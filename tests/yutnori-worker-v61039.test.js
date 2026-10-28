import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom, register, authRequest, responseJson} from './helpers.js';

const post=async(room, token, path, value={})=>responseJson(await room.fetch(authRequest(path,token,{method:'POST',body:JSON.stringify(value)})));
const get=async(room,token,path)=>responseJson(await room.fetch(authRequest(path,token)));

test('실제 Worker 경로: 로그인 → 방 생성 → 참가 → 시작 → 윷 던지기 → 관전자 조회',async()=>{
 const {room}=await createRoom();
 const tokenA=await register(room,'윷놀이테스트A');
 const tokenB=await register(room,'윷놀이테스트B');
 const tokenC=await register(room,'윷놀이테스트C');
 const a=await get(room,tokenA,'/api/bootstrap');
 assert.equal(a.response.status,200);assert.equal(a.data.bootstrap.yut.maxRooms,3);
 const create=await post(room,tokenA,'/api/yut/rooms',{mode:'solo',seats:2});
 assert.equal(create.response.status,201,JSON.stringify(create.data));
 const roomId=create.data.roomId;
 const join=await post(room,tokenB,`/api/yut/rooms/${roomId}/join`);
 assert.equal(join.data.ok,true,JSON.stringify(join.data));
 const start=await post(room,tokenA,`/api/yut/rooms/${roomId}/start`);
 assert.equal(start.data.ok,true,JSON.stringify(start.data));
 const bootstrap=await get(room,tokenB,'/api/bootstrap');
 const running=bootstrap.data.bootstrap.yut.rooms.find(r=>r.id===roomId);
 assert.equal(running.status,'playing');assert.equal(running.pieces.length,8);
 const watch=await post(room,tokenC,`/api/yut/rooms/${roomId}/spectate`);
 assert.equal(watch.data.ok,true,JSON.stringify(watch.data));
 const watchRoom=(await get(room,tokenC,'/api/bootstrap')).data.bootstrap.yut.rooms.find(r=>r.id===roomId);
 assert.equal(watchRoom.role,'spectator');assert.equal(watchRoom.spectatorCount,1);
 const current=running.currentPetId;
 const tokenForTurn=a.data.bootstrap.dashboard.pet.id===current?tokenA:tokenB;
 const toss=await post(room,tokenForTurn,`/api/yut/rooms/${roomId}/move`,{type:'throw',power:50});
 assert.equal(toss.data.ok,true,JSON.stringify(toss.data));
 const after=(await get(room,tokenA,'/api/bootstrap')).data.bootstrap.yut.rooms.find(r=>r.id===roomId);
 assert.equal(after.turn>=1,true);
});
