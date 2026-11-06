import axios, { AxiosError } from 'axios';
import { z } from 'zod';

const AIMS_EMAIL_URL = 'https://aim-api-staging.globalvisioninc.com.ph/apis/sends/mail';

const emailPayloadSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(20_000),
}).strict();

type AimsEmailResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

export async function POST(request: Request): Promise<Response> {
  const requestOrigin = request.headers.get('origin');
  const applicationOrigin = new URL(request.url).origin;

  if (!requestOrigin || requestOrigin !== applicationOrigin) {
    return Response.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsedPayload = emailPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return Response.json({ success: false, error: 'Invalid email payload' }, { status: 400 });
  }

  try {
    const response = await axios.post<AimsEmailResponse>(AIMS_EMAIL_URL, parsedPayload.data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });

    if (response.data.success === false) {
      return Response.json(
        { success: false, error: response.data.error || response.data.message || 'Email was rejected' },
        { status: 502 },
      );
    }

    return Response.json({ success: true, message: response.data.message || 'Email accepted for delivery' });
  } catch (reason) {
    const upstreamResponse = reason instanceof AxiosError
      ? reason.response?.data as AimsEmailResponse | undefined
      : undefined;

    console.error('AIMS email delivery failed', {
      status: reason instanceof AxiosError ? reason.response?.status : undefined,
      code: reason instanceof AxiosError ? reason.code : undefined,
    });

    return Response.json(
      {
        success: false,
        error: upstreamResponse?.error
          || upstreamResponse?.message
          || (reason instanceof AxiosError && reason.code === 'ECONNABORTED'
            ? 'Email service timed out'
            : 'Email service is unavailable'),
      },
      { status: 502 },
    );
  }
}
