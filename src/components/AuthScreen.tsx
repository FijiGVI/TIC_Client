'use client';

import { IconArrowRight, IconBrandWindows, IconEye, IconEyeOff, IconIdBadge2, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { startMicrosoftSignIn } from '@/features/auth/microsoftSso';
import { takeSessionMessage } from '@/lib/api';

type SignInMethod = 'credentials' | 'microsoft';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('credentials');

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, router, user]);

  useEffect(() => {
    const sessionMessage = takeSessionMessage();
    // The message is produced by the browser-only session-expiry event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionMessage) setError(sessionMessage);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login(identifier, password);
      router.replace(result === 'registration_required' ? '/register' : '/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const microsoft = async () => {
    setSubmitting(true);
    setError('');
    try {
      await startMicrosoftSignIn('/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Microsoft sign-in failed');
      setSubmitting(false);
    }
  };

  const selectSignInMethod = (method: SignInMethod) => {
    setSignInMethod(method);
    setError('');
  };

  const navigateSignInMethods = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const method = signInMethod === 'credentials' ? 'microsoft' : 'credentials';
    selectSignInMethod(method);
    document.getElementById(`${method === 'credentials' ? 'credential' : 'microsoft'}-sign-in-tab`)?.focus();
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand light"><span>G</span><div><strong>GVI Ticketing System</strong><small>Employee Services</small></div></div>
        <div><p className="eyebrow">One place for every request</p><h1>Work requests,<br />without the friction.</h1><p>Submit, track, and collaborate on employee services through a secure, transparent workflow.</p></div>
        <div className="trust"><IconShieldCheck size={22} /><span>Enterprise-grade identity and role-based access</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card auth-method-card">
          <p className="eyebrow">Welcome</p>
          <h2>{mode === 'register' ? 'Your account is centrally managed' : 'Sign in to your account'}</h2>
          <p>Choose how you access your requests and approvals.</p>
          <div className="auth-method-tabs" role="tablist" aria-label="Sign-in method">
            <button type="button" role="tab" tabIndex={signInMethod === 'credentials' ? 0 : -1} aria-selected={signInMethod === 'credentials'} aria-controls="credential-sign-in" id="credential-sign-in-tab" className={signInMethod === 'credentials' ? 'active' : ''} onKeyDown={navigateSignInMethods} onClick={() => selectSignInMethod('credentials')}><IconIdBadge2 size={19}/><span><strong>TIC or ACT</strong><small>Company credentials</small></span></button>
            <button type="button" role="tab" tabIndex={signInMethod === 'microsoft' ? 0 : -1} aria-selected={signInMethod === 'microsoft'} aria-controls="microsoft-sign-in" id="microsoft-sign-in-tab" className={signInMethod === 'microsoft' ? 'active' : ''} onKeyDown={navigateSignInMethods} onClick={() => selectSignInMethod('microsoft')}><IconBrandWindows size={18}/><span><strong>Microsoft</strong><small>Work account</small></span></button>
          </div>
          {error && <div className="alert" role="alert">{error}</div>}
          {signInMethod === 'credentials' ? (
            <form key="credentials" id="credential-sign-in" className="auth-method-panel" role="tabpanel" aria-labelledby="credential-sign-in-tab" onSubmit={submit}>
              <div className="auth-method-intro"><strong>Sign in with TIC or ACT</strong><small>Your email will be securely matched with the correct account.</small></div>
              <label>Email address<input required type="email" autoComplete="username" inputMode="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
              <label>Password<span className="password-input"><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <IconEyeOff size={19} /> : <IconEye size={19} />}</button></span></label>
              <Link className="forgot-link" href="/forgot-password">Forgot password?</Link>
              <button className="primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in securely'}<IconArrowRight size={18} /></button>
              <p className="auth-method-help">Use the same form for a local TIC account or your existing ACT credentials.</p>
            </form>
          ) : (
            <section key="microsoft" id="microsoft-sign-in" className="auth-method-panel microsoft-method-panel" role="tabpanel" aria-labelledby="microsoft-sign-in-tab">
              <span className="microsoft-method-icon" aria-hidden="true"><IconBrandWindows size={30}/></span>
              <div><h3>Continue with Microsoft</h3><p>Use your verified company Microsoft account. You may be asked to complete your TIC profile on first sign-in.</p></div>
              <button className="primary microsoft-sign-in-button" type="button" disabled={submitting} onClick={() => void microsoft()}>{submitting ? 'Opening Microsoft…' : 'Continue with Microsoft'}<IconArrowRight size={18}/></button>
              <small className="auth-security-note"><IconShieldCheck size={15}/>Authentication is completed securely by Microsoft.</small>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
