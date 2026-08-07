import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialTerritory,
  claimTerritory,
  territoryCounts,
  territoryRanking,
  territoryView,
  processTerritorySeason,
  clearPetTerritory,
  territoryNextAlarmAt
} from '../src/game/territory.js';
import { TERRITORY_SIZE, TERRITORY_WIN_POINTS } from '../src/game/constants.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-06T03:00:00.000Z');

function setup(names = [['u1', '윤설'], ['u2', '민균'], ['u3', '콩순']]) {
  const state = stateWithUsers(names, BASE);
  const pets = names.map(([userId]) => state.pets[state.users[userId].currentPetId]);
  state.territory = initialTerritory(BASE, 3);
  state.territory.goldenCell = { row: 0, col: 1 };
  return { state, pets };
}

function at(offsetMs) {
  return new Date(BASE.getTime() + offsetMs);
}

test('영토전은 4×4이며 황금칸은 마지막 2시간 전까지 숨기고 공개 시각을 첫 알람으로 잡는다', () => {
  const { state, pets } = setup();
  const view = territoryView(state, pets[0].id);
  assert.equal(view.size, TERRITORY_SIZE);
  assert.equal(view.size, 4);
  assert.equal(view.cells.length, 16);
  assert.equal(view.goldenRevealed, false);
  assert.equal(view.goldenCell, null);
  assert.equal(view.cells.some((cell) => cell.golden), false);
  assert.equal(territoryNextAlarmAt(state), view.goldenRevealAt);
  assert.equal(new Date(view.endsAt).getTime() - new Date(view.goldenRevealAt).getTime(), 2 * 60 * 60 * 1000);
});

test('구버전 15×15 데이터는 4×4 새 시즌으로 안전하게 초기화된다', () => {
  const { state, pets } = setup();
  state.territory = {
    version: 1,
    size: 15,
    seasonNumber: 7,
    seasonId: 'legacy',
    startedAt: BASE.toISOString(),
    endsAt: at(60_000).toISOString(),
    goldenCell: { row: 14, col: 14 },
    cells: { '14:14': { ownerPetId: pets[0].id, claimedAt: BASE.toISOString() } },
    settledSeasonIds: [],
    lastResult: null
  };
  const view = territoryView(state, pets[0].id);
  assert.equal(view.size, 4);
  assert.equal(state.territory.version, 4);
  assert.deepEqual(state.territory.cells, {});
  assert.equal(state.territory.seasonNumber, 8);
});

test('기존 4×4 데이터는 가장 오래된 소유 칸을 본진으로 승격해 보존한다', () => {
  const { state, pets } = setup();
  const pet = pets[0];
  state.territory.version = 3;
  state.territory.cells = {
    '1:1': { ownerPetId: pet.id, claimedAt: at(1000).toISOString() },
    '1:2': { ownerPetId: pet.id, claimedAt: at(2000).toISOString() }
  };
  const view = territoryView(state, pet.id);
  assert.equal(view.my.owned, 2);
  assert.equal(view.cells.find((cell) => cell.row === 1 && cell.col === 1).home, true);
  assert.equal(view.cells.find((cell) => cell.row === 1 && cell.col === 2).home, false);
});

test('첫 빈칸 점령은 빼앗기지 않는 본진이 되며 영토 수와 순위를 즉시 갱신한다', () => {
  const { state, pets } = setup();
  const pet = pets[0];
  const claimed = claimTerritory(state, pet, 2, 2, BASE);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.home, true);
  assert.equal(claimed.myOwned, 1);
  const view = territoryView(state, pet.id);
  assert.equal(view.my.owned, 1);
  assert.equal(view.my.rank, 1);
  assert.equal(view.cells.find((cell) => cell.row === 2 && cell.col === 2).home, true);
});

test('첫 영토가 없는 사용자는 다른 사람 땅부터 빼앗을 수 없고 실패해도 배고픔은 소모된다', () => {
  const { state, pets } = setup();
  const [owner, attacker] = pets;
  claimTerritory(state, owner, 1, 1, BASE);
  const before = attacker.stats.hunger;
  const result = claimTerritory(state, attacker, 1, 1, at(1));
  assert.equal(result.ok, false);
  assert.match(result.message, /첫 영토는 빈 회색칸/);
  assert.equal(attacker.stats.hunger, before - 1);
});

test('내 영토 주변 8칸의 빈 땅은 점령할 수 있고 멀리 떨어진 칸은 거부한다', () => {
  const { state, pets } = setup();
  const pet = pets[0];
  pet.stats.legoPower = 23; // Lv3
  assert.equal(claimTerritory(state, pet, 1, 1, BASE).ok, true);
  assert.equal(claimTerritory(state, pet, 2, 2, at(1)).ok, true, '대각선도 주변 8칸에 포함');
  const far = claimTerritory(state, pet, 0, 3, at(2));
  assert.equal(far.ok, false);
  assert.match(far.message, /주변 칸/);
  assert.equal(territoryCounts(state)[pet.id], 2);
});

