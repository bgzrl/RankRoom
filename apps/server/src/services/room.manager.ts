import {
  generateRoomCode,
  type ClientToServerEvents,
  type PersistedGameResult,
  type PublicRoomState,
  type RoomSettings,
  type ServerToClientEvents,
} from '@rankroom/shared';
import type { Server, Socket } from 'socket.io';
import type { AppDatabase } from '../db/index.js';
import {
  advanceFromRevealState,
  advanceFromVotingState,
  buildVoteStatuses,
  castVoteState,
  createRoomState,
  disconnectPlayerState,
  getCurrentItem,
  getRoomDeckStats,
  joinRoomState,
  kickPlayerState,
  leavePlayerState,
  resetDeckState,
  resetToLobbyState,
  startGameState,
  toPublicRoomState,
  transferHostIfNeeded,
  updateRoomSettingsState,
  GameStateError,
  type InternalRoomState,
} from '../game/state-machine.js';
import { generateResultId, saveGameResult } from './result.service.js';
import { getThemeById } from './theme.service.js';

export const ALL_VOTED_GRACE_MS = 2_000;
export const ITEM_REVEAL_DURATION_MS = 10_000;
export const HOST_RECONNECT_GRACE_MS = 12_000;
export const ROOM_INACTIVITY_TTL_MS = 2 * 60 * 60 * 1000;
export const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export type TypedSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface ManagedRoom {
  state: InternalRoomState;
  phaseTimer: NodeJS.Timeout | null;
  graceTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  hostTransferTimer: NodeJS.Timeout | null;
}

