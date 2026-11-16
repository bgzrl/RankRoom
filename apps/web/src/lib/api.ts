import type {
  ImageSearchResultDto,
  PersistedGameResult,
  ThemeDetailDto,
  ThemeSummaryDto,
} from '@rankroom/shared';
import {
  clearAdminPassword,
  getStoredAdminPassword,
} from './session';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ThemeMutationPayload {
  title: string;
  description: string;
  category: string;
  items: Array<{
    id?: string;
    name: string;
    description: string;
    imagePath: string;
  }>;
}

async function requestJson<T>(
  url: string,
  options: RequestInit & { requireAdminHeader?: boolean } = {},
): Promise<T> {
  const { requireAdminHeader, headers: extraHeaders, ...rest } = options;
  const headers = new Headers(extraHeaders);

  if (requireAdminHeader) {
    const adminPassword = getStoredAdminPassword();
    if (adminPassword) {
      headers.set('X-Admin-Password', adminPassword);
    }
  }

  const response = await fetch(url, {
    ...rest,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    if (response.status === 401 && requireAdminHeader) {
      clearAdminPassword();
    }
    const code = typeof body?.error === 'string' ? body.error : `HTTP_${response.status}`;
    const message =
      typeof body?.message === 'string'
        ? body.message
        : `Erreur serveur (${response.status}).`;
    throw new ApiError(response.status, code, message);
  }

  return body as T;
}

export async function fetchAdminStatus(): Promise<{ adminRequired: boolean }> {
  return requestJson<{ adminRequired: boolean }>('/api/auth/admin-status');
}

export async function verifyAdminPassword(password: string): Promise<{ valid: boolean }> {
  return requestJson<{ valid: boolean }>('/api/auth/verify-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function fetchThemes(filters?: {
  category?: string;
  q?: string;
}): Promise<ThemeSummaryDto[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.q) params.set('q', filters.q);
  const qs = params.toString();
  const data = await requestJson<{ themes: ThemeSummaryDto[] }>(
    qs ? `/api/themes?${qs}` : '/api/themes',
  );
  return data.themes;
}

export async function fetchThemeDetail(themeId: string): Promise<ThemeDetailDto> {
  const data = await requestJson<{ theme: ThemeDetailDto }>(`/api/themes/${themeId}`);
  return data.theme;
}

export async function createTheme(payload: ThemeMutationPayload): Promise<ThemeDetailDto> {
  const data = await requestJson<{ theme: ThemeDetailDto }>('/api/themes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    requireAdminHeader: true,
  });
  return data.theme;
}

export async function updateTheme(
  themeId: string,
  payload: ThemeMutationPayload,
): Promise<ThemeDetailDto> {
  const data = await requestJson<{ theme: ThemeDetailDto }>(`/api/themes/${themeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    requireAdminHeader: true,
  });
  return data.theme;
}

export async function deleteTheme(themeId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/themes/${themeId}`, {
    method: 'DELETE',
    requireAdminHeader: true,
  });
}

export async function importThemeJson(jsonPayload: unknown): Promise<ThemeDetailDto> {
  const data = await requestJson<{ theme: ThemeDetailDto }>('/api/themes/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonPayload),
    requireAdminHeader: true,
  });
  return data.theme;
}

export async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const data = await requestJson<{ imagePath: string }>('/api/uploads/image', {
    method: 'POST',
    body: formData,
    requireAdminHeader: true,
  });
  return data.imagePath;
}

export async function uploadImageFromUrl(url: string): Promise<string> {
  const data = await requestJson<{ imagePath: string }>('/api/uploads/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    requireAdminHeader: true,
  });
  return data.imagePath;
}

export async function searchImages(query: string): Promise<ImageSearchResultDto[]> {
  const params = new URLSearchParams({ q: query });
  const data = await requestJson<{ results: ImageSearchResultDto[] }>(
    `/api/uploads/search-images?${params.toString()}`,
    {
      method: 'GET',
      requireAdminHeader: true,
    },
  );
  return data.results;
}

export async function fetchGameResult(resultId: string): Promise<PersistedGameResult> {
  const data = await requestJson<{ result: PersistedGameResult }>(`/api/results/${resultId}`);
  return data.result;
}
