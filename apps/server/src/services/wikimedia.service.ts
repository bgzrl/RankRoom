import type { ImageSearchResultDto, ImageSearchSource } from '@rankroom/shared';

export const WIKIMEDIA_USER_AGENT =
  'RankRoom/1.0 (https://github.com/rankroom/rankroom; admin@rankroom.local)';
const SEARCH_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESULTS = 12;

const ALLOWED_COMMONS_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const FORBIDDEN_EXTENSIONS_REGEX =
  /\.(svg|pdf|ogg|ogv|oga|webm|djvu|tiff?|xcf|mid|midi|flac|mp3|wav)(\?|$|#)/i;

const FORBIDDEN_TECHNICAL_PATTERNS = [
  'commons-logo',
  'wikimedia-logo',
  'wikipedia-logo',
  'wikidata-logo',
  'wiktionary-logo',
  'wikibooks-logo',
  'wikinews-logo',
  'wikiquote-logo',
  'wikisource-logo',
  'wikiversity-logo',
  'wikivoyage-logo',
  'crystal_clear',
  'ambox_',
  'question_book',
  'padlock-',
  'edit-clear',
  'disambig_',
  'nuvola_apps',
  'red_pog',
  'blue_pog',
  'folder_hexagonal',
  'sound-icon',
  'speaker_icon',
  'loudspeaker',
  'flag_of_',
  'stub_icon',
  'portal-puzzle',
  'semi-protection',
  'increase2',
  'decrease2',
  'steady2',
];

export class WikimediaRateLimitError extends Error {
  constructor() {
    super(
      'Wikimedia limite temporairement les requêtes de recherche. Réessayez dans quelques secondes.',
    );
    this.name = 'WikimediaRateLimitError';
  }
}

function isUsableRasterImage(url: string, title = ''): boolean {
  if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
    return false;
  }

  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (FORBIDDEN_EXTENSIONS_REGEX.test(lowerUrl) || FORBIDDEN_EXTENSIONS_REGEX.test(lowerTitle)) {
    return false;
  }

  // Wikimedia thumbnails for SVG files look like .../Foo.svg/480px-Foo.svg.png
  if (lowerUrl.includes('.svg/') || lowerTitle.endsWith('.svg')) {
    return false;
  }

  for (const pattern of FORBIDDEN_TECHNICAL_PATTERNS) {
    if (lowerUrl.includes(pattern) || lowerTitle.includes(pattern)) {
      return false;
    }
  }

  return true;
}

function cleanCommonsFileTitle(rawTitle: string): string {
  return rawTitle
    .replace(/^(File|Fichier):/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function getDedupeKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname.split('/').pop()?.toLowerCase() ?? parsed.pathname.toLowerCase();
  } catch {
    return (rawUrl.split('?')[0] ?? rawUrl).split('/').pop()?.toLowerCase() ?? rawUrl.toLowerCase();
  }
}

interface WikipediaPageEntry {
  pageid?: number;
  title?: string;
  index?: number;
  thumbnail?: {
    source?: string;
    width?: number;
    height?: number;
  };
  original?: {
    source?: string;
    width?: number;
    height?: number;
  };
}

interface WikipediaPageImageResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Record<string, WikipediaPageEntry>;
  };
}

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid?: number;
        title?: string;
        index?: number;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          mime?: string;
          size?: number;
          width?: number;
          height?: number;
        }>;
      }
    >;
  };
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function extractWikipediaResult(
  page: WikipediaPageEntry,
  source: Extract<ImageSearchSource, 'wikipedia-fr' | 'wikipedia-en'>,
  fallbackTitle: string,
): ImageSearchResultDto | null {
  const title = page.title?.trim() ?? '';
  const thumbUrl = page.thumbnail?.source?.trim() ?? '';
  const originalUrl = page.original?.source?.trim() ?? '';
  const origWidth = page.original?.width ?? 0;
  const origHeight = page.original?.height ?? 0;

  if (!thumbUrl || !isUsableRasterImage(thumbUrl, title)) {
    return null;
  }

  const canUseOriginal =
    originalUrl.length > 0 &&
    isUsableRasterImage(originalUrl, title) &&
    origWidth > 0 &&
    origHeight > 0 &&
    origWidth <= 2400 &&
    origHeight <= 2400;

  return {
    title: title || fallbackTitle,
    previewUrl: thumbUrl,
    fullUrl: canUseOriginal ? originalUrl : thumbUrl,
    source,
  };
}

async function queryWikipediaImages(
  host: 'fr.wikipedia.org' | 'en.wikipedia.org',
  source: Extract<ImageSearchSource, 'wikipedia-fr' | 'wikipedia-en'>,
  query: string,
  limit: number,
  fetchImpl: FetchLike,
): Promise<{ results: ImageSearchResultDto[]; rateLimited: boolean }> {
  const endpoint = new URL(`https://${host}/w/api.php`);
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrsearch', query);
  endpoint.searchParams.set('gsrlimit', String(limit));
  endpoint.searchParams.set('prop', 'pageimages');
  endpoint.searchParams.set('piprop', 'thumbnail|original');
  endpoint.searchParams.set('pithumbsize', '640');
  endpoint.searchParams.set('pilicense', 'any');
  endpoint.searchParams.set('format', 'json');

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (response.status === 429) {
    return { results: [], rateLimited: true };
  }
  if (!response.ok) {
    return { results: [], rateLimited: false };
  }

  const data = (await response.json()) as WikipediaPageImageResponse;
  const pages = Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999),
  );

  const results: ImageSearchResultDto[] = [];
  for (const page of pages) {
    const parsed = extractWikipediaResult(page, source, query);
    if (parsed) {
      results.push(parsed);
    }
  }

  return { results, rateLimited: false };
}

