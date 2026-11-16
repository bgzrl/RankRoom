import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import { getGameResultById } from '../services/result.service.js';

const ResultIdSchema = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Identifiant de résultat invalide.');

export function registerResultRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  fastify.get('/api/results/:id', async (request, reply) => {
    const parsed = ResultIdSchema.safeParse((request.params as { id?: unknown }).id);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Identifiant de résultat invalide.',
      });
    }

    const result = getGameResultById(db, parsed.data);
    if (!result) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Résultat de partie introuvable.',
      });
    }

    return reply.code(200).send({ result });
  });
}
