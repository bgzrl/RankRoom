import { randomInt, randomUUID } from 'node:crypto';
import {
  DEFAULT_ROOM_SETTINGS,
  computeItemMetrics,
  computeRoundItemCount,
  drawSmartDeck,
  getUnplayedItemsCount,
  isValidScoreForScale,
  rankGameItems,
  type GamePhase,
  type ItemRevealResult,
  type PersistedGameResult,
  type PlayerSummary,
  type PlayerVoteDetail,
  type PublicPlayer,
  type PublicRoomState,
  type PublicThemeItem,
  type RandomIndexFn,
  type RoomSettings,
  type ThemeDetailDto,
} from '@rankroom/shared';

export interface InternalPlayer {
  id: string;
  token: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
  socketId: string | null;
}

export interface InternalRoomState {
  roomCode: string;
  phase: GamePhase;
  theme: ThemeDetailDto;
  orderedItems: PublicThemeItem[];
  playedItemIdsByTheme: Map<string, Set<string>>;
  lastItemIdByTheme: Map<string, string | null>;
  settings: RoomSettings;
  players: Map<string, InternalPlayer>;
  currentItemIndex: number;
  votesByItemId: Map<string, Map<string, number>>;
  phaseEndsAt: number | null;
  allVotedGraceEndsAt: number | null;
  currentReveal: ItemRevealResult | null;
  finalResult: PersistedGameResult | null;
  createdAt: number;
  lastActivityAt: number;
}

export class GameStateError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameStateError';
    this.code = code;
  }
}

function toPublicThemeItems(theme: ThemeDetailDto): PublicThemeItem[] {
  return [...theme.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imagePath: item.imagePath,
      position: item.position,
    }));
}

function cryptoRandomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return randomInt(0, maxExclusive);
}

export function getRoomDeckStats(room: InternalRoomState): {
  totalThemeItems: number;
  unplayedCount: number;
} {
  const totalThemeItems = room.theme.items.length;
  const playedSet = room.playedItemIdsByTheme.get(room.theme.id);
  const unplayedCount = playedSet
    ? getUnplayedItemsCount(room.theme.items, playedSet)
    : totalThemeItems;
  return { totalThemeItems, unplayedCount };
}

export function getConnectedPlayers(room: InternalRoomState): InternalPlayer[] {
  return Array.from(room.players.values()).filter((p) => p.connected);
}

export function findPlayerByToken(
  room: InternalRoomState,
  token: string,
): InternalPlayer | undefined {
  for (const player of room.players.values()) {
    if (player.token === token) {
      return player;
    }
  }
  return undefined;
}

export function getCurrentItem(room: InternalRoomState): PublicThemeItem | null {
  if (room.phase !== 'VOTING' && room.phase !== 'ITEM_REVEAL') {
    return null;
  }
  return room.orderedItems[room.currentItemIndex] ?? null;
}

export function buildVoteStatuses(room: InternalRoomState): Record<string, boolean> {
  const currentItem = getCurrentItem(room);
  const statuses: Record<string, boolean> = {};
  const itemVotes = currentItem ? room.votesByItemId.get(currentItem.id) : undefined;

  for (const player of room.players.values()) {
    statuses[player.id] = itemVotes ? itemVotes.has(player.id) : false;
  }

  return statuses;
}

export function areAllConnectedPlayersVoted(room: InternalRoomState): boolean {
  if (room.phase !== 'VOTING') {
    return false;
  }
  const currentItem = getCurrentItem(room);
  if (!currentItem) {
    return false;
  }
  const connected = getConnectedPlayers(room);
  if (connected.length === 0) {
    return false;
  }
  const itemVotes = room.votesByItemId.get(currentItem.id);
  if (!itemVotes) {
    return false;
  }
  return connected.every((player) => itemVotes.has(player.id));
}

