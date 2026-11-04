import axios, { AxiosError } from 'axios';

const AIMS_EMAIL_URL = 'https://aim-api-staging.globalvisioninc.com.ph/apis/sends/mail';
const EMAIL_TIMEOUT_MS = 15_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailPayload {
  to: string;
  subject: string;
  message: string;
}

export interface SendEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const emailClient = axios.create({
  baseURL: AIMS_EMAIL_URL,
  timeout: EMAIL_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

function validatePayload(payload: SendEmailPayload): SendEmailPayload {
  const normalized = {
    to: payload.to.trim().toLowerCase(),
    subject: payload.subject.trim(),
    message: payload.message.trim(),
  };

  if (!EMAIL_PATTERN.test(normalized.to)) throw new Error('A valid recipient email is required');
  if (!normalized.subject || normalized.subject.length > 200) throw new Error('Email subject must be between 1 and 200 characters');
  if (!normalized.message || normalized.message.length > 10_000) throw new Error('Email message must be between 1 and 10,000 characters');
  return normalized;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
  try {
    const response = await emailClient.post<SendEmailResponse>('', validatePayload(payload));
    if (!response.data.success) throw new Error(response.data.error || response.data.message || 'Email delivery was rejected');
    return response.data;
  } catch (reason) {
    if (reason instanceof AxiosError) {
      const detail = (reason.response?.data as SendEmailResponse | undefined)?.error;
      throw new Error(detail || (reason.code === 'ECONNABORTED' ? 'Email delivery timed out' : 'Email delivery failed'));
    }
    throw reason;
  }
}