async function queryCommonsImages(
  query: string,
  limit: number,
  fetchImpl: FetchLike,
): Promise<{ results: ImageSearchResultDto[]; rateLimited: boolean }> {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrnamespace', '6');
  endpoint.searchParams.set('gsrsearch', query);
  endpoint.searchParams.set('gsrlimit', String(limit));
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url|mime|size');
  endpoint.searchParams.set('iiurlwidth', '640');
  endpoint.searchParams.set('format', 'json');

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (response.status === 429) {
    return { results: [], rateLimited: true };
  }
  if (!response.ok) {
    return { results: [], rateLimited: false };
  }

  const data = (await response.json()) as CommonsImageInfoResponse;
  const pages = Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999),
  );

  const results: ImageSearchResultDto[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;

    const mime = info.mime?.toLowerCase() ?? '';
    if (!ALLOWED_COMMONS_MIMES.has(mime)) {
      continue;
    }

    const rawTitle = page.title ?? '';
    const originalUrl = info.url?.trim() ?? '';
    const thumbUrl = info.thumburl?.trim() ?? originalUrl;

    if (!thumbUrl || !isUsableRasterImage(thumbUrl, rawTitle)) {
      continue;
    }

    const canUseOriginal =
      originalUrl.length > 0 &&
      isUsableRasterImage(originalUrl, rawTitle) &&
      (info.size === undefined || info.size <= 4 * 1024 * 1024);

    results.push({
      title: cleanCommonsFileTitle(rawTitle) || query,
      previewUrl: thumbUrl,
      fullUrl: canUseOriginal ? originalUrl : thumbUrl,
      source: 'wikimedia-commons',
    });
  }

  return { results, rateLimited: false };
}

export async function fetchWikipediaImagesBatch(
  titles: readonly string[],
  host: 'en.wikipedia.org' | 'fr.wikipedia.org' = 'en.wikipedia.org',
  fetchImpl: FetchLike = fetch,
): Promise<Map<string, ImageSearchResultDto>> {
  const resultByTitle = new Map<string, ImageSearchResultDto>();
  if (titles.length === 0) return resultByTitle;

  const endpoint = new URL(`https://${host}/w/api.php`);
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('titles', titles.join('|'));
  endpoint.searchParams.set('redirects', '1');
  endpoint.searchParams.set('prop', 'pageimages');
  endpoint.searchParams.set('piprop', 'thumbnail|original');
  endpoint.searchParams.set('pithumbsize', '640');
  endpoint.searchParams.set('pilicense', 'any');
  endpoint.searchParams.set('format', 'json');

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!response.ok) return resultByTitle;
    const data = (await response.json()) as WikipediaPageImageResponse;

    const normalizedMap = new Map<string, string>();
    for (const entry of data.query?.normalized ?? []) {
      normalizedMap.set(entry.from, entry.to);
    }

    const redirectMap = new Map<string, string>();
    for (const entry of data.query?.redirects ?? []) {
      redirectMap.set(entry.from, entry.to);
    }

    const imageByPageTitle = new Map<string, ImageSearchResultDto>();
    const source: Extract<ImageSearchSource, 'wikipedia-fr' | 'wikipedia-en'> =
      host === 'fr.wikipedia.org' ? 'wikipedia-fr' : 'wikipedia-en';

    for (const page of Object.values(data.query?.pages ?? {})) {
      const parsed = extractWikipediaResult(page, source, page.title ?? '');
      if (parsed && page.title) {
        imageByPageTitle.set(page.title, parsed);
      }
    }

    for (const requestedTitle of titles) {
      const afterNorm = normalizedMap.get(requestedTitle) ?? requestedTitle;
      const afterRedirect = redirectMap.get(afterNorm) ?? afterNorm;
      const match = imageByPageTitle.get(afterRedirect);
      if (match) {
        resultByTitle.set(requestedTitle, match);
      }
    }
  } catch {
    // Offline or network error -> return partial/empty map cleanly
  }

  return resultByTitle;
}

export async function searchWikimediaImages(
  rawQuery: string,
  maxResults = DEFAULT_MAX_RESULTS,
  fetchImpl: FetchLike = fetch,
): Promise<ImageSearchResultDto[]> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return [];
  }

  const settled = await Promise.allSettled([
    queryWikipediaImages('fr.wikipedia.org', 'wikipedia-fr', query, 6, fetchImpl),
    queryWikipediaImages('en.wikipedia.org', 'wikipedia-en', query, 6, fetchImpl),
    queryCommonsImages(query, 8, fetchImpl),
  ]);

  const combined: ImageSearchResultDto[] = [];
  let anyRateLimited = false;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      if (outcome.value.rateLimited) {
        anyRateLimited = true;
      }
      combined.push(...outcome.value.results);
    }
  }

  if (combined.length === 0 && anyRateLimited) {
    throw new WikimediaRateLimitError();
  }

  const deduped: ImageSearchResultDto[] = [];
  const seenKeys = new Set<string>();

  for (const item of combined) {
    const key = getDedupeKey(item.fullUrl);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    deduped.push(item);
    if (deduped.length >= maxResults) {
      break;
    }
  }

  return deduped;
}