interface SocketSession {
  roomCode: string;
  playerId: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly socketSessions = new Map<string, SocketSession>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly io: TypedSocketServer,
    private readonly db: AppDatabase,
  ) {}

  public startCleanupLoop(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRooms();
    }, ROOM_CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const roomCode of Array.from(this.rooms.keys())) {
      this.destroyRoom(roomCode);
    }
  }

  private clearAllTransitionTimers(managed: ManagedRoom): void {
    if (managed.phaseTimer) {
      clearTimeout(managed.phaseTimer);
      managed.phaseTimer = null;
    }
    if (managed.graceTimer) {
      clearTimeout(managed.graceTimer);
      managed.graceTimer = null;
    }
    if (managed.revealTimer) {
      clearTimeout(managed.revealTimer);
      managed.revealTimer = null;
    }
    managed.state.phaseEndsAt = null;
    managed.state.allVotedGraceEndsAt = null;
  }

  private clearGraceTimer(managed: ManagedRoom): void {
    if (managed.graceTimer) {
      clearTimeout(managed.graceTimer);
      managed.graceTimer = null;
    }
    managed.state.allVotedGraceEndsAt = null;
  }

  private clearHostTransferTimer(managed: ManagedRoom): void {
    if (managed.hostTransferTimer) {
      clearTimeout(managed.hostTransferTimer);
      managed.hostTransferTimer = null;
    }
  }

  private destroyRoom(roomCode: string): void {
    const managed = this.rooms.get(roomCode);
    if (!managed) return;
    this.clearAllTransitionTimers(managed);
    this.clearHostTransferTimer(managed);
    for (const player of managed.state.players.values()) {
      if (player.socketId) {
        this.socketSessions.delete(player.socketId);
      }
    }
    this.rooms.delete(roomCode);
  }

  public cleanupExpiredRooms(now = Date.now()): number {
    let removed = 0;
    for (const [roomCode, managed] of this.rooms.entries()) {
      if (now - managed.state.lastActivityAt > ROOM_INACTIVITY_TTL_MS) {
        this.destroyRoom(roomCode);
        removed += 1;
      }
    }
    return removed;
  }

  private generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = generateRoomCode();
      if (!this.rooms.has(candidate)) {
        return candidate;
      }
    }
    throw new GameStateError('ROOM_CAPACITY', 'Impossible de générer un code de salle unique.');
  }

  private attachSocketToRoom(
    socket: TypedSocket,
    roomCode: string,
    playerId: string,
  ): void {
    const previous = this.socketSessions.get(socket.id);
    if (previous && previous.roomCode !== roomCode) {
      void socket.leave(previous.roomCode);
    }
    this.socketSessions.set(socket.id, { roomCode, playerId });
    void socket.join(roomCode);
  }

  private schedulePhaseTimer(managed: ManagedRoom): void {
    if (managed.phaseTimer) {
      clearTimeout(managed.phaseTimer);
      managed.phaseTimer = null;
    }
    const { phaseEndsAt, roomCode } = managed.state;
    if (managed.state.phase !== 'VOTING' || phaseEndsAt === null) {
      return;
    }
    const delayMs = Math.max(0, phaseEndsAt - Date.now());
    managed.phaseTimer = setTimeout(() => {
      this.handleVotingComplete(roomCode);
    }, delayMs);
  }

  private scheduleGraceTimer(managed: ManagedRoom): void {
    this.clearGraceTimer(managed);
    const { roomCode } = managed.state;
    managed.state.allVotedGraceEndsAt = Date.now() + ALL_VOTED_GRACE_MS;
    managed.graceTimer = setTimeout(() => {
      this.handleVotingComplete(roomCode);
    }, ALL_VOTED_GRACE_MS);
  }

  private scheduleRevealTimer(managed: ManagedRoom): void {
    if (managed.revealTimer) {
      clearTimeout(managed.revealTimer);
      managed.revealTimer = null;
    }
    const { roomCode, phaseEndsAt } = managed.state;
    if (managed.state.phase !== 'ITEM_REVEAL' || phaseEndsAt === null) {
      return;
    }
    const delayMs = Math.max(0, phaseEndsAt - Date.now());
    managed.revealTimer = setTimeout(() => {
      this.handleRevealComplete(roomCode);
    }, delayMs);
  }

  private handleVotingComplete(roomCode: string): void {
    const managed = this.rooms.get(roomCode);
    if (!managed || managed.state.phase !== 'VOTING') {
      return;
    }

    this.clearAllTransitionTimers(managed);

    const outcome = advanceFromVotingState(managed.state, {
      generateResultId,
      revealDurationMs: ITEM_REVEAL_DURATION_MS,
    });

    this.broadcastAdvanceOutcome(managed, outcome);
  }

  private handleRevealComplete(roomCode: string): void {
    const managed = this.rooms.get(roomCode);
    if (!managed || managed.state.phase !== 'ITEM_REVEAL') {
      return;
    }

    this.clearAllTransitionTimers(managed);

    const outcome = advanceFromRevealState(managed.state, {
      generateResultId,
    });

    this.broadcastAdvanceOutcome(managed, outcome);
  }

  private broadcastAdvanceOutcome(
    managed: ManagedRoom,
    outcome:
      | ReturnType<typeof advanceFromVotingState>
      | ReturnType<typeof advanceFromRevealState>,
  ): void {
    const { roomCode } = managed.state;

    if (outcome.kind === 'ITEM_REVEAL') {
      this.scheduleRevealTimer(managed);
      this.io.to(roomCode).emit('game:item_revealed', {
        itemReveal: outcome.reveal,
        phaseEndsAt: managed.state.phaseEndsAt,
      });
      return;
    }

    if (outcome.kind === 'NEXT_VOTING') {
      this.schedulePhaseTimer(managed);
      const deckStats = getRoomDeckStats(managed.state);
      this.io.to(roomCode).emit('game:phase_changed', {
        phase: 'VOTING',
        currentItemIndex: managed.state.currentItemIndex,
        totalItems: managed.state.orderedItems.length,
        totalThemeItems: deckStats.totalThemeItems,
        unplayedCount: deckStats.unplayedCount,
        currentItem: getCurrentItem(managed.state),
        phaseEndsAt: managed.state.phaseEndsAt,
        allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
        voteStatuses: buildVoteStatuses(managed.state),
      });
      return;
    }

    const persisted: PersistedGameResult = saveGameResult(this.db, outcome.result);
    managed.state.finalResult = persisted;
    this.io.to(roomCode).emit('game:finished', { result: persisted });
  }

  public createRoom(
    socket: TypedSocket,
    playerToken: string,
    payload: { displayName: string; themeId: string; settings?: Partial<RoomSettings> },
  ): { roomCode: string; playerId: string; state: PublicRoomState } {
    const theme = getThemeById(this.db, payload.themeId);
    if (!theme) {
      throw new GameStateError('THEME_NOT_FOUND', 'Le thème sélectionné est introuvable.');
    }

    const roomCode = this.generateUniqueRoomCode();
    const { room, hostPlayer } = createRoomState({
      roomCode,
      theme,
      hostToken: playerToken,
      hostDisplayName: payload.displayName,
      hostSocketId: socket.id,
      settings: payload.settings,
    });

    const managed: ManagedRoom = {
      state: room,
      phaseTimer: null,
      graceTimer: null,
      revealTimer: null,
      hostTransferTimer: null,
    };
    this.rooms.set(roomCode, managed);
    this.attachSocketToRoom(socket, roomCode, hostPlayer.id);

    return {
      roomCode,
      playerId: hostPlayer.id,
      state: toPublicRoomState(room, hostPlayer.id),
    };
  }

  public joinRoom(
    socket: TypedSocket,
    playerToken: string,
    payload: { roomCode: string; displayName: string },
  ): { playerId: string; state: PublicRoomState } {
    const managed = this.rooms.get(payload.roomCode);
    if (!managed) {
      throw new GameStateError('ROOM_NOT_FOUND', `Aucune salle trouvée pour le code ${payload.roomCode}.`);
    }

    const { player, reconnected } = joinRoomState(managed.state, {
      playerToken,
      displayName: payload.displayName,
      socketId: socket.id,
    });

    if (player.isHost) {
      this.clearHostTransferTimer(managed);
    }

    this.attachSocketToRoom(socket, payload.roomCode, player.id);

    // If someone joined or reconnected while all connected players previously voted, re-evaluate grace timer
    if (managed.state.phase === 'VOTING') {
      this.clearGraceTimer(managed);
      this.io.to(payload.roomCode).emit('game:vote_status', {
        itemId: getCurrentItem(managed.state)?.id ?? '',
        voteStatuses: buildVoteStatuses(managed.state),
        allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
      });
    }

    socket.to(payload.roomCode).emit('room:player_joined', {
      player: {
        id: player.id,
        displayName: player.displayName,
        isHost: player.isHost,
        connected: player.connected,
        joinedAt: player.joinedAt,
      },
    });

    const publicState = toPublicRoomState(managed.state, player.id);
    if (reconnected) {
      socket.emit('room:state', publicState);
    }

    return {
      playerId: player.id,
      state: publicState,
    };
  }

  public leaveRoom(socket: TypedSocket): void {
    const session = this.socketSessions.get(socket.id);
    if (!session) return;

    this.socketSessions.delete(socket.id);
    void socket.leave(session.roomCode);

    const managed = this.rooms.get(session.roomCode);
    if (!managed) return;

    const { removed, newHostId } = leavePlayerState(managed.state, session.playerId);
    if (!removed) return;

    if (managed.state.players.size === 0) {
      this.destroyRoom(session.roomCode);
      return;
    }

    this.io.to(session.roomCode).emit('room:player_left', {
      playerId: session.playerId,
      newHostId,
      connected: false,
      removed: !managed.state.players.has(session.playerId),
    });

    // If remaining connected players have all voted during VOTING, start 2s grace timer
    if (managed.state.phase === 'VOTING') {
      const currentItem = getCurrentItem(managed.state);
      if (currentItem) {
        const allVoted = Array.from(managed.state.players.values())
          .filter((p) => p.connected)
          .every((p) => managed.state.votesByItemId.get(currentItem.id)?.has(p.id));
        if (allVoted && Array.from(managed.state.players.values()).some((p) => p.connected)) {
          this.scheduleGraceTimer(managed);
        } else {
          this.clearGraceTimer(managed);
        }
        this.io.to(session.roomCode).emit('game:vote_status', {
          itemId: currentItem.id,
          voteStatuses: buildVoteStatuses(managed.state),
          allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
        });
      }
    }
  }

  public handleDisconnect(socket: TypedSocket): void {
    const session = this.socketSessions.get(socket.id);
    if (!session) return;

    this.socketSessions.delete(socket.id);
    const managed = this.rooms.get(session.roomCode);
    if (!managed) return;

    // Ignore stale socket disconnect if player already reconnected on another socket
    const existingPlayer = managed.state.players.get(session.playerId);
    if (!existingPlayer || existingPlayer.socketId !== socket.id) {
      return;
    }

    const { player } = disconnectPlayerState(managed.state, session.playerId);
    if (!player) return;

    this.io.to(session.roomCode).emit('room:player_left', {
      playerId: player.id,
      newHostId: null,
      connected: false,
      removed: false,
    });

    if (player.isHost) {
      this.clearHostTransferTimer(managed);
      managed.hostTransferTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(session.roomCode);
        if (!activeRoom) return;
        const newHostId = transferHostIfNeeded(activeRoom.state);
        if (newHostId) {
          this.io.to(session.roomCode).emit('room:player_left', {
            playerId: player.id,
            newHostId,
            connected: false,
            removed: false,
          });
        }
      }, HOST_RECONNECT_GRACE_MS);
    }
  }

  public updateSettings(
    socket: TypedSocket,
    payload: { themeId?: string; settings?: Partial<RoomSettings> },
  ): {
    theme: PublicRoomState['theme'];
    settings: RoomSettings;
    totalThemeItems: number;
    unplayedCount: number;
  } {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const nextTheme = payload.themeId ? getThemeById(this.db, payload.themeId) : undefined;
    if (payload.themeId && !nextTheme) {
      throw new GameStateError('THEME_NOT_FOUND', 'Le thème demandé est introuvable.');
    }

    const updated = updateRoomSettingsState(managed.state, session.playerId, {
      theme: nextTheme ?? undefined,
      settings: payload.settings,
    });

    const publicTheme: PublicRoomState['theme'] = {
      id: updated.theme.id,
      title: updated.theme.title,
      description: updated.theme.description,
      category: updated.theme.category,
      itemCount: updated.theme.items.length,
    };

    this.io.to(session.roomCode).emit('room:settings_updated', {
      theme: publicTheme,
      settings: updated.settings,
      totalThemeItems: updated.totalThemeItems,
      unplayedCount: updated.unplayedCount,
    });

    return {
      theme: publicTheme,
      settings: updated.settings,
      totalThemeItems: updated.totalThemeItems,
      unplayedCount: updated.unplayedCount,
    };
  }

  public resetDeck(socket: TypedSocket): {
    totalThemeItems: number;
    unplayedCount: number;
  } {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const stats = resetDeckState(managed.state, session.playerId);

    this.io.to(session.roomCode).emit('room:deck_updated', {
      themeId: managed.state.theme.id,
      totalThemeItems: stats.totalThemeItems,
      unplayedCount: stats.unplayedCount,
    });

    return stats;
  }

  public startGame(socket: TypedSocket): void {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const freshTheme = getThemeById(this.db, managed.state.theme.id);
    if (!freshTheme) {
      throw new GameStateError('THEME_NOT_FOUND', 'Le thème sélectionné est introuvable.');
    }

    this.clearAllTransitionTimers(managed);
    const deckStats = startGameState(managed.state, session.playerId, { freshTheme });
    this.schedulePhaseTimer(managed);

    this.io.to(session.roomCode).emit('game:phase_changed', {
      phase: 'VOTING',
      currentItemIndex: managed.state.currentItemIndex,
      totalItems: managed.state.orderedItems.length,
      totalThemeItems: deckStats.totalThemeItems,
      unplayedCount: deckStats.unplayedCount,
      currentItem: getCurrentItem(managed.state),
      phaseEndsAt: managed.state.phaseEndsAt,
      allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
      voteStatuses: buildVoteStatuses(managed.state),
    });
  }

  public castVote(
    socket: TypedSocket,
    payload: { itemId: string; score: number },
  ): { acceptedScore: number } {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    // Always cancel/reset grace timer when a vote is cast or modified (anti-missclick)
    this.clearGraceTimer(managed);

    const result = castVoteState(managed.state, session.playerId, payload);

    if (result.allConnectedVoted) {
      this.scheduleGraceTimer(managed);
    }

    this.io.to(session.roomCode).emit('game:vote_status', {
      itemId: payload.itemId,
      voteStatuses: buildVoteStatuses(managed.state),
      allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
    });

    return { acceptedScore: result.acceptedScore };
  }

  public nextItem(socket: TypedSocket): void {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const actor = managed.state.players.get(session.playerId);
    if (!actor || !actor.isHost) {
      throw new GameStateError('FORBIDDEN', "Seul l'hôte peut forcer le passage à la suite.");
    }

    if (managed.state.phase === 'VOTING') {
      this.handleVotingComplete(session.roomCode);
      return;
    }

    if (managed.state.phase === 'ITEM_REVEAL') {
      this.handleRevealComplete(session.roomCode);
      return;
    }

    throw new GameStateError(
      'INVALID_PHASE',
      "Impossible d'avancer depuis la phase actuelle.",
    );
  }

  public kickPlayer(socket: TypedSocket, targetPlayerId: string): void {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const { kickedPlayer, allConnectedVoted } = kickPlayerState(
      managed.state,
      session.playerId,
      targetPlayerId,
    );

    if (kickedPlayer.socketId) {
      const targetSocket = this.io.sockets.sockets.get(kickedPlayer.socketId);
      if (targetSocket) {
        targetSocket.emit('room:player_kicked', {
          playerId: kickedPlayer.id,
          reason: "Vous avez été exclu de la salle par l'hôte.",
        });
        void targetSocket.leave(session.roomCode);
      }
      this.socketSessions.delete(kickedPlayer.socketId);
    }

    this.io.to(session.roomCode).emit('room:player_kicked', {
      playerId: kickedPlayer.id,
      reason: "Exclu par l'hôte.",
    });

    if (managed.state.phase === 'VOTING') {
      if (allConnectedVoted) {
        this.scheduleGraceTimer(managed);
      } else {
        this.clearGraceTimer(managed);
      }
      this.io.to(session.roomCode).emit('game:vote_status', {
        itemId: getCurrentItem(managed.state)?.id ?? '',
        voteStatuses: buildVoteStatuses(managed.state),
        allVotedGraceEndsAt: managed.state.allVotedGraceEndsAt,
      });
    }
  }

  public resetToLobby(socket: TypedSocket): void {
    const session = this.requireSession(socket);
    const managed = this.requireRoom(session.roomCode);

    const freshTheme = getThemeById(this.db, managed.state.theme.id) ?? undefined;

    this.clearAllTransitionTimers(managed);
    resetToLobbyState(managed.state, session.playerId, { freshTheme });

    for (const player of managed.state.players.values()) {
      if (player.connected && player.socketId) {
        const playerSocket = this.io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('room:state', toPublicRoomState(managed.state, player.id));
        }
      }
    }
  }

  private requireSession(socket: TypedSocket): SocketSession {
    const session = this.socketSessions.get(socket.id);
    if (!session) {
      throw new GameStateError('NOT_IN_ROOM', "Vous n'êtes connecté à aucune salle.");
    }
    return session;
  }

  private requireRoom(roomCode: string): ManagedRoom {
    const managed = this.rooms.get(roomCode);
    if (!managed) {
      throw new GameStateError('ROOM_NOT_FOUND', 'Salle introuvable ou expirée.');
    }
    return managed;
  }
}
