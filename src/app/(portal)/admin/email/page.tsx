'use client';

import { IconRefresh, IconRotateClockwise } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EmailNotification } from '@/lib/types';

type EmailResponse = { data: EmailNotification[]; summary: { pending: number; sent: number; failed: number } };

export default function EmailDeliveryPage() {
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [summary, setSummary] = useState({ pending: 0, sent: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await api.get<EmailResponse>('/notifications/email'); setNotifications(response.data); setSummary(response.summary); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load email delivery status'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Loading is intentionally initiated when the page is mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const retry = async (id: string) => {
    setRetryingId(id); setError('');
    try { await api.post(`/notifications/email/${id}/retry`, {}); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retry email'); }
    finally { setRetryingId(null); }
  };

  return <><header className="page-header"><div><p className="eyebrow">Administration</p><h1>Email delivery</h1><p>Verify whether TIC notifications were queued, sent, or rejected by the mail service.</p></div><button className="secondary" type="button" disabled={loading} onClick={() => void load()}><IconRefresh size={17} />Refresh</button></header>{error && <div className="alert" role="alert">{error}</div>}<section className="stats"><article><span>Waiting</span><strong>{summary.pending}</strong><small>Queued or processing</small></article><article><span>Sent</span><strong>{summary.sent}</strong><small>Accepted by AIMS</small></article><article><span>Failed</span><strong>{summary.failed}</strong><small>Needs attention</small></article></section><section className="surface email-delivery-surface"><div className="surface-toolbar"><div><h2>Recent notifications</h2><small>Latest 100 delivery attempts</small></div></div><div className="email-delivery-table"><div className="email-delivery-row heading"><span>Recipient</span><span>Subject</span><span>Status</span><span>Attempts</span><span>Last activity</span><span /></div>{notifications.map((notification) => <div className="email-delivery-row" key={notification.id}><span><strong>{notification.recipientEmail}</strong>{notification.lastError && <small title={notification.lastError}>{notification.lastError}</small>}</span><span>{notification.subject}</span><span><em className={`status ${notification.status}`}>{notification.status}</em></span><span>{notification.attempts}</span><span>{new Date(notification.sentAt || notification.updatedAt).toLocaleString()}</span><span>{notification.status !== 'sent' && <button className="secondary compact" type="button" disabled={retryingId !== null} onClick={() => void retry(notification.id)}><IconRotateClockwise size={15} />{retryingId === notification.id ? 'Retrying…' : 'Retry'}</button>}</span></div>)}{!loading && !notifications.length && <div className="empty"><h3>No email notifications yet</h3><p>Create or update a request to generate one.</p></div>}</div></section></>;
}
