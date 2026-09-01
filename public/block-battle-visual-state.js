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
  const sameKey = Boolean(current && current.key === key);
  const localPredictedAhead = Boolean(sameKey && visualPieces > serverPieces && lockPending);

  if (!sameKey) return { key, player: cloneBlockBattleVisualPlayer(serverPlayer) };

  const player = current.player;

  // 서버가 실제로 한 piece 이상 앞서 간 경우(재접속/서버 fallback)만 전체 gameplay 상태를
  // authoritative 값으로 교정한다. 정상 플레이 중 같은 piece의 row/col 차이 때문에 active를
  // 통째로 바꾸지 않아 낙하 블록이 서버 push마다 사라졌다 나타나는 현상을 막는다.
  if (serverPieces > visualPieces) return { key, player: cloneBlockBattleVisualPlayer(serverPlayer) };

  // 로컬이 lock을 한 piece 먼저 예측한 동안에는 이전 서버 piece가 visual을 되감지 못한다.
  if (localPredictedAhead) {
    player.connected = serverPlayer.connected;
    player.score = serverPlayer.score;
    player.attackSent = serverPlayer.attackSent;
    player.gravityDueAt = serverPlayer.gravityDueAt;
    return current;
  }

  // 동일 piece 번호에서는 active 타입이 같다면 현재 DOM이 그리고 있는 active 객체를 그대로
  // 유지한다. ACK가 row/col/rotation이 조금 뒤처져 와도 낙하 블록을 교체하지 않는다.
  // lock ACK처럼 force=true일 때는 고정 board/HUD/방해줄/next만 서버값으로 확정한다.
  const samePiece = serverPieces === visualPieces;
  if (samePiece) {
    player.connected = serverPlayer.connected;
    player.score = serverPlayer.score;
    player.attackSent = serverPlayer.attackSent;
    player.gravityDueAt = serverPlayer.gravityDueAt;

    if (force) {
      player.board = Array.from({ length: 20 }, (_, row) =>
        Array.from({ length: 10 }, (_, col) => serverPlayer.board?.[row]?.[col] ?? null));
      player.lines = serverPlayer.lines;
      player.pendingGarbage = serverPlayer.pendingGarbage;
      player.pendingGarbageHoles = Array.isArray(serverPlayer.pendingGarbageHoles) ? [...serverPlayer.pendingGarbageHoles] : [];
      player.next = Array.isArray(serverPlayer.next) ? [...serverPlayer.next] : [];

      const localActive = player.active || null;
      const serverActive = serverPlayer.active || null;
      if (!localActive || !serverActive || localActive.type !== serverActive.type) {
        player.active = serverActive ? { ...serverActive } : null;
      }
      return current;
    }

    // 평상시 서버 push는 낙하 위치와 고정 board를 건드리지 않고 HUD만 갱신한다.
    player.lines = serverPlayer.lines;
    player.pendingGarbage = serverPlayer.pendingGarbage;
    player.pendingGarbageHoles = Array.isArray(serverPlayer.pendingGarbageHoles) ? [...serverPlayer.pendingGarbageHoles] : player.pendingGarbageHoles;
    player.next = Array.isArray(serverPlayer.next) ? [...serverPlayer.next] : player.next;
    return current;
  }

  // serverPieces < visualPieces인데 lockPending이 아닌 비정상 상태는 서버값으로 복구한다.
  return { key, player: cloneBlockBattleVisualPlayer(serverPlayer) };
}
