import fs from 'node:fs';
import path from 'node:path';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { ClientToServerEvents, ServerToClientEvents } from '@rankroom/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import type { ServerConfig } from './config.js';
import { createDatabaseConnection, type DatabaseConnection } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { hydrateSeedImages, seedInitialThemesSync } from './db/seed.js';
import { registerHealthRoutes } from './routes/health.route.js';
import { registerResultRoutes } from './routes/results.route.js';
import { registerThemeRoutes } from './routes/themes.route.js';
import { RoomManager } from './services/room.manager.js';
import { registerSocketHandlers } from './socket/handlers.js';

export interface BuiltServer {
  fastify: FastifyInstance;
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  roomManager: RoomManager;
  dbConnection: DatabaseConnection;
  close: () => Promise<void>;
}

function buildAllowedOrigins(config: ServerConfig): Set<string> {
  const allowed = new Set<string>();
  if (config.publicUrl) {
    try {
      allowed.add(new URL(config.publicUrl).origin);
    } catch {
      // Validated earlier
    }
  }
  if (config.nodeEnv !== 'production') {
    allowed.add(`http://localhost:${config.port}`);
    allowed.add(`http://127.0.0.1:${config.port}`);
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  return allowed;
}

export async function buildServer(config: ServerConfig): Promise<BuiltServer> {
  const dbConnection = createDatabaseConnection(config.dbPath, config.uploadsDir);
  runMigrations(dbConnection.sqlite);
  const seedPlan = seedInitialThemesSync(dbConnection.db);
  let closed = false;

  if (config.nodeEnv !== 'test' && seedPlan.itemsToHydrate.length > 0) {
    void hydrateSeedImages(
      dbConnection.db,
      seedPlan.itemsToHydrate,
      {
        uploadsDir: config.uploadsDir,
        maxUploadBytes: config.maxUploadBytes,
        fetchImages: true,
      },
      () => closed,
    ).catch((err) => {
      console.warn('Hydratation des images initiales ignorée:', err);
    });
  }

  const fastify = Fastify({
    trustProxy: true,
    logger: config.nodeEnv !== 'test',
  });

  const allowedOrigins = buildAllowedOrigins(config);
  const corsOriginHandler = (
    origin: string | undefined,
    cb: (err: Error | null, allow: boolean) => void,
  ): void => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (allowedOrigins.has(origin)) {
      cb(null, true);
      return;
    }
    cb(null, config.nodeEnv === 'development');
  };

  await fastify.register(fastifyCors, {
    origin: corsOriginHandler,
    credentials: true,
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
    },
  });

  await fastify.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
    immutable: true,
    maxAge: '365d',
  });

  registerHealthRoutes(fastify, dbConnection.db);
  registerThemeRoutes(fastify, dbConnection.db, config);
  registerResultRoutes(fastify, dbConnection.db);

  if (fs.existsSync(config.webDistDir)) {
    await fastify.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: '/',
      decorateReply: true,
      wildcard: false,
    });

    fastify.setNotFoundHandler((request, reply) => {
      const urlPath = request.url.split('?')[0] ?? '';
      if (
        request.method === 'GET' &&
        !urlPath.startsWith('/api/') &&
        !urlPath.startsWith('/uploads/') &&
        !urlPath.startsWith('/socket.io/')
      ) {
        const indexPath = path.join(config.webDistDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          return reply.type('text/html').send(fs.readFileSync(indexPath));
        }
      }
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  }

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
    cors: {
      origin: corsOriginHandler,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const roomManager = new RoomManager(io, dbConnection.db);
  roomManager.startCleanupLoop();
  registerSocketHandlers(io, roomManager);

  const close = async (): Promise<void> => {
    closed = true;
    roomManager.dispose();
    await io.close();
    await fastify.close();
    dbConnection.sqlite.close();
  };

  return { fastify, io, roomManager, dbConnection, close };
}
