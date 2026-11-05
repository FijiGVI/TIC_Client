'use client';

import { IconDatabaseImport, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type MappingKey = 'title' | 'businessUnit' | 'entity' | 'businessUnitHead' | 'assistantBusinessUnitHead' | 'validity';
type Mapping = Record<MappingKey, string>;
type BusinessUnit = {
  id: string; sharepointItemId: string; title: string | null; businessUnit: string | null; entity: string | null;
  businessUnitHead: string | null; assistantBusinessUnitHead: string | null; validity: string | null; syncedAt: string;
};
type ListResponse = { data: BusinessUnit[]; meta: { sourceFields: string[]; mapping: Mapping } };

const labels: Record<MappingKey, string> = {
  title: 'Code / title', businessUnit: 'Business unit', entity: 'Entity', businessUnitHead: 'BU head',
  assistantBusinessUnitHead: 'Assistant BU head', validity: 'Validity',
};

export default function SharePointBusinessUnitsPage() {
  const [rows, setRows] = useState<BusinessUnit[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await api.get<ListResponse>('/integrations/sharepoint/business-units');
    setRows(result.data); setSourceFields(result.meta.sourceFields); setMapping(result.meta.mapping);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load data')).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sync = async () => {
    if (!mapping) return;
    setSyncing(true); setError(''); setMessage('');
    try {
      const result = await api.post<{ data: { count: number } }>('/integrations/sharepoint/business-units/sync', { mapping });
      await load(); setMessage(`${result.data.count} SharePoint items synchronized.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SharePoint synchronization failed'); }
    finally { setSyncing(false); }
  };

  return <>
    <header className="page-header"><div><p className="eyebrow">Data integration</p><h1>SharePoint business units</h1><p>Map SharePoint columns to the TIC staging table and synchronize the latest records.</p></div><button className="primary" disabled={syncing || !mapping} onClick={() => void sync()}><IconRefresh size={18} className={syncing ? 'spin-icon' : ''} />{syncing ? 'Synchronizing…' : 'Sync SharePoint'}</button></header>
    {error && <div className="alert" role="alert">{error}</div>}{message && <div className="success-alert" role="status">{message}</div>}
    <section className="surface mapping-surface"><div className="surface-toolbar"><div><h2>Column mapping</h2><small>Choose the SharePoint source column for each database field.</small></div><IconDatabaseImport size={22} /></div>
      <div className="mapping-grid">{mapping && (Object.keys(labels) as MappingKey[]).map((key) => <label key={key}>{labels[key]}<input list="sharepoint-fields" value={mapping[key]} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value })} /></label>)}<datalist id="sharepoint-fields">{sourceFields.map((field) => <option value={field} key={field} />)}</datalist></div>
    </section>
    <section className="surface sharepoint-surface"><div className="surface-toolbar"><div><h2>Retrieved data</h2><small>{rows.length} records stored locally{rows[0] ? ` · Last synced ${new Date(rows[0].syncedAt).toLocaleString()}` : ''}</small></div></div>
      {loading ? <div className="empty"><div className="spinner" /><p>Loading business units…</p></div> : rows.length === 0 ? <div className="empty"><IconDatabaseImport size={34} /><h3>No synchronized records</h3><p>Configure the server credentials, review the mapping, then sync SharePoint.</p></div> : <div className="sharepoint-table"><div className="sharepoint-row heading"><span>ID</span><span>Code</span><span>Business unit</span><span>Entity</span><span>BU head</span><span>Assistant</span><span>Validity</span></div>{rows.map((row) => <div className="sharepoint-row" key={row.id}><span>{row.sharepointItemId}</span><strong>{row.title || '—'}</strong><span>{row.businessUnit || '—'}</span><span>{row.entity || '—'}</span><span>{row.businessUnitHead || '—'}</span><span>{row.assistantBusinessUnitHead || '—'}</span><span>{row.validity || '—'}</span></div>)}</div>}
    </section>
  </>;
}
