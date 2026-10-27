import { PublicClientApplication, type AuthenticationResult, type RedirectRequest } from '@azure/msal-browser';

const clientId = (process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '').trim();
const tenantId = (process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || '').trim();
const returnToStorageKey = 'tic.microsoft.returnTo';

let initializationPromise: Promise<PublicClientApplication> | null = null;
let signInPromise: Promise<void> | null = null;
let completionPromise: Promise<AuthenticationResult> | null = null;

export const isMicrosoftSsoConfigured = Boolean(clientId && tenantId);

function requireBrowser(): void {
  if (typeof window === 'undefined') throw new Error('Microsoft sign-in must be started in a browser.');
}

function isSafeLocalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

function getRedirectUri(): string {
  requireBrowser();
  return `${window.location.origin}/sso/callback`;
}

async function getMicrosoftClient(): Promise<PublicClientApplication> {
  requireBrowser();
  if (!isMicrosoftSsoConfigured) throw new Error('Microsoft sign-in is not configured for this environment.');

  if (!initializationPromise) {
    const redirectUri = getRedirectUri();
    const instance = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
        postLogoutRedirectUri: `${window.location.origin}/login`,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    initializationPromise = instance.initialize().then(() => instance).catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

function getLoginRequest(): RedirectRequest {
  return { scopes: ['openid', 'profile', 'email'], redirectUri: getRedirectUri() };
}

export function startMicrosoftSignIn(returnTo = '/dashboard'): Promise<void> {
  requireBrowser();
  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    if (isSafeLocalPath(returnTo)) sessionStorage.setItem(returnToStorageKey, returnTo);
    else sessionStorage.removeItem(returnToStorageKey);
    const client = await getMicrosoftClient();
    try {
      await client.loginRedirect(getLoginRequest());
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'errorCode' in error ? String(error.errorCode) : '';
      if (errorCode !== 'interaction_in_progress') throw error;
      await client.clearCache();
      await client.loginRedirect(getLoginRequest());
    }
  })().catch((error) => {
    signInPromise = null;
    throw error;
  });
  return signInPromise;
}

export function consumeMicrosoftReturnTo(): string {
  requireBrowser();
  const returnTo = sessionStorage.getItem(returnToStorageKey);
  sessionStorage.removeItem(returnToStorageKey);
  return returnTo && isSafeLocalPath(returnTo) ? returnTo : '/dashboard';
}

export function completeMicrosoftSignIn(): Promise<AuthenticationResult> {
  requireBrowser();
  if (completionPromise) return completionPromise;
  completionPromise = (async () => {
    const client = await getMicrosoftClient();
    const result = await client.handleRedirectPromise({ navigateToLoginRequestUrl: false });
    if (!result?.idToken) throw new Error('Microsoft did not return a valid sign-in response.');
    return result;
  })().catch((error) => {
    completionPromise = null;
    throw error;
  });
  return completionPromise;
}
