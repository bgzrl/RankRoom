import { randomUUID } from 'node:crypto';
import type { ImageSearchResultDto, RankedItemResult } from '@rankroom/shared';
import { eq, like, sql } from 'drizzle-orm';
import type { AppDatabase } from './index.js';
import { gameResults, themeItems, themes } from './schema.js';
import { downloadAndSaveImageFromUrl } from '../services/image.service.js';
import {
  fetchWikipediaImagesBatch,
  searchWikimediaImages,
} from '../services/wikimedia.service.js';

interface SeedThemeSpec {
  title: string;
  description: string;
  category: string;
  items: Array<{
    name: string;
    description: string;
    wikiTitle: string;
  }>;
}

const SEED_THEMES: readonly SeedThemeSpec[] = [
  {
    title: 'Classiques du Jeu Vidéo',
    description: 'Six titres marquants qui ont redéfini leurs genres respectifs.',
    category: 'Jeux vidéo',
    items: [
      {
        name: 'The Legend of Zelda: Breath of the Wild',
        description: 'Exploration libre et physique émergente en Hyrule.',
        wikiTitle: 'The Legend of Zelda: Breath of the Wild',
      },
      {
        name: 'Hollow Knight',
        description: 'Metroidvania exigeant et mélancolique sous Hallownest.',
        wikiTitle: 'Hollow Knight',
      },
      {
        name: 'Portal 2',
        description: 'Puzzles spatiaux millimétrés et écriture brillante.',
        wikiTitle: 'Portal 2',
      },
      {
        name: 'Hades',
        description: 'Roguelite nerveux mêlant action et narration dynamique.',
        wikiTitle: 'Hades (video game)',
      },
      {
        name: 'Elden Ring',
        description: 'Action-RPG monumental en monde ouvert par FromSoftware.',
        wikiTitle: 'Elden Ring',
      },
      {
        name: 'Celeste',
        description: 'Plateformer de précision sur le dépassement de soi.',
        wikiTitle: 'Celeste (video game)',
      },
    ],
  },
  {
    title: 'Films Cultes (1990–2015)',
    description: 'Des œuvres de cinéma devenues incontournables.',
    category: 'Cinéma',
    items: [
      {
        name: 'Le Seigneur des Anneaux : La Communauté',
        description: 'Épopée fantasy de Peter Jackson en Terre du Milieu.',
        wikiTitle: 'The Lord of the Rings: The Fellowship of the Ring',
      },
      {
        name: 'Matrix',
        description: 'Révolution cyberpunk et action chorégraphiée (1999).',
        wikiTitle: 'The Matrix',
      },
      {
        name: 'Le Voyage de Chihiro',
        description: 'Chef-d’œuvre d’animation du studio Ghibli.',
        wikiTitle: 'Spirited Away',
      },
      {
        name: 'Pulp Fiction',
        description: 'Récit choral non-linéaire signé Quentin Tarantino.',
        wikiTitle: 'Pulp Fiction',
      },
      {
        name: 'Interstellar',
        description: 'Odyssée spatiale sur le temps et la gravité.',
        wikiTitle: 'Interstellar (film)',
      },
      {
        name: 'Jurassic Park',
        description: 'Classique d’aventure et d’effets spéciaux de Spielberg.',
        wikiTitle: 'Jurassic Park (film)',
      },
    ],
  },
  {
    title: 'Plats & Spécialités Iconiques',
    description: 'Incontournables de la cuisine du monde à départager.',
    category: 'Gastronomie',
    items: [
      {
        name: 'Ramen Tonkotsu',
        description: 'Bouillon d’os mijoté, nouilles fraîches et œuf mollet mariné.',
        wikiTitle: 'Tonkotsu ramen',
      },
      {
        name: 'Pizza Napolitaine Margherita',
        description: 'Pâte levée 48h, San Marzano, fior di latte et basilic.',
        wikiTitle: 'Pizza Margherita',
      },
      {
        name: 'Tacos Al Pastor',
        description: 'Porc mariné à la broche, coriandre, oignon et ananas rôti.',
        wikiTitle: 'Al pastor',
      },
      {
        name: 'Pad Thaï',
        description: 'Nouilles de riz sautées au tamarin, cacahuètes et citron vert.',
        wikiTitle: 'Pad thai',
      },
      {
        name: 'Raclette Savoyarde',
        description: 'Fromage fondu au lait cru, pommes de terre et charcuterie.',
        wikiTitle: 'Raclette',
      },
      {
        name: 'Croissant au Beurre AOP',
        description: 'Pâte feuilletée levée croustillante et mie alvéolée.',
        wikiTitle: 'Croissant',
      },
    ],
  },
];

