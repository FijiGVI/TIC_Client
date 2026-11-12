'use client';

import { IconCheck, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { fieldIsVisible, initialFieldResponses } from '@/lib/fieldConditions';
import type { DepartmentOption, FormField, RequestForm } from '@/lib/types';

const completeEmail = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return normalized;
  if (!normalized.includes('@')) return `${normalized}@globalvisionsinc.com.ph`;
  const [local, domain] = normalized.split('@');
  return domain && !domain.includes('.') ? `${local}@${domain}.com` : normalized;
};

const validateField = (field: FormField, value: unknown): string => {
  const empty = value === undefined || value === null || value === '' || value === false;
  if (field.required && empty) return `${field.label} is required`;
  if (empty) return '';
  const text = String(value);
  if (field.type === 'email' && !/^\S+@\S+\.\S+$/.test(completeEmail(text))) return `${field.label} must be a valid email address`;
  if ((field.type === 'select' || field.type === 'radio') && !field.options.includes(text)) return `${field.label} has an invalid selection`;
  if (field.validation.minLength !== undefined && text.length < field.validation.minLength) return `${field.label} must have at least ${field.validation.minLength} characters`;
  if (field.validation.maxLength !== undefined && text.length > field.validation.maxLength) return `${field.label} must not exceed ${field.validation.maxLength} characters`;
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return `${field.label} must be a non-negative number`;
    if (field.validation.min !== undefined && number < field.validation.min) return `${field.label} must be at least ${field.validation.min}`;
    if (field.validation.max !== undefined && number > field.validation.max) return `${field.label} must not exceed ${field.validation.max}`;
  }
  if (field.validation.pattern) {
    try {
      if (!new RegExp(field.validation.pattern, field.validation.patternFlags).test(text)) return field.validation.message || `${field.label} has an invalid format`;
    } catch { return `${field.label} has an invalid validation rule. Please contact an administrator.`; }
  }
  return '';
};

type FieldProps = { field: FormField; value: unknown; error?: string; setValue(value: unknown): void; onBlur(): void };
function Field({ field, value, error, setValue, onBlur }: FieldProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const errorId = `${field.id}-error`;
  const descriptionId = `${field.id}-description`;
  const feedback = error ? <small className="field-error" id={errorId} role="alert">{error}</small> : null;
  const description = field.description ? <small className="field-description" id={descriptionId}>{field.description}</small> : null;
  const accessibility = { 'aria-invalid': Boolean(error), 'aria-describedby': [field.description ? descriptionId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined };
  if (field.type === 'csv') return <label className="field-wide"><span>{field.label}</span>{description}<input {...accessibility} type="file" accept=".csv,text/csv,application/csv" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploadError(''); if (!file.name.toLowerCase().endsWith('.csv') || file.size < 1 || file.size > 10 * 1024 * 1024) { setUploadError('Select a CSV file between 1 byte and 10 MB.'); event.target.value = ''; return; } setUploading(true); const previousId = typeof value === 'string' ? value : ''; try { const contentType = file.type === 'application/vnd.ms-excel' ? file.type : file.type === 'application/csv' ? file.type : 'text/csv'; const created = await api.post<{ data: { id: string; uploadUrl: string; headers: Record<string, string> } }>('/uploads', { fileName: file.name, contentType, sizeBytes: file.size }); const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: created.data.headers, body: file }); if (!uploaded.ok) throw new Error('CSV upload failed'); await api.post(`/uploads/${created.data.id}/complete`); setValue(created.data.id); setUploadName(file.name); if (previousId) await api.delete(`/uploads/${previousId}`).catch(() => undefined); onBlur(); } catch (reason) { setValue(''); setUploadError(reason instanceof Error ? reason.message : 'Unable to upload CSV file'); } finally { setUploading(false); } }} />{uploading ? 'Uploading…' : uploadName || (value ? 'CSV uploaded' : '')}{(uploadError || error) && <small className="field-error" role="alert">{uploadError || error}</small>}</label>;
  if (field.type === 'textarea') return <label className="field-wide"><span>{field.label}</span>{description}<textarea {...accessibility} required={field.required} minLength={field.validation.minLength} maxLength={field.validation.maxLength} placeholder={field.placeholder} value={String(value || '')} onBlur={onBlur} onChange={(event) => setValue(event.target.value)} />{feedback}</label>;
  if (field.type === 'select') return <label><span>{field.label}</span>{description}<select {...accessibility} required={field.required} value={String(value || '')} onBlur={onBlur} onChange={(event) => setValue(event.target.value)}><option value="">Select one</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>{feedback}</label>;
  if (field.type === 'radio') return <fieldset {...accessibility} onBlur={onBlur}><legend>{field.label}</legend>{description}{field.options.map((option) => <label className="radio" key={option}><input required={field.required} type="radio" name={field.id} checked={value === option} onChange={() => setValue(option)} />{option}</label>)}{feedback}</fieldset>;
  if (field.type === 'checkbox') return <label className="radio"><input {...accessibility} required={field.required} type="checkbox" checked={Boolean(value)} onBlur={onBlur} onChange={(event) => setValue(event.target.checked)} />{field.label}{feedback}</label>;
  const isFile = field.type === 'image' || field.type === 'pdf';
  return <label><span>{field.label}</span>{description}<input {...accessibility} required={field.required} minLength={field.validation.minLength} maxLength={field.validation.maxLength} min={field.type === 'number' ? field.validation.min ?? 0 : field.validation.min} max={field.validation.max} pattern={field.validation.patternFlags ? undefined : field.validation.pattern} placeholder={field.placeholder} type={isFile ? 'file' : field.type} value={isFile ? undefined : String(value || '')} onChange={(event) => { if (field.type === 'number' && event.target.value !== '') { if (event.target.valueAsNumber < 0) return; setValue(event.target.valueAsNumber); return; } setValue(event.target.value); }} onBlur={(event) => { if (field.type === 'email') setValue(completeEmail(event.target.value)); onBlur(); }} />{feedback}</label>;
}