export function createRoomState(params: {
  roomCode: string;
  theme: ThemeDetailDto;
  hostToken: string;
  hostDisplayName: string;
  hostSocketId: string | null;
  settings?: Partial<RoomSettings>;
  now?: number;
}): { room: InternalRoomState; hostPlayer: InternalPlayer } {
  if (params.theme.items.length < 3) {
    throw new GameStateError(
      'THEME_TOO_SMALL',
      'Un thème doit contenir au moins 3 items pour démarrer une partie.',
    );
  }

  const now = params.now ?? Date.now();
  const hostPlayer: InternalPlayer = {
    id: randomUUID(),
    token: params.hostToken,
    displayName: params.hostDisplayName,
    isHost: true,
    connected: true,
    joinedAt: now,
    socketId: params.hostSocketId,
  };

  const players = new Map<string, InternalPlayer>();
  players.set(hostPlayer.id, hostPlayer);

  const room: InternalRoomState = {
    roomCode: params.roomCode,
    phase: 'LOBBY',
    theme: params.theme,
    orderedItems: toPublicThemeItems(params.theme),
    playedItemIdsByTheme: new Map(),
    lastItemIdByTheme: new Map(),
    settings: {
      ...DEFAULT_ROOM_SETTINGS,
      ...params.settings,
    },
    players,
    currentItemIndex: 0,
    votesByItemId: new Map(),
    phaseEndsAt: null,
    allVotedGraceEndsAt: null,
    currentReveal: null,
    finalResult: null,
    createdAt: now,
    lastActivityAt: now,
  };

  return { room, hostPlayer };
}

export function joinRoomState(
  room: InternalRoomState,
  params: {
    playerToken: string;
    displayName: string;
    socketId: string | null;
    now?: number;
  },
): { player: InternalPlayer; reconnected: boolean } {
  const now = params.now ?? Date.now();
  room.lastActivityAt = now;

  const existing = findPlayerByToken(room, params.playerToken);
  if (existing) {
    existing.connected = true;
    existing.socketId = params.socketId;
    if (params.displayName.trim().length > 0 && room.phase === 'LOBBY') {
      existing.displayName = params.displayName.trim();
    }
    return { player: existing, reconnected: true };
  }

  const hasHost = Array.from(room.players.values()).some((p) => p.isHost);

  const newPlayer: InternalPlayer = {
    id: randomUUID(),
    token: params.playerToken,
    displayName: params.displayName.trim(),
    isHost: !hasHost,
    connected: true,
    joinedAt: now,
    socketId: params.socketId,
  };

  room.players.set(newPlayer.id, newPlayer);
  return { player: newPlayer, reconnected: false };
}

export function disconnectPlayerState(
  room: InternalRoomState,
  playerId: string,
  now = Date.now(),
): { player: InternalPlayer | null } {
  const player = room.players.get(playerId) ?? null;
  if (!player) {
    return { player: null };
  }
  player.connected = false;
  player.socketId = null;
  room.lastActivityAt = now;
  return { player };
}

export function transferHostIfNeeded(room: InternalRoomState): string | null {
  const currentHost = Array.from(room.players.values()).find((p) => p.isHost);
  if (currentHost && currentHost.connected) {
    return null;
  }

  const nextCandidate = Array.from(room.players.values())
    .filter((p) => p.connected && (!currentHost || p.id !== currentHost.id))
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

  if (!nextCandidate) {
    return null;
  }

  if (currentHost) {
    currentHost.isHost = false;
  }
  nextCandidate.isHost = true;
  return nextCandidate.id;
}

export function leavePlayerState(
  room: InternalRoomState,
  playerId: string,
  now = Date.now(),
): { removed: boolean; newHostId: string | null } {
  const player = room.players.get(playerId);
  if (!player) {
    return { removed: false, newHostId: null };
  }

  room.lastActivityAt = now;
  const wasHost = player.isHost;

  if (room.phase === 'LOBBY') {
    room.players.delete(playerId);
  } else {
    // Keep historical player identity if they already voted, or mark disconnected
    const hasAnyVote = Array.from(room.votesByItemId.values()).some((map) => map.has(playerId));
    if (hasAnyVote) {
      player.connected = false;
      player.socketId = null;
      player.isHost = false;
    } else {
      room.players.delete(playerId);
    }
  }

  let newHostId: string | null = null;
  if (wasHost) {
    newHostId = transferHostIfNeeded(room);
  }

  return { removed: true, newHostId };
}

