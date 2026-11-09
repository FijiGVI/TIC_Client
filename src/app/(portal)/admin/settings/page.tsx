'use client';

import { IconClock, IconDeviceFloppy } from '@tabler/icons-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [minutes, setMinutes] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api.get<{ data: { sessionIdleTimeoutMinutes: number } }>('/settings')
      .then((response) => setMinutes(response.data.sessionIdleTimeoutMinutes))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put('/settings', { sessionIdleTimeoutMinutes: minutes });
      setMessage('Session settings were saved. They apply when each user next loads or refreshes the portal.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <header className="page-header"><div><p className="eyebrow">Administration</p><h1>System settings</h1><p>Configure secure behavior that applies across the ticketing portal.</p></div></header>
    {error && <div className="alert" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <section className="surface settings-card" aria-busy={loading}>
      <div className="settings-heading"><span><IconClock size={22} /></span><div><h2>Automatic logout</h2><p>Inactive users are logged out to protect company and request information.</p></div></div>
      <form onSubmit={save}>
        <label>Idle timeout in minutes<input type="number" min={5} max={480} step={1} required disabled={loading} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /><small>Allowed range: 5 minutes to 8 hours.</small></label>
        <button className="primary" disabled={loading || saving}><IconDeviceFloppy size={17} />{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </section>
  </>;
}
