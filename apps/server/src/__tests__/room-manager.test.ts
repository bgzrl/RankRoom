import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppDatabase } from '../db/index.js';
import { createDatabaseConnection } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { themeItems } from '../db/schema.js';
import { seedInitialThemes } from '../db/seed.js';
import { RoomManager, type TypedSocket, type TypedSocketServer } from '../services/room.manager.js';
import { listThemes } from '../services/theme.service.js';

interface MockSocketRecord {
  id: string;
  emitted: Array<{ event: string; payload: unknown }>;
  rooms: Set<string>;
}

function createMockIo() {
  const socketsMap = new Map<string, TypedSocket>();
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];

  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload });
      },
    }),
    sockets: {
      sockets: socketsMap,
    },
  } as unknown as TypedSocketServer;

  const makeSocket = (id: string): { socket: TypedSocket; record: MockSocketRecord } => {
    const record: MockSocketRecord = {
      id,
      emitted: [],
      rooms: new Set(),
    };
    const socket = {
      id,
      join: (room: string) => {
        record.rooms.add(room);
      },
      leave: (room: string) => {
        record.rooms.delete(room);
      },
      emit: (event: string, payload: unknown) => {
        record.emitted.push({ event, payload });
      },
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          roomEmits.push({ room, event, payload });
        },
      }),
    } as unknown as TypedSocket;
    socketsMap.set(id, socket);
    return { socket, record };
  };

  return { io, makeSocket, roomEmits };
}

