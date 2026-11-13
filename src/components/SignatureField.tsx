'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { replaceUpload, validateImage } from '@/lib/uploads';
import { ReferenceImage } from '@/components/ReferenceImage';

type Props = {
  id: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange(uploadId: string): void;
};

export function SignatureField({ id, value, error, disabled, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 2;
      context.strokeStyle = '#17202e';
    }
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || uploading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.beginPath();
    context?.moveTo(current.x, current.y);
    drawingRef.current = true;
  };
  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.lineTo(current.x, current.y);
    context?.stroke();
    setHasInk(true);
  };
  const stop = () => {
    const completedStroke = drawingRef.current;
    drawingRef.current = false;
    if (!completedStroke || disabled) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveDrawing();
    }, 600);
  };
  const clear = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setLocalError('');
  };
  const persist = async (file: File) => {
    setUploading(true);
    setLocalError('');
    try {
      onChange(await replaceUpload(file, value));
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Unable to upload signature');
    } finally {
      setUploading(false);
    }
  };
  const saveDrawing = () => {
    if (!hasInk) { setLocalError('Draw your signature before saving.'); return; }
    canvasRef.current?.toBlob((blob) => {
      if (blob) void persist(new File([blob], 'signature.png', { type: 'image/png' }));
    }, 'image/png');
  };

  return <div className="signature-input" id={id}>
    {value && <figure className="request-current-upload signature-current-upload"><ReferenceImage uploadId={value} alt="Current saved signature"/><figcaption>Current signature · Draw or import a PNG to replace it</figcaption></figure>}
    <canvas aria-label="Draw signature" ref={canvasRef} onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerCancel={stop} />
    <div className="signature-actions">
      <button type="button" className="secondary compact" disabled={disabled || uploading || !hasInk} onClick={saveDrawing}>Save signature</button>
      <button type="button" className="secondary compact" disabled={disabled || uploading || !hasInk} onClick={clear}>Clear</button>
      <label className="signature-upload secondary compact">Import PNG<input type="file" accept="image/png" disabled={disabled || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const issue = validateImage(file, true); if (issue) { setLocalError(issue); return; } void persist(file); }} /></label>
    </div>
    <small>{uploading ? 'Saving signature…' : value ? 'Signature saved' : hasInk ? 'Your signature will save automatically.' : 'Draw above or import a transparent PNG signature.'}</small>
    {(localError || error) && <small className="field-error" role="alert">{localError || error}</small>}
  </div>;
}
