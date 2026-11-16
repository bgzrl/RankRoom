import {
  computeRoundItemCount,
  type PublicRoomState,
  type RoomSettings,
} from '@rankroom/shared';
import { create } from 'zustand';
import { getSavedDisplayName, saveDisplayName } from '../lib/session';
import { emitWithAck, getSocket } from '../lib/socket';

interface RoomStoreState {
  connected: boolean;
  roomState: PublicRoomState | null;
  activeRoomCode: string | null;
  lastDisplayName: string;
  joining: boolean;
  error: string | null;
  kickedReason: string | null;
  listenersInitialized: boolean;

  initSocketListeners: () => void;
  clearError: () => void;
  clearKickedReason: () => void;
  createRoom: (payload: {
    displayName: string;
    themeId: string;
    settings?: Partial<RoomSettings>;
  }) => Promise<string>;
  joinRoom: (payload: { roomCode: string; displayName: string }) => Promise<void>;
  leaveRoom: () => Promise<void>;
  updateSettings: (payload: {
    themeId?: string;
    settings?: Partial<RoomSettings>;
  }) => Promise<void>;
  resetDeck: () => Promise<void>;
  startGame: () => Promise<void>;
  castVote: (itemId: string, score: number) => Promise<void>;
  nextItem: () => Promise<void>;
  kickPlayer: (targetPlayerId: string) => Promise<void>;
  resetToLobby: () => Promise<void>;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  connected: false,
  roomState: null,
  activeRoomCode: null,
  lastDisplayName: getSavedDisplayName(),
  joining: false,
  error: null,
  kickedReason: null,
  listenersInitialized: false,

  clearError: () => set({ error: null }),
  clearKickedReason: () => set({ kickedReason: null }),

