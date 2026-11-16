import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/index.js';

export function registerHealthRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  fastify.get('/api/health', async (_request, reply) => {
    try {
      db.get(sql`SELECT 1`);
      return reply.code(200).send({
        status: 'ok',
        db: 'connected',
        uptimeSec: Math.floor(process.uptime()),
      });
    } catch {
      return reply.code(503).send({
        status: 'error',
        db: 'disconnected',
      });
    }
  });
}
