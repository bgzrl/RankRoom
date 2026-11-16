import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const themes = sqliteTable(
  'themes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    isSeeded: integer('is_seeded', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_themes_category').on(table.category),
    index('idx_themes_updated_at').on(table.updatedAt),
  ],
);

export const themeItems = sqliteTable(
  'theme_items',
  {
    id: text('id').primaryKey(),
    themeId: text('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    imagePath: text('image_path').notNull().default(''),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_theme_items_theme_pos').on(table.themeId, table.position)],
);

export const gameResults = sqliteTable(
  'game_results',
  {
    id: text('id').primaryKey(),
    roomCode: text('room_code').notNull(),
    themeId: text('theme_id').references(() => themes.id, { onDelete: 'set null' }),
    themeTitle: text('theme_title').notNull(),
    themeCategory: text('theme_category').notNull(),
    settingsJson: text('settings_json').notNull(),
    playersJson: text('players_json').notNull(),
    rankingsJson: text('rankings_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_game_results_created_at').on(table.createdAt)],
);

export type ThemeRow = typeof themes.$inferSelect;
export type NewThemeRow = typeof themes.$inferInsert;
export type ThemeItemRow = typeof themeItems.$inferSelect;
export type NewThemeItemRow = typeof themeItems.$inferInsert;
export type GameResultRow = typeof gameResults.$inferSelect;
export type NewGameResultRow = typeof gameResults.$inferInsert;
