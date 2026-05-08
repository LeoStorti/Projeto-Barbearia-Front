const TOKEN_STORAGE_KEY = 'auth_token';
const TOKEN_COOKIE_KEY = 'auth_token';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const encodedName = encodeURIComponent(name) + '=';
  const cookies = document.cookie ? document.cookie.split(';') : [];

  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(encodedName)) {
      return decodeURIComponent(cookie.slice(encodedName.length));
    }
  }

  return null;
}

export function getAuthToken(): string | null {
  if (!isBrowser()) return null;

  // Migração planejada: prioriza cookie; mantém fallback para localStorage enquanto o backend não finaliza a transição.
  const cookieToken = readCookie(TOKEN_COOKIE_KEY);
  if (cookieToken) return cookieToken;

  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
