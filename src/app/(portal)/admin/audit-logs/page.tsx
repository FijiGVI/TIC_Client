'use client';

import { IconEye, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import type { PaginationMeta } from '@/lib/types';

type AuditActor = { name?: string; email?: string };
type AuditDetails = { actor?: AuditActor; body?: Record<string, unknown> };
type AuditRow = {
  id: number; action: string; resource: string | null; resourceId: string | null;
  method: string; path: string; statusCode: number | null;
  description: string | null; details: AuditDetails | null; createdAt: string;
};

const PAGE_SIZE = 20;
const initialMeta: PaginationMeta = { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };
const sentenceCase = (value: string) => value.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
const actorName = (row: AuditRow) => row.details?.actor?.name || row.details?.actor?.email || 'System';
const succeeded = (row: AuditRow) => row.statusCode !== null && row.statusCode < 400;

function activityLabel(row: AuditRow): string {
  const path = row.path.toLowerCase();
  const body = row.details?.body;
  if (path.includes('/workflow-action')) {
    const action = typeof body?.action === 'string' ? sentenceCase(body.action) : 'Updated';
    return `${action} a request`;
  }
  if (path.includes('/requests')) return row.method === 'POST' ? 'Submitted a new request' : 'Updated a request';
  if (path.includes('/forms')) return row.method === 'POST' ? 'Created a request form' : 'Updated a request form';
  if (path.includes('/users') && path.includes('/active')) return 'Changed a user account status';
  if (path.includes('/reset-password')) return 'Reset a user password';
  if (path.includes('/users')) return row.method === 'POST' ? 'Created a user account' : 'Updated a user account';
  if (path.includes('/roles')) return 'Updated role permissions';
  if (path.includes('/sharepoint') && path.includes('/sync')) return 'Synchronized department data';
  if (path.includes('/uploads')) return row.method === 'DELETE' ? 'Removed an attachment' : 'Added an attachment';
  if (path.includes('/profile')) return 'Updated profile information';
  if (path.includes('/change-password')) return 'Changed account password';
  return sentenceCase(row.action);
}

function readableDetails(row: AuditRow): Array<{ label: string; value: string }> {
  const body = row.details?.body;
  if (!body || typeof body !== 'object') return [];
  return Object.entries(body)
    .filter(([key, value]) => !['password', 'currentPassword', 'newPassword', 'confirmPassword'].includes(key) && value !== undefined && value !== null && value !== '')
    .slice(0, 20)
    .map(([key, value]) => ({
      label: sentenceCase(key),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}

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
    void load().then((result) => {
      if (!active) return;
      setRows(result.data); setMeta(result.meta); setError('');
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to load audit logs');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, refreshKey]);

  const updateDateRange = (field: 'from' | 'to', value: string) => {
    setLoading(true); setPage(1);
    if (field === 'from') setFrom(value); else setTo(value);
  };

  const selectedDetails = selected ? readableDetails(selected) : [];
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Administration</p><h1>Activity history</h1><p>See who made a change, what happened, and when it occurred.</p></div>
        <button type="button" className="secondary" title="Refresh activity history" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} disabled={loading}><IconRefresh size={17} /> Refresh</button>
      </header>
      {error && <div className="alert">{error}</div>}
      <section className="surface" aria-busy={loading}>
        <div className="request-filters">
          <label>From<input type="datetime-local" value={from} onChange={(event) => updateDateRange('from', event.target.value)} /></label>
          <label>To<input type="datetime-local" min={from} value={to} onChange={(event) => updateDateRange('to', event.target.value)} /></label>
          <button type="button" className="secondary" disabled={!from && !to} onClick={() => { setLoading(true); setFrom(''); setTo(''); setPage(1); }}>Clear dates</button>
        </div>
        <div className="audit-table">
          <div className="audit-row heading"><span>When</span><span>Who</span><span>What happened</span><span>Result</span><span>Details</span></div>
          {!loading && rows.length === 0 && <p className="audit-empty">No activity matches this date range.</p>}
          {rows.map((row) => (
            <div className="audit-row" key={row.id}>
              <span>{new Date(row.createdAt).toLocaleString()}</span><strong>{actorName(row)}</strong><span>{activityLabel(row)}</span>
              <span className={succeeded(row) ? 'audit-result success' : 'audit-result failed'}>{succeeded(row) ? 'Successful' : 'Unsuccessful'}</span>
              <button type="button" className="secondary compact" onClick={() => setSelected(row)}><IconEye size={15} /> View</button>
            </div>
          ))}
        </div>
        <Pagination meta={meta} disabled={loading} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
      </section>
      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="modal audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-details-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="Close activity details" onClick={() => setSelected(null)}>×</button>
            <p className="eyebrow">Activity details</p><h2 id="audit-details-title">{activityLabel(selected)}</h2>
            <dl className="audit-summary"><div><dt>Performed by</dt><dd>{actorName(selected)}</dd></div><div><dt>Date and time</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div><div><dt>Result</dt><dd>{succeeded(selected) ? 'Successful' : 'Unsuccessful'}</dd></div></dl>
            <h3>Information recorded</h3>
            {selectedDetails.length ? <dl className="audit-change-list">{selectedDetails.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p className="muted">No additional information was recorded for this activity.</p>}
          </section>
        </div>
      )}
    </>
  );
}