export function updateRoomSettingsState(
  room: InternalRoomState,
  actorPlayerId: string,
  updates: {
    theme?: ThemeDetailDto;
    settings?: Partial<RoomSettings>;
  },
  now = Date.now(),
): {
  theme: ThemeDetailDto;
  settings: RoomSettings;
  totalThemeItems: number;
  unplayedCount: number;
} {
  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.isHost) {
    throw new GameStateError('FORBIDDEN', "Seul l'hôte peut modifier les paramètres de la salle.");
  }
  if (room.phase !== 'LOBBY') {
    throw new GameStateError(
      'INVALID_PHASE',
      'Les paramètres ne peuvent être modifiés que dans le lobby.',
    );
  }

  if (updates.theme) {
    if (updates.theme.items.length < 3) {
      throw new GameStateError(
        'THEME_TOO_SMALL',
        'Le thème sélectionné doit contenir au moins 3 items.',
      );
    }
    room.theme = updates.theme;
    room.orderedItems = toPublicThemeItems(updates.theme);
  }

  if (updates.settings) {
    room.settings = {
      ...room.settings,
      ...updates.settings,
    };
  }

  room.lastActivityAt = now;
  const deckStats = getRoomDeckStats(room);
  return {
    theme: room.theme,
    settings: room.settings,
    ...deckStats,
  };
}

export function resetDeckState(
  room: InternalRoomState,
  actorPlayerId: string,
  now = Date.now(),
): { totalThemeItems: number; unplayedCount: number } {
  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.isHost) {
    throw new GameStateError('FORBIDDEN', "Seul l'hôte peut réinitialiser la pioche.");
  }
  if (room.phase !== 'LOBBY') {
    throw new GameStateError(
      'INVALID_PHASE',
      'La pioche ne peut être réinitialisée que dans le lobby.',
    );
  }

  room.playedItemIdsByTheme.delete(room.theme.id);
  room.lastItemIdByTheme.delete(room.theme.id);
  room.lastActivityAt = now;
  return getRoomDeckStats(room);
}

export interface StartGameOptions {
  freshTheme?: ThemeDetailDto;
  randomIndex?: RandomIndexFn;
  now?: number;
}

