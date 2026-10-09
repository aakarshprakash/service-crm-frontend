import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { Button, Card, QueryState } from '@/components/ui';
import { LogoMark } from '@/components/brand';

interface ShareInfo {
  company: string;
  call_id: string;
  customer: string | null;
  shared: boolean;
  closed: boolean;
}

/** Public page (/share-location/:token) the customer opens from SMS / WhatsApp to send their location. */
export default function ShareLocation() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['share-location', token], queryFn: () => api.get<Envelope<ShareInfo>>(`/share-location/${token}`).then((r) => r.data), retry: false });
  const [state, setState] = useState<'idle' | 'locating' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const info = q.data;

  const share = () => {
    if (!navigator.geolocation) {
      setState('error');
      setError('This browser can’t share location. Please send your location on WhatsApp instead.');
      return;
    }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState('sending');
        try {
          await api.post(`/share-location/${token}`, { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
          setState('done');
        } catch (e) {
          setState('error');
          setError((e as Error).message);
        }
      },
      (err) => {
        setState('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was blocked. Allow location for this site in your browser settings and try again.'
            : 'Couldn’t get your location. Turn on GPS / location and try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <QueryState loading={q.isLoading} error={q.error}>
          {info && (
            <Card>
              <div className="mb-5 flex items-center gap-2">
                <LogoMark className="h-9 w-9" />
                <div>
                  <p className="font-semibold">{info.company}</p>
                  <p className="text-xs text-slate-500">Service request {info.call_id}</p>
                </div>
              </div>
              {info.closed ? (
                <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">This service request is already closed. Thank you!</p>
              ) : state === 'done' ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-accent-500" />
                  <p className="text-lg font-semibold">Location shared</p>
                  <p className="text-sm text-slate-600">Our technician will use it to reach you. You can close this page.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Dear {info.customer ?? 'customer'}, please share your current location so our technician can find your place easily.
                    Tap the button while you are <strong>at the service address</strong>.
                  </p>
                  {info.shared && <p className="mt-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">You already shared your location. Share again if it has changed.</p>}
                  <Button size="lg" className="mt-5 w-full" icon={<MapPin className="h-5 w-5" />} loading={state === 'locating' || state === 'sending'} onClick={share}>
                    {state === 'locating' ? 'Finding your location…' : 'Share my location'}
                  </Button>
                  {state === 'error' && <p className="mt-3 text-center text-sm text-red-700">{error}</p>}
                </>
              )}
              <p className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Your location is only used for this service visit.
              </p>
            </Card>
          )}
        </QueryState>
      </div>
    </div>
  );
}
