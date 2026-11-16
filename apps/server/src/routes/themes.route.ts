import {
  CreateThemeSchema,
  ImportThemeSchema,
  SearchImagesQuerySchema,
  UpdateThemeSchema,
  UploadFromUrlSchema,
  UuidSchema,
  VerifyAdminPasswordSchema,
} from '@rankroom/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAdminPassword, type ServerConfig } from '../config.js';
import type { AppDatabase } from '../db/index.js';
import {
  downloadAndSaveImageFromUrl,
  ImageProcessingError,
  processAndSaveImage,
} from '../services/image.service.js';
import {
  searchWikimediaImages,
  WikimediaRateLimitError,
} from '../services/wikimedia.service.js';
import {
  createTheme,
  deleteTheme,
  exportTheme,
  getThemeById,
  importTheme,
  listThemes,
  ThemeNotFoundError,
  updateTheme,
} from '../services/theme.service.js';

function extractAdminCandidate(request: FastifyRequest): string | undefined {
  const headerPassword = request.headers['x-admin-password'];
  if (typeof headerPassword === 'string' && headerPassword.length > 0) {
    return headerPassword;
  }
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

function assertAdminAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ServerConfig,
): boolean {
  if (!config.adminPassword) {
    return true;
  }
  const candidate = extractAdminCandidate(request);
  if (!verifyAdminPassword(candidate, config.adminPassword)) {
    void reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Mot de passe administrateur requis ou invalide.',
    });
    return false;
  }
  return true;
}

export function registerThemeRoutes(
  fastify: FastifyInstance,
  db: AppDatabase,
  config: ServerConfig,
): void {
  fastify.get('/api/auth/admin-status', async () => {
    return { adminRequired: Boolean(config.adminPassword) };
  });

  fastify.post('/api/auth/verify-admin', async (request, reply) => {
    const parsed = VerifyAdminPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Mot de passe requis.',
      });
    }

    if (!verifyAdminPassword(parsed.data.password, config.adminPassword)) {
      return reply.code(401).send({
        error: 'INVALID_PASSWORD',
        message: 'Mot de passe administrateur incorrect.',
      });
    }

    return reply.code(200).send({ valid: true });
  });

  fastify.get('/api/themes', async (request) => {
    const query = request.query as { category?: string; q?: string } | undefined;
    const themes = listThemes(db, {
      category: typeof query?.category === 'string' ? query.category : undefined,
      q: typeof query?.q === 'string' ? query.q : undefined,
    });
    return { themes };
  });

  fastify.get('/api/themes/:id', async (request, reply) => {
    const idParsed = UuidSchema.safeParse((request.params as { id?: unknown }).id);
    if (!idParsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'ID de thème invalide.' });
    }

    const theme = getThemeById(db, idParsed.data);
    if (!theme) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Thème introuvable.' });
    }
    return { theme };
  });

  fastify.post('/api/themes', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const parsed = CreateThemeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Données de thème invalides.',
        issues: parsed.error.issues,
      });
    }

    const theme = createTheme(db, parsed.data);
    return reply.code(201).send({ theme });
  });

  fastify.put('/api/themes/:id', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const idParsed = UuidSchema.safeParse((request.params as { id?: unknown }).id);
    if (!idParsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'ID de thème invalide.' });
    }

    const parsed = UpdateThemeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Données de thème invalides.',
        issues: parsed.error.issues,
      });
    }

    try {
      const theme = await updateTheme(db, idParsed.data, parsed.data, config.uploadsDir);
      return reply.code(200).send({ theme });
    } catch (err) {
      if (err instanceof ThemeNotFoundError) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  });

  fastify.delete('/api/themes/:id', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const idParsed = UuidSchema.safeParse((request.params as { id?: unknown }).id);
    if (!idParsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'ID de thème invalide.' });
    }

    const deleted = await deleteTheme(db, idParsed.data, config.uploadsDir);
    if (!deleted) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Thème introuvable.' });
    }
    return reply.code(200).send({ deleted: true });
  });

  fastify.get('/api/themes/:id/export', async (request, reply) => {
    const idParsed = UuidSchema.safeParse((request.params as { id?: unknown }).id);
    if (!idParsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'ID de thème invalide.' });
    }

    const exported = exportTheme(db, idParsed.data);
    if (!exported) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Thème introuvable.' });
    }

    const slug = exported.theme.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return reply
      .header('Content-Disposition', `attachment; filename="rankroom-${slug || 'theme'}.json"`)
      .code(200)
      .send(exported);
  });

  fastify.post('/api/themes/import', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const parsed = ImportThemeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Format JSON de thème invalide.',
        issues: parsed.error.issues,
      });
    }

    const theme = await importTheme(db, parsed.data, {
      uploadsDir: config.uploadsDir,
      maxUploadBytes: config.maxUploadBytes,
    });
    return reply.code(201).send({ theme });
  });

  fastify.post('/api/uploads/image', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    try {
      const file = await request.file();
      if (!file) {
        return reply
          .code(400)
          .send({ error: 'NO_FILE', message: 'Aucun fichier image fourni.' });
      }
      const buffer = await file.toBuffer();
      const imagePath = await processAndSaveImage(
        buffer,
        config.uploadsDir,
        config.maxUploadBytes,
      );
      return reply.code(201).send({ imagePath });
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        return reply.code(err.statusCode).send({ error: 'UPLOAD_ERROR', message: err.message });
      }
      const fastifyErr = err as { code?: string; statusCode?: number };
      if (fastifyErr.code === 'FST_REQ_FILE_TOO_LARGE' || fastifyErr.statusCode === 413) {
        return reply.code(413).send({
          error: 'FILE_TOO_LARGE',
          message: `Fichier trop volumineux (max ${Math.round(config.maxUploadBytes / (1024 * 1024))} Mo).`,
        });
      }
      throw err;
    }
  });

  fastify.post('/api/uploads/from-url', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const parsed = UploadFromUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'URL invalide.',
      });
    }

    try {
      const imagePath = await downloadAndSaveImageFromUrl(
        parsed.data.url,
        config.uploadsDir,
        config.maxUploadBytes,
      );
      return reply.code(201).send({ imagePath });
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        return reply.code(err.statusCode).send({ error: 'UPLOAD_ERROR', message: err.message });
      }
      throw err;
    }
  });

  fastify.get('/api/uploads/search-images', async (request, reply) => {
    if (!assertAdminAuthorized(request, reply, config)) return;

    const parsed = SearchImagesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Requête de recherche invalide.',
      });
    }

    try {
      const results = await searchWikimediaImages(parsed.data.q, 12);
      return reply.code(200).send({ results });
    } catch (err) {
      if (err instanceof WikimediaRateLimitError) {
        return reply.code(429).send({
          error: 'RATE_LIMITED',
          message: err.message,
        });
      }
      throw err;
    }
  });
}
