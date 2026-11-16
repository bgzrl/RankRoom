import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ThemeDetailDto,
  ThemeExportDto,
  ThemeItemDto,
  ThemeSummaryDto,
} from '@rankroom/shared';
import { CreateThemeSchema, ImportThemeSchema, UpdateThemeSchema } from '@rankroom/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import { themeItems, themes } from '../db/schema.js';
import {
  deleteOrphanedUploadFiles,
  downloadAndSaveImageFromUrl,
} from './image.service.js';

export type CreateThemeInput = z.infer<typeof CreateThemeSchema>;
export type UpdateThemeInput = z.infer<typeof UpdateThemeSchema>;
export type ImportThemeInput = z.infer<typeof ImportThemeSchema>;

export class ThemeNotFoundError extends Error {
  constructor(id: string) {
    super(`Thème introuvable (${id}).`);
    this.name = 'ThemeNotFoundError';
  }
}

export function listThemes(
  db: AppDatabase,
  filters?: { category?: string; q?: string },
): ThemeSummaryDto[] {
  const themeRows = db.select().from(themes).orderBy(desc(themes.updatedAt)).all();
  const itemRows = db
    .select()
    .from(themeItems)
    .orderBy(asc(themeItems.position))
    .all();

  const itemsByThemeId = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const existing = itemsByThemeId.get(item.themeId);
    if (existing) {
      existing.push(item);
    } else {
      itemsByThemeId.set(item.themeId, [item]);
    }
  }

  const categoryFilter = filters?.category?.trim().toLowerCase();
  const queryFilter = filters?.q?.trim().toLowerCase();

  const summaries: ThemeSummaryDto[] = [];

  for (const row of themeRows) {
    if (categoryFilter && row.category.toLowerCase() !== categoryFilter) {
      continue;
    }
    if (queryFilter) {
      const matchesTitle = row.title.toLowerCase().includes(queryFilter);
      const matchesDesc = row.description.toLowerCase().includes(queryFilter);
      const matchesCat = row.category.toLowerCase().includes(queryFilter);
      if (!matchesTitle && !matchesDesc && !matchesCat) {
        continue;
      }
    }

    const items = itemsByThemeId.get(row.id) ?? [];
    const previewImages = items
      .map((i) => i.imagePath)
      .filter((p) => p.length > 0)
      .slice(0, 4);

    summaries.push({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      isSeeded: row.isSeeded,
      itemCount: items.length,
      previewImages,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return summaries;
}

export function getThemeById(db: AppDatabase, themeId: string): ThemeDetailDto | null {
  const themeRow = db.select().from(themes).where(eq(themes.id, themeId)).get();
  if (!themeRow) {
    return null;
  }

  const itemRows = db
    .select()
    .from(themeItems)
    .where(eq(themeItems.themeId, themeId))
    .orderBy(asc(themeItems.position))
    .all();

  const items: ThemeItemDto[] = itemRows.map((item) => ({
    id: item.id,
    themeId: item.themeId,
    name: item.name,
    description: item.description,
    imagePath: item.imagePath,
    position: item.position,
    createdAt: item.createdAt,
  }));

  return {
    id: themeRow.id,
    title: themeRow.title,
    description: themeRow.description,
    category: themeRow.category,
    isSeeded: themeRow.isSeeded,
    createdAt: themeRow.createdAt,
    updatedAt: themeRow.updatedAt,
    items,
  };
}

export function createTheme(db: AppDatabase, input: CreateThemeInput): ThemeDetailDto {
  const themeId = randomUUID();
  const now = Date.now();

  db.transaction((tx) => {
    tx.insert(themes)
      .values({
        id: themeId,
        title: input.title,
        description: input.description,
        category: input.category,
        isSeeded: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    input.items.forEach((item, position) => {
      tx.insert(themeItems)
        .values({
          id: item.id ?? randomUUID(),
          themeId,
          name: item.name,
          description: item.description,
          imagePath: item.imagePath,
          position,
          createdAt: now,
        })
        .run();
    });
  });

  const created = getThemeById(db, themeId);
  if (!created) {
    throw new Error('Erreur interne lors de la création du thème.');
  }
  return created;
}

export async function updateTheme(
  db: AppDatabase,
  themeId: string,
  input: UpdateThemeInput,
  uploadsDir: string,
): Promise<ThemeDetailDto> {
  const existing = getThemeById(db, themeId);
  if (!existing) {
    throw new ThemeNotFoundError(themeId);
  }

  const previousImagePaths = existing.items.map((item) => item.imagePath);
  const nextImagePathSet = new Set(input.items.map((item) => item.imagePath));
  const removedCandidates = previousImagePaths.filter((p) => !nextImagePathSet.has(p));

  const now = Date.now();

  db.transaction((tx) => {
    tx.update(themes)
      .set({
        title: input.title,
        description: input.description,
        category: input.category,
        updatedAt: now,
      })
      .where(eq(themes.id, themeId))
      .run();

    tx.delete(themeItems).where(eq(themeItems.themeId, themeId)).run();

    input.items.forEach((item, position) => {
      tx.insert(themeItems)
        .values({
          id: item.id ?? randomUUID(),
          themeId,
          name: item.name,
          description: item.description,
          imagePath: item.imagePath,
          position,
          createdAt: now,
        })
        .run();
    });
  });

  await deleteOrphanedUploadFiles(db, uploadsDir, removedCandidates);

  const updated = getThemeById(db, themeId);
  if (!updated) {
    throw new ThemeNotFoundError(themeId);
  }
  return updated;
}

export async function deleteTheme(
  db: AppDatabase,
  themeId: string,
  uploadsDir: string,
): Promise<boolean> {
  const existing = getThemeById(db, themeId);
  if (!existing) {
    return false;
  }

  const candidateImages = existing.items.map((item) => item.imagePath);

  db.delete(themes).where(eq(themes.id, themeId)).run();

  await deleteOrphanedUploadFiles(db, uploadsDir, candidateImages);
  return true;
}

export function exportTheme(db: AppDatabase, themeId: string): ThemeExportDto | null {
  const theme = getThemeById(db, themeId);
  if (!theme) {
    return null;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: {
      title: theme.title,
      description: theme.description,
      category: theme.category,
      items: theme.items.map((item) => ({
        name: item.name,
        description: item.description,
        imagePath: item.imagePath,
      })),
    },
  };
}

export async function importTheme(
  db: AppDatabase,
  payload: ImportThemeInput,
  options: { uploadsDir: string; maxUploadBytes: number },
): Promise<ThemeDetailDto> {
  const resolvedItems: CreateThemeInput['items'] = [];

  for (const item of payload.theme.items) {
    let resolvedImagePath = '';
    const rawPath = item.imagePath.trim();

    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      try {
        resolvedImagePath = await downloadAndSaveImageFromUrl(
          rawPath,
          options.uploadsDir,
          options.maxUploadBytes,
        );
      } catch {
        resolvedImagePath = '';
      }
    } else if (rawPath.startsWith('/uploads/')) {
      const filename = path.basename(rawPath);
      if (fs.existsSync(path.join(options.uploadsDir, filename))) {
        resolvedImagePath = `/uploads/${filename}`;
      }
    }

    resolvedItems.push({
      name: item.name,
      description: item.description,
      imagePath: resolvedImagePath,
    });
  }

  return createTheme(db, {
    title: payload.theme.title,
    description: payload.theme.description,
    category: payload.theme.category,
    items: resolvedItems,
  });
}
