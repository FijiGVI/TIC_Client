'use client';

import { IconArrowRight, IconBrandWindows, IconEye, IconEyeOff, IconShieldCheck } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { startMicrosoftSignIn } from '@/features/auth/microsoftSso';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, router, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(identifier, password);
      router.replace('/dashboard');
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

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand light"><span>G</span><div><strong>GVI Ticketing System</strong><small>Employee Services</small></div></div>
        <div><p className="eyebrow">One place for every request</p><h1>Work requests,<br />without the friction.</h1><p>Submit, track, and collaborate on employee services through a secure, transparent workflow.</p></div>
        <div className="trust"><IconShieldCheck size={22} /><span>Enterprise-grade identity and role-based access</span></div>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <p className="eyebrow">Welcome</p>
          <h2>{mode === 'register' ? 'Your account is centrally managed' : 'Login to your account'}</h2>
          <p>Access your requests and approvals.</p>
          {error && <div className="alert" role="alert">{error}</div>}
          <label>Email<input required type="email" autoComplete="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
          <label>Password<span className="password-input"><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <IconEyeOff size={19} /> : <IconEye size={19} />}</button></span></label>
          <Link className="forgot-link" href="/forgot-password">Forgot password?</Link>
          <button className="primary" disabled={submitting}>{submitting ? 'Please wait…' : 'Login'}<IconArrowRight size={18} /></button>
          <div className="divider"><span>or</span></div>
          <button className="secondary" type="button" disabled={submitting} onClick={() => void microsoft()}><IconBrandWindows size={19} />Continue with Microsoft</button>
          <p className="auth-switch">Use your company credentials or Microsoft account.</p>
        </form>
      </section>
    </main>
  );
}
