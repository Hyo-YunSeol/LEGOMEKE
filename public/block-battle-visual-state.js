export function cloneBlockBattleVisualPlayer(player) {
  if (!player) return null;
  return {
    ...player,
    board: Array.from({ length: 20 }, (_, row) =>
      Array.from({ length: 10 }, (_, col) => player.board?.[row]?.[col] ?? null)),
    active: player.active ? { ...player.active } : null,
    next: Array.isArray(player.next) ? [...player.next] : [],
    pendingGarbageHoles: Array.isArray(player.pendingGarbageHoles) ? [...player.pendingGarbageHoles] : []
  };
}

function blockBattleVisualGameplayMatches(a, b) {
  if (!a || !b || Number(a.pieces || 0) !== Number(b.pieces || 0)) return false;
  const activeA = a.active || null;
  const activeB = b.active || null;
  if (JSON.stringify(activeA) !== JSON.stringify(activeB)) return false;
  if (JSON.stringify(a.board) !== JSON.stringify(b.board)) return false;
  if (String(a.next?.[0] || '') !== String(b.next?.[0] || '')) return false;
  if (Number(a.pendingGarbage || 0) !== Number(b.pendingGarbage || 0)) return false;
  return JSON.stringify(Array.isArray(a.pendingGarbageHoles) ? a.pendingGarbageHoles : [])
    === JSON.stringify(Array.isArray(b.pendingGarbageHoles) ? b.pendingGarbageHoles : []);
}

export function reconcileBlockBattleVisual(current, serverPlayer, key, { force = false, lockPending = false } = {}) {
  if (!serverPlayer || !key) return null;
  const serverPieces = Number(serverPlayer.pieces || 0);
  const visualPieces = Number(current?.player?.pieces || 0);
  const localPredictedAhead = Boolean(current && current.key === key && visualPieces > serverPieces && lockPending);
  const boundaryChanged = !current || current.key !== key
    || serverPieces > visualPieces
    || (serverPieces < visualPieces && !localPredictedAhead);

  if (force || boundaryChanged) {
    // 로컬 lock 예측이 서버 확정 결과와 이미 완전히 같다면 객체/DOM을 갈아엎지 않는다.
    // ACK 순간의 불필요한 화면 교체가 낙하 블록이 한 프레임 반짝이는 원인이 되지 않게 한다.
    if (current?.key === key && blockBattleVisualGameplayMatches(current.player, serverPlayer)) {
      const player = current.player;
      player.connected = serverPlayer.connected;
      player.lines = serverPlayer.lines;
      player.score = serverPlayer.score;
      player.attackSent = serverPlayer.attackSent;
      player.pendingGarbage = serverPlayer.pendingGarbage;
      player.pendingGarbageHoles = Array.isArray(serverPlayer.pendingGarbageHoles) ? [...serverPlayer.pendingGarbageHoles] : [];
      player.next = Array.isArray(serverPlayer.next) ? [...serverPlayer.next] : player.next;
      player.gravityDueAt = serverPlayer.gravityDueAt;
      return current;
    }
    return { key, player: cloneBlockBattleVisualPlayer(serverPlayer) };
  }

  // 같은 piece가 떨어지는 동안 board/active/pieces는 절대 서버 snapshot으로 덮지 않는다.
  // HUD/다음블록처럼 위치와 무관한 정보만 authoritative 값으로 갱신한다.
  const player = current.player;
  player.connected = serverPlayer.connected;
  player.score = serverPlayer.score;
  player.attackSent = serverPlayer.attackSent;
  player.gravityDueAt = serverPlayer.gravityDueAt;
  // lock을 로컬에서 한 piece 앞서 그린 동안에는 서버의 이전 piece HUD/방해줄/next가
  // 예측 결과를 되감지 않게 유지한다. ACK로 serverPieces가 따라오면 위 경계 로직에서 확정한다.
  if (!localPredictedAhead) {
    player.lines = serverPlayer.lines;
    player.pendingGarbage = serverPlayer.pendingGarbage;
    player.pendingGarbageHoles = Array.isArray(serverPlayer.pendingGarbageHoles) ? [...serverPlayer.pendingGarbageHoles] : player.pendingGarbageHoles;
    player.next = Array.isArray(serverPlayer.next) ? [...serverPlayer.next] : player.next;
  }
  return current;
}
