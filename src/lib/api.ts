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
const SESSION_MESSAGE_KEY = 'tic.sessionMessage';
export const SESSION_EXPIRED_EVENT = 'tic:session-expired';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

type ApiScope = 'tic' | 'root';
type ApiErrorBody = { error?: string; message?: string; errors?: Array<{ msg?: string }> };

const defaultStatusMessages: Record<number, string> = {
  400: 'Some of the information provided is invalid. Review the form and try again.',
  401: 'Your login is no longer valid. Please log in again to continue.',
  403: 'You do not have permission to perform this action. Contact an administrator if you need access.',
  404: 'The requested information could not be found. It may have been removed or changed.',
  409: 'This change conflicts with existing information. Refresh the page and try again.',
  422: 'Some fields need your attention. Review the entered information and try again.',
  429: 'Too many attempts were made. Wait a moment, then try again.',
  500: 'The server could not complete the request. Your information was not changed. Please try again later.',
  502: 'The service is temporarily unavailable. Please try again in a few minutes.',
  503: 'The service is temporarily unavailable. Please try again in a few minutes.',
  504: 'The server took too long to respond. Please try again.',
};

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

export function takeSessionMessage(): string {
  if (typeof window === 'undefined') return '';
  const message = sessionStorage.getItem(SESSION_MESSAGE_KEY) || '';
  sessionStorage.removeItem(SESSION_MESSAGE_KEY);
  return message;
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

function getErrorMessage(status: number, body: ApiErrorBody, authenticationAttempt: boolean): string {
  const supplied = body.error || body.message || body.errors?.[0]?.msg;
  const normalized = supplied?.trim().toLowerCase() || '';
  if (authenticationAttempt && status === 401) return 'The email or password is incorrect. Check your details and try again.';
  if (normalized === 'invalid credentials') return 'The email or password is incorrect. Check your details and try again.';
  if (normalized.includes('email service is unavailable')) return 'The email notification service is temporarily unavailable. The main action may still have been completed.';
  if (status >= 500 || /sequelize|sql|relation|column|stack|undefined|internal server error/.test(normalized)) {
    return defaultStatusMessages[status] || defaultStatusMessages[500];
  }
  return supplied || defaultStatusMessages[status] || 'Something went wrong while processing your request. Please try again.';
}

function expireSession(): void {
  setTokens(null);
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_MESSAGE_KEY, defaultStatusMessages[401]);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshToken) throw new Error(defaultStatusMessages[401]);
  let response: Response;
  try {
    response = await fetch(apiUrl('root', '/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    throw new Error('Unable to connect to the server. Check your internet connection and try again.');
  }
  if (!response.ok) throw new Error('Your session has expired');
  setTokens(await response.json() as { accessToken: string; refreshToken: string });
}

async function request<T>(scope: ApiScope, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const hadSession = Boolean(accessToken || refreshToken);
  const authenticationAttempt = path === '/auth/login' || path === '/auth/microsoft';
  let response: Response;
  try {
    response = await fetch(apiUrl(scope, path), {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('Unable to connect to the server. Check your internet connection and try again.');
  }

  if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
    try {
      refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null; });
      await refreshPromise;
      return request<T>(scope, path, init, false);
    } catch {
      expireSession();
      throw new Error(defaultStatusMessages[401]);
    }
  }

  if (response.status === 401 && hadSession && !authenticationAttempt && path !== '/auth/logout') {
    expireSession();
    throw new Error(defaultStatusMessages[401]);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new Error(getErrorMessage(response.status, body, authenticationAttempt));
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
