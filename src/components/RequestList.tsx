'use client';

import { IconArrowRight, IconClock, IconFilePlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { ServiceRequest } from '@/lib/types';

type Filter = 'all' | 'open' | 'completed';
const openStatuses = new Set(['submitted', 'in_review']);
const statusLabel = (status: string) => status.replaceAll('_', ' ');

export function RequestList({ managed = false }: { managed?: boolean }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: ServiceRequest[] }>('/requests');
      setRequests(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesQuery = !normalizedQuery || [request.referenceNumber, request.formSnapshot.name, request.requester?.name]
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesFilter = filter === 'all'
        || (filter === 'open' && openStatuses.has(request.status))
        || (filter === 'completed' && request.status === 'completed');
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, requests]);

  const act = async (action: 'approve' | 'reject') => {
    if (!selected || acting) return;
    setActing(true);
    setError('');
    try {
      await api.post(`/requests/${selected.id}/workflow-action`, { action });
      setSelected(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update request');
    } finally {
      setActing(false);
    }
  };

  const openCount = requests.filter((request) => openStatuses.has(request.status)).length;
  const completedCount = requests.filter((request) => request.status === 'completed').length;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{managed ? 'Team workspace' : 'Your workspace'}</p>
          <h1>{managed ? 'Service requests' : 'My requests'}</h1>
          <p>{managed ? 'Review assigned work and keep every request moving.' : 'Track requests from submission through completion.'}</p>
        </div>
        <div className="page-actions">
          <button className="icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh requests"><IconRefresh size={18} /></button>
          {!managed && <Link className="primary" href="/form-request"><IconFilePlus size={18} />New request</Link>}
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="stats">
        <article><span>Total requests</span><strong>{requests.length}</strong><small>All time</small></article>
        <article><span>In progress</span><strong>{openCount}</strong><small>Needs attention</small></article>
        <article><span>Completed</span><strong>{completedCount}</strong><small>Successfully closed</small></article>
      </section>

      <section className="surface request-surface">
        <div className="surface-toolbar request-toolbar">
          <div className="segmented" aria-label="Filter requests">
            {(['all', 'open', 'completed'] as Filter[]).map((option) => (
              <button className={filter === option ? 'selected' : ''} key={option} onClick={() => setFilter(option)}>{option}</button>
            ))}
          </div>
          <label className="search"><IconSearch size={18} /><input aria-label="Search requests" placeholder="Search reference, service, or requester" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>

        <div className="request-table">
          <div className={`request-row heading ${managed ? 'managed' : ''}`}>
            <span>Reference</span><span>Request</span>{managed && <span>Requester</span>}<span>Status</span><span>Submitted</span><span />
          </div>
          {loading && !requests.length && <div className="empty"><div className="spinner" /><h3>Loading requests</h3></div>}
          {!loading && filtered.map((request) => (
            <button className={`request-row ${managed ? 'managed' : ''}`} key={request.id} onClick={() => setSelected(request)}>
              <strong>{request.referenceNumber}</strong>
              <span className="request-name">{request.formSnapshot.name}</span>
              {managed && <span>{request.requester?.name || 'Not available'}</span>}
              <span><em className={`status ${request.status}`}>{statusLabel(request.status)}</em></span>
              <span>{new Date(request.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <IconArrowRight className="row-arrow" size={17} />
            </button>
          ))}
          {!loading && !filtered.length && <div className="empty"><IconClock size={34} /><h3>No matching requests</h3><p>Try another search or filter.</p></div>}
        </div>
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="modal request-detail" role="dialog" aria-modal="true" aria-labelledby="request-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close request details" onClick={() => setSelected(null)}>×</button>
            <p className="eyebrow">{selected.referenceNumber}</p>
            <h2 id="request-title">{selected.formSnapshot.name}</h2>
            <div className="detail-meta"><span className={`status ${selected.status}`}>{statusLabel(selected.status)}</span><span>Submitted {new Date(selected.createdAt).toLocaleString()}</span></div>
            <h3>Request details</h3>
            <dl>{Object.entries(selected.responses).map(([key, value]) => <div key={key}><dt>{selected.formSnapshot.fields.find((field) => field.id === key)?.label || key}</dt><dd>{String(value)}</dd></div>)}</dl>
            {!!selected.events?.length && <><h3>Activity</h3><div className="timeline">{selected.events.map((event) => <div key={event.id}><i /><p><strong>{statusLabel(event.action)}</strong><small>{event.actor?.name || 'System'} · {new Date(event.createdAt).toLocaleString()}</small></p></div>)}</div></>}
            {managed && selected.status === 'in_review' && <div className="modal-actions"><button className="danger" disabled={acting} onClick={() => void act('reject')}>Reject</button><button className="primary" disabled={acting} onClick={() => void act('approve')}>{acting ? 'Updating…' : 'Approve request'}</button></div>}
          </section>
        </div>
      )}
    </>
  );
}

