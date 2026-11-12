"use client";

import { IconAlertTriangle, IconChartBar, IconCircleCheck, IconClockHour4, IconInbox, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type RankedItem = { label: string; count: number };
type Analytics = {
  periodDays: number;
  statuses: RankedItem[];
  departments: RankedItem[];
  forms: RankedItem[];
  aging: RankedItem[];
  trend: Array<{ date: string; count: number }>;
  metrics: {
    total: number; open: number; periodCreated: number; previousPeriodCreated: number;
    resolvedInPeriod: number; overdue3Days: number; overdue7Days: number;
    averageResolutionHours: number | null;
  };
};
type TrendBucket = { label: string; accessibleLabel: string; count: number };

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const groupTrend = (trend: Analytics["trend"], days: number): TrendBucket[] => {
  const bucketSize = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const buckets: TrendBucket[] = [];
  for (let index = 0; index < trend.length; index += bucketSize) {
    const group = trend.slice(index, index + bucketSize);
    const first = group[0];
    const last = group[group.length - 1];
    const count = group.reduce((total, point) => total + point.count, 0);
    buckets.push({ count, label: first.date === last.date ? shortDate(first.date) : `${shortDate(first.date)}–${shortDate(last.date)}`, accessibleLabel: `${shortDate(first.date)} to ${shortDate(last.date)}: ${count} requests` });
  }
  return buckets;
};
const comparisonText = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? "No change from previous period" : "No requests in previous period";
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return "Same as previous period";
  return `${Math.abs(change)}% ${change > 0 ? "higher" : "lower"} than previous period`;
};

function RankedList({ items, emptyMessage }: { items: RankedItem[]; emptyMessage: string }) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  if (!items.length) return <p className="analytics-empty">{emptyMessage}</p>;
  return <div className="rank-list">{items.map((item) => <div key={item.label}><div><strong>{item.label}</strong><span>{item.count}</span></div><i aria-hidden="true"><span style={{ width: `${(item.count / maximum) * 100}%` }} /></i></div>)}</div>;
}

export function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData((await api.get<{ data: Analytics }>(`/analytics/requests?days=${days}`)).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load dashboard analytics"); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const trendBuckets = useMemo(() => groupTrend(data?.trend || [], days), [data?.trend, days]);
  const maximumTrend = Math.max(...trendBuckets.map((point) => point.count), 1);
  const averagePerDay = data ? (data.metrics.periodCreated / days).toFixed(1) : "0.0";

  return <section className="analytics-section" aria-busy={loading}>
    <div className="analytics-heading"><div><h1>Dashboard</h1><p>See incoming demand, current workload, turnaround, and areas that need attention.</p></div><div className="analytics-actions"><select aria-label="Dashboard reporting period" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button className="icon-button" type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh dashboard" title="Refresh dashboard data"><IconRefresh size={18} /></button></div></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <div className="analytics-metrics">
      <article><IconChartBar /><span>New requests</span><strong>{data?.metrics.periodCreated ?? "—"}</strong><small>{data ? comparisonText(data.metrics.periodCreated, data.metrics.previousPeriodCreated) : "Selected period"}</small></article>
      <article><IconInbox /><span>Open now</span><strong>{data?.metrics.open ?? "—"}</strong><small>{data?.metrics.overdue3Days ?? 0} open longer than 3 days</small></article>
      <article><IconCircleCheck /><span>Resolved</span><strong>{data?.metrics.resolvedInPeriod ?? "—"}</strong><small>Completed during selected period</small></article>
      <article className={data?.metrics.overdue7Days ? "needs-attention" : ""}>{data?.metrics.overdue7Days ? <IconAlertTriangle /> : <IconClockHour4 />}<span>Average resolution</span><strong>{data?.metrics.averageResolutionHours == null ? "—" : `${data.metrics.averageResolutionHours}h`}</strong><small>{data?.metrics.overdue7Days ?? 0} open longer than 7 days</small></article>
    </div>
    <div className="analytics-grid">
      <article className="surface analytics-card volume-card"><div className="analytics-card-title"><div><h2>Incoming requests</h2><p>Requests received during the selected period</p></div><div className="volume-average"><strong>{averagePerDay}</strong><span>per day</span></div></div>{data?.metrics.periodCreated ? <div className="trend-chart" aria-label="Request volume grouped into readable periods">{trendBuckets.map((point) => <div className="trend-column" key={point.label} aria-label={point.accessibleLabel}><strong>{point.count}</strong><div><span style={{ height: `${Math.max((point.count / maximumTrend) * 100, point.count ? 8 : 0)}%` }} /></div><small>{point.label}</small></div>)}</div> : <p className="analytics-empty">No requests were received during this period.</p>}</article>
      <article className="surface analytics-card aging-card"><div className="analytics-card-title"><div><h2>Open request age</h2><p>How long current work has been waiting</p></div></div><div className="aging-list">{(data?.aging || []).map((item, index) => <div className={index >= 2 && item.count ? "aging-warning" : ""} key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>)}{!data?.aging.length && <p className="analytics-empty">There are no open requests.</p>}</div></article>
      <article className="surface analytics-card"><div className="analytics-card-title"><div><h2>Top departments</h2><p>Departments creating the most requests</p></div><span>{days} days</span></div><RankedList items={data?.departments || []} emptyMessage="No department activity for this period." /></article>
      <article className="surface analytics-card"><div className="analytics-card-title"><div><h2>Top request types</h2><p>Most frequently requested services</p></div><span>{days} days</span></div><RankedList items={data?.forms || []} emptyMessage="No request activity for this period." /></article>
    </div>
  </section>;
}
