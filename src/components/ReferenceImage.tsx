'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function ReferenceImage({ uploadId, alt }: { uploadId: string; alt: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<{ data: { downloadUrl: string } }>(`/uploads/${uploadId}/download`)
      .then((result) => { if (active) setUrl(result.data.downloadUrl); })
      .catch(() => { if (active) setError('Reference image is unavailable.'); });
    return () => { active = false; };
  }, [uploadId]);

  if (error) return <div className="upload-preview-placeholder" role="status">Image preview unavailable</div>;
  if (!url) return <div className="upload-preview-placeholder" role="status">Loading image…</div>;
  return <a className="upload-preview-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${alt} at full size`}>
    <Image unoptimized width={440} height={280} src={url} alt={alt}/>
  </a>;
}
