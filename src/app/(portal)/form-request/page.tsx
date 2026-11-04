'use client';

import { IconCheck, IconChevronRight, IconFileText } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { sendEmail } from '@/lib/email';
import type { FormField, RequestForm } from '@/lib/types';

function completeEmail(value: string): string {
  const normalized = value.trim();
  if (!normalized) return normalized;
  if (!normalized.includes('@')) return `${normalized}@globalvisionsinc.com.ph`;
  const [local, domain] = normalized.split('@');
  return domain && !domain.includes('.') ? `${local}@${domain}.com` : normalized;
}

function Field({ field, value, setValue }: { field: FormField; value: unknown; setValue(value: unknown): void }) {
  const common = { required: field.required };
  if (field.type === 'textarea') return <label><span>{field.label}</span><small>{field.description}</small><textarea {...common} value={String(value || '')} onChange={(event) => setValue(event.target.value)} /></label>;
  if (field.type === 'select') return <label><span>{field.label}</span><small>{field.description}</small><select {...common} value={String(value || '')} onChange={(event) => setValue(event.target.value)}><option value="">Select one</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === 'radio') return <fieldset><legend>{field.label}</legend><small>{field.description}</small>{field.options.map((option) => <label className="radio" key={option}><input type="radio" name={field.id} checked={value === option} onChange={() => setValue(option)} />{option}</label>)}</fieldset>;
  if (field.type === 'checkbox') return <label className="radio"><input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} />{field.label}</label>;
  const isFile = field.type === 'image' || field.type === 'pdf';
  return <label><span>{field.label}</span><small>{field.description}</small><input {...common} type={isFile ? 'file' : field.type} value={isFile ? undefined : String(value || '')} onChange={(event) => setValue(event.target.value)} onBlur={(event) => { if (field.type === 'email') setValue(completeEmail(event.target.value)); }} /></label>;
}

export default function FormRequestPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [forms, setForms] = useState<RequestForm[]>([]);
  const [formId, setFormId] = useState('');
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailWarning, setEmailWarning] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ data: RequestForm[] }>('/forms/public')
      .then((response) => { setForms(response.data); setFormId(response.data[0]?.id || ''); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const selected = useMemo(() => forms.find((form) => form.id === formId), [forms, formId]);
  const groups = useMemo(() => [...new Set(forms.map((form) => form.groupName))], [forms]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !user) return;
    setSaving(true);
    setError('');
    setEmailWarning('');
    try {
      const result = await api.post<{ data: { referenceNumber: string } }>('/requests', { formId, responses });
      setSuccess(result.data.referenceNumber);
      try {
        await sendEmail({
          to: user.email,
          subject: `TIC request ${result.data.referenceNumber} received`,
          message: `Your ${selected.name} request was submitted successfully. Reference: ${result.data.referenceNumber}.`,
        });
      } catch (reason) {
        setEmailWarning(reason instanceof Error ? `Your request was submitted, but ${reason.message.toLowerCase()}.` : 'Your request was submitted, but its confirmation email could not be sent.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit request');
    } finally {
      setSaving(false);
    }
  };

  if (success) return <section className="success-card"><span><IconCheck size={32} /></span><p className="eyebrow">Request received</p><h1>You’re all set.</h1><p>Keep this reference number for your records.</p><strong>{success}</strong>{emailWarning && <div className="notice" role="status">{emailWarning}</div>}<button className="primary" onClick={() => router.push('/dashboard')}>View my requests</button></section>;

  return <><header className="page-header"><div><p className="eyebrow">Employee Services</p><h1>Start a new request</h1><p>Choose a service and share the details the team needs.</p></div></header>{error && <div className="alert" role="alert">{error}</div>}<div className="request-composer"><aside><h2>Services</h2>{groups.map((group) => <div key={group}><h3>{group}</h3>{forms.filter((form) => form.groupName === group).map((form) => <button type="button" className={form.id === formId ? 'selected' : ''} key={form.id} onClick={() => { setFormId(form.id); setResponses({}); }}><IconFileText size={18} /><span>{form.name}</span><IconChevronRight size={16} /></button>)}</div>)}</aside><section className="surface form-surface">{selected ? <form onSubmit={submit}><p className="eyebrow">{selected.groupName}</p><h2>{selected.name}</h2><p>{selected.description}</p><div className="dynamic-fields">{selected.fields.map((field) => <Field field={field} key={field.id} value={responses[field.id]} setValue={(value) => setResponses({ ...responses, [field.id]: value })} />)}</div><button className="primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></form> : <div className="empty"><h3>No request forms available</h3></div>}</section></div></>;
}
