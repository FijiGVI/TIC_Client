const STORAGE_KEY = 'tic.microsoft.pending-registration';

export type PendingMicrosoftRegistration = {
  provider: 'microsoft' | 'act';
  idToken?: string;
  email: string;
  name: string;
};

export function savePendingMicrosoftRegistration(value: PendingMicrosoftRegistration): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function getPendingMicrosoftRegistration(): PendingMicrosoftRegistration | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingMicrosoftRegistration>;
    if (!value.email || !['microsoft', 'act'].includes(value.provider || '')) return null;
    if (value.provider === 'microsoft' && !value.idToken) return null;
    return { provider: value.provider as 'microsoft' | 'act', idToken: value.idToken, email: value.email, name: value.name || '' };
  } catch {
    return null;
  }
}

export function clearPendingMicrosoftRegistration(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