export function NewRequestModal({ onClose, onSubmitted }: { onClose(): void; onSubmitted(): void }) {
  const { user } = useAuth();
  const [forms, setForms] = useState<RequestForm[]>([]);
  const [formId, setFormId] = useState('');
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get<{ data: RequestForm[] }>('/forms/public'), api.get<{ data: DepartmentOption[] }>('/departments')])
      .then(([formResponse, departmentResponse]) => { setForms(formResponse.data); setFormId(formResponse.data[0]?.id || ''); setDepartments(departmentResponse.data); setDepartmentId(user?.departmentId || ''); })
      .catch((reason: Error) => setError(reason.message));
  }, [user?.departmentId]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', close);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  const selected = useMemo(() => forms.find((form) => form.id === formId), [forms, formId]);
  const requesterFields = useMemo(() => selected?.fields.filter((field) => !field.stepId) || [], [selected]);
  const visibleRequesterFields = useMemo(() => requesterFields.filter((field) => fieldIsVisible(field, responses)), [requesterFields, responses]);
  const groups = useMemo(() => [...new Set(forms.map((form) => form.groupName))], [forms]);
  useEffect(() => {
    setResponses(initialFieldResponses(requesterFields));
    setFieldErrors({});
  }, [formId, requesterFields]);
  const setFieldValue = (field: FormField, value: unknown) => { setResponses((current) => ({ ...current, [field.id]: value })); setFieldErrors((current) => ({ ...current, [field.id]: '' })); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !user) return;
    const errors = Object.fromEntries(visibleRequesterFields.map((field) => [field.id, validateField(field, responses[field.id])] as const).filter(([, message]) => Boolean(message)));
    setFieldErrors(errors);
    if (!departmentId || Object.keys(errors).length) { setError('Please complete the department and correct the highlighted fields.'); return; }
    setSaving(true); setError('');
    try {
      const attachmentIds = visibleRequesterFields.filter((field) => field.type === 'csv').map((field) => responses[field.id]).filter((value): value is string => typeof value === 'string' && Boolean(value));
      const result = await api.post<{ data: { referenceNumber: string } }>('/requests', { formId, departmentId, responses, attachmentIds });
      setSuccess(result.data.referenceNumber); onSubmitted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit request'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="modal new-request-modal" role="dialog" aria-modal="true" aria-labelledby="new-request-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label="Close new request" onClick={onClose}><IconX size={21} /></button>
        {success ? (
          <div className="modal-success"><span><IconCheck size={30} /></span><p className="eyebrow">Request received</p><h2 id="new-request-title">You’re all set.</h2><p>We’ll email you as the request progresses.</p><strong>{success}</strong><button className="primary" type="button" onClick={onClose}>View my requests</button></div>
        ) : (
          <>
            <header className="modal-heading"><p className="eyebrow">Employee services</p><h2 id="new-request-title">New request</h2><p>Choose a service and provide the details the team needs.</p></header>
            <div className="new-request-scroll-area">
              {error && <div className="alert" role="alert">{error}</div>}
              <div className="modal-request-form">
                {selected ? (
                  <form id="new-request-form" noValidate onSubmit={submit}>
                    <div className="request-context-grid">
                      <label className="service-select"><span>Service</span><small>Choose the type of request you want to create.</small><select value={formId} onChange={(event) => { const nextId = event.target.value; const nextForm = forms.find((form) => form.id === nextId); setFormId(nextId); setResponses(initialFieldResponses(nextForm?.fields.filter((field) => !field.stepId) || [])); setFieldErrors({}); setError(''); }}>{groups.map((group) => <optgroup label={group} key={group}>{forms.filter((form) => form.groupName === group).map((form) => <option value={form.id} key={form.id}>{form.name}</option>)}</optgroup>)}</select></label>
                      <label><span>Department</span><small>Automatically assigned from your user profile.</small><select required disabled value={departmentId}><option value="">Department not configured</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.title ? `${department.title} — ` : ''}{department.businessUnit}</option>)}</select></label>
                      <div className="selected-service-summary"><p className="eyebrow">{selected.groupName}</p><h3>{selected.name}</h3><p>{selected.description}</p></div>
                    </div>
                    <div className="dynamic-fields">{visibleRequesterFields.map((field) => <Field field={field} key={field.id} value={responses[field.id]} error={fieldErrors[field.id]} setValue={(value) => setFieldValue(field, value)} onBlur={() => setFieldErrors((current) => ({ ...current, [field.id]: validateField(field, responses[field.id]) }))} />)}</div>
                  </form>
                ) : <div className="empty"><h3>No request forms available</h3></div>}
              </div>
            </div>
            {selected && (
              <footer className="modal-footer">
                <button
                  className="primary"
                  type="submit"
                  form="new-request-form"
                  disabled={saving}
                >
                  {saving ? 'Submitting…' : 'Submit request'}
                </button>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}
