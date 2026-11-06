import axios, { AxiosError } from 'axios';

const AIMS_EMAIL_URL = process.env.NEXT_PUBLIC_AIMS_EMAIL_URL || 'https://aim-api-staging.globalvisioninc.com.ph/apis/sends/mail';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendEmailPayload = { to: string; subject: string; message: string };
export type SendEmailResponse = { success: boolean; message?: string; error?: string };

const client = axios.create({ timeout: 15_000, headers: { 'Content-Type': 'application/json' } });

export const adminNotificationEmails = (process.env.NEXT_PUBLIC_TIC_ADMIN_EMAILS || '')
  .split(',').map((email) => email.trim().toLowerCase()).filter((email) => EMAIL_PATTERN.test(email));

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
  const normalized = { to: payload.to.trim().toLowerCase(), subject: payload.subject.trim(), message: payload.message.trim() };
  if (!EMAIL_PATTERN.test(normalized.to)) throw new Error('A valid recipient email is required');
  try {
    const response = await client.post<SendEmailResponse>(AIMS_EMAIL_URL, normalized);
    if (response.data.success === false) throw new Error(response.data.error || response.data.message || 'Email was rejected');
    return response.data;
  } catch (reason) {
    if (reason instanceof AxiosError) {
      const data = reason.response?.data as SendEmailResponse | undefined;
      throw new Error(data?.error || data?.message || (reason.code === 'ECONNABORTED' ? 'Email delivery timed out' : 'Email delivery failed'));
    }
    throw reason;
  }
}

export async function sendEmails(payloads: SendEmailPayload[]): Promise<string[]> {
  const unique = Array.from(new Map(payloads.map((payload) => [`${payload.to.toLowerCase()}|${payload.subject}`, payload])).values());
  const results = await Promise.allSettled(unique.map(sendEmail));
  return results.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Email delivery failed'] : []);
}