export function startGameState(
  room: InternalRoomState,
  actorPlayerId: string,
  optionsOrNow: StartGameOptions | number = {},
): {
  deckResetOccurred: boolean;
  totalThemeItems: number;
  unplayedCount: number;
} {
  const options: StartGameOptions =
    typeof optionsOrNow === 'number' ? { now: optionsOrNow } : optionsOrNow;
  const now = options.now ?? Date.now();

  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.isHost) {
    throw new GameStateError('FORBIDDEN', "Seul l'hôte peut démarrer la partie.");
  }
  if (room.phase !== 'LOBBY') {
    throw new GameStateError('INVALID_PHASE', 'La partie a déjà démarré.');
  }
  const connected = getConnectedPlayers(room);
  if (connected.length === 0) {
    throw new GameStateError('NO_PLAYERS', 'Aucun joueur connecté dans la salle.');
  }

  if (options.freshTheme) {
    if (options.freshTheme.items.length < 3) {
      throw new GameStateError('THEME_TOO_SMALL', 'Le thème doit contenir au moins 3 items.');
    }
    room.theme = options.freshTheme;
  } else if (room.theme.items.length < 3) {
    throw new GameStateError('THEME_TOO_SMALL', 'Le thème doit contenir au moins 3 items.');
  }

  const baseItems = toPublicThemeItems(room.theme);
  const existingPlayed = room.playedItemIdsByTheme.get(room.theme.id) ?? new Set<string>();
  const lastItemId = room.lastItemIdByTheme.get(room.theme.id) ?? null;

  const drawResult = drawSmartDeck({
    items: baseItems,
    playedItemIds: existingPlayed,
    targetCount: room.settings.itemCount,
    itemOrder: room.settings.itemOrder,
    avoidRepeats: room.settings.avoidRepeats,
    lastPlayedItemId: lastItemId,
    randomIndex: options.randomIndex ?? cryptoRandomIndex,
  });

  room.playedItemIdsByTheme.set(room.theme.id, drawResult.nextPlayedItemIds);
  room.lastItemIdByTheme.set(room.theme.id, drawResult.nextLastPlayedItemId);
  room.orderedItems = drawResult.drawnItems;
  room.votesByItemId.clear();
  room.currentItemIndex = 0;
  room.currentReveal = null;
  room.finalResult = null;
  room.phase = 'VOTING';
  room.allVotedGraceEndsAt = null;
  room.phaseEndsAt =
    room.settings.timeLimitSeconds !== null
      ? now + room.settings.timeLimitSeconds * 1000
      : null;
  room.lastActivityAt = now;

  return {
    deckResetOccurred: drawResult.deckResetOccurred,
    totalThemeItems: baseItems.length,
    unplayedCount: drawResult.unplayedAfterDraw,
  };
}

export function castVoteState(
  room: InternalRoomState,
  actorPlayerId: string,
  payload: { itemId: string; score: number },
  now = Date.now(),
): { acceptedScore: number; allConnectedVoted: boolean } {
  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.connected) {
    throw new GameStateError('PLAYER_NOT_FOUND', 'Joueur introuvable ou déconnecté.');
  }
  if (room.phase !== 'VOTING') {
    throw new GameStateError('INVALID_PHASE', "Les votes ne sont pas ouverts actuellement.");
  }

  const currentItem = getCurrentItem(room);
  if (!currentItem || currentItem.id !== payload.itemId) {
    throw new GameStateError('ITEM_MISMATCH', "Cet item n'est pas en cours de vote.");
  }

  if (!isValidScoreForScale(payload.score, room.settings.ratingScale)) {
    throw new GameStateError(
      'INVALID_SCORE',
      room.settings.ratingScale === 'integers'
        ? 'La note doit être un entier entre 1 et 5.'
        : 'La note doit être comprise entre 0.5 et 5 par paliers de 0.5.',
    );
  }

  let itemVotes = room.votesByItemId.get(currentItem.id);
  if (!itemVotes) {
    itemVotes = new Map();
    room.votesByItemId.set(currentItem.id, itemVotes);
  }
  itemVotes.set(actorPlayerId, payload.score);
  room.lastActivityAt = now;

  return {
    acceptedScore: payload.score,
    allConnectedVoted: areAllConnectedPlayersVoted(room),
  };
}

function buildItemVotesList(room: InternalRoomState, itemId: string): PlayerVoteDetail[] {
  const votesMap = room.votesByItemId.get(itemId);
  if (!votesMap) {
    return [];
  }
  const details: PlayerVoteDetail[] = [];
  for (const [playerId, score] of votesMap.entries()) {
    const player = room.players.get(playerId);
    if (player) {
      details.push({
        playerId,
        displayName: player.displayName,
        score,
      });
    }
  }
  return details.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }),
  );
}

function finalizeGameResult(
  room: InternalRoomState,
  resultId: string,
  now: number,
): PersistedGameResult {
  const rankings = rankGameItems(
    room.orderedItems.map((item) => ({
      itemId: item.id,
      name: item.name,
      description: item.description,
      imagePath: item.imagePath,
      originalPosition: item.position,
      votes: buildItemVotesList(room, item.id),
    })),
    room.settings.ratingScale,
  );

  const players: PlayerSummary[] = Array.from(room.players.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isHost: p.isHost,
    }));

  return {
    id: resultId,
    roomCode: room.roomCode,
    themeId: room.theme.id,
    themeTitle: room.theme.title,
    themeCategory: room.theme.category,
    settings: { ...room.settings },
    players,
    rankings,
    createdAt: now,
  };
}

