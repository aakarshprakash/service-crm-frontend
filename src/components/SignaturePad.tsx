import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser } from 'lucide-react';
import { Button, Field, Input, Modal } from '@/components/ui';

/**
 * Customer sign-off on a canvas (mouse, pen or finger). Hands back a PNG blob on a
 * white background plus the signer's name.
 */
export function SignaturePad({ open, onClose, onSave, defaultName, saving }: { open: boolean; onClose: () => void; onSave: (png: Blob, signerName: string) => void; defaultName?: string; saving?: boolean }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const ink = useRef(0);
  const box = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const grow = (p: { x: number; y: number }) => {
    const b = box.current;
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  };
  const resetBox = () => (box.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [name, setName] = useState(defaultName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);

  // Size the bitmap to the element (and the screen's pixel ratio) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const c = canvas.current;
      if (!c) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.clientWidth * ratio;
      c.height = c.clientHeight * ratio;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#0B2545';
      ink.current = 0;
      resetBox();
      setEmpty(true);
      setError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    grow(last.current);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0B2545';
    ctx.fill();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext('2d')!;
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    grow(p);
    ink.current += 1;
    if (empty) setEmpty(false);
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    ink.current = 0;
    resetBox();
    setEmpty(true);
    setError(null);
  };

  const save = () => {
    if (!name.trim()) return setError(t('job.signature.nameRequired'));
    if (ink.current < 8) return setError(t('job.signature.empty'));
    const c = canvas.current;
    if (!c) return;
    // Export only the inked area (plus a margin) so the signature fills its slot on the invoice.
    const ratio = c.width / c.clientWidth;
    const pad = 12;
    const x = Math.max(0, box.current.minX - pad);
    const y = Math.max(0, box.current.minY - pad);
    const w = Math.max(60, Math.min(c.clientWidth, box.current.maxX + pad) - x);
    const h = Math.max(30, Math.min(c.clientHeight, box.current.maxY + pad) - y);
    const out = document.createElement('canvas');
    out.width = Math.round(w * ratio);
    out.height = Math.round(h * ratio);
    out.getContext('2d')!.drawImage(c, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, out.width, out.height);
    out.toBlob((blob) => blob && onSave(blob, name.trim()), 'image/png');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('job.signature.title')}
      footer={
        <>
          <Button variant="secondary" icon={<Eraser className="h-4 w-4" />} onClick={clear}>
            {t('job.signature.clear')}
          </Button>
          <Button loading={saving} onClick={save}>
            {t('job.signature.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('job.signature.signer')} required>
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="off" />
        </Field>
        <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
          <canvas
            ref={canvas}
            className="block h-56 w-full touch-none cursor-crosshair rounded-xl"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            aria-label={t('job.signature.signHere')}
          />
          {empty && (
            <div className="pointer-events-none absolute inset-x-8 bottom-6 border-b border-slate-200 pb-1 text-center text-xs text-slate-400">{t('job.signature.signHere')}</div>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
