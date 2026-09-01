import { id } from '../lib/ids.js';
import { canStartBattleForPets, consumeBattleForPets } from './battle-limit.js';

export const LEGODOKU_SIZE = 8;
export const LEGODOKU_CELL_COUNT = LEGODOKU_SIZE * LEGODOKU_SIZE;
export const LEGODOKU_MATCH_SECONDS = 180;
export const LEGODOKU_MAX_ROOMS = 3;
export const LEGODOKU_MAX_MISTAKES = 3;
export const LEGODOKU_WAITING_ROOM_TTL_MS = 10 * 60_000;
export const LEGODOKU_ENDED_ROOM_TTL_MS = 10 * 60_000;
export const LEGODOKU_STAKES = Object.freeze([100, 500, 1000, 2000, 3000]);
export const LEGODOKU_ACTION_HISTORY = 64;

const nowIso = (date = new Date()) => date.toISOString();
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const clampIndex = (value) => { const n = int(value, -1); return n >= 0 && n < LEGODOKU_CELL_COUNT ? n : -1; };
const rowOf = (index) => Math.floor(index / LEGODOKU_SIZE);
const colOf = (index) => index % LEGODOKU_SIZE;
const indexOf = (row, col) => row * LEGODOKU_SIZE + col;

export function validLegodokuStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

