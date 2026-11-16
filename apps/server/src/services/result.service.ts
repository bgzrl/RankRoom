import { randomBytes } from 'node:crypto';
import {
  DEFAULT_ROOM_SETTINGS,
  type PersistedGameResult,
  type PlayerSummary,
  type RankedItemResult,
  type RoomSettings,
} from '@rankroom/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { gameResults } from '../db/schema.js';

export function generateResultId(): string {
  return randomBytes(8).toString('base64url');
}

export function saveGameResult(db: AppDatabase, result: PersistedGameResult): PersistedGameResult {
  db.insert(gameResults)
    .values({
      id: result.id,
      roomCode: result.roomCode,
      themeId: result.themeId,
      themeTitle: result.themeTitle,
      themeCategory: result.themeCategory,
      settingsJson: JSON.stringify(result.settings),
      playersJson: JSON.stringify(result.players),
      rankingsJson: JSON.stringify(result.rankings),
      createdAt: result.createdAt,
    })
    .run();

  return result;
}

export function getGameResultById(db: AppDatabase, resultId: string): PersistedGameResult | null {
  const row = db.select().from(gameResults).where(eq(gameResults.id, resultId)).get();
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    roomCode: row.roomCode,
    themeId: row.themeId,
    themeTitle: row.themeTitle,
    themeCategory: row.themeCategory,
    settings: {
      ...DEFAULT_ROOM_SETTINGS,
      ...(JSON.parse(row.settingsJson) as Partial<RoomSettings>),
    },
    players: JSON.parse(row.playersJson) as PlayerSummary[],
    rankings: JSON.parse(row.rankingsJson) as RankedItemResult[],
    createdAt: row.createdAt,
  };
}
