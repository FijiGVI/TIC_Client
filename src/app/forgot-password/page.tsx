'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { actApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await actApi.post<{ message: string }>('/auth/reset-password', { email });
      setMessage(result.message);
    } catch {
      setMessage('If an account exists with this email, password reset instructions will be sent.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="auth-page auth-simple"><section className="auth-panel"><form className="auth-card" onSubmit={submit}><p className="eyebrow">Account recovery</p><h2>Forgot password</h2><p>Enter your ACT email address. A temporary password will be sent to your inbox.</p>{message && <div className="notice" role="status">{message}</div>}<label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="primary" disabled={saving}>{saving ? 'Sending…' : 'Send temporary password'}</button><p className="auth-switch"><Link href="/login">Back to sign in</Link></p></form></section></main>;
}
