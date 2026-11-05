'use client';

import { IconAlertTriangle, IconChartBar, IconClockHour4, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Analytics = {
  periodDays: number;
  statuses: Array<{ label: string; count: number }>;
  departments: Array<{ label: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  metrics: { total: number; open: number; overdue3Days: number; overdue7Days: number; averageResolutionHours: number | null };
};

export function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.get<{ data: Analytics }>(`/analytics/requests?days=${days}`)).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load dashboard analytics'); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const maximumTrend = useMemo(() => Math.max(...(data?.trend.map((point) => point.count) || [0]), 1), [data]);
  const maximumDepartment = useMemo(() => Math.max(...(data?.departments.map((item) => item.count) || [0]), 1), [data]);
  if (error) return <div className="alert" role="alert">{error}</div>;

  return <section className="analytics-section" aria-busy={loading}>
    <div className="analytics-heading"><div><p className="eyebrow">Operations overview</p><h1>Admin dashboard</h1><p>Monitor request volume, turnaround, departments, and aging work.</p></div><div className="analytics-actions"><select aria-label="Analytics period" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button className="icon-button" disabled={loading} onClick={() => void load()} aria-label="Refresh analytics"><IconRefresh size={18} /></button></div></div>
    <div className="analytics-metrics"><article><IconChartBar /><span>Total requests</span><strong>{data?.metrics.total ?? '—'}</strong></article><article><IconClockHour4 /><span>Average resolution</span><strong>{data?.metrics.averageResolutionHours == null ? '—' : `${data.metrics.averageResolutionHours}h`}</strong></article><article><IconAlertTriangle /><span>Open over 3 days</span><strong>{data?.metrics.overdue3Days ?? '—'}</strong><small>{data?.metrics.overdue7Days ?? 0} open over 7 days</small></article></div>
    <div className="analytics-grid"><article className="surface analytics-card"><div className="analytics-card-title"><h2>Request volume</h2><span>{days} days</span></div><div className="trend-chart" aria-label="Daily request volume">{data?.trend.map((point) => <div className="trend-column" key={point.date} title={`${point.date}: ${point.count}`}><span style={{ height: `${Math.max((point.count / maximumTrend) * 100, point.count ? 8 : 2)}%` }} /><small>{new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>)}</div></article>
      <article className="surface analytics-card"><div className="analytics-card-title"><h2>Top departments</h2><span>All time</span></div><div className="rank-list">{data?.departments.map((item) => <div key={item.label}><div><strong>{item.label}</strong><span>{item.count}</span></div><i><span style={{ width: `${(item.count / maximumDepartment) * 100}%` }} /></i></div>)}{!data?.departments.length && <p>No department data yet.</p>}</div></article>
      <article className="surface analytics-card status-card"><div className="analytics-card-title"><h2>Status breakdown</h2><span>All time</span></div><div className="status-breakdown">{data?.statuses.map((item) => <div key={item.label}><span className={`status ${item.label}`}>{item.label.replaceAll('_', ' ')}</span><strong>{item.count}</strong></div>)}</div></article>
    </div>
  </section>;
}
