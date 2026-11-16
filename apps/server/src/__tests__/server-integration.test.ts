import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PersistedGameResult } from '@rankroom/shared';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../app.js';
import type { ServerConfig } from '../config.js';
import { themeItems } from '../db/schema.js';
import { seedInitialThemes } from '../db/seed.js';
import { saveGameResult } from '../services/result.service.js';
import { searchWikimediaImages, type FetchLike } from '../services/wikimedia.service.js';

const tempDirs: string[] = [];
const serversToClose: BuiltServer[] = [];

async function makeTempConfig(overrides?: Partial<ServerConfig>): Promise<ServerConfig> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rankroom-test-'));
  tempDirs.push(dataDir);
  return {
    port: 0,
    host: '127.0.0.1',
    nodeEnv: 'test',
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    dbPath: path.join(dataDir, 'rankroom.sqlite'),
    webDistDir: path.join(dataDir, 'non-existent-web-dist'),
    publicUrl: undefined,
    maxUploadBytes: 5 * 1024 * 1024,
    adminPassword: undefined,
    ...overrides,
  };
}

afterEach(async () => {
  while (serversToClose.length > 0) {
    const srv = serversToClose.pop();
    if (srv) await srv.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Intégration Fastify + SQLite + Sharp + Protection résultats', () => {
  it('initialise la BDD avec 3 thèmes seedés, sert /api/health et nettoie les anciens /seed-assets/*.svg', async () => {
    const config = await makeTempConfig();
    const server = await buildServer(config);
    serversToClose.push(server);

    const healthRes = await server.fastify.inject({ method: 'GET', url: '/api/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json()).toMatchObject({ status: 'ok', db: 'connected' });

    const themesRes = await server.fastify.inject({ method: 'GET', url: '/api/themes' });
    expect(themesRes.statusCode).toBe(200);
    const { themes } = themesRes.json() as {
      themes: Array<{ id: string; itemCount: number }>;
    };
    expect(themes).toHaveLength(3);
    expect(themes.every((t) => t.itemCount === 6)).toBe(true);

    // Simule un ancien enregistrement contenant un /seed-assets/*.svg hérité
    const firstThemeId = themes[0]!.id;
    server.dbConnection.db
      .insert(themeItems)
      .values({
        id: '99999999-9999-4999-8999-999999999999',
        themeId: firstThemeId,
        name: 'Ancien SVG',
        description: '',
        imagePath: '/seed-assets/legacy-icon.svg',
        position: 99,
        createdAt: Date.now(),
      })
      .run();

    await seedInitialThemes(server.dbConnection.db, {
      uploadsDir: config.uploadsDir,
      maxUploadBytes: config.maxUploadBytes,
      fetchImages: false,
    });

    const detailRes = await server.fastify.inject({
      method: 'GET',
      url: `/api/themes/${firstThemeId}`,
    });
    const detail = detailRes.json() as {
      theme: { items: Array<{ name: string; imagePath: string }> };
    };
    const cleaned = detail.theme.items.find((i) => i.name === 'Ancien SVG');
    expect(cleaned?.imagePath).toBe('');
  });

  it("protège les mutations et la recherche d'images par ADMIN_PASSWORD et vérifie l'intégrité des images liées aux résultats", async () => {
    const config = await makeTempConfig({ adminPassword: 'super-secret-password' });
    const server = await buildServer(config);
    serversToClose.push(server);

    const statusRes = await server.fastify.inject({
      method: 'GET',
      url: '/api/auth/admin-status',
    });
    expect(statusRes.json()).toEqual({ adminRequired: true });

    // Rejet sans mot de passe sur /api/themes et /api/uploads/search-images
    const unauthCreate = await server.fastify.inject({
      method: 'POST',
      url: '/api/themes',
      payload: {
        title: 'Thème Bloqué',
        description: '',
        category: 'Test',
        items: [
          { name: 'A', description: '', imagePath: '' },
          { name: 'B', description: '', imagePath: '' },
          { name: 'C', description: '', imagePath: '' },
        ],
      },
    });
    expect(unauthCreate.statusCode).toBe(401);

    const unauthSearch = await server.fastify.inject({
      method: 'GET',
      url: '/api/uploads/search-images?q=ramen',
    });
    expect(unauthSearch.statusCode).toBe(401);

    // Validation Zod sur /api/uploads/search-images (q trop court)
    const invalidSearch = await server.fastify.inject({
      method: 'GET',
      url: '/api/uploads/search-images?q=a',
      headers: { 'x-admin-password': 'super-secret-password' },
    });
    expect(invalidSearch.statusCode).toBe(400);

    // Crée deux vrais fichiers .webp via sharp dans uploadsDir
    const pngBuffer = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .png()
      .toBuffer();

    const keptFile = path.join(config.uploadsDir, '11111111-1111-4111-8111-111111111111.webp');
    const orphanFile = path.join(config.uploadsDir, '22222222-2222-4222-8222-222222222222.webp');
    await sharp(pngBuffer).webp().toFile(keptFile);
    await sharp(pngBuffer).webp().toFile(orphanFile);

    const keptPath = '/uploads/11111111-1111-4111-8111-111111111111.webp';
    const orphanPath = '/uploads/22222222-2222-4222-8222-222222222222.webp';

    // Création autorisée
    const createRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/themes',
      headers: { 'x-admin-password': 'super-secret-password' },
      payload: {
        title: 'Thème Temporaire',
        description: 'Avec images uploadées',
        category: 'Test',
        items: [
          { name: 'Item Gardé', description: '', imagePath: keptPath },
          { name: 'Item Supprimable', description: '', imagePath: orphanPath },
          { name: 'Item Neutre', description: '', imagePath: '' },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdTheme = (createRes.json() as { theme: { id: string } }).theme;

    // Enregistre un game_result référençant keptPath
    const resultRecord: PersistedGameResult = {
      id: 'res-keep-img',
      roomCode: 'K7M2P',
      themeId: createdTheme.id,
      themeTitle: 'Thème Temporaire',
      themeCategory: 'Test',
      settings: {
        timeLimitSeconds: 30,
        revealBetweenItems: false,
        itemOrder: 'sequential',
        ratingScale: 'integers',
        itemCount: null,
        avoidRepeats: true,
      },
      players: [{ id: 'p1', displayName: 'Alice', isHost: true }],
      rankings: [
        {
          itemId: 'i1',
          name: 'Item Gardé',
          description: '',
          imagePath: keptPath,
          originalPosition: 0,
          rank: 1,
          tier: 'S',
          averageScore: 5,
          stdDev: 0,
          maxScoreCount: 1,
          voteCount: 1,
          tieBreakReason: null,
          votesByPlayer: [{ playerId: 'p1', displayName: 'Alice', score: 5 }],
          scoreDistribution: [{ score: 5, count: 1 }],
        },
      ],
      createdAt: Date.now(),
    };
    saveGameResult(server.dbConnection.db, resultRecord);

    // Suppression du thème
    const delRes = await server.fastify.inject({
      method: 'DELETE',
      url: `/api/themes/${createdTheme.id}`,
      headers: { 'x-admin-password': 'super-secret-password' },
    });
    expect(delRes.statusCode).toBe(200);

    // keptFile DOIT toujours exister car référencé dans game_results, orphanFile DOIT être supprimé
    await expect(fs.access(keptFile)).resolves.toBeUndefined();
    await expect(fs.access(orphanFile)).rejects.toThrow();

    // Le résultat reste accessible via /api/results/:id
    const resFetch = await server.fastify.inject({
      method: 'GET',
      url: '/api/results/res-keep-img',
    });
    expect(resFetch.statusCode).toBe(200);
    expect(resFetch.json().result.rankings[0].imagePath).toBe(keptPath);
  });

  it('interroge Wikimedia avec User-Agent explicite et filtre les SVG/PDF/icônes techniques', async () => {
    const capturedUserAgents: string[] = [];

    const mockFetch: FetchLike = async (input, init) => {
      const headers = new Headers(init?.headers);
      capturedUserAgents.push(headers.get('user-agent') ?? '');
      const url = input.toString();

      if (url.includes('fr.wikipedia.org')) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                '1': {
                  index: 1,
                  title: 'Ramen',
                  thumbnail: {
                    source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Ramen.jpg/640px-Ramen.jpg',
                    width: 640,
                    height: 480,
                  },
                  original: {
                    source: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Ramen.jpg',
                    width: 1200,
                    height: 900,
                  },
                },
                '2': {
                  index: 2,
                  title: 'Icône SVG exclue',
                  thumbnail: {
                    source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Icon.svg/640px-Icon.svg.png',
                  },
                  original: {
                    source: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Icon.svg',
                  },
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('commons.wikimedia.org')) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                '10': {
                  index: 1,
                  title: 'File:Tonkotsu_ramen_bowl.jpg',
                  imageinfo: [
                    {
                      url: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Tonkotsu_ramen_bowl.jpg',
                      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Tonkotsu_ramen_bowl.jpg/640px-Tonkotsu_ramen_bowl.jpg',
                      mime: 'image/jpeg',
                      size: 500_000,
                    },
                  ],
                },
                '11': {
                  index: 2,
                  title: 'File:Commons-logo.png',
                  imageinfo: [
                    {
                      url: 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Commons-logo.png',
                      mime: 'image/png',
                      size: 10_000,
                    },
                  ],
                },
                '12': {
                  index: 3,
                  title: 'File:Document.pdf',
                  imageinfo: [
                    {
                      url: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Document.pdf',
                      mime: 'application/pdf',
                      size: 100_000,
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ query: { pages: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const results = await searchWikimediaImages('Ramen', 12, mockFetch);
    expect(capturedUserAgents.length).toBe(3);
    expect(
      capturedUserAgents.every(
        (ua) => ua === 'RankRoom/1.0 (https://github.com/rankroom/rankroom; admin@rankroom.local)',
      ),
    ).toBe(true);
    expect(results).toEqual([
      {
        title: 'Ramen',
        previewUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Ramen.jpg/640px-Ramen.jpg',
        fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Ramen.jpg',
        source: 'wikipedia-fr',
      },
      {
        title: 'Tonkotsu ramen bowl',
        previewUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Tonkotsu_ramen_bowl.jpg/640px-Tonkotsu_ramen_bowl.jpg',
        fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Tonkotsu_ramen_bowl.jpg',
        source: 'wikimedia-commons',
      },
    ]);
  });
});
