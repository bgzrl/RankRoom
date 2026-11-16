import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const SERVER_PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const MONOREPO_ROOT = path.resolve(SERVER_PACKAGE_ROOT, '../..');

dotenv.config({ path: path.join(MONOREPO_ROOT, '.env') });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATA_DIR: z.string().trim().optional(),
  PUBLIC_URL: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined))
    .refine(
      (val) => {
        if (!val) return true;
        try {
          const u = new URL(val);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'PUBLIC_URL doit être une URL http(s) valide.' },
    ),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().min(1).max(25).default(5),
  ADMIN_PASSWORD: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),
});

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  dataDir: string;
  uploadsDir: string;
  dbPath: string;
  webDistDir: string;
  publicUrl: string | undefined;
  maxUploadBytes: number;
  adminPassword: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = EnvSchema.parse(env);

  const dataDir = parsed.DATA_DIR
    ? path.resolve(MONOREPO_ROOT, parsed.DATA_DIR)
    : path.join(MONOREPO_ROOT, 'data');

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    nodeEnv: parsed.NODE_ENV,
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    dbPath: path.join(dataDir, 'rankroom.sqlite'),
    webDistDir: path.resolve(SERVER_PACKAGE_ROOT, '../web/dist'),
    publicUrl: parsed.PUBLIC_URL,
    maxUploadBytes: Math.round(parsed.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
    adminPassword: parsed.ADMIN_PASSWORD,
  };
}

export function verifyAdminPassword(
  candidate: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) {
    return true;
  }
  if (!candidate) {
    return false;
  }
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}
