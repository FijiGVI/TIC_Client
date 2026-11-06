'use client';

import { IconEye, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import type { PaginationMeta } from '@/lib/types';

type AuditRow = {
  id: number; action: string; resource: string | null; resourceId: string | null;
  method: string; path: string; statusCode: number | null;
  details: Record<string, unknown> | null; ipAddress: string | null; createdAt: string;
};

const PAGE_SIZE = 20;
const initialMeta: PaginationMeta = { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [meta, setMeta] = useState(initialMeta);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const parameters = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (from) parameters.set('from', new Date(from).toISOString());
    if (to) parameters.set('to', new Date(to).toISOString());
    return api.get<{ data: AuditRow[]; meta: PaginationMeta }>(`/audit-logs?${parameters}`);
  }, [from, page, to]);

  useEffect(() => {
    let active = true;
    void load()
      .then((result) => {
        if (!active) return;
        setRows(result.data);
        setMeta(result.meta);
        setError('');
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load audit logs');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load, refreshKey]);

  const updateDateRange = (field: 'from' | 'to', value: string) => {
    setLoading(true);
    setPage(1);
    if (field === 'from') setFrom(value); else setTo(value);
  };

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Administration</p><h1>Audit logs</h1><p>Review ticketing activity, timestamps, outcomes, and sanitized request details.</p></div>
        <button type="button" className="secondary" title="Refresh audit logs" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} disabled={loading}><IconRefresh size={17} /> Refresh</button>
      </header>
      {error && <div className="alert">{error}</div>}
      <section className="surface" aria-busy={loading}>
        <div className="request-filters">
          <label>From<input type="datetime-local" value={from} onChange={(event) => updateDateRange('from', event.target.value)} /></label>
          <label>To<input type="datetime-local" min={from} value={to} onChange={(event) => updateDateRange('to', event.target.value)} /></label>
          <button type="button" className="secondary" disabled={!from && !to} onClick={() => { setLoading(true); setFrom(''); setTo(''); setPage(1); }}>Clear dates</button>
        </div>
        <div className="audit-table">
          <div className="audit-row heading"><span>Date and time</span><span>Action</span><span>Resource</span><span>Method</span><span>Status</span><span>Details</span></div>
          {!loading && rows.length === 0 && <p className="audit-empty">No audit activity matches this date range.</p>}
          {rows.map((row) => (
            <div className="audit-row" key={row.id}>
              <span>{new Date(row.createdAt).toLocaleString()}</span><strong>{row.action.replaceAll('_', ' ')}</strong>
              <span>{row.resource || '—'}{row.resourceId ? ` #${row.resourceId}` : ''}</span><span>{row.method}</span><span>{row.statusCode ?? '—'}</span>
              <button type="button" className="secondary compact" onClick={() => setSelected(row)}><IconEye size={15} /> View</button>
            </div>
          ))}
        </div>
        <Pagination meta={meta} disabled={loading} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
      </section>
      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="audit-details-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="Close audit details" onClick={() => setSelected(null)}>×</button>
            <h2 id="audit-details-title">Audit details</h2><p>{selected.method} {selected.path}</p>
            <pre className="audit-details">{JSON.stringify(selected.details, null, 2)}</pre>
          </section>
        </div>
      )}
    </>
  );
}