const LEGODOKU_PUZZLE_BANK = Object.freeze([{"r":[2,2,1,1,1,1,1,0,2,2,2,2,1,3,1,1,2,2,2,3,3,3,3,1,5,2,2,2,3,3,6,6,5,5,4,7,3,3,3,6,5,5,7,7,7,7,3,6,5,7,7,7,7,6,6,6,5,5,5,7,7,7,7,6],"s":[7,12,17,29,34,40,54,59],"d":"중상","n":981},{"r":[1,0,0,0,4,4,4,4,1,1,1,3,4,2,4,4,1,1,3,3,3,2,4,4,3,3,3,2,2,2,2,4,3,3,2,2,2,7,7,4,5,3,2,2,2,7,4,4,5,3,3,6,6,7,4,7,5,5,3,6,6,7,7,7],"s":[3,9,21,26,39,40,52,62],"d":"중상","n":746},{"r":[0,0,0,1,1,1,1,2,3,3,3,1,3,1,2,2,3,3,3,3,3,3,2,2,4,3,3,3,3,3,5,5,4,3,4,4,4,3,3,5,4,3,4,4,4,5,5,5,4,3,4,7,4,7,5,6,4,4,4,7,7,7,7,7],"s":[1,11,22,26,32,45,55,60],"d":"중","n":627},{"r":[0,0,0,0,0,0,0,0,0,1,3,3,0,0,0,2,0,3,3,3,3,4,0,2,3,3,5,5,4,4,4,4,5,3,5,5,4,4,7,7,5,5,5,5,5,6,6,7,5,5,5,5,6,6,6,7,6,6,6,6,6,6,7,7],"s":[3,9,23,24,37,42,52,62],"d":"중상","n":861},{"r":[0,0,0,0,0,0,0,2,0,0,0,1,1,1,1,2,0,3,3,3,1,2,2,2,3,3,3,7,1,1,2,4,3,3,7,7,1,1,2,4,3,5,7,7,1,7,4,4,5,5,7,7,7,7,6,6,5,5,5,5,7,7,7,7],"s":[0,11,21,26,39,41,54,60],"d":"중상","n":691},{"r":[3,3,0,1,1,1,4,4,3,3,1,1,2,1,4,4,3,3,2,2,2,1,1,4,6,3,3,4,4,4,4,4,6,6,3,4,4,4,5,4,6,3,3,4,7,4,5,4,6,7,4,4,7,7,7,7,7,7,7,7,7,7,7,7],"s":[2,13,19,25,36,46,48,63],"d":"중상","n":764},{"r":[1,1,1,1,0,0,0,3,1,1,1,1,1,1,0,3,1,2,1,2,0,0,0,3,1,2,2,2,2,0,3,3,1,4,2,3,3,3,3,3,4,4,2,3,7,5,5,5,4,3,3,3,7,5,5,6,4,7,7,7,7,7,5,5],"s":[4,8,19,30,33,45,55,58],"d":"중","n":345},{"r":[3,0,7,7,1,1,2,2,3,3,7,7,1,1,1,2,3,3,7,7,1,7,2,2,3,3,3,7,7,7,7,7,7,7,7,7,7,4,4,4,7,7,4,4,4,4,4,5,7,7,6,6,6,6,4,4,7,7,7,7,6,6,4,4],"s":[1,12,22,26,37,47,51,56],"d":"중","n":648},{"r":[0,0,0,0,2,1,1,1,0,3,2,2,2,1,2,1,3,3,2,2,2,2,2,1,3,3,2,2,1,1,2,1,3,4,4,4,4,1,1,1,3,4,7,4,5,5,5,1,3,3,7,4,4,5,6,1,3,3,7,7,7,7,7,7],"s":[1,15,21,24,34,44,54,59],"d":"중상","n":703},{"r":[3,3,2,2,2,0,0,0,3,7,1,4,2,2,2,0,3,7,7,4,4,2,0,0,3,3,7,4,4,2,0,0,3,7,7,4,2,2,0,0,3,7,7,2,2,2,5,0,6,7,7,5,5,5,5,0,6,7,7,7,7,5,5,5],"s":[7,10,21,25,35,46,48,60],"d":"중상","n":872},{"r":[0,0,0,0,0,1,1,1,3,3,0,0,1,1,1,1,3,0,0,0,1,1,2,1,3,3,0,3,3,1,2,4,5,3,3,3,3,3,2,4,5,3,3,5,5,5,2,4,5,5,5,5,5,6,6,4,5,5,5,7,7,6,6,6],"s":[2,12,22,25,39,40,53,59],"d":"중","n":262},{"r":[1,1,2,2,2,0,0,0,1,1,1,1,2,2,2,0,1,3,1,4,4,4,2,0,6,3,4,4,7,4,0,0,6,4,4,7,7,4,0,0,6,5,5,7,4,4,4,4,6,5,7,7,4,7,4,7,6,6,6,7,7,7,7,7],"s":[7,11,22,25,37,42,48,60],"d":"중상","n":1256},{"r":[0,3,1,1,1,2,2,2,3,3,3,1,3,3,3,2,4,4,3,3,3,3,2,2,4,4,4,3,3,2,2,5,4,7,4,4,5,5,5,5,4,7,4,4,4,5,5,5,7,7,7,7,5,5,6,6,7,7,7,7,5,5,5,5],"s":[0,11,22,28,34,45,55,57],"d":"중상","n":737},{"r":[1,0,0,0,0,0,3,3,1,1,1,0,0,0,3,3,2,1,3,0,3,0,0,3,2,1,3,3,3,3,3,3,2,2,2,4,4,4,6,6,2,2,4,4,5,5,6,6,2,2,2,2,2,7,6,6,7,7,7,7,7,7,7,7],"s":[4,10,16,30,35,45,55,57],"d":"중","n":289},{"r":[0,0,0,0,0,1,1,2,0,0,1,1,1,1,1,2,0,3,3,3,3,1,2,2,0,0,0,3,3,3,7,7,0,5,5,3,7,3,7,4,5,5,5,3,7,7,7,7,5,5,5,3,7,6,6,7,5,5,5,7,7,7,6,7],"s":[0,10,22,28,39,41,53,59],"d":"중상","n":940},{"r":[0,0,0,0,0,0,0,0,1,1,1,2,0,0,2,0,1,1,3,2,0,2,2,0,1,3,3,2,2,2,4,0,3,3,3,2,2,4,4,4,3,3,5,5,5,4,4,4,3,3,5,7,5,6,4,4,3,3,5,7,7,6,4,4],"s":[4,8,22,25,39,42,53,59],"d":"중","n":457},{"r":[3,1,1,1,0,0,0,2,3,4,4,1,1,1,0,2,3,3,4,4,1,1,1,2,5,3,4,4,4,4,1,1,5,5,5,5,4,4,4,4,7,5,5,5,5,4,6,4,7,5,7,7,5,4,6,6,7,7,7,7,5,5,5,6],"s":[5,11,23,25,36,42,54,56],"d":"중상","n":1024},{"r":[0,2,2,1,1,1,3,3,0,2,2,1,1,1,1,3,2,2,2,1,3,1,1,3,2,5,5,5,3,3,1,3,2,4,7,5,5,3,3,3,2,4,7,5,5,3,3,6,7,4,7,5,5,3,3,6,7,7,7,7,5,5,5,6],"s":[0,14,18,29,33,44,55,59],"d":"중","n":593},{"r":[0,2,3,3,3,3,1,3,2,2,3,3,4,3,1,3,2,2,2,4,4,3,3,3,7,7,7,7,4,3,3,5,7,6,4,4,4,4,4,5,7,6,6,6,6,6,4,5,7,7,5,6,6,6,6,5,7,7,5,5,5,5,5,5],"s":[0,14,18,29,35,47,52,57],"d":"중상","n":1269},{"r":[3,3,0,0,0,0,0,0,1,3,3,3,3,3,2,0,4,4,3,2,2,2,2,2,4,3,3,3,3,2,6,2,4,4,6,6,6,2,6,2,4,5,5,5,6,6,6,2,4,7,5,5,6,5,6,2,7,7,7,5,5,5,5,5],"s":[5,8,23,28,33,43,54,58],"d":"중상","n":1042},{"r":[0,0,0,0,0,0,0,0,0,3,1,0,1,0,0,0,3,3,1,1,1,2,4,5,3,3,3,1,1,4,4,5,3,3,3,1,4,4,4,5,3,6,3,3,6,4,4,5,6,6,6,6,6,4,7,5,6,6,6,6,4,4,7,7],"s":[0,10,21,25,36,47,51,62],"d":"중","n":411},{"r":[2,0,1,1,4,4,4,4,2,1,1,1,1,4,6,4,2,2,2,1,4,4,6,4,3,3,2,1,3,3,6,4,3,3,3,3,3,6,6,4,5,5,7,3,3,6,6,4,5,5,7,3,6,6,6,6,5,5,7,7,7,6,6,6],"s":[1,12,18,29,39,40,54,59],"d":"중상","n":1011},{"r":[0,0,0,0,0,1,1,1,0,2,2,0,1,1,1,1,0,0,2,0,1,2,3,1,0,2,2,2,2,2,3,3,0,4,5,5,5,2,2,3,6,4,5,5,2,2,5,3,6,4,5,5,5,5,5,3,4,4,4,5,7,5,5,3],"s":[3,13,18,31,33,46,48,60],"d":"중","n":382},{"r":[1,5,5,5,0,0,0,0,1,1,1,5,0,3,3,0,4,1,5,5,0,3,2,2,4,1,5,0,0,3,2,3,4,4,5,0,7,3,3,3,4,5,5,5,7,7,3,3,6,7,7,5,7,7,7,3,7,7,7,7,7,7,3,3],"s":[6,10,23,29,33,43,48,60],"d":"중상","n":1226},{"r":[2,2,2,2,2,0,0,4,2,2,1,1,2,4,0,4,5,1,1,1,2,4,4,4,5,3,1,1,1,1,4,4,5,5,1,5,1,1,4,4,7,5,5,5,1,1,4,4,7,5,5,4,4,1,6,4,7,7,7,4,4,4,4,4],"s":[5,10,20,25,39,43,54,56],"d":"중","n":580},{"r":[1,3,3,0,0,0,0,0,1,3,3,0,0,0,4,0,1,1,3,0,0,2,4,0,1,3,3,3,3,2,4,4,1,3,6,2,2,2,4,4,1,5,6,6,2,4,4,4,1,5,7,6,2,4,6,4,7,7,7,6,6,6,6,6],"s":[4,8,21,27,39,41,54,58],"d":"중상","n":929},{"r":[2,2,2,0,0,0,0,1,2,0,0,0,0,1,1,1,2,3,0,3,1,1,6,6,3,3,0,3,1,6,6,6,7,3,3,3,3,6,6,4,7,5,5,5,5,6,6,6,7,7,5,5,5,6,5,6,7,7,5,5,5,5,5,5],"s":[4,14,16,27,39,42,53,57],"d":"중상","n":1121},{"r":[1,1,1,1,0,0,0,0,1,2,1,1,1,1,1,0,2,2,5,5,3,1,5,5,2,2,5,5,3,1,5,5,2,5,4,5,3,3,3,5,2,5,5,5,5,5,5,5,2,6,5,5,6,6,6,5,7,6,6,6,6,6,5,5],"s":[6,11,17,28,34,47,53,56],"d":"중상","n":669},{"r":[1,0,0,0,0,0,2,4,1,0,2,2,0,0,2,4,1,1,2,2,2,2,2,4,1,1,3,2,4,4,4,4,1,1,3,2,2,4,4,4,1,5,3,4,4,4,7,7,5,5,3,3,7,7,7,6,5,5,3,3,3,7,7,7],"s":[3,8,20,26,38,41,55,61],"d":"중","n":647},{"r":[2,0,1,3,3,3,3,4,2,1,1,1,3,4,3,4,2,2,1,3,3,4,4,4,2,2,5,5,3,3,4,4,5,2,5,3,3,6,6,4,5,2,5,7,3,6,6,6,5,5,5,7,6,6,6,6,7,7,7,7,7,6,6,6],"s":[1,11,16,29,39,42,54,60],"d":"중상","n":1387},{"r":[0,0,0,1,1,1,1,1,0,1,1,1,3,1,1,2,0,0,0,3,3,1,1,2,0,0,0,3,1,1,2,2,0,0,6,3,5,5,4,2,0,6,6,6,5,7,2,2,6,6,6,5,5,7,2,2,6,6,6,6,6,7,7,2],"s":[0,10,23,27,38,44,49,61],"d":"중","n":486},{"r":[1,1,1,1,1,2,0,0,1,3,1,1,1,2,2,4,3,3,3,1,2,2,2,4,3,1,1,1,1,5,2,4,3,3,5,1,5,5,5,4,3,5,5,5,5,5,5,4,3,5,5,6,5,7,5,4,3,3,5,5,7,7,7,7],"s":[6,10,20,24,39,41,51,61],"d":"중","n":627},{"r":[5,5,0,0,0,0,0,0,5,5,2,0,0,1,0,0,5,2,2,2,1,1,6,0,5,2,2,4,3,3,6,0,5,2,4,4,5,6,6,0,5,5,5,5,5,6,6,0,7,7,5,7,7,7,6,6,7,7,7,7,7,7,7,6],"s":[7,13,17,28,34,40,54,59],"d":"중상","n":977},{"r":[2,0,0,0,0,0,0,0,2,0,0,4,4,0,0,1,2,2,5,4,0,0,0,1,2,5,5,4,4,3,1,1,2,2,5,4,4,4,1,1,5,2,5,4,4,4,4,1,5,5,5,5,4,6,6,1,5,5,7,5,5,6,6,6],"s":[4,15,17,29,35,40,54,58],"d":"중상","n":664},{"r":[4,0,0,0,0,0,0,0,4,2,2,0,0,0,0,1,4,4,2,0,0,0,3,1,4,2,2,2,2,3,3,1,4,4,4,2,3,3,3,3,4,4,2,2,3,5,6,3,4,2,2,6,6,5,6,3,4,7,6,6,6,6,6,6],"s":[4,15,18,30,32,45,51,57],"d":"중","n":489},{"r":[1,1,2,2,2,0,0,0,1,1,1,1,2,0,0,0,1,2,2,2,2,2,0,0,1,3,5,2,2,6,0,0,1,3,5,6,2,6,0,4,5,5,5,6,2,6,4,4,5,5,6,6,6,6,4,4,7,7,6,6,6,4,4,4],"s":[6,11,21,25,39,42,52,56],"d":"중상","n":652},{"r":[4,1,7,7,7,0,0,7,4,1,1,1,7,7,0,7,4,2,2,7,7,7,7,7,4,4,7,7,3,3,7,7,4,4,4,7,3,3,3,3,4,6,4,7,5,3,3,3,6,6,4,7,7,7,3,3,4,4,4,4,7,7,7,7],"s":[6,11,17,29,34,44,48,63],"d":"중상","n":686},{"r":[4,4,0,0,0,0,0,0,1,4,4,4,2,0,0,0,1,1,4,2,2,2,2,2,4,4,4,4,3,2,2,2,4,4,5,2,2,2,7,2,5,5,5,5,2,2,7,7,5,5,5,5,2,2,7,6,5,5,5,5,7,7,7,7],"s":[2,8,22,28,33,43,55,61],"d":"중상","n":700},{"r":[0,0,0,0,0,1,1,1,0,0,0,2,1,1,1,1,0,0,0,2,3,3,1,1,4,4,0,3,3,3,3,1,4,5,3,3,3,3,1,1,4,5,5,5,6,3,3,1,4,7,5,5,6,6,3,1,4,7,5,5,6,6,6,6],"s":[4,15,19,30,32,42,53,57],"d":"중","n":525},{"r":[4,4,4,0,0,0,3,3,2,4,4,1,1,0,0,3,2,4,4,4,3,3,0,3,4,4,3,3,3,3,3,3,4,4,3,7,5,3,5,5,4,7,7,7,5,5,5,5,4,7,7,5,5,6,6,7,7,7,7,7,7,7,7,7],"s":[5,11,16,31,33,44,54,58],"d":"중상","n":680},{"r":[0,0,0,0,0,1,1,1,0,0,0,0,3,3,1,1,2,0,0,0,3,3,1,1,2,2,3,3,3,3,4,1,5,2,2,2,2,4,4,4,5,2,5,2,2,2,2,4,5,5,5,7,7,7,2,6,5,5,5,5,7,7,7,7],"s":[1,14,16,27,37,42,55,60],"d":"중상","n":743},{"r":[0,0,0,0,0,0,0,1,0,0,2,0,0,5,1,1,2,2,2,0,2,5,1,4,2,2,3,2,2,5,5,4,2,2,2,2,6,5,5,4,2,2,6,6,6,5,5,5,2,6,6,6,7,7,7,5,6,6,6,6,7,7,5,5],"s":[3,14,16,26,39,45,49,60],"d":"중","n":582},{"r":[3,3,3,0,0,0,2,2,3,3,3,0,0,1,0,2,3,7,3,3,0,0,0,2,3,7,7,7,0,2,2,2,7,7,0,0,0,2,4,4,7,7,5,5,5,5,4,4,7,7,5,6,6,5,5,4,7,7,7,7,5,5,5,4],"s":[3,13,23,24,38,42,52,57],"d":"중상","n":712},{"r":[1,3,3,3,3,2,0,0,1,1,3,5,3,2,2,0,1,1,3,5,3,3,2,0,1,3,3,5,5,5,5,5,1,1,3,5,5,4,5,5,6,1,6,5,7,7,7,5,6,1,6,6,6,6,7,7,6,6,6,7,7,7,7,7],"s":[7,9,22,26,37,43,48,60],"d":"중상","n":897},{"r":[2,2,2,4,0,0,1,1,2,4,4,4,0,1,1,1,2,4,2,4,0,1,1,1,2,2,2,4,3,3,3,1,2,2,4,4,4,3,1,1,2,5,5,4,5,3,3,3,2,6,5,5,5,5,5,3,6,6,7,7,5,5,5,3],"s":[5,15,16,30,34,44,49,59],"d":"중","n":584},{"r":[0,0,0,0,0,0,3,3,4,2,0,0,1,0,1,3,4,2,0,0,1,1,1,3,4,1,1,0,1,3,1,3,4,6,1,1,1,3,3,3,6,6,6,6,1,1,3,5,6,7,7,6,3,3,3,3,6,6,7,7,7,7,7,7],"s":[2,12,17,29,32,47,51,62],"d":"중","n":488},{"r":[1,1,0,0,0,0,3,3,1,1,0,0,0,0,0,3,1,1,0,2,0,0,3,3,1,1,1,2,0,0,3,3,1,2,2,2,4,6,6,5,1,1,2,4,4,6,6,5,2,2,2,4,6,6,6,6,2,7,7,4,4,4,6,6],"s":[2,8,19,30,36,47,53,57],"d":"중","n":355},{"r":[2,0,0,1,1,1,1,1,2,0,0,0,0,0,0,1,2,4,4,4,0,0,1,1,2,2,4,4,3,3,1,1,4,2,4,7,7,1,1,1,4,2,4,7,5,7,6,6,4,2,4,7,7,7,6,6,4,4,4,7,6,6,6,6],"s":[1,15,16,29,34,44,54,59],"d":"중","n":631},{"r":[3,3,1,3,0,2,4,4,3,3,1,3,2,2,2,4,3,3,3,3,2,2,2,4,7,3,4,4,4,4,4,4,7,7,7,4,6,4,4,4,7,7,7,4,6,6,5,5,7,7,7,7,7,6,6,7,7,7,7,7,7,7,7,7],"s":[4,10,22,25,35,47,53,56],"d":"중상","n":760},{"r":[2,2,1,1,1,0,0,0,2,1,1,1,1,1,0,0,2,2,2,2,1,1,0,0,2,2,4,1,1,1,0,3,2,4,4,1,0,0,0,3,2,4,7,7,7,7,5,5,4,4,7,6,6,7,7,5,4,4,7,7,5,5,5,5],"s":[5,11,16,31,33,46,52,58],"d":"중","n":352},{"r":[2,2,0,1,1,1,3,3,5,2,1,1,1,3,3,3,5,2,2,2,1,4,3,3,5,5,5,2,2,4,4,3,5,5,5,2,4,4,4,4,5,5,4,4,4,4,6,6,5,5,6,6,6,4,6,6,5,5,7,7,6,6,6,6],"s":[2,12,17,31,37,40,54,59],"d":"중상","n":1084},{"r":[0,0,4,1,1,1,1,1,7,0,4,4,1,4,1,1,7,0,4,4,4,4,1,2,7,0,3,7,7,4,4,2,7,7,7,7,4,4,4,4,7,5,7,6,4,4,4,6,5,5,7,6,6,4,6,6,5,7,7,7,6,6,6,6],"s":[0,12,23,26,37,41,54,59],"d":"중상","n":690},{"r":[1,1,1,1,0,0,0,0,5,1,1,1,1,0,2,0,5,5,1,1,1,0,2,0,5,1,1,3,2,2,2,0,5,5,5,5,2,6,6,4,7,5,7,7,7,7,6,6,7,5,5,5,7,6,6,6,7,7,7,7,7,7,6,6],"s":[4,10,22,27,39,41,53,56],"d":"중상","n":734},{"r":[0,0,0,0,0,1,1,1,0,2,2,0,0,0,1,1,0,2,4,4,0,4,1,1,2,2,4,4,4,4,3,1,2,2,2,4,4,5,1,1,2,2,5,5,5,5,5,1,5,5,5,5,7,6,6,1,5,5,7,7,7,7,7,7],"s":[0,15,17,30,36,42,53,59],"d":"중","n":425},{"r":[3,0,1,1,1,1,1,2,3,3,3,1,4,1,1,2,3,3,3,1,4,4,2,2,4,3,3,4,4,6,6,2,4,4,4,4,4,6,6,5,4,6,6,6,6,6,6,5,7,6,7,7,7,6,7,7,7,7,7,7,7,7,7,7],"s":[1,11,22,26,36,47,53,56],"d":"중상","n":1085},{"r":[3,3,3,2,2,4,4,0,3,1,3,3,2,4,4,4,3,1,1,3,2,2,2,4,3,3,1,1,2,4,4,4,5,3,1,2,2,4,2,7,5,3,5,5,2,2,2,7,5,3,5,5,2,6,6,7,5,5,5,7,7,7,7,7],"s":[7,9,20,24,37,42,54,59],"d":"중","n":558},{"r":[1,0,0,0,0,0,0,0,1,0,1,1,1,1,0,0,1,1,1,4,3,1,0,2,1,1,4,4,3,3,3,5,1,4,4,4,3,3,3,5,4,4,6,3,3,5,5,5,4,4,6,3,6,6,6,6,4,4,6,6,6,7,6,6],"s":[3,8,23,28,33,46,50,61],"d":"중","n":343},{"r":[0,0,0,0,0,1,1,1,2,2,0,3,0,3,1,1,2,2,2,3,3,3,3,3,2,2,2,3,3,3,5,3,2,2,4,5,3,3,5,3,2,2,2,5,5,3,5,5,2,2,2,5,5,5,5,6,2,7,2,5,6,6,6,6],"s":[3,14,16,29,34,44,55,57],"d":"중상","n":699},{"r":[0,0,3,3,3,1,1,1,0,0,0,3,1,1,1,1,0,2,2,3,3,3,3,1,0,0,0,4,4,3,1,1,4,4,4,4,3,3,1,1,4,4,7,4,4,4,5,1,6,7,7,7,4,4,5,5,6,6,7,7,7,5,5,5],"s":[1,15,18,29,35,46,48,60],"d":"중","n":332},{"r":[1,2,2,0,0,0,4,4,1,2,0,0,2,0,4,4,1,2,2,0,2,0,0,4,1,2,2,2,2,3,4,4,5,5,5,5,6,6,4,4,5,5,7,6,6,6,4,4,5,5,7,7,6,6,6,4,5,5,7,7,6,6,4,4],"s":[4,8,18,29,39,41,54,59],"d":"중상","n":1189},{"r":[1,1,1,1,1,0,0,0,1,1,4,4,1,1,5,0,2,1,3,4,1,1,5,0,6,1,3,4,5,5,5,5,6,1,1,4,4,4,4,5,6,6,6,4,4,6,6,5,7,6,6,6,4,4,6,5,7,7,7,6,6,6,6,5],"s":[6,12,16,26,37,47,51,57],"d":"중상","n":703},{"r":[0,0,0,0,0,1,1,1,0,0,0,1,1,1,1,1,0,0,0,0,0,4,4,2,3,0,4,4,4,4,2,2,3,3,3,4,4,4,4,2,3,5,7,7,7,4,2,2,3,5,7,7,2,6,6,2,3,3,7,2,2,2,2,2],"s":[3,13,23,24,36,41,54,58],"d":"중","n":529},{"r":[2,2,2,4,4,0,0,4,1,1,2,4,4,4,0,4,2,1,2,4,4,4,4,4,2,2,2,4,5,6,6,3,5,5,5,4,5,6,6,6,5,5,5,5,5,7,7,6,7,7,7,5,7,7,6,6,7,7,7,7,7,7,7,6],"s":[5,8,18,31,35,41,54,60],"d":"중상","n":1159},{"r":[1,1,1,1,3,0,0,0,1,1,1,1,3,0,3,0,5,1,1,1,3,3,3,2,5,1,1,3,3,4,7,2,5,5,5,5,5,4,7,2,5,5,5,6,5,5,7,7,5,6,6,6,6,6,6,7,5,6,6,6,7,7,7,7],"s":[6,9,23,27,37,40,50,60],"d":"중상","n":1119}]);