test('보유 한도가 남아 있으면 인접한 상대 일반 영토를 바로 빼앗고 피해자는 한 칸을 잃는다', () => {
  const { state, pets } = setup();
  const [attacker, victim] = pets;
  attacker.stats.legoPower = 11; // Lv2
  victim.stats.legoPower = 11;
  claimTerritory(state, victim, 0, 1, BASE); // home
  claimTerritory(state, victim, 1, 1, at(1)); // normal
  claimTerritory(state, attacker, 2, 2, at(2)); // home, diagonal adjacent to 1,1
  const stolen = claimTerritory(state, attacker, 1, 1, at(3));
  assert.equal(stolen.ok, true);
  assert.equal(stolen.stolenFromPetId, victim.id);
  assert.equal(stolen.myOwned, 2);
  assert.equal(stolen.victimOwned, 1);
  assert.equal(state.territory.cells['1:1'].ownerPetId, attacker.id);
  assert.equal(attacker.records.territorySteals, 1);
});

test('상대 본진은 인접해 있어도 빼앗을 수 없다', () => {
  const { state, pets } = setup();
  const [attacker, victim] = pets;
  attacker.stats.legoPower = 11;
  claimTerritory(state, attacker, 1, 1, BASE);
  claimTerritory(state, victim, 1, 2, at(1));
  const result = claimTerritory(state, attacker, 1, 2, at(2));
  assert.equal(result.ok, false);
  assert.match(result.message, /본진은 빼앗을 수 없습니다/);
  assert.equal(state.territory.cells['1:2'].ownerPetId, victim.id);
});

test('보유 한도가 꽉 차면 가장 오래된 일반 영토를 자동 해제하고 본진은 유지한다', () => {
  const { state, pets } = setup();
  const pet = pets[0];
  pet.stats.legoPower = 11; // Lv2
  claimTerritory(state, pet, 1, 1, BASE); // home
  claimTerritory(state, pet, 1, 2, at(1)); // oldest normal
  const moved = claimTerritory(state, pet, 2, 2, at(2));
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.released, { row: 1, col: 2 });
  assert.equal(state.territory.cells['1:1'].home, true);
  assert.equal(state.territory.cells['1:2'], undefined);
  assert.equal(state.territory.cells['2:2'].ownerPetId, pet.id);
  assert.equal(territoryCounts(state)[pet.id], 2);
});

test('Lv1은 본진 한 칸만 보유하므로 본진을 버리고 이동할 수 없다', () => {
  const { state, pets } = setup();
  const pet = pets[0];
  claimTerritory(state, pet, 1, 1, BASE);
  const moved = claimTerritory(state, pet, 1, 2, at(1));
  assert.equal(moved.ok, false);
  assert.match(moved.message, /본진은 유지해야/);
  assert.equal(territoryCounts(state)[pet.id], 1);
});

test('황금칸 공개 시각이 되면 한 번만 공개되고 소식과 뷰에 반영된다', () => {
  const { state, pets } = setup();
  const revealAt = new Date(state.territory.goldenRevealAt);
  assert.equal(processTerritorySeason(state, new Date(revealAt.getTime() - 1)).changed, false);
  const result = processTerritorySeason(state, new Date(revealAt.getTime() + 1));
  assert.equal(result.changed, true);
  assert.equal(state.territory.goldenRevealed, true);
  const view = territoryView(state, pets[0].id);
  assert.deepEqual(view.goldenCell, state.territory.goldenCell);
  assert.equal(view.cells.filter((cell) => cell.golden).length, 1);
  assert.match(state.publicEvents[0].text, /황금 영토가 공개/);
  assert.equal(territoryNextAlarmAt(state), state.territory.endsAt);
});

test('황금 공개 전 동률 순위는 황금 보유자를 숨기고 공동 1위로 표시한다', () => {
  const { state, pets } = setup();
  const [a, b, c] = pets;
  state.territory.goldenCell = { row: 0, col: 0 };
  state.territory.cells = {
    '0:0': { ownerPetId: a.id, claimedAt: BASE.toISOString(), home: true },
    '0:1': { ownerPetId: a.id, claimedAt: at(1).toISOString(), home: false },
    '1:0': { ownerPetId: b.id, claimedAt: BASE.toISOString(), home: true },
    '1:1': { ownerPetId: b.id, claimedAt: at(1).toISOString(), home: false },
    '2:0': { ownerPetId: c.id, claimedAt: BASE.toISOString(), home: true }
  };
  const ranking = territoryRanking(state);
  assert.equal(ranking.winner, null);
  assert.equal(ranking.entries.find((entry) => entry.petId === a.id).rank, 1);
  assert.equal(ranking.entries.find((entry) => entry.petId === b.id).rank, 1);
  assert.equal(ranking.entries.find((entry) => entry.petId === c.id).rank, 2);
  assert.equal(ranking.entries.some((entry) => entry.hasGolden), false);
});