export type AdvanceOutcome =
  | { kind: 'ITEM_REVEAL'; reveal: ItemRevealResult }
  | { kind: 'NEXT_VOTING'; itemIndex: number }
  | { kind: 'FINAL_RESULTS'; result: PersistedGameResult };

export function advanceFromVotingState(
  room: InternalRoomState,
  options: { generateResultId: () => string; revealDurationMs: number; now?: number },
): AdvanceOutcome {
  if (room.phase !== 'VOTING') {
    throw new GameStateError('INVALID_PHASE', "Impossible de clôturer le vote hors phase VOTING.");
  }
  const currentItem = getCurrentItem(room);
  if (!currentItem) {
    throw new GameStateError('NO_CURRENT_ITEM', 'Aucun item actif.');
  }

  const now = options.now ?? Date.now();
  room.lastActivityAt = now;
  room.allVotedGraceEndsAt = null;

  if (room.settings.revealBetweenItems) {
    const votes = buildItemVotesList(room, currentItem.id);
    const metrics = computeItemMetrics(
      {
        itemId: currentItem.id,
        name: currentItem.name,
        description: currentItem.description,
        imagePath: currentItem.imagePath,
        originalPosition: currentItem.position,
        votes,
      },
      room.settings.ratingScale,
    );

    const reveal: ItemRevealResult = {
      item: currentItem,
      itemIndex: room.currentItemIndex,
      totalItems: room.orderedItems.length,
      averageScore: metrics.averageScore,
      stdDev: metrics.stdDev,
      voteCount: metrics.voteCount,
      votes,
    };

    room.phase = 'ITEM_REVEAL';
    room.currentReveal = reveal;
    room.phaseEndsAt = now + options.revealDurationMs;

    return { kind: 'ITEM_REVEAL', reveal };
  }

  return advanceToNextItemOrFinish(room, options.generateResultId, now);
}

export function advanceFromRevealState(
  room: InternalRoomState,
  options: { generateResultId: () => string; now?: number },
): Exclude<AdvanceOutcome, { kind: 'ITEM_REVEAL' }> {
  if (room.phase !== 'ITEM_REVEAL') {
    throw new GameStateError('INVALID_PHASE', "La salle n'est pas en phase de révélation.");
  }
  const now = options.now ?? Date.now();
  return advanceToNextItemOrFinish(room, options.generateResultId, now);
}

function advanceToNextItemOrFinish(
  room: InternalRoomState,
  generateResultId: () => string,
  now: number,
): Exclude<AdvanceOutcome, { kind: 'ITEM_REVEAL' }> {
  room.lastActivityAt = now;
  room.currentReveal = null;
  room.allVotedGraceEndsAt = null;

  const nextIndex = room.currentItemIndex + 1;
  if (nextIndex < room.orderedItems.length) {
    room.currentItemIndex = nextIndex;
    room.phase = 'VOTING';
    room.phaseEndsAt =
      room.settings.timeLimitSeconds !== null
        ? now + room.settings.timeLimitSeconds * 1000
        : null;
    return { kind: 'NEXT_VOTING', itemIndex: nextIndex };
  }

  const result = finalizeGameResult(room, generateResultId(), now);
  room.phase = 'FINAL_RESULTS';
  room.phaseEndsAt = null;
  room.finalResult = result;
  return { kind: 'FINAL_RESULTS', result };
}

