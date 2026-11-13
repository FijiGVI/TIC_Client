import { api } from '@/lib/api';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PNG_MIME_TYPE = 'image/png';
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type CreatedUpload = {
  data: {
    id: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };
};

export async function uploadFile(file: File, purpose: 'request_attachment' | 'form_reference' = 'request_attachment'): Promise<string> {
  const created = await api.post<CreatedUpload>('/uploads', {
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    purpose,
  });
  const uploaded = await fetch(created.data.uploadUrl, {
    method: 'PUT',
    headers: created.data.headers,
    body: file,
  });
  if (!uploaded.ok) throw new Error('File upload failed');
  await api.post(`/uploads/${created.data.id}/complete`);
  return created.data.id;
}

export async function replaceUpload(file: File, previousUploadId?: string | null, purpose: 'request_attachment' | 'form_reference' = 'request_attachment'): Promise<string> {
  const uploadId = await uploadFile(file, purpose);
  if (previousUploadId) await api.delete(`/uploads/${previousUploadId}`).catch(() => undefined);
  return uploadId;
}

export function validateImage(file: File, pngOnly = false): string | null {
  const allowedTypes: readonly string[] = pngOnly ? [PNG_MIME_TYPE] : IMAGE_MIME_TYPES;
  if (!allowedTypes.includes(file.type)) return pngOnly ? 'Select a PNG image.' : 'Select a JPG, PNG, or WebP image.';
  if (file.size < 1 || file.size > MAX_IMAGE_SIZE_BYTES) return 'Select an image between 1 byte and 10 MB.';
  return null;
}