const SEED_WIKI_TITLE_BY_ITEM_NAME = new Map<string, string>(
  SEED_THEMES.flatMap((theme) =>
    theme.items.map((item) => [item.name.toLowerCase(), item.wikiTitle] as const),
  ),
);

export interface SeedOptions {
  uploadsDir: string;
  maxUploadBytes: number;
  fetchImages?: boolean;
}

export interface SeedHydrationTarget {
  itemId: string;
  name: string;
  wikiTitle: string;
}

export interface SyncSeedPlan {
  itemsToHydrate: SeedHydrationTarget[];
  seededNewThemes: boolean;
}

async function downloadCandidateToWebp(
  candidate: ImageSearchResultDto,
  options: SeedOptions,
): Promise<string> {
  const urlsToTry =
    candidate.previewUrl !== candidate.fullUrl
      ? [candidate.fullUrl, candidate.previewUrl]
      : [candidate.fullUrl];

  for (const url of urlsToTry) {
    try {
      return await downloadAndSaveImageFromUrl(
        url,
        options.uploadsDir,
        options.maxUploadBytes,
      );
    } catch {
      // Try next URL
    }
  }
  return '';
}

async function resolveSeedImagesBatch(
  titles: readonly string[],
  options: SeedOptions,
  isCancelled: () => boolean = () => false,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (options.fetchImages === false || titles.length === 0 || isCancelled()) {
    return resolved;
  }

  const uniqueTitles = Array.from(new Set(titles));
  let enCandidates = new Map<string, ImageSearchResultDto>();
  try {
    enCandidates = await fetchWikipediaImagesBatch(uniqueTitles, 'en.wikipedia.org');
  } catch {
    return resolved;
  }

  if (isCancelled()) return resolved;

  const missingTitles = uniqueTitles.filter((t) => !enCandidates.has(t));
  let frCandidates = new Map<string, ImageSearchResultDto>();
  if (missingTitles.length > 0) {
    try {
      frCandidates = await fetchWikipediaImagesBatch(missingTitles, 'fr.wikipedia.org');
    } catch {
      // Ignore fallback language error
    }
  }

  // Téléchargement poli (concurrence 2) pour éviter les 429 côté Wikimedia
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < uniqueTitles.length && !isCancelled()) {
      const idx = cursor;
      cursor += 1;
      const title = uniqueTitles[idx]!;
      const candidate = enCandidates.get(title) ?? frCandidates.get(title);
      if (candidate) {
        const localPath = await downloadCandidateToWebp(candidate, options);
        if (localPath) {
          resolved.set(title, localPath);
          continue;
        }
      }
      if (isCancelled()) return;
      // Dernier recours si absent des infoboxes
      try {
        const fallbackResults = await searchWikimediaImages(title, 2);
        for (const fb of fallbackResults) {
          if (isCancelled()) return;
          const localPath = await downloadCandidateToWebp(fb, options);
          if (localPath) {
            resolved.set(title, localPath);
            break;
          }
        }
      } catch {
        // Hors-ligne ou rate-limit -> fallback propre sur ''
      }
    }
  }

  await Promise.all([worker(), worker()]);
  return resolved;
}

