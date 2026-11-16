import type Database from 'better-sqlite3';

export function runMigrations(sqlite: Database.Database): void {
  const migrate = sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        is_seeded INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_themes_category ON themes(category);
      CREATE INDEX IF NOT EXISTS idx_themes_updated_at ON themes(updated_at DESC);

      CREATE TABLE IF NOT EXISTS theme_items (
        id TEXT PRIMARY KEY NOT NULL,
        theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image_path TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_theme_items_theme_pos ON theme_items(theme_id, position);

      CREATE TABLE IF NOT EXISTS game_results (
        id TEXT PRIMARY KEY NOT NULL,
        room_code TEXT NOT NULL,
        theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
        theme_title TEXT NOT NULL,
        theme_category TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        players_json TEXT NOT NULL,
        rankings_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_game_results_created_at ON game_results(created_at DESC);
    `);
  });

  migrate();
}