test('황금 공개 후 최다 영토 동점에서는 황금칸 동점자만 1위, 나머지는 공동 2위로 간다', () => {
  const { state, pets } = setup();
  const [a, b, c] = pets;
  state.territory.goldenRevealed = true;
  state.territory.goldenCell = { row: 0, col: 0 };
  state.territory.cells = {
    '0:0': { ownerPetId: a.id, claimedAt: BASE.toISOString(), home: true },
    '0:1': { ownerPetId: a.id, claimedAt: at(1).toISOString(), home: false },
    '1:0': { ownerPetId: b.id, claimedAt: BASE.toISOString(), home: true },
    '1:1': { ownerPetId: b.id, claimedAt: at(1).toISOString(), home: false },
    '2:0': { ownerPetId: c.id, claimedAt: BASE.toISOString(), home: true }
  };
  const ranking = territoryRanking(state);
  assert.equal(ranking.winner.petId, a.id);
  assert.deepEqual(ranking.entries.map((entry) => [entry.petId, entry.rank]), [[a.id,1],[b.id,2],[c.id,3]]);
});

test('황금 공개 후 최다 동점자 중 황금칸 보유자가 없으면 단독 우승자는 없다', () => {
  const { state, pets } = setup();
  const [a, b, c] = pets;
  state.territory.goldenRevealed = true;
  state.territory.goldenCell = { row: 3, col: 3 };
  state.territory.cells = {
    '0:0': { ownerPetId: a.id, claimedAt: BASE.toISOString(), home: true },
    '0:1': { ownerPetId: a.id, claimedAt: at(1).toISOString(), home: false },
    '1:0': { ownerPetId: b.id, claimedAt: BASE.toISOString(), home: true },
    '1:1': { ownerPetId: b.id, claimedAt: at(1).toISOString(), home: false },
    '3:3': { ownerPetId: c.id, claimedAt: BASE.toISOString(), home: true }
  };
  const ranking = territoryRanking(state);
  assert.equal(ranking.winner, null);
  assert.equal(ranking.entries.find((entry) => entry.petId === a.id)?.rank, 2);
  assert.equal(ranking.entries.find((entry) => entry.petId === b.id)?.rank, 2);
  assert.equal(ranking.entries.find((entry) => entry.petId === c.id)?.rank, 3);
});

test('시즌 종료는 단독 우승자에게만 300P를 한 번 지급하고 새 4×4 맵으로 초기화한다', () => {
  const { state, pets } = setup();
  const [a, b] = pets;
  const initialPoints = a.stats.points;
  state.territory.goldenRevealed = true;
  state.territory.goldenCell = { row: 0, col: 0 };
  state.territory.cells = {
    '0:0': { ownerPetId: a.id, claimedAt: BASE.toISOString(), home: true },
    '0:1': { ownerPetId: a.id, claimedAt: at(1).toISOString(), home: false },
    '1:0': { ownerPetId: b.id, claimedAt: BASE.toISOString(), home: true }
  };
  state.territory.endsAt = at(1000).toISOString();
  state.territory.goldenRevealAt = BASE.toISOString();
  const after = at(2000);
  const result = processTerritorySeason(state, after);
  assert.equal(result.changed, true);
  assert.equal(result.settled.winnerPetId, a.id);
  assert.equal(result.settled.reward, TERRITORY_WIN_POINTS);
  assert.equal(a.stats.points, initialPoints + 300);
  assert.equal(a.records.territoryWins, 1);
  assert.deepEqual(state.territory.cells, {});
  assert.equal(processTerritorySeason(state, after).changed, false);
  assert.equal(a.stats.points, initialPoints + 300);
});

test('파손·강퇴 초기화용 영토 삭제는 해당 레고 땅만 제거하고 제거 개수를 반환한다', () => {
  const { state, pets } = setup();
  const [a, b] = pets;
  state.territory.cells = {
    '0:0': { ownerPetId: a.id, claimedAt: BASE.toISOString(), home: true },
    '0:1': { ownerPetId: b.id, claimedAt: BASE.toISOString(), home: true }
  };
  assert.equal(clearPetTerritory(state, a.id), 1);
  assert.equal(state.territory.cells['0:0'], undefined);
  assert.equal(state.territory.cells['0:1'].ownerPetId, b.id);
});
