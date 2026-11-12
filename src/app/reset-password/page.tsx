"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) { setError("This password reset link is invalid or incomplete."); return; }
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setSaving(true);
    try {
      const result = await api.post<{ message: string }>("/auth/reset-password", { token, password });
      setMessage(result.message);
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset the password.");
    } finally {
      setSaving(false);
    }
  };

  if (message) return <main className="auth-page auth-simple"><section className="auth-panel"><div className="auth-card"><p className="eyebrow">Account recovery</p><h2>Password reset complete</h2><div className="notice" role="status">{message}</div><p className="auth-switch"><Link href="/login">Continue to sign in</Link></p></div></section></main>;

  return <main className="auth-page auth-simple"><section className="auth-panel"><form className="auth-card" onSubmit={submit}><p className="eyebrow">Account recovery</p><h2>Create a new password</h2><p>Use at least 12 characters with uppercase, lowercase, and a number.</p>{error && <div className="alert" role="alert">{error}</div>}<label>New password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary" disabled={saving || !token}>{saving ? "Resetting…" : "Reset password"}</button><p className="auth-switch"><Link href="/login">Back to login</Link></p></form></section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page auth-simple"><section className="auth-panel"><div className="auth-card"><p>Loading password reset…</p></div></section></main>}><ResetPasswordForm /></Suspense>;
}
