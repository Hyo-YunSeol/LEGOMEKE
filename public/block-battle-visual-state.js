export function cloneBlockBattleVisualPlayer(player) {
  if (!player) return null;
  return {
    ...player,
    board: Array.from({ length: 20 }, (_, row) =>
      Array.from({ length: 10 }, (_, col) => player.board?.[row]?.[col] ?? null)),
    active: player.active ? { ...player.active } : null,
    next: Array.isArray(player.next) ? [...player.next] : []
  };
}

export function reconcileBlockBattleVisual(current, serverPlayer, key, { force = false, lockPending = false } = {}) {
  if (!serverPlayer || !key) return null;
  const serverPieces = Number(serverPlayer.pieces || 0);
  const visualPieces = Number(current?.player?.pieces || 0);
  const localPredictedAhead = Boolean(current && current.key === key && visualPieces > serverPieces && lockPending);
  const boundaryChanged = !current || current.key !== key
    || serverPieces > visualPieces
    || (serverPieces < visualPieces && !localPredictedAhead);

  if (force || boundaryChanged) return { key, player: cloneBlockBattleVisualPlayer(serverPlayer) };

  // 같은 piece가 떨어지는 동안 board/active/pieces는 절대 서버 snapshot으로 덮지 않는다.
  // HUD/다음블록처럼 위치와 무관한 정보만 authoritative 값으로 갱신한다.
  const player = current.player;
  player.connected = serverPlayer.connected;
  player.lines = serverPlayer.lines;
  player.score = serverPlayer.score;
  player.attackSent = serverPlayer.attackSent;
  player.pendingGarbage = serverPlayer.pendingGarbage;
  player.gravityDueAt = serverPlayer.gravityDueAt;
  player.next = Array.isArray(serverPlayer.next) ? [...serverPlayer.next] : player.next;
  return current;
}