async function createInMemoryDb(): Promise<{ db: AppDatabase; close: () => void }> {
  const conn = createDatabaseConnection(':memory:');
  runMigrations(conn.sqlite);
  await seedInitialThemes(conn.db, {
    uploadsDir: '/tmp/rankroom-test-unused',
    maxUploadBytes: 5 * 1024 * 1024,
    fetchImages: false,
  });
  return { db: conn.db, close: () => conn.sqlite.close() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RoomManager Timer Hygiene', () => {
  it('annule et réinitialise le timer de grâce de 2s si un joueur modifie sa note', async () => {
    vi.useFakeTimers();
    const { db, close } = await createInMemoryDb();
    const { io, makeSocket, roomEmits } = createMockIo();
    const manager = new RoomManager(io, db);

    try {
      const themes = listThemes(db);
      const themeId = themes[0]!.id;

      const host = makeSocket('sock-host');
      const guest = makeSocket('sock-guest');

      const created = manager.createRoom(host.socket, 'token-1', {
        displayName: 'Alice',
        themeId,
        settings: { timeLimitSeconds: null, revealBetweenItems: true },
      });
      manager.joinRoom(guest.socket, 'token-2', {
        roomCode: created.roomCode,
        displayName: 'Bob',
      });
      manager.startGame(host.socket);

      const firstItemId = created.state.theme.id
        ? manager['rooms'].get(created.roomCode)!.state.orderedItems[0]!.id
        : '';

      manager.castVote(host.socket, { itemId: firstItemId, score: 4 });
      manager.castVote(guest.socket, { itemId: firstItemId, score: 3 });

      // À t = 1500ms, Bob change son vote -> le timer de 2s doit repartir à zéro
      vi.advanceTimersByTime(1500);
      expect(roomEmits.some((e) => e.event === 'game:item_revealed')).toBe(false);

      manager.castVote(guest.socket, { itemId: firstItemId, score: 5 });

      // À t = 1500 + 1500ms = 3000ms (< 2000ms après modification), toujours en VOTING
      vi.advanceTimersByTime(1500);
      expect(roomEmits.some((e) => e.event === 'game:item_revealed')).toBe(false);

      // À +600ms (total 2100ms après la modification), la transition a lieu exactement une fois
      vi.advanceTimersByTime(600);
      const reveals = roomEmits.filter((e) => e.event === 'game:item_revealed');
      expect(reveals).toHaveLength(1);
    } finally {
      manager.dispose();
      close();
    }
  });

  it('annule tous les timers lors de game:next_item pour éviter toute double transition fantôme', async () => {
    vi.useFakeTimers();
    const { db, close } = await createInMemoryDb();
    const { io, makeSocket, roomEmits } = createMockIo();
    const manager = new RoomManager(io, db);

    try {
      const themeId = listThemes(db)[0]!.id;
      const host = makeSocket('sock-host');

      const created = manager.createRoom(host.socket, 'token-1', {
        displayName: 'Alice',
        themeId,
        settings: { timeLimitSeconds: 15, revealBetweenItems: true },
      });
      manager.startGame(host.socket);

      const item0 = manager['rooms'].get(created.roomCode)!.state.orderedItems[0]!.id;
      manager.castVote(host.socket, { itemId: item0, score: 5 });

      // L'hôte clique immédiatement sur "Suivant" -> passe en ITEM_REVEAL et annule le phaseTimer(15s) & graceTimer(2s)
      manager.nextItem(host.socket);
      expect(roomEmits.filter((e) => e.event === 'game:item_revealed')).toHaveLength(1);

      // Puis clique encore sur "Suivant" -> passe à l'item 1 (VOTING) et annule le revealTimer(10s)
      manager.nextItem(host.socket);
      const phaseChangesAfterManual = roomEmits.filter(
        (e) => e.event === 'game:phase_changed',
      );
      expect(phaseChangesAfterManual).toHaveLength(2); // start + item 1

      // Avance de 12s (< 15s du nouvel item) : aucune transition fantôme de l'ancien revealTimer ni ancien graceTimer !
      vi.advanceTimersByTime(12_000);
      expect(roomEmits.filter((e) => e.event === 'game:item_revealed')).toHaveLength(1);
      expect(roomEmits.filter((e) => e.event === 'game:phase_changed')).toHaveLength(2);
    } finally {
      manager.dispose();
      close();
    }
  });

  it('recharge toujours le thème frais depuis SQLite au game:start et supporte room:reset_deck', async () => {
    const { db, close } = await createInMemoryDb();
    const { io, makeSocket, roomEmits } = createMockIo();
    const manager = new RoomManager(io, db);

    try {
      const themeId = listThemes(db)[0]!.id;
      const host = makeSocket('sock-host');

      const created = manager.createRoom(host.socket, 'token-1', {
        displayName: 'Alice',
        themeId,
        settings: { itemCount: 4, revealBetweenItems: false },
      });
      expect(created.state.totalThemeItems).toBe(6);
      expect(created.state.unplayedCount).toBe(6);

      // Un administrateur ajoute un 7e item en BDD pendant que la salle est en lobby
      const addedItemId = randomUUID();
      db.insert(themeItems)
        .values({
          id: addedItemId,
          themeId,
          name: 'Nouvel Item BDD',
          description: '',
          imagePath: '',
          position: 6,
          createdAt: Date.now(),
        })
        .run();

      manager.startGame(host.socket);
      const managed = manager['rooms'].get(created.roomCode)!;
      expect(managed.state.theme.items).toHaveLength(7);
      expect(managed.state.orderedItems).toHaveLength(4);

      // Termine rapidement les 4 items et revient au lobby
      for (let i = 0; i < 4; i += 1) {
        manager.nextItem(host.socket);
      }
      manager.resetToLobby(host.socket);
      expect(managed.state.phase).toBe('LOBBY');

      const stats = manager.resetDeck(host.socket);
      expect(stats).toEqual({ totalThemeItems: 7, unplayedCount: 7 });
      expect(
        roomEmits.some(
          (e) =>
            e.event === 'room:deck_updated' &&
            (e.payload as { unplayedCount: number }).unplayedCount === 7,
        ),
      ).toBe(true);
    } finally {
      manager.dispose();
      close();
    }
  });
});
