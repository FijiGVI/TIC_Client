const DEFAULT_TIC_API_URL = 'https://act-api-staging.globalvisionsinc.com.ph/api/v2/tic';
const environmentApiUrl = process.env.NEXT_PUBLIC_TIC_API_URL?.trim()
  || process.env.NEXT_PUBLIC_API_URL?.trim();
const configuredApiUrl = environmentApiUrl && /^https?:\/\//i.test(environmentApiUrl)
  ? environmentApiUrl
  : DEFAULT_TIC_API_URL;

const ticApiUrl = new URL(configuredApiUrl);
if (!['http:', 'https:'].includes(ticApiUrl.protocol) || !ticApiUrl.pathname.replace(/\/$/, '').endsWith('/api/v2/tic')) {
  throw new Error('The TIC API URL must be an HTTP(S) URL ending with /api/v2/tic');
}

ticApiUrl.pathname = ticApiUrl.pathname.replace(/\/$/, '');
const apiRootUrl = new URL(ticApiUrl);
apiRootUrl.pathname = apiRootUrl.pathname.slice(0, -'/tic'.length);

const ACCESS_TOKEN_KEY = 'tic.accessToken';
const REFRESH_TOKEN_KEY = 'tic.refreshToken';
// Test
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

type ApiScope = 'tic' | 'root';
type ApiErrorBody = { error?: string; message?: string; errors?: Array<{ msg?: string }> };

function apiUrl(scope: ApiScope, path: string): URL {
  const baseUrl = scope === 'tic' ? ticApiUrl : apiRootUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(`${baseUrl.pathname}${normalizedPath}`, baseUrl.origin);
}

export function setTokens(tokens: { accessToken: string; refreshToken?: string | null } | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;

  if (typeof window === 'undefined') return;
  if (accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function restoreTokens(): void {
  if (typeof window === 'undefined') return;
  accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY));
}

export async function logoutSession(): Promise<void> {
  try {
    await request('root', '/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, false);
  } finally {
    setTokens(null);
  }
}

function getErrorMessage(body: ApiErrorBody): string {
  return body.error || body.message || body.errors?.[0]?.msg || 'Request failed';
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshToken) throw new Error('No refresh token is available');
  const response = await fetch(apiUrl('root', '/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error('Your session has expired');
  setTokens(await response.json() as { accessToken: string; refreshToken: string });
}

async function request<T>(scope: ApiScope, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(apiUrl(scope, path), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
    try {
      refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null; });
      await refreshPromise;
      return request<T>(scope, path, init, false);
    } catch {
      setTokens(null);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new Error(getErrorMessage(body));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function createApi(scope: ApiScope) {
  return {
    get: <T>(path: string) => request<T>(scope, path),
    post: <T>(path: string, body?: unknown) => request<T>(scope, path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) => request<T>(scope, path, { method: 'PUT', body: JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) => request<T>(scope, path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: <T = void>(path: string) => request<T>(scope, path, { method: 'DELETE' }),
  };
}

/** TIC bounded-context endpoints under /api/v2/tic. */
export const api = createApi('tic');

/** Shared ACT endpoints such as authentication under /api/v2. */
export const actApi = createApi('root');