  initSocketListeners: () => {
    if (get().listenersInitialized) return;
    const socket = getSocket();

    socket.on('connect', () => {
      set({ connected: true });
      const { activeRoomCode, lastDisplayName } = get();
      if (activeRoomCode && lastDisplayName) {
        void emitWithAck<{ playerId: string; state: PublicRoomState }>((ack) =>
          socket.emit(
            'room:join',
            { roomCode: activeRoomCode, displayName: lastDisplayName },
            ack,
          ),
        )
          .then((res) => {
            set({ roomState: res.state, error: null });
          })
          .catch(() => {
            // Room may have expired while disconnected
            set({ roomState: null, activeRoomCode: null });
          });
      }
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('room:state', (state) => {
      set({ roomState: state, activeRoomCode: state.roomCode, error: null });
    });

    socket.on(
      'room:settings_updated',
      ({ theme, settings, totalThemeItems, unplayedCount }) => {
        set((prev) => {
          if (!prev.roomState) return prev;
          return {
            roomState: {
              ...prev.roomState,
              theme,
              settings,
              totalItems: computeRoundItemCount(theme.itemCount, settings.itemCount),
              totalThemeItems,
              unplayedCount,
            },
          };
        });
      },
    );

    socket.on('room:deck_updated', ({ themeId, totalThemeItems, unplayedCount }) => {
      set((prev) => {
        if (!prev.roomState || prev.roomState.theme.id !== themeId) return prev;
        return {
          roomState: {
            ...prev.roomState,
            totalThemeItems,
            unplayedCount,
          },
        };
      });
    });

    socket.on('room:player_joined', ({ player }) => {
      set((prev) => {
        if (!prev.roomState) return prev;
        const exists = prev.roomState.players.some((p) => p.id === player.id);
        const players = exists
          ? prev.roomState.players.map((p) => (p.id === player.id ? player : p))
          : [...prev.roomState.players, player];
        return {
          roomState: {
            ...prev.roomState,
            players,
          },
        };
      });
    });

    socket.on('room:player_left', ({ playerId, newHostId, connected, removed }) => {
      set((prev) => {
        if (!prev.roomState) return prev;
        let players = removed
          ? prev.roomState.players.filter((p) => p.id !== playerId)
          : prev.roomState.players.map((p) =>
              p.id === playerId ? { ...p, connected } : p,
            );

        if (newHostId) {
          players = players.map((p) => ({
            ...p,
            isHost: p.id === newHostId,
          }));
        }

        return {
          roomState: {
            ...prev.roomState,
            players,
          },
        };
      });
    });

    socket.on('room:player_kicked', ({ playerId, reason }) => {
      const current = get().roomState;
      if (!current) return;
      if (playerId === current.selfPlayerId) {
        set({
          roomState: null,
          activeRoomCode: null,
          kickedReason: reason,
        });
        return;
      }
      set({
        roomState: {
          ...current,
          players: current.players.filter((p) => p.id !== playerId),
        },
      });
    });

    socket.on(
      'game:phase_changed',
      ({
        phase,
        currentItemIndex,
        totalItems,
        totalThemeItems,
        unplayedCount,
        currentItem,
        phaseEndsAt,
        allVotedGraceEndsAt,
        voteStatuses,
      }) => {
        set((prev) => {
          if (!prev.roomState) return prev;
          return {
            roomState: {
              ...prev.roomState,
              phase,
              currentItemIndex,
              totalItems,
              totalThemeItems,
              unplayedCount,
              currentItem,
              phaseEndsAt,
              allVotedGraceEndsAt,
              voteStatuses,
              currentReveal: null,
            },
          };
        });
      },
    );

    socket.on('game:vote_status', ({ itemId, voteStatuses, allVotedGraceEndsAt }) => {
      set((prev) => {
        if (!prev.roomState || prev.roomState.currentItem?.id !== itemId) {
          return prev;
        }
        return {
          roomState: {
            ...prev.roomState,
            voteStatuses,
            allVotedGraceEndsAt,
          },
        };
      });
    });

    socket.on('game:item_revealed', ({ itemReveal, phaseEndsAt }) => {
      set((prev) => {
        if (!prev.roomState) return prev;
        return {
          roomState: {
            ...prev.roomState,
            phase: 'ITEM_REVEAL',
            currentReveal: itemReveal,
            phaseEndsAt,
            allVotedGraceEndsAt: null,
          },
        };
      });
    });

    socket.on('game:finished', ({ result }) => {
      set((prev) => {
        if (!prev.roomState) return prev;
        return {
          roomState: {
            ...prev.roomState,
            phase: 'FINAL_RESULTS',
            currentItem: null,
            currentReveal: null,
            phaseEndsAt: null,
            allVotedGraceEndsAt: null,
            finalResult: result,
          },
        };
      });
    });

    socket.on('room:error', (err) => {
      set({ error: err.message });
    });

    set({
      listenersInitialized: true,
      connected: socket.connected,
    });
  },

  createRoom: async ({ displayName, themeId, settings }) => {
    get().initSocketListeners();
    const socket = getSocket();
    const trimmedName = displayName.trim();
    saveDisplayName(trimmedName);
    set({ joining: true, error: null, kickedReason: null });

    try {
      const res = await emitWithAck<{
        roomCode: string;
        playerId: string;
        state: PublicRoomState;
      }>((ack) =>
        socket.emit('room:create', { displayName: trimmedName, themeId, settings }, ack),
      );

      set({
        roomState: res.state,
        activeRoomCode: res.roomCode,
        lastDisplayName: trimmedName,
        joining: false,
      });
      return res.roomCode;
    } catch (err) {
      set({
        joining: false,
        error: err instanceof Error ? err.message : 'Impossible de créer la salle.',
      });
      throw err;
    }
  },

  joinRoom: async ({ roomCode, displayName }) => {
    get().initSocketListeners();
    const socket = getSocket();
    const trimmedName = displayName.trim();
    const normalizedCode = roomCode.trim().toUpperCase();
    saveDisplayName(trimmedName);
    set({ joining: true, error: null, kickedReason: null });

    try {
      const res = await emitWithAck<{ playerId: string; state: PublicRoomState }>((ack) =>
        socket.emit(
          'room:join',
          { roomCode: normalizedCode, displayName: trimmedName },
          ack,
        ),
      );
      set({
        roomState: res.state,
        activeRoomCode: normalizedCode,
        lastDisplayName: trimmedName,
        joining: false,
      });
    } catch (err) {
      set({
        joining: false,
        error: err instanceof Error ? err.message : 'Impossible de rejoindre la salle.',
      });
      throw err;
    }
  },

  leaveRoom: async () => {
    const socket = getSocket();
    try {
      await emitWithAck<{ left: true }>((ack) => socket.emit('room:leave', {}, ack));
    } catch {
      // Ignore if socket already disconnected
    }
    set({ roomState: null, activeRoomCode: null });
  },

  updateSettings: async (payload) => {
    const socket = getSocket();
    await emitWithAck((ack) => socket.emit('room:update_settings', payload, ack));
  },

  resetDeck: async () => {
    const socket = getSocket();
    await emitWithAck((ack) => socket.emit('room:reset_deck', {}, ack));
  },

  startGame: async () => {
    const socket = getSocket();
    await emitWithAck((ack) => socket.emit('game:start', {}, ack));
  },

  castVote: async (itemId, score) => {
    const socket = getSocket();
    const previousState = get().roomState;
    if (previousState) {
      set({
        roomState: {
          ...previousState,
          myVotes: {
            ...previousState.myVotes,
            [itemId]: score,
          },
          voteStatuses: {
            ...previousState.voteStatuses,
            [previousState.selfPlayerId]: true,
          },
        },
      });
    }

    try {
      await emitWithAck<{ acceptedScore: number }>((ack) =>
        socket.emit('game:vote', { itemId, score }, ack),
      );
    } catch (err) {
      if (previousState) {
        set({
          roomState: previousState,
          error: err instanceof Error ? err.message : 'Vote refusé par le serveur.',
        });
      }
      throw err;
    }
  },

  nextItem: async () => {
    const socket = getSocket();
    await emitWithAck((ack) => socket.emit('game:next_item', {}, ack));
  },

  kickPlayer: async (targetPlayerId) => {
    const socket = getSocket();
    await emitWithAck((ack) =>
      socket.emit('game:kick_player', { targetPlayerId }, ack),
    );
  },

  resetToLobby: async () => {
    const socket = getSocket();
    await emitWithAck((ack) => socket.emit('game:reset_to_lobby', {}, ack));
  },
}));
