'use client';

import { IconArrowRight, IconClipboardList, IconFilePlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PaginationMeta, ServiceRequest } from '@/lib/types';

const statusLabel = (status: string) => status.replaceAll('_', ' ');

export function RequesterDashboard() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: ServiceRequest[]; meta: PaginationMeta; summary: typeof summary }>('/requests?page=1&pageSize=5')
      .then((response) => { setRequests(response.data); setSummary(response.summary); })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  return <><header className="page-header"><div><p className="eyebrow">Your overview</p><h1>Dashboard</h1><p>See request progress and quickly continue your work.</p></div><Link className="primary" href="/requests"><IconFilePlus size={18} />New request</Link></header>{error && <div className="alert" role="alert">{error}</div>}<section className="stats"><article><span>Total requests</span><strong>{summary.total}</strong><small>All time</small></article><article><span>In progress</span><strong>{summary.open}</strong><small>Currently active</small></article><article><span>Completed</span><strong>{summary.completed}</strong><small>Successfully closed</small></article></section><section className="surface request-surface"><div className="surface-toolbar"><div><h2>Recent requests</h2><small>Your five latest submissions</small></div><Link className="secondary" href="/requests">View all requests</Link></div><div className="request-table">{loading && <div className="empty"><div className="spinner" /><h3>Loading your overview</h3></div>}{!loading && requests.map((request) => <Link className="request-row" href="/requests" key={request.id}><strong>{request.referenceNumber}</strong><span className="request-name">{request.formSnapshot.name}</span><span><em className={`status ${request.status}`}>{statusLabel(request.status)}</em></span><IconArrowRight size={17} /></Link>)}{!loading && !requests.length && <div className="empty"><IconClipboardList size={34} /><h3>No requests yet</h3><p>Create your first request when you are ready.</p></div>}</div></section></>;
}
