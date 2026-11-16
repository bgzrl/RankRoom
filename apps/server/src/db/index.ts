import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  sqlite: Database.Database;
  db: AppDatabase;
}

export function createDatabaseConnection(dbPath: string, uploadsDir?: string): DatabaseConnection {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  if (uploadsDir) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}
