'use client';

import { IconCircleCheck, IconLoader2 } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearPendingMicrosoftRegistration, getPendingMicrosoftRegistration, type PendingMicrosoftRegistration } from '@/features/auth/pendingMicrosoftRegistration';
import { api, setTokens } from '@/lib/api';

type RegistrationOptions = { companies: string[]; businessUnits: Array<{ id: string; companyName: string; name: string }> };
const splitName = (name: string): [string, string] => { const parts = name.trim().split(/\s+/).filter(Boolean); return parts.length < 2 ? [parts[0] || '', ''] : [parts[0], parts.slice(1).join(' ')]; };

export default function RegisterPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<PendingMicrosoftRegistration | null>(null);
  const [options, setOptions] = useState<RegistrationOptions>({ companies: [], businessUnits: [] });
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState(''); const [businessUnitId, setBusinessUnitId] = useState('');
  const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    const pending = getPendingMicrosoftRegistration();
    if (!pending) { router.replace('/login'); return; }
    setIdentity(pending); const [first, last] = splitName(pending.name); setFirstName(first); setLastName(last);
    api.get<{ data: RegistrationOptions }>('/auth/registration/options').then((response) => setOptions(response.data)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Registration options could not be loaded.')).finally(() => setLoading(false));
  }, [router]);

  const businessUnits = useMemo(() => options.businessUnits.filter((option) => option.companyName === companyName), [companyName, options.businessUnits]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!identity) return; setSubmitting(true); setError('');
    try {
      const payload = { email: identity.email, firstName, lastName, companyName, businessUnitId };
      if (identity.provider === 'microsoft') await api.post('/auth/registration', { ...payload, idToken: identity.idToken });
      else await api.post('/auth/act-registration', payload);
      clearPendingMicrosoftRegistration(); setTokens(null); setSubmitted(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Registration could not be submitted.'); }
    finally { setSubmitting(false); }
  };

  if (submitted) return <main className="auth-page auth-simple"><section className="auth-panel"><div className="auth-card registration-success" role="status"><IconCircleCheck size={46}/><p className="eyebrow">Registration submitted</p><h2>Your account is awaiting approval</h2><p>A TIC master administrator must approve your requester account before you can sign in.</p><button className="primary" type="button" onClick={() => router.replace('/login')}>Return to sign in</button></div></section></main>;
  return <main className="auth-page auth-simple"><section className="auth-panel"><form className="auth-card registration-card" onSubmit={submit}><p className="eyebrow">Microsoft registration</p><h2>Complete your profile</h2><p>Your Microsoft identity has been verified. Select your company and business unit from the ACT-maintained reference list.</p>{error && <div className="alert" role="alert">{error}</div>}<label>Email<input value={identity?.email || ''} readOnly aria-readonly="true"/><small>Verified from your Microsoft account.</small></label><div className="registration-name-grid"><label>First name *<input value={firstName} maxLength={100} required autoComplete="given-name" onChange={(event) => setFirstName(event.target.value)}/></label><label>Last name *<input value={lastName} maxLength={100} required autoComplete="family-name" onChange={(event) => setLastName(event.target.value)}/></label></div><div className="registration-name-grid"><label>Company *<select value={companyName} required disabled={loading} onChange={(event) => { setCompanyName(event.target.value); setBusinessUnitId(''); }}><option value="">Select company</option>{options.companies.map((company) => <option value={company} key={company}>{company}</option>)}</select></label><label>Business unit *<select value={businessUnitId} required disabled={loading || !companyName} onChange={(event) => setBusinessUnitId(event.target.value)}><option value="">Select business unit</option>{businessUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label></div><button className="primary" type="submit" disabled={loading || submitting}>{loading || submitting ? <><IconLoader2 className="sso-spinner" size={18}/>{loading ? 'Loading reference data' : 'Submitting registration'}</> : 'Submit registration'}</button><button className="secondary registration-cancel" type="button" onClick={() => { clearPendingMicrosoftRegistration(); router.replace('/login'); }}>Cancel</button></form></section></main>;
}
