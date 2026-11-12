'use client';

import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeMicrosoftSignIn, consumeMicrosoftReturnTo } from '@/features/auth/microsoftSso';

export default function MicrosoftSsoCallbackPage() {
  const router = useRouter();
  const { loginWithMicrosoft } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const destination = consumeMicrosoftReturnTo();
        const microsoftSession = await completeMicrosoftSignIn();
        await loginWithMicrosoft(microsoftSession.idToken);
        router.replace(destination);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Microsoft sign-in could not be completed.');
      }
    })();
  }, [loginWithMicrosoft, router]);

  return <main className="auth-page sso-callback-page"><section className="auth-panel"><div className="auth-card sso-callback-card" role="status" aria-live="polite">{error ? <><IconAlertCircle size={38} aria-hidden="true" /><p className="eyebrow">Sign-in unsuccessful</p><h2>We could not verify your Microsoft account</h2><div className="alert" role="alert">{error}</div><button className="primary" type="button" onClick={() => router.replace('/login')}>Return to sign in</button></> : <><IconLoader2 className="sso-spinner" size={38} aria-hidden="true" /><p className="eyebrow">Secure sign-in</p><h2>Completing Microsoft sign-in</h2><p>Please wait while TIC verifies your account.</p></>}</div></section></main>;
}
