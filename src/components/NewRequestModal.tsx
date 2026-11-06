'use client';

import { IconCheck, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { adminNotificationEmails, sendEmails } from '@/lib/email';
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
    if (!Number.isFinite(number)) return `${field.label} must be a number`;
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
  const errorId = `${field.id}-error`;
  const feedback = error ? <small className="field-error" id={errorId} role="alert">{error}</small> : null;
  const accessibility = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined };
  if (field.type === 'textarea') return <label><span>{field.label}</span><small>{field.description}</small><textarea {...accessibility} required={field.required} minLength={field.validation.minLength} maxLength={field.validation.maxLength} value={String(value || '')} onBlur={onBlur} onChange={(event) => setValue(event.target.value)} />{feedback}</label>;
  if (field.type === 'select') return <label><span>{field.label}</span><small>{field.description}</small><select {...accessibility} required={field.required} value={String(value || '')} onBlur={onBlur} onChange={(event) => setValue(event.target.value)}><option value="">Select one</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>{feedback}</label>;
  if (field.type === 'radio') return <fieldset {...accessibility} onBlur={onBlur}><legend>{field.label}</legend><small>{field.description}</small>{field.options.map((option) => <label className="radio" key={option}><input required={field.required} type="radio" name={field.id} checked={value === option} onChange={() => setValue(option)} />{option}</label>)}{feedback}</fieldset>;
  if (field.type === 'checkbox') return <label className="radio"><input {...accessibility} required={field.required} type="checkbox" checked={Boolean(value)} onBlur={onBlur} onChange={(event) => setValue(event.target.checked)} />{field.label}{feedback}</label>;
  const isFile = field.type === 'image' || field.type === 'pdf';
  return <label><span>{field.label}</span><small>{field.description}</small><input {...accessibility} required={field.required} minLength={field.validation.minLength} maxLength={field.validation.maxLength} min={field.validation.min} max={field.validation.max} pattern={field.validation.patternFlags ? undefined : field.validation.pattern} type={isFile ? 'file' : field.type} value={isFile ? undefined : String(value || '')} onChange={(event) => setValue(event.target.value)} onBlur={(event) => { if (field.type === 'email') setValue(completeEmail(event.target.value)); onBlur(); }} />{feedback}</label>;
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
  const [emailWarning, setEmailWarning] = useState('');

  useEffect(() => {
    Promise.all([api.get<{ data: RequestForm[] }>('/forms/public'), api.get<{ data: DepartmentOption[] }>('/departments')])
      .then(([formResponse, departmentResponse]) => { setForms(formResponse.data); setFormId(formResponse.data[0]?.id || ''); setDepartments(departmentResponse.data); })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', close);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  const selected = useMemo(() => forms.find((form) => form.id === formId), [forms, formId]);
  const groups = useMemo(() => [...new Set(forms.map((form) => form.groupName))], [forms]);
  const setFieldValue = (field: FormField, value: unknown) => { setResponses((current) => ({ ...current, [field.id]: value })); setFieldErrors((current) => ({ ...current, [field.id]: '' })); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !user) return;
    const errors = Object.fromEntries(selected.fields.map((field) => [field.id, validateField(field, responses[field.id])] as const).filter(([, message]) => Boolean(message)));
    setFieldErrors(errors);
    if (!departmentId || Object.keys(errors).length) { setError('Please complete the department and correct the highlighted fields.'); return; }
    setSaving(true); setError('');
    try {
      const result = await api.post<{ data: { referenceNumber: string } }>('/requests', { formId, departmentId, responses });
      setSuccess(result.data.referenceNumber); onSubmitted();
      const failures = await sendEmails([
        { to: user.email, subject: `TIC request ${result.data.referenceNumber} received`, message: `Your ${selected.name} request was submitted successfully. Reference: ${result.data.referenceNumber}.` },
        ...adminNotificationEmails.map((to) => ({ to, subject: `New TIC request ${result.data.referenceNumber}`, message: `${user.name} submitted ${selected.name}. Reference: ${result.data.referenceNumber}.` })),
      ]);
      if (failures.length) setEmailWarning('The request was saved, but one or more notification emails could not be delivered.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit request'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="modal new-request-modal" role="dialog" aria-modal="true" aria-labelledby="new-request-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label="Close new request" onClick={onClose}><IconX size={21} /></button>
        {success ? (
          <div className="modal-success"><span><IconCheck size={30} /></span><p className="eyebrow">Request received</p><h2 id="new-request-title">You’re all set.</h2><p>{emailWarning || 'Confirmation emails were sent.'}</p><strong>{success}</strong><button className="primary" type="button" onClick={onClose}>View my requests</button></div>
        ) : (
          <>
            <header className="modal-heading"><p className="eyebrow">Employee services</p><h2 id="new-request-title">New request</h2><p>Choose a service and provide the details the team needs.</p></header>
            <div className="new-request-scroll-area">
              {error && <div className="alert" role="alert">{error}</div>}
              <div className="modal-request-form">
                {selected ? (
                  <form noValidate onSubmit={submit}>
                    <label className="service-select"><span>Service</span><small>Choose the type of request you want to create.</small><select value={formId} onChange={(event) => { setFormId(event.target.value); setResponses({}); setFieldErrors({}); setError(''); }}>{groups.map((group) => <optgroup label={group} key={group}>{forms.filter((form) => form.groupName === group).map((form) => <option value={form.id} key={form.id}>{form.name}</option>)}</optgroup>)}</select></label>
                    <div className="selected-service-summary"><p className="eyebrow">{selected.groupName}</p><h3>{selected.name}</h3><p>{selected.description}</p></div>
                    <label><span>Department</span><small>Select the department you belong to.</small><select required value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Select your department</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.title ? `${department.title} — ` : ''}{department.businessUnit}</option>)}</select></label>
                    <div className="dynamic-fields">{selected.fields.map((field) => <Field field={field} key={field.id} value={responses[field.id]} error={fieldErrors[field.id]} setValue={(value) => setFieldValue(field, value)} onBlur={() => setFieldErrors((current) => ({ ...current, [field.id]: validateField(field, responses[field.id]) }))} />)}</div>
                    <button className="primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
                  </form>
                ) : <div className="empty"><h3>No request forms available</h3></div>}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