export function countLegodokuSolutions(regions, limit = 2) {
  const normalized = Array.from({ length: LEGODOKU_CELL_COUNT }, (_, i) => int(regions?.[i], -1));
  if (normalized.some((region) => region < 0 || region >= LEGODOKU_SIZE)) return { count: 0, nodes: 0, first: null };
  let count = 0; let nodes = 0; let first = null;
  const usedCols = new Set(); const usedRegions = new Set(); const cols = Array(LEGODOKU_SIZE).fill(-1);
  const walk = (row, previousCol) => {
    if (count >= limit) return;
    if (row === LEGODOKU_SIZE) { count += 1; if (!first) first = cols.map((col, r) => indexOf(r, col)); return; }
    for (let col = 0; col < LEGODOKU_SIZE; col += 1) {
      const region = normalized[indexOf(row, col)];
      if (usedCols.has(col) || usedRegions.has(region) || (row > 0 && Math.abs(col - previousCol) === 1)) continue;
      nodes += 1; usedCols.add(col); usedRegions.add(region); cols[row] = col;
      walk(row + 1, col);
      usedCols.delete(col); usedRegions.delete(region); cols[row] = -1;
      if (count >= limit) return;
    }
  };
  walk(0, -99);
  return { count, nodes, first };
}

function transformIndex(index, variant) {
  const row = rowOf(index); const col = colOf(index); const last = LEGODOKU_SIZE - 1;
  const transforms = [
    [row, col], [col, last - row], [last - row, last - col], [last - col, row],
    [row, last - col], [last - row, col], [col, row], [last - col, last - row]
  ];
  const [nextRow, nextCol] = transforms[Math.max(0, Math.min(7, int(variant)))];
  return indexOf(nextRow, nextCol);
}