function cleanupLegacySeedSvgReferencesSync(db: AppDatabase): SeedHydrationTarget[] {
  const legacyItems = db
    .select({
      id: themeItems.id,
      name: themeItems.name,
      imagePath: themeItems.imagePath,
    })
    .from(themeItems)
    .where(like(themeItems.imagePath, '/seed-assets/%'))
    .all();

  const targets: SeedHydrationTarget[] = [];

  if (legacyItems.length > 0) {
    db.transaction((tx) => {
      for (const item of legacyItems) {
        tx.update(themeItems)
          .set({ imagePath: '' })
          .where(eq(themeItems.id, item.id))
          .run();

        targets.push({
          itemId: item.id,
          name: item.name,
          wikiTitle: SEED_WIKI_TITLE_BY_ITEM_NAME.get(item.name.toLowerCase()) ?? item.name,
        });
      }
    });
  }

  // Nettoie également les éventuels anciens chemins /seed-assets/*.svg dans game_results
  const legacyResults = db
    .select({
      id: gameResults.id,
      rankingsJson: gameResults.rankingsJson,
    })
    .from(gameResults)
    .where(like(gameResults.rankingsJson, '%/seed-assets/%'))
    .all();

  for (const row of legacyResults) {
    try {
      const parsed = JSON.parse(row.rankingsJson) as RankedItemResult[];
      if (!Array.isArray(parsed)) continue;
      let changed = false;
      const updatedRankings = parsed.map((entry) => {
        if (typeof entry.imagePath === 'string' && entry.imagePath.startsWith('/seed-assets/')) {
          changed = true;
          return {
            ...entry,
            imagePath: '',
          };
        }
        return entry;
      });
      if (changed) {
        db.update(gameResults)
          .set({ rankingsJson: JSON.stringify(updatedRankings) })
          .where(eq(gameResults.id, row.id))
          .run();
      }
    } catch {
      // Ignore malformed historical JSON
    }
  }

  return targets;
}

export function seedInitialThemesSync(db: AppDatabase): SyncSeedPlan {
  const legacyTargets = cleanupLegacySeedSvgReferencesSync(db);

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(themes)
    .get();

  if ((countRow?.count ?? 0) > 0) {
    return {
      itemsToHydrate: legacyTargets,
      seededNewThemes: false,
    };
  }

  const now = Date.now();
  const seededTargets: SeedHydrationTarget[] = [];

  db.transaction((tx) => {
    SEED_THEMES.forEach((themeSpec, themeIdx) => {
      const themeId = randomUUID();
      const timestamp = now - (SEED_THEMES.length - themeIdx) * 1000;

      tx.insert(themes)
        .values({
          id: themeId,
          title: themeSpec.title,
          description: themeSpec.description,
          category: themeSpec.category,
          isSeeded: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      themeSpec.items.forEach((itemSpec, position) => {
        const itemId = randomUUID();
        tx.insert(themeItems)
          .values({
            id: itemId,
            themeId,
            name: itemSpec.name,
            description: itemSpec.description,
            imagePath: '',
            position,
            createdAt: timestamp,
          })
          .run();

        seededTargets.push({
          itemId,
          name: itemSpec.name,
          wikiTitle: itemSpec.wikiTitle,
        });
      });
    });
  });

  return {
    itemsToHydrate: [...legacyTargets, ...seededTargets],
    seededNewThemes: true,
  };
}

export async function hydrateSeedImages(
  db: AppDatabase,
  targets: readonly SeedHydrationTarget[],
  options: SeedOptions,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  if (options.fetchImages === false || targets.length === 0 || isCancelled()) {
    return;
  }

  const resolvedByWikiTitle = await resolveSeedImagesBatch(
    targets.map((t) => t.wikiTitle),
    options,
    isCancelled,
  );

  if (isCancelled() || resolvedByWikiTitle.size === 0) {
    return;
  }

  db.transaction((tx) => {
    for (const target of targets) {
      if (isCancelled()) return;
      const localPath = resolvedByWikiTitle.get(target.wikiTitle);
      if (!localPath) continue;

      tx.update(themeItems)
        .set({ imagePath: localPath })
        .where(eq(themeItems.id, target.itemId))
        .run();
    }
  });
}

export async function seedInitialThemes(
  db: AppDatabase,
  options: SeedOptions,
): Promise<void> {
  const plan = seedInitialThemesSync(db);
  await hydrateSeedImages(db, plan.itemsToHydrate, options);
}
