const PLAYER_TOKEN_KEY = 'rankroom:playerToken';
const DISPLAY_NAME_KEY = 'rankroom:displayName';
const ADMIN_PASSWORD_KEY = 'rankroom:adminPassword';
const THEME_MODE_KEY = 'rankroom:theme';

export type ColorMode = 'light' | 'dark';

function generateFallbackUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreatePlayerToken(): string {
  try {
    const existing = window.sessionStorage.getItem(PLAYER_TOKEN_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      return existing;
    }
    const created = generateFallbackUuid();
    window.sessionStorage.setItem(PLAYER_TOKEN_KEY, created);
    return created;
  } catch {
    return generateFallbackUuid();
  }
}

export function getSavedDisplayName(): string {
  try {
    return window.sessionStorage.getItem(DISPLAY_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDisplayName(name: string): void {
  try {
    window.sessionStorage.setItem(DISPLAY_NAME_KEY, name.trim());
  } catch {
    // Ignore storage quota errors
  }
}

export function getStoredAdminPassword(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_PASSWORD_KEY);
  } catch {
    return null;
  }
}

export function saveAdminPassword(password: string): void {
  try {
    window.sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
  } catch {
    // Ignore storage errors
  }
}

export function clearAdminPassword(): void {
  try {
    window.sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getInitialColorMode(): ColorMode {
  try {
    const stored = window.localStorage.getItem(THEME_MODE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

export function applyColorMode(mode: ColorMode): void {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    window.localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}