function randomPermutation(random = Math.random) {
  const values = Array.from({ length: LEGODOKU_SIZE }, (_, i) => i);
  for (let i = values.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}

export function generateLegodokuPuzzle(random = Math.random) {
  const bankIndex = Math.max(0, Math.min(LEGODOKU_PUZZLE_BANK.length - 1, Math.floor(random() * LEGODOKU_PUZZLE_BANK.length)));
  const variant = Math.max(0, Math.min(7, Math.floor(random() * 8)));
  const base = LEGODOKU_PUZZLE_BANK[bankIndex];
  const regionMap = randomPermutation(random);
  const regions = Array(LEGODOKU_CELL_COUNT).fill(0);
  for (let index = 0; index < LEGODOKU_CELL_COUNT; index += 1) regions[transformIndex(index, variant)] = regionMap[base.r[index]];
  const solution = base.s.map((index) => transformIndex(index, variant)).sort((a, b) => a - b);
  return { regions, solution, difficulty: base.d === '중상' ? '중상' : '중', difficultyScore: base.n, key: `${bankIndex}:${variant}` };
}

function normalizePuzzle(raw) {
  const regions = Array.from({ length: LEGODOKU_CELL_COUNT }, (_, i) => Math.max(0, Math.min(LEGODOKU_SIZE - 1, int(raw?.regions?.[i], i % LEGODOKU_SIZE))));
  const solution = Array.isArray(raw?.solution) ? [...new Set(raw.solution.map(clampIndex).filter((i) => i >= 0))].slice(0, LEGODOKU_SIZE) : [];
  return { regions, solution, difficulty: raw?.difficulty === '중상' ? '중상' : '중', difficultyScore: Math.max(0, int(raw?.difficultyScore)), key: String(raw?.key || '') };
}

function normalizePlayer(raw, pet) {
  const confirmed = [...new Set((Array.isArray(raw?.confirmed) ? raw.confirmed : []).map(clampIndex).filter((i) => i >= 0))].slice(0, LEGODOKU_SIZE);
  return {
    petId: pet.id, userId: pet.userId, displayName: pet.displayName,
    confirmed, foundCount: confirmed.length,
    mistakes: Math.max(0, Math.min(LEGODOKU_MAX_MISTAKES, int(raw?.mistakes))),
    completed: Boolean(raw?.completed),
    lastMove: raw?.lastMove && typeof raw.lastMove === 'object' ? { index: clampIndex(raw.lastMove.index), correct: Boolean(raw.lastMove.correct), at: raw.lastMove.at || null } : null
  };
}

export function initialLegodoku() { return { version: 1, rooms: {}, recentPuzzleKeys: [] }; }

export function normalizeLegodoku(raw, state, date = new Date()) {
  const game = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialLegodoku();
  game.version = 1;
  game.rooms = game.rooms && typeof game.rooms === 'object' && !Array.isArray(game.rooms) ? game.rooms : {};
  game.recentPuzzleKeys = Array.isArray(game.recentPuzzleKeys) ? game.recentPuzzleKeys.map(String).slice(-20) : [];
  for (const [roomId, rawRoom] of Object.entries(game.rooms)) {
    const host = state?.pets?.[rawRoom?.hostPetId]; const guest = state?.pets?.[rawRoom?.guestPetId];
    const status = ['waiting', 'playing', 'ended'].includes(rawRoom?.status) ? rawRoom.status : 'waiting';
    if (!host?.alive || !validLegodokuStake(rawRoom?.stakePoints) || (status !== 'waiting' && !guest?.alive)) { delete game.rooms[roomId]; continue; }
    const room = rawRoom;
    room.id = String(room.id || roomId); room.roomNumber = Math.max(1, Math.min(LEGODOKU_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = status; room.hostPetId = host.id; room.guestPetId = guest?.id ?? null; room.stakePoints = Number(room.stakePoints);
    room.matchId = String(room.matchId || id('legodokumatch'));
    room.puzzle = status === 'waiting' ? null : normalizePuzzle(room.puzzle);
    room.players = room.players && typeof room.players === 'object' && !Array.isArray(room.players) ? room.players : {};
    if (status !== 'waiting') { room.players[host.id] = normalizePlayer(room.players[host.id], host); room.players[guest.id] = normalizePlayer(room.players[guest.id], guest); } else room.players = {};
    room.spectators = room.spectators && typeof room.spectators === 'object' && !Array.isArray(room.spectators) ? room.spectators : {};
    for (const [petId, spectator] of Object.entries(room.spectators)) {
      const pet = state?.pets?.[petId];
      if (!pet?.alive || [host.id, guest?.id].includes(petId)) delete room.spectators[petId];
      else room.spectators[petId] = { petId, userId: pet.userId, displayName: pet.displayName, joinedAt: spectator?.joinedAt || nowIso(date) };
    }
    room.escrow = room.escrow && typeof room.escrow === 'object' && !Array.isArray(room.escrow) ? room.escrow : {};
    for (const petId of [host.id, guest?.id].filter(Boolean)) room.escrow[petId] = Math.max(0, int(room.escrow[petId]));
    room.processedActionIds = Array.isArray(room.processedActionIds) ? [...new Set(room.processedActionIds.map(String))].slice(-LEGODOKU_ACTION_HISTORY) : [];
    room.stateVersion = Math.max(0, int(room.stateVersion));
    room.rematchRequests = Array.isArray(room.rematchRequests) ? [...new Set(room.rematchRequests.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.departedPetIds = Array.isArray(room.departedPetIds) ? [...new Set(room.departedPetIds.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.settled = Boolean(room.settled); room.winnerPetId = state?.pets?.[room.winnerPetId]?.alive ? room.winnerPetId : null; room.loserPetId = state?.pets?.[room.loserPetId]?.alive ? room.loserPetId : null;
    room.result = ['win', 'draw'].includes(room.result) ? room.result : null; room.resultReason = room.resultReason ? String(room.resultReason).slice(0, 180) : null;
    room.createdAt = room.createdAt || nowIso(date); room.startedAt = room.startedAt || null; room.deadlineAt = room.deadlineAt || null; room.endedAt = room.endedAt || null; room.updatedAt = room.updatedAt || room.createdAt;
    game.rooms[roomId] = room;
  }
  return game;
}

function bumpRoomVersion(room, date = new Date()) { room.stateVersion = Math.max(0, int(room.stateVersion)) + 1; room.updatedAt = nowIso(date); }
function occupiedNumbers(game) { return new Set(Object.values(game.rooms).filter((room) => room.status !== 'ended').map((room) => room.roomNumber)); }
function nextRoomNumber(game) { const occupied = occupiedNumbers(game); for (let n = 1; n <= LEGODOKU_MAX_ROOMS; n += 1) if (!occupied.has(n)) return n; return null; }
function activePlayerRoom(game, petId, except = null) { return Object.values(game.rooms).find((room) => room.id !== except && room.status !== 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) ?? null; }
function opponentId(room, petId) { return room.hostPetId === petId ? room.guestPetId : room.hostPetId; }
function puzzleKey(puzzle) { return String(puzzle?.key || puzzle?.regions?.join('') || ''); }

function awardResultRecords(pet, { win = false, loss = false, draw = false } = {}) {
  if (!pet?.alive) return; pet.records ??= {}; pet.records.legodokuGames = int(pet.records.legodokuGames) + 1;
  if (win) { pet.records.legodokuWins = int(pet.records.legodokuWins) + 1; pet.records.seasonLegodokuWins = int(pet.records.seasonLegodokuWins) + 1; }
  if (loss) { pet.records.legodokuLosses = int(pet.records.legodokuLosses) + 1; pet.records.seasonLegodokuLosses = int(pet.records.seasonLegodokuLosses) + 1; }
  if (draw) { pet.records.legodokuDraws = int(pet.records.legodokuDraws) + 1; pet.records.seasonLegodokuDraws = int(pet.records.seasonLegodokuDraws) + 1; }
}

function finishWin(state, room, winnerPetId, loserPetId, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  const winner = state.pets[winnerPetId]; const loser = state.pets[loserPetId];
  room.status = 'ended'; room.result = 'win'; room.winnerPetId = winner?.alive ? winnerPetId : null; room.loserPetId = loserPetId; room.resultReason = String(reason || '레고도쿠 대전이 종료되었습니다.').slice(0, 180);
  room.endedAt = nowIso(date); room.deadlineAt = null; room.settled = true; room.settlementId ||= id('legodokusettle'); room.rematchRequests = [];
  const pot = Object.values(room.escrow).reduce((sum, value) => sum + Math.max(0, int(value)), 0);
  if (winner?.alive) { winner.stats.points += pot; winner.records.pointsEarned += pot; winner.records.maxPoints = Math.max(int(winner.records.maxPoints), winner.stats.points); }
  awardResultRecords(winner, { win: true }); awardResultRecords(loser, { loss: true });
  for (const petId of [room.hostPetId, room.guestPetId]) room.escrow[petId] = 0;
  bumpRoomVersion(room, date); return true;
}

function finishDraw(state, room, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  room.status = 'ended'; room.result = 'draw'; room.winnerPetId = null; room.loserPetId = null; room.resultReason = String(reason || '동점으로 무승부 처리되었습니다.').slice(0, 180);
  room.endedAt = nowIso(date); room.deadlineAt = null; room.settled = true; room.settlementId ||= id('legodokusettle'); room.rematchRequests = [];
  for (const petId of [room.hostPetId, room.guestPetId]) {
    const pet = state.pets[petId]; const refund = Math.max(0, int(room.escrow[petId]));
    if (pet?.alive) { pet.stats.points += refund; pet.records.pointsSpent = Math.max(0, int(pet.records.pointsSpent) - refund); awardResultRecords(pet, { draw: true }); }
    room.escrow[petId] = 0;
  }
  bumpRoomVersion(room, date); return true;
}

function makeFreshPuzzle(game) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const puzzle = generateLegodokuPuzzle(); const key = puzzleKey(puzzle);
    if (!game.recentPuzzleKeys.includes(key)) { game.recentPuzzleKeys.push(key); game.recentPuzzleKeys = game.recentPuzzleKeys.slice(-20); return puzzle; }
  }
  const puzzle = generateLegodokuPuzzle(); game.recentPuzzleKeys.push(puzzleKey(puzzle)); game.recentPuzzleKeys = game.recentPuzzleKeys.slice(-20); return puzzle;
}

function startMatch(state, game, room, date = new Date()) {
  const host = state.pets[room.hostPetId]; const guest = state.pets[room.guestPetId];
  if (!host?.alive || !guest?.alive) return { ok: false, message: '두 플레이어를 모두 찾을 수 없습니다.' };
  const battleCheck = canStartBattleForPets([host, guest], date); if (!battleCheck.ok) return battleCheck;
  if (host.stats.points < room.stakePoints || guest.stats.points < room.stakePoints) return { ok: false, message: '두 플레이어 모두 판돈을 보유해야 시작할 수 있습니다.' };
  host.stats.points -= room.stakePoints; host.records.pointsSpent += room.stakePoints; guest.stats.points -= room.stakePoints; guest.records.pointsSpent += room.stakePoints;
  const consumed = consumeBattleForPets([host, guest], date);
  if (!consumed.ok) { host.stats.points += room.stakePoints; host.records.pointsSpent -= room.stakePoints; guest.stats.points += room.stakePoints; guest.records.pointsSpent -= room.stakePoints; return consumed; }
  const puzzle = makeFreshPuzzle(game);
  room.puzzle = puzzle; room.escrow = { [host.id]: room.stakePoints, [guest.id]: room.stakePoints };
  room.players = {
    [host.id]: { petId: host.id, userId: host.userId, displayName: host.displayName, confirmed: [], foundCount: 0, mistakes: 0, completed: false, lastMove: null },
    [guest.id]: { petId: guest.id, userId: guest.userId, displayName: guest.displayName, confirmed: [], foundCount: 0, mistakes: 0, completed: false, lastMove: null }
  };
  room.status = 'playing'; room.matchId = id('legodokumatch'); room.processedActionIds = []; room.rematchRequests = []; room.departedPetIds = []; room.settled = false; room.settlementId = null;
  room.winnerPetId = null; room.loserPetId = null; room.result = null; room.resultReason = null; room.startedAt = nowIso(date); room.deadlineAt = new Date(date.getTime() + LEGODOKU_MATCH_SECONDS * 1000).toISOString(); room.endedAt = null;
  bumpRoomVersion(room, date); return { ok: true };
}

export function createLegodokuRoom(state, pet, stakeValue, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const battleCheck = canStartBattleForPets([pet], date); if (!battleCheck.ok) return battleCheck;
  if (!validLegodokuStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  const existing = activePlayerRoom(game, pet.id); if (existing) return { ok: true, roomId: existing.id, message: '이미 참가 중인 레고도쿠 대전방을 열었습니다.' };
  if (Object.values(game.rooms).filter((room) => room.status !== 'ended').length >= LEGODOKU_MAX_ROOMS) return { ok: false, message: '레고도쿠 대전방 3개가 모두 사용 중입니다.' };
  if (pet.stats.points < Number(stakeValue)) return { ok: false, message: `판돈 ${stakeValue}P가 필요합니다.` };
  const roomNumber = nextRoomNumber(game); const room = { id: id('legodokuroom'), roomNumber, status: 'waiting', hostPetId: pet.id, guestPetId: null, stakePoints: Number(stakeValue), matchId: id('legodokumatch'), puzzle: null, players: {}, spectators: {}, escrow: {}, processedActionIds: [], stateVersion: 0, rematchRequests: [], departedPetIds: [], settled: false, settlementId: null, winnerPetId: null, loserPetId: null, result: null, resultReason: null, createdAt: nowIso(date), startedAt: null, deadlineAt: null, endedAt: null, updatedAt: nowIso(date) };
  game.rooms[room.id] = room; return { ok: true, roomId: room.id, message: `${roomNumber}번 레고도쿠 대전방을 만들었습니다.` };
}

export function joinLegodokuRoom(state, pet, roomId, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const check = canStartBattleForPets([pet], date); if (!check.ok) return check;
  const room = game.rooms[roomId]; if (!room) return { ok: false, message: '레고도쿠 대전방을 찾을 수 없습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: true, roomId, message: '이미 이 방의 플레이어입니다.' };
  if (room.status !== 'waiting' || room.guestPetId) return { ok: false, message: '현재 플레이어로 참가할 수 없는 방입니다.' };
  if (activePlayerRoom(game, pet.id)) return { ok: false, message: '한 사용자는 동시에 여러 레고도쿠 대전방의 선수가 될 수 없습니다.' };
  if (pet.stats.points < room.stakePoints || state.pets[room.hostPetId].stats.points < room.stakePoints) return { ok: false, message: '둘 중 한 명의 포인트가 부족해 시작할 수 없습니다.' };
  room.guestPetId = pet.id; delete room.spectators[pet.id]; const started = startMatch(state, game, room, date); if (!started.ok) { room.guestPetId = null; return started; }
  return { ok: true, roomId, started: true, message: '상대 참가가 확정되어 레고도쿠 대전을 시작했습니다.' };
}

export function spectateLegodokuRoom(state, pet, roomId, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId];
  if (!room || room.status !== 'playing') return { ok: false, message: '진행 중인 레고도쿠 대전만 관전할 수 있습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  room.spectators[pet.id] = { petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: room.spectators[pet.id]?.joinedAt || nowIso(date) }; bumpRoomVersion(room, date);
  return { ok: true, roomId, message: '레고도쿠 대전 관전을 시작했습니다.' };
}

export function leaveLegodokuSpectator(state, pet, roomId, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 레고도쿠 대전방입니다.' }; if (!room.spectators?.[pet.id]) return { ok: true, message: '이미 관전을 종료했습니다.' };
  delete room.spectators[pet.id]; bumpRoomVersion(room, date); return { ok: true, message: '관전을 종료했습니다.' };
}

export function leaveLegodokuRoom(state, pet, roomId, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 레고도쿠 대전방입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return leaveLegodokuSpectator(state, pet, roomId, date);
  if (room.status === 'waiting') { delete game.rooms[roomId]; return { ok: true, message: '대기방을 닫았습니다.' }; }
  if (room.status === 'playing') { finishWin(state, room, opponentId(room, pet.id), pet.id, `${pet.displayName}이 나가 기권패했습니다.`, date); if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id); room.rematchRequests = room.rematchRequests.filter((x) => x !== pet.id); bumpRoomVersion(room, date); return { ok: true, forfeited: true, message: '기권패 처리되었습니다.' }; }
  if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id); room.rematchRequests = room.rematchRequests.filter((x) => x !== pet.id);
  if ([room.hostPetId, room.guestPetId].filter(Boolean).every((x) => room.departedPetIds.includes(x))) delete game.rooms[roomId]; else bumpRoomVersion(room, date);
  return { ok: true, message: '레고도쿠 대전방에서 나갔습니다.' };
}

export function playLegodokuCell(state, pet, roomId, input = {}, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId];
  if (!room) return { ok: false, terminal: true, stale: true, message: '레고도쿠 대전방이 이미 정리되었습니다.' };
  processLegodokuTimers(state, date, { roomId });
  if (room.status !== 'playing' || room.settled) return { ok: false, terminal: true, message: '이미 종료된 레고도쿠 대전입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 칸을 선택할 수 없습니다.' };
  if (String(input.matchId || '') !== room.matchId) return { ok: false, stale: true, message: '이전 대전의 입력이라 무시했습니다.' };
  const actionId = String(input.actionId || '').trim().slice(0, 100); if (!actionId) return { ok: false, message: '입력 요청 ID가 필요합니다.' };
  if (room.processedActionIds.includes(actionId)) return { ok: true, duplicate: true, actionId, stateVersion: room.stateVersion, message: '이미 처리된 선택입니다.' };
  const index = clampIndex(input.index); if (index < 0) return { ok: false, message: '선택한 칸이 올바르지 않습니다.' };
  room.processedActionIds.push(actionId); room.processedActionIds = room.processedActionIds.slice(-LEGODOKU_ACTION_HISTORY);
  const player = room.players[pet.id]; if (player.confirmed.includes(index)) return { ok: true, duplicateCell: true, correct: true, index, actionId, stateVersion: room.stateVersion, message: '이미 찾은 레고입니다.' };
  const correct = room.puzzle.solution.includes(index); player.lastMove = { index, correct, at: nowIso(date) };
  if (correct) {
    player.confirmed.push(index); player.confirmed.sort((a, b) => a - b); player.foundCount = player.confirmed.length; bumpRoomVersion(room, date);
    if (player.foundCount >= LEGODOKU_SIZE) { player.completed = true; finishWin(state, room, pet.id, opponentId(room, pet.id), `${pet.displayName}이 레고 8개를 먼저 모두 찾았습니다.`, date); return { ok: true, correct: true, index, finished: true, actionId, stateVersion: room.stateVersion, message: '정답! 레고도쿠를 완성해 승리했습니다!' }; }
    return { ok: true, correct: true, index, actionId, stateVersion: room.stateVersion, message: '정답!' };
  }
  player.mistakes = Math.min(LEGODOKU_MAX_MISTAKES, int(player.mistakes) + 1); bumpRoomVersion(room, date);
  if (player.mistakes >= LEGODOKU_MAX_MISTAKES) { finishWin(state, room, opponentId(room, pet.id), pet.id, `${pet.displayName}이 오답 3회로 패배했습니다.`, date); return { ok: true, correct: false, index, mistake: true, mistakes: player.mistakes, finished: true, actionId, stateVersion: room.stateVersion, message: '여기 아닙니다 · 실수 3회로 패배했습니다.' }; }
  return { ok: true, correct: false, index, mistake: true, mistakes: player.mistakes, actionId, stateVersion: room.stateVersion, message: '여기 아닙니다' };
}

export function requestLegodokuRematch(state, pet, roomId, date = new Date()) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 방에서만 재대결할 수 있습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id) || room.departedPetIds.includes(pet.id)) return { ok: false, message: '방을 나간 플레이어 또는 관전자는 재대결을 요청할 수 없습니다.' };
  if (room.departedPetIds.length) return { ok: false, message: '상대가 방을 나가 재대결할 수 없습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id); const other = opponentId(room, pet.id);
  if (!room.rematchRequests.includes(other)) return { ok: true, pending: true, message: '상대의 재대결 수락을 기다립니다.' };
  if (activePlayerRoom(game, pet.id, room.id) || activePlayerRoom(game, other, room.id)) { room.rematchRequests = []; return { ok: false, message: '둘 중 한 명이 다른 레고도쿠 대전방에서 플레이 중입니다.' }; }
  const started = startMatch(state, game, room, date); if (!started.ok) room.rematchRequests = []; return started.ok ? { ok: true, started: true, message: '새 문제로 재대결을 시작했습니다.' } : started;
}

export function processLegodokuTimers(state, date = new Date(), { roomId: targetRoomId = null } = {}) {
  const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); let changed = false; let settled = false;
  const entries = targetRoomId ? (game.rooms[targetRoomId] ? [[targetRoomId, game.rooms[targetRoomId]]] : []) : Object.entries(game.rooms);
  for (const [roomId, room] of entries) {
    if (room.status === 'waiting') { const base = new Date(room.updatedAt ?? room.createdAt ?? '').getTime(); if (Number.isFinite(base) && base + LEGODOKU_WAITING_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; } continue; }
    if (room.status === 'ended' && room.settled) { const base = new Date(room.endedAt ?? room.updatedAt ?? room.createdAt ?? '').getTime(); if (Number.isFinite(base) && base + LEGODOKU_ENDED_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; } continue; }
    if (room.status !== 'playing') continue; const deadline = new Date(room.deadlineAt ?? '').getTime(); if (!Number.isFinite(deadline) || deadline > date.getTime()) continue;
    const host = room.players[room.hostPetId]; const guest = room.players[room.guestPetId]; const hf = int(host?.foundCount); const gf = int(guest?.foundCount); const hm = int(host?.mistakes); const gm = int(guest?.mistakes);
    if (hf !== gf) { const winner = hf > gf ? room.hostPetId : room.guestPetId; finishWin(state, room, winner, opponentId(room, winner), `3분 종료 · 레고 ${Math.max(hf, gf)}개 대 ${Math.min(hf, gf)}개로 승리했습니다.`, date); }
    else if (hm !== gm) { const winner = hm < gm ? room.hostPetId : room.guestPetId; finishWin(state, room, winner, opponentId(room, winner), `3분 종료 · 둘 다 ${hf}개를 찾았고 실수가 ${Math.min(hm, gm)}회로 더 적어 승리했습니다.`, date); }
    else finishDraw(state, room, `3분 종료 · 레고 ${hf}개, 실수 ${hm}회로 완전히 동점입니다.`, date);
    changed = true; settled = true;
  }
  return { changed, settled };
}

export function legodokuNextAlarmAt(state, date = new Date()) {
  const game = normalizeLegodoku(state.legodoku, state, date); const now = date.getTime(); const candidates = [];
  for (const room of Object.values(game.rooms)) {
    if (room.status === 'waiting') candidates.push(new Date(room.updatedAt ?? room.createdAt ?? '').getTime() + LEGODOKU_WAITING_ROOM_TTL_MS);
    else if (room.status === 'playing') candidates.push(new Date(room.deadlineAt ?? '').getTime());
    else if (room.status === 'ended' && room.settled) candidates.push(new Date(room.endedAt ?? room.updatedAt ?? '').getTime() + LEGODOKU_ENDED_ROOM_TTL_MS);
  }
  const valid = candidates.filter((v) => Number.isFinite(v) && v > now); return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
}

function playerPublic(player, { revealConfirmed = false, revealLastMove = false } = {}) {
  return { petId: player.petId, displayName: player.displayName, confirmed: revealConfirmed ? [...player.confirmed] : [], foundCount: int(player.foundCount), mistakes: int(player.mistakes), completed: Boolean(player.completed), lastMove: revealLastMove && player.lastMove ? { ...player.lastMove } : null };
}

function publicRoomView(state, room, viewerPetId, date = new Date()) {
  const isPlayer = [room.hostPetId, room.guestPetId].includes(viewerPetId) && !room.departedPetIds.includes(viewerPetId); const isSpectator = Boolean(room.spectators?.[viewerPetId]); const viewerRole = isPlayer ? 'player' : isSpectator ? 'spectator' : 'none';
  const host = state.pets[room.hostPetId]; const guest = state.pets[room.guestPetId]; const players = {};
  if (room.status !== 'waiting') {
    const ended = room.status === 'ended';
    const spectatorCanSeeBoards = isSpectator && room.status === 'playing';
    players[room.hostPetId] = playerPublic(room.players[room.hostPetId], { revealConfirmed: ended || spectatorCanSeeBoards || viewerPetId === room.hostPetId, revealLastMove: ended || viewerPetId === room.hostPetId });
    players[room.guestPetId] = playerPublic(room.players[room.guestPetId], { revealConfirmed: ended || spectatorCanSeeBoards || viewerPetId === room.guestPetId, revealLastMove: ended || viewerPetId === room.guestPetId });
  }
  return {
    id: room.id, roomNumber: room.roomNumber, status: room.status, stakePoints: room.stakePoints, matchId: isPlayer ? room.matchId : null,
    host: host ? { petId: host.id, displayName: host.displayName } : null, guest: guest ? { petId: guest.id, displayName: guest.displayName } : null,
    viewerRole, selfPetId: isPlayer ? viewerPetId : null, opponentPetId: isPlayer ? opponentId(room, viewerPetId) : null, spectatorCount: Object.keys(room.spectators ?? {}).length,
    puzzle: room.puzzle ? { regions: [...room.puzzle.regions], difficulty: room.puzzle.difficulty, solution: room.status === 'ended' ? [...room.puzzle.solution] : [] } : null,
    players, maxMistakes: LEGODOKU_MAX_MISTAKES, stateVersion: room.stateVersion, winnerPetId: room.winnerPetId, loserPetId: room.loserPetId, result: room.result, resultReason: room.resultReason,
    rematchRequestedByMe: room.rematchRequests.includes(viewerPetId), startedAt: room.startedAt, deadlineAt: room.deadlineAt, endedAt: room.endedAt, updatedAt: room.updatedAt, serverTime: date.getTime()
  };
}

export function legodokuRoomView(state, roomId, viewerPetId, date = new Date()) { const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const room = game.rooms[roomId]; return room ? publicRoomView(state, room, viewerPetId, date) : null; }
export function legodokuView(state, viewerPetId, date = new Date()) { const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); return { maxRooms: LEGODOKU_MAX_ROOMS, stakes: [...LEGODOKU_STAKES], size: LEGODOKU_SIZE, matchSeconds: LEGODOKU_MATCH_SECONDS, maxMistakes: LEGODOKU_MAX_MISTAKES, serverTime: date.getTime(), rooms: Object.values(game.rooms).sort((a,b) => a.roomNumber-b.roomNumber).map((room) => publicRoomView(state, room, viewerPetId, date)) }; }
export function clearEndedLegodokuRooms(state, date = new Date()) { const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); const ids = Object.values(game.rooms).filter((room) => room.status === 'ended' && room.settled).map((room) => room.id); for (const roomId of ids) delete game.rooms[roomId]; return { ok: true, cleared: ids.length, message: ids.length ? `종료된 레고도쿠 대전방 ${ids.length}개를 비웠습니다.` : '비울 종료 레고도쿠 대전방이 없습니다.' }; }
export function legodokuRanking(state, viewerPetId = null) { const entries = Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => ({ petId: pet.id, displayName: pet.displayName, wins: int(pet.records?.seasonLegodokuWins), draws: int(pet.records?.seasonLegodokuDraws), losses: int(pet.records?.seasonLegodokuLosses) })).filter((e) => e.wins || e.draws || e.losses).sort((a,b) => b.wins-a.wins || a.losses-b.losses || b.draws-a.draws || a.displayName.localeCompare(b.displayName,'ko')); const myIndex = viewerPetId ? entries.findIndex((e) => e.petId === viewerPetId) : -1; return { top: entries.slice(0,5).map((e,i)=>({...e,rank:i+1})), mine: myIndex >= 0 ? {...entries[myIndex], rank:myIndex+1} : null }; }
export function removePetFromLegodoku(state, petId, date = new Date()) { const game = state.legodoku = normalizeLegodoku(state.legodoku, state, date); for (const room of Object.values(game.rooms)) { delete room.spectators?.[petId]; if (room.status === 'waiting' && room.hostPetId === petId) delete game.rooms[room.id]; else if (room.status === 'playing' && [room.hostPetId, room.guestPetId].includes(petId)) finishWin(state, room, opponentId(room, petId), petId, '플레이어 상태가 종료되어 기권패 처리되었습니다.', date); else if (room.status === 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) delete game.rooms[room.id]; } }