export function kickPlayerState(
  room: InternalRoomState,
  actorPlayerId: string,
  targetPlayerId: string,
  now = Date.now(),
): { kickedPlayer: InternalPlayer; allConnectedVoted: boolean } {
  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.isHost) {
    throw new GameStateError('FORBIDDEN', "Seul l'hôte peut exclure un joueur.");
  }
  if (actorPlayerId === targetPlayerId) {
    throw new GameStateError('INVALID_TARGET', "L'hôte ne peut pas s'exclure lui-même.");
  }
  const target = room.players.get(targetPlayerId);
  if (!target) {
    throw new GameStateError('PLAYER_NOT_FOUND', 'Joueur cible introuvable.');
  }

  room.players.delete(targetPlayerId);
  for (const itemVotes of room.votesByItemId.values()) {
    itemVotes.delete(targetPlayerId);
  }
  room.lastActivityAt = now;

  return {
    kickedPlayer: target,
    allConnectedVoted: areAllConnectedPlayersVoted(room),
  };
}

export interface ResetToLobbyOptions {
  freshTheme?: ThemeDetailDto;
  now?: number;
}

export function resetToLobbyState(
  room: InternalRoomState,
  actorPlayerId: string,
  optionsOrNow: ResetToLobbyOptions | number = {},
): void {
  const options: ResetToLobbyOptions =
    typeof optionsOrNow === 'number' ? { now: optionsOrNow } : optionsOrNow;
  const now = options.now ?? Date.now();

  const actor = room.players.get(actorPlayerId);
  if (!actor || !actor.isHost) {
    throw new GameStateError('FORBIDDEN', "Seul l'hôte peut réinitialiser la salle.");
  }
  if (room.phase !== 'FINAL_RESULTS') {
    throw new GameStateError(
      'INVALID_PHASE',
      'La partie doit être terminée pour revenir au lobby.',
    );
  }

  // Purge disconnected non-host ghosts on reset
  for (const [id, player] of room.players.entries()) {
    if (!player.connected && !player.isHost) {
      room.players.delete(id);
    }
  }

  if (options.freshTheme && options.freshTheme.items.length >= 3) {
    room.theme = options.freshTheme;
  }

  room.phase = 'LOBBY';
  room.orderedItems = toPublicThemeItems(room.theme);
  room.currentItemIndex = 0;
  room.votesByItemId.clear();
  room.phaseEndsAt = null;
  room.allVotedGraceEndsAt = null;
  room.currentReveal = null;
  room.finalResult = null;
  room.lastActivityAt = now;
}

export function toPublicRoomState(
  room: InternalRoomState,
  viewerPlayerId: string,
): PublicRoomState {
  const players: PublicPlayer[] = Array.from(room.players.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isHost: p.isHost,
      connected: p.connected,
      joinedAt: p.joinedAt,
    }));

  const myVotes: Record<string, number> = {};
  for (const [itemId, itemVotes] of room.votesByItemId.entries()) {
    const score = itemVotes.get(viewerPlayerId);
    if (score !== undefined) {
      myVotes[itemId] = score;
    }
  }

  const deckStats = getRoomDeckStats(room);
  const totalItems =
    room.phase === 'LOBBY'
      ? computeRoundItemCount(room.theme.items.length, room.settings.itemCount)
      : room.orderedItems.length;

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    theme: {
      id: room.theme.id,
      title: room.theme.title,
      description: room.theme.description,
      category: room.theme.category,
      itemCount: room.theme.items.length,
    },
    settings: { ...room.settings },
    players,
    selfPlayerId: viewerPlayerId,
    currentItemIndex: room.currentItemIndex,
    totalItems,
    totalThemeItems: deckStats.totalThemeItems,
    unplayedCount: deckStats.unplayedCount,
    currentItem: getCurrentItem(room),
    phaseEndsAt: room.phaseEndsAt,
    allVotedGraceEndsAt: room.allVotedGraceEndsAt,
    voteStatuses: buildVoteStatuses(room),
    myVotes,
    currentReveal: room.phase === 'ITEM_REVEAL' ? room.currentReveal : null,
    finalResult: room.phase === 'FINAL_RESULTS' ? room.finalResult : null,
  };
}
