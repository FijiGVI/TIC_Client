'use client';

import { IconArrowRight, IconBrandWindows, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { startMicrosoftSignIn } from '@/features/auth/microsoftSso';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      router.replace('/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to continue');
    } finally {
      setSubmitting(false);
    }
  };

  const microsoft = async () => {
    setError('');
    setSubmitting(true);
    try {
      await startMicrosoftSignIn('/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Microsoft sign-in failed');
      setSubmitting(false);
    }
  };

  return <main className="auth-page"><section className="auth-story"><div className="brand light"><span>T</span><div><strong>TIC</strong><small>Employee Services</small></div></div><div><p className="eyebrow">One place for every request</p><h1>Work requests,<br />without the friction.</h1><p>Submit, track, and collaborate on employee services through a secure, transparent workflow.</p></div><div className="trust"><IconShieldCheck size={22} /><span>Enterprise-grade identity and role-based access</span></div></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><p className="eyebrow">Welcome to TIC</p><h2>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h2><p>{mode === 'login' ? 'Access your requests and approvals.' : 'Start submitting and tracking requests.'}</p>{error && <div className="alert" role="alert">{error}</div>}{mode === 'register' && <label>Full name<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}<label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Password<input required minLength={mode === 'register' ? 12 : 1} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />{mode === 'register' && <small>12+ characters with uppercase, lowercase, and a number</small>}</label><button className="primary" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<IconArrowRight size={18} /></button><div className="divider"><span>or</span></div><button className="secondary" type="button" disabled={submitting} onClick={() => void microsoft()}><IconBrandWindows size={19} />Continue with Microsoft</button><p className="auth-switch">{mode === 'login' ? <>New to TIC? <Link href="/register">Create an account</Link></> : <>Already registered? <Link href="/login">Sign in</Link></>}</p></form></section></main>;
}
