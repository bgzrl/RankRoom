import { randomUUID } from 'node:crypto';
import {
  EmptyPayloadSchema,
  GameKickPlayerPayloadSchema,
  GameVotePayloadSchema,
  RoomCreatePayloadSchema,
  RoomJoinPayloadSchema,
  RoomUpdateSettingsPayloadSchema,
  UuidSchema,
  type SocketAck,
} from '@rankroom/shared';
import type { z } from 'zod';
import { GameStateError } from '../game/state-machine.js';
import type { RoomManager, TypedSocket, TypedSocketServer } from '../services/room.manager.js';

function parsePayload<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Données Socket.IO invalides.',
    };
  }
  return { ok: true, data: parsed.data };
}

function handleAckError<T>(
  ack: ((res: SocketAck<T>) => void) | undefined,
  err: unknown,
): void {
  if (typeof ack !== 'function') return;
  if (err instanceof GameStateError) {
    ack({ ok: false, error: { code: err.code, message: err.message } });
    return;
  }
  ack({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' },
  });
}

function resolvePlayerToken(socket: TypedSocket): string {
  const rawToken = (socket.handshake.auth as { playerToken?: unknown } | undefined)?.playerToken;
  const parsed = UuidSchema.safeParse(rawToken);
  if (parsed.success) {
    return parsed.data;
  }
  return randomUUID();
}

export function registerSocketHandlers(
  io: TypedSocketServer,
  roomManager: RoomManager,
): void {
  io.on('connection', (socket) => {
    const playerToken = resolvePlayerToken(socket);

    socket.on('room:create', (rawPayload, ack) => {
      const parsed = parsePayload(RoomCreatePayloadSchema, rawPayload);
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        const result = roomManager.createRoom(socket, playerToken, parsed.data);
        if (typeof ack === 'function') {
          ack({ ok: true, data: result });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('room:join', (rawPayload, ack) => {
      const parsed = parsePayload(RoomJoinPayloadSchema, rawPayload);
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        const result = roomManager.joinRoom(socket, playerToken, parsed.data);
        if (typeof ack === 'function') {
          ack({ ok: true, data: result });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('room:leave', (rawPayload, ack) => {
      const parsed = parsePayload(EmptyPayloadSchema, rawPayload ?? {});
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        roomManager.leaveRoom(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, data: { left: true } });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('room:update_settings', (rawPayload, ack) => {
      const parsed = parsePayload(RoomUpdateSettingsPayloadSchema, rawPayload);
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        const updated = roomManager.updateSettings(socket, parsed.data);
        if (typeof ack === 'function') {
          ack({ ok: true, data: updated });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('room:reset_deck', (rawPayload, ack) => {
      const parsed = parsePayload(EmptyPayloadSchema, rawPayload ?? {});
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        const stats = roomManager.resetDeck(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, data: stats });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('game:start', (rawPayload, ack) => {
      const parsed = parsePayload(EmptyPayloadSchema, rawPayload ?? {});
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        roomManager.startGame(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, data: { started: true } });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('game:vote', (rawPayload, ack) => {
      const parsed = parsePayload(GameVotePayloadSchema, rawPayload);
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        const result = roomManager.castVote(socket, parsed.data);
        if (typeof ack === 'function') {
          ack({ ok: true, data: result });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('game:next_item', (rawPayload, ack) => {
      const parsed = parsePayload(EmptyPayloadSchema, rawPayload ?? {});
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        roomManager.nextItem(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, data: { advanced: true } });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('game:kick_player', (rawPayload, ack) => {
      const parsed = parsePayload(GameKickPlayerPayloadSchema, rawPayload);
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        roomManager.kickPlayer(socket, parsed.data.targetPlayerId);
        if (typeof ack === 'function') {
          ack({ ok: true, data: { kicked: true } });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('game:reset_to_lobby', (rawPayload, ack) => {
      const parsed = parsePayload(EmptyPayloadSchema, rawPayload ?? {});
      if (!parsed.ok) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
        }
        return;
      }

      try {
        roomManager.resetToLobby(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, data: { reset: true } });
        }
      } catch (err) {
        handleAckError(ack, err);
      }
    });

    socket.on('disconnect', () => {
      roomManager.handleDisconnect(socket);
    });
  });
}
