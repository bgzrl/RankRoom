import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { RankedItemResult } from '@rankroom/shared';
import sharp, { type Metadata } from 'sharp';
import type { AppDatabase } from '../db/index.js';
import { gameResults, themeItems } from '../db/schema.js';

const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);
const SAFE_UPLOAD_FILENAME_REGEX = /^[a-f0-9-]+\.webp$/i;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

export class ImageProcessingError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ImageProcessingError';
    this.statusCode = statusCode;
  }
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // Multicast & reserved

  return false;
}

function isPrivateOrReservedIpv6(rawIp: string): boolean {
  const withoutZone = rawIp.split('%')[0]?.toLowerCase() ?? '';
  if (!withoutZone) return true;

  if (withoutZone === '::' || withoutZone === '::1') return true;

  // IPv4-mapped IPv6 addresses: ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (withoutZone.startsWith('::ffff:')) {
    const suffix = withoutZone.slice('::ffff:'.length);
    if (net.isIPv4(suffix)) {
      return isPrivateOrReservedIpv4(suffix);
    }
    const hexWords = suffix.split(':');
    if (hexWords.length === 2) {
      const high = Number.parseInt(hexWords[0] ?? '', 16);
      const low = Number.parseInt(hexWords[1] ?? '', 16);
      if (Number.isInteger(high) && Number.isInteger(low)) {
        const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isPrivateOrReservedIpv4(ipv4);
      }
    }
    return true;
  }

  // Expand first hextet to test fc00::/7 (ULA) and fe80::/10 (link-local) and ff00::/8 (multicast)
  const firstSegment = withoutZone.split(':')[0] ?? '';
  if (firstSegment.length > 0) {
    const firstWord = Number.parseInt(firstSegment, 16);
    if (!Number.isNaN(firstWord)) {
      if ((firstWord & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
      if ((firstWord & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
      if ((firstWord & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    }
  }

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (ipVersion === 6) {
    return isPrivateOrReservedIpv6(ip);
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ImageProcessingError("URL d'image invalide.");
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ImageProcessingError('Seules les URLs http:// et https:// sont autorisées.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new ImageProcessingError("Hôte local ou interne interdit pour l'import d'image.");
  }

  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new ImageProcessingError('Adresse IP privée ou réservée interdite.');
    }
    return parsed;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    throw new ImageProcessingError("Impossible de résoudre le nom de domaine de l'image.");
  }

  if (resolved.length === 0) {
    throw new ImageProcessingError("Aucune adresse IP résolue pour l'URL fournie.");
  }

  for (const entry of resolved) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new ImageProcessingError('Adresse IP résolue privée ou réservée interdite.');
    }
  }

  return parsed;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ImageProcessingError(
        `L'image dépasse la taille maximale autorisée (${Math.round(maxBytes / (1024 * 1024))} Mo).`,
        413,
      );
    }
  }

  if (!response.body) {
    throw new ImageProcessingError("Réponse vide lors du téléchargement de l'image.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new ImageProcessingError(
        `L'image dépasse la taille maximale autorisée (${Math.round(maxBytes / (1024 * 1024))} Mo).`,
        413,
      );
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function processAndSaveImage(
  buffer: Buffer,
  uploadsDir: string,
  maxBytes: number,
): Promise<string> {
  if (buffer.byteLength === 0) {
    throw new ImageProcessingError("Le fichier image est vide.");
  }
  if (buffer.byteLength > maxBytes) {
    throw new ImageProcessingError(
      `L'image dépasse la taille maximale autorisée (${Math.round(maxBytes / (1024 * 1024))} Mo).`,
      413,
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 25_000_000 }).metadata();
  } catch {
    throw new ImageProcessingError('Le fichier fourni n’est pas une image valide.');
  }

  if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw new ImageProcessingError(
      'Format d’image non supporté. Formats acceptés : JPEG, PNG, WebP, GIF, AVIF.',
    );
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  const targetPath = path.join(uploadsDir, filename);

  await sharp(buffer, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toFile(targetPath);

  return `/uploads/${filename}`;
}

export async function downloadAndSaveImageFromUrl(
  rawUrl: string,
  uploadsDir: string,
  maxBytes: number,
): Promise<string> {
  let currentUrl = await assertPublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'RankRoom/1.0 (https://github.com/rankroom/rankroom; admin@rankroom.local)',
        Accept: 'image/*',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) {
        throw new ImageProcessingError("Trop de redirections lors du téléchargement de l'image.");
      }
      const nextUrl = new URL(location, currentUrl);
      currentUrl = await assertPublicHttpUrl(nextUrl.toString());
      continue;
    }

    if (!response.ok) {
      throw new ImageProcessingError(
        `Le serveur distant a renvoyé une erreur HTTP ${response.status}.`,
      );
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType && !contentType.startsWith('image/')) {
      throw new ImageProcessingError("L'URL ne pointe pas vers une ressource image.");
    }

    const buffer = await readResponseWithLimit(response, maxBytes);
    return processAndSaveImage(buffer, uploadsDir, maxBytes);
  }

  throw new ImageProcessingError("Échec du téléchargement de l'image.");
}

export async function deleteOrphanedUploadFiles(
  db: AppDatabase,
  uploadsDir: string,
  candidateImagePaths: readonly string[],
): Promise<void> {
  const uploadCandidates = Array.from(
    new Set(candidateImagePaths.filter((p) => p.startsWith('/uploads/'))),
  );

  if (uploadCandidates.length === 0) {
    return;
  }

  const stillReferenced = new Set<string>();

  const activeItems = db.select({ imagePath: themeItems.imagePath }).from(themeItems).all();
  for (const row of activeItems) {
    if (row.imagePath.startsWith('/uploads/')) {
      stillReferenced.add(row.imagePath);
    }
  }

  const persistedResults = db
    .select({ rankingsJson: gameResults.rankingsJson })
    .from(gameResults)
    .all();

  for (const resultRow of persistedResults) {
    try {
      const rankings = JSON.parse(resultRow.rankingsJson) as RankedItemResult[];
      if (Array.isArray(rankings)) {
        for (const item of rankings) {
          if (typeof item.imagePath === 'string' && item.imagePath.startsWith('/uploads/')) {
            stillReferenced.add(item.imagePath);
          }
        }
      }
    } catch {
      // Ignore malformed historical JSON safely without deleting anything risky
    }
  }

  for (const candidate of uploadCandidates) {
    if (stillReferenced.has(candidate)) {
      continue;
    }
    const filename = path.basename(candidate);
    if (!SAFE_UPLOAD_FILENAME_REGEX.test(filename)) {
      continue;
    }
    const absolutePath = path.join(uploadsDir, filename);
    try {
      await fs.unlink(absolutePath);
    } catch {
      // File may already be absent on disk
    }
  }
}
