// 블럭왕: 서버에서 정상 정산된 단판 최고점만 시즌 기록에 반영합니다.
const nni = value => Math.max(0, Math.floor(Number(value) || 0));
const at = value => {const n=new Date(value||'').getTime();return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};
export function blockKingRecord(pet) {
  const records=pet?.records||{};
  return {score:nni(records.seasonBlockKingBestScore),removed:nni(records.seasonBlockKingBestRemoved),
    moves:nni(records.seasonBlockKingBestMoves),achievedAt:records.seasonBlockKingBestAt||null};
}
export function compareBlockKing(a,b) {
  return b.score-a.score || b.removed-a.removed || a.moves-b.moves || at(a.achievedAt)-at(b.achievedAt);
}
export function recordBlockKingScore(pet, score, removed, moves, date=new Date()) {
  pet.records ??={};
  const candidate={score:nni(score),removed:nni(removed),moves:nni(moves),achievedAt:date.toISOString()};
  const previous=blockKingRecord(pet);
  if(candidate.score<=0 || (previous.score>0 && compareBlockKing(candidate,previous)>=0))return false;
  pet.records.seasonBlockKingBestScore=candidate.score;
  pet.records.seasonBlockKingBestRemoved=candidate.removed;
  pet.records.seasonBlockKingBestMoves=candidate.moves;
  pet.records.seasonBlockKingBestAt=candidate.achievedAt;
  return true;
}
export function blockKingRows(state) {
  return Object.values(state.pets??{}).filter(pet=>pet?.alive).map(pet=>({pet,...blockKingRecord(pet)}))
    .filter(row=>row.score>0).sort((a,b)=>compareBlockKing(a,b)||a.pet.displayName.localeCompare(b.pet.displayName,'ko'));
}
