import { useState } from 'react';
import { Copy, Link2, MapPin, MessageCircle, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { relative } from '@/lib/format';
import type { Job } from '@/lib/types';
import { Button, Card, Field, Input, Modal, toast } from '@/components/ui';
import { MapEmbed } from '@/components/domain';

const SOURCE = { customer: 'Shared by the customer', office: 'Set by the office', technician: 'Saved by the technician on site' } as const;

/**
 * Where the technician must go. The office can paste the location the customer sent on
 * WhatsApp / Google Maps, or send the customer a link to share their live location.
 */
export function CustomerLocationCard({ job, canManage, visitLat, visitLng }: { job: Job; canManage: boolean; visitLat?: number | null; visitLng?: number | null }) {
  const c = job.customer;
  const [pasting, setPasting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const hasCustomerLocation = c?.lat != null && c?.lng != null;

  return (
    <Card
      title="Customer location"
      actions={
        canManage && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => setPasting(true)}>
              Paste link
            </Button>
            <Button size="sm" variant="outline" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setRequesting(true)}>
              Ask customer
            </Button>
          </div>
        )
      }
    >
      <MapEmbed lat={hasCustomerLocation ? c!.lat : visitLat} lng={hasCustomerLocation ? c!.lng : visitLng} />
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <MapPin className="h-3.5 w-3.5" />
        {hasCustomerLocation
          ? `${c?.location_source ? SOURCE[c.location_source] : 'Saved on the customer'}${c?.location_updated_at ? ` · ${relative(c.location_updated_at)}` : ''}`
          : visitLat != null
            ? 'Where the last visit started (customer location not shared yet)'
            : 'Ask the customer to share their location so the technician gets directions.'}
      </p>
      {pasting && <PasteDialog job={job} onClose={() => setPasting(false)} />}
      {requesting && <RequestDialog job={job} onClose={() => setRequesting(false)} />}
    </Card>
  );
}

function PasteDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [link, setLink] = useState('');
  const m = useApiMutation(() => api.post(`/jobs/${job.id}/location`, { link }), { invalidate: [['job', String(job.id)]], toastValidation: false, onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Paste customer location"
      description="The location link the customer sent on WhatsApp, a Google Maps link, or “latitude, longitude”."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!link.trim()} onClick={() => m.mutate(undefined)}>
            Save location
          </Button>
        </>
      }
    >
      <Field label="Location link" error={fieldError(m.error, 'link')} hint="e.g. https://maps.app.goo.gl/… or 12.9716, 77.5946">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste here" autoFocus />
      </Field>
      <p className="mt-3 text-xs text-slate-500">The assigned technician gets a notification with directions.</p>
    </Modal>
  );
}

function RequestDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ link: string; message: string; phone: string | null } | null>(null);
  const m = useApiMutation((send: boolean) => api.post<Envelope<{ link: string; message: string; phone: string | null }>>(`/jobs/${job.id}/location-request`, { send }), {
    onSuccess: (r) => {
      setResult(r.data);
      qc.invalidateQueries({ queryKey: ['job', String(job.id)] });
    },
  });
  const phone = (result?.phone ?? job.customer?.phone ?? '').replace(/\D/g, '');
  const waPhone = phone.length === 10 ? `91${phone}` : phone;

  return (
    <Modal open onClose={onClose} title="Ask the customer for their location" description="The customer opens the link and taps “Share my location”. The technician is notified straight away.">
      {!result ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button icon={<Send className="h-4 w-4" />} loading={m.isPending && m.variables === true} onClick={() => m.mutate(true)}>
            Send by SMS / WhatsApp
          </Button>
          <Button variant="secondary" icon={<Link2 className="h-4 w-4" />} loading={m.isPending && m.variables === false} onClick={() => m.mutate(false)}>
            Just get the link
          </Button>
          <p className="text-xs text-slate-500 sm:col-span-2">“Send” uses the SMS / WhatsApp channels enabled in Settings → Preferences.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Link for the customer">
            <Input value={result.link} readOnly onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Copy className="h-4 w-4" />}
              onClick={() => navigator.clipboard.writeText(result.message).then(() => toast.success('Message copied'), () => toast.error('Copy failed'))}
            >
              Copy message
            </Button>
            {waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(result.message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-medium text-white hover:bg-accent-600"
              >
                <MessageCircle className="h-4 w-4" /> Open WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
