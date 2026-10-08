import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, money, time, toMajor, toMinor, today } from '@/lib/format';
import type { CashClose, CashSummary } from '@/lib/types';
import { Button, Card, ConfirmDialog, Field, Input, QueryState, Textarea } from '@/components/ui';
import { MethodLabel, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

/** FR-15.1 / FR-15.2: the service agent's end-of-day cash close. */
export default function TechCash() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [day, setDay] = useState(today());
  const q = useQuery({ queryKey: ['my-cash', day], queryFn: () => api.get<Envelope<CashSummary>>('/accounts/cash-summary', { date: day }).then((r) => r.data) });
  const history = useQuery({ queryKey: ['my-closes'], queryFn: () => api.get<Paginated<CashClose>>('/accounts/cash-close', { per_page: 10 }) });
  const [amount, setAmount] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const s = q.data;
  const declared = amount ?? toMajor(s?.expected_in_hand ?? 0);
  const mismatch = s ? toMinor(declared) !== s.expected_in_hand : false;

  const submit = useApiMutation(() => api.post('/accounts/cash-close', { date: day, amount_confirmed: toMinor(declared), remarks: remarks || null }), {
    toastValidation: true,
    onSuccess: () => {
      setConfirming(false);
      setAmount(null);
      setRemarks('');
      qc.invalidateQueries({ queryKey: ['my-cash'] });
      qc.invalidateQueries({ queryKey: ['my-closes'] });
      qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-navy-900">{t('cash.title')}</h1>
        <Input type="date" value={day} max={today()} onChange={(e) => { setDay(e.target.value); setAmount(null); }} className="!w-40" aria-label={t('common.date')} />
      </div>
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {s && (
          <>
            {!!s.pending_dates.length && (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  {t('cash.earlierOpen', { dates: s.pending_dates.map(date).join(', ') })}{' '}
                  <button className="font-semibold underline" onClick={() => { setDay(s.pending_dates[0]!); setAmount(null); }}>
                    {t('cash.closeFirst', { date: date(s.pending_dates[0]) })}
                  </button>
                </div>
              </div>
            )}

            <Card>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-slate-500">{t('cash.carried')}</span>
                <span className="text-right tabular-nums">{money(s.opening_balance)}</span>
                <span className="text-slate-500">{t('cash.cashCollected')}</span>
                <span className="text-right tabular-nums">{money(s.cash)}</span>
                <span className="text-slate-500">{t('cash.chequesCollected')}</span>
                <span className="text-right tabular-nums">{money(s.cheque)}</span>
                <span className="border-t border-slate-100 pt-2 font-semibold">{t('cash.toHandOver')}</span>
                <span className="border-t border-slate-100 pt-2 text-right text-lg font-bold tabular-nums">{money(s.expected_in_hand)}</span>
                <span className="text-xs text-slate-500">{t('cash.digital')}</span>
                <span className="text-right text-xs tabular-nums text-slate-500">{money(s.digital)}</span>
                <span className="text-xs text-slate-500">{t('cash.credit')}</span>
                <span className="text-right text-xs tabular-nums text-slate-500">{money(s.credit)}</span>
              </div>
            </Card>

            {s.close ? (
              <Card>
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-slate-400" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{t('cash.submittedLocked')}</p>
                    <p className="text-slate-500">
                      {t('cash.youDeclared', { amount: money(s.close.amount_confirmed) })}{' '}
                      {s.close.amount_verified !== null && t('cash.verified', { amount: money(s.close.amount_verified) })}
                    </p>
                  </div>
                  <StatusBadge status={s.close.status} />
                </div>
              </Card>
            ) : (
              <Card title={t('cash.confirmTitle')}>
                <div className="space-y-4">
                  <Field label={t('cash.amountHandingOver')} error={fieldError(submit.error, 'amount_confirmed')}>
                    <Input inputMode="decimal" className="text-lg font-semibold" value={declared} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                  </Field>
                  {mismatch && (
                    <Field label={t('cash.whyDifferent')} required error={fieldError(submit.error, 'remarks')}>
                      <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t('cash.whyPlaceholder')} />
                    </Field>
                  )}
                  <Hint block text={t('cash.submitHint')}>
                    <Button size="lg" className="w-full" icon={<CheckCircle2 className="h-5 w-5" />} disabled={!!s.pending_dates.length} onClick={() => setConfirming(true)}>
                      {t('cash.submit')}
                    </Button>
                  </Hint>
                </div>
              </Card>
            )}

            <Card title={t('cash.collections', { count: s.payments.length })} padded={false}>
              {!s.payments.length ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">{t('cash.noCollections')}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{p.customer}</p>
                        <p className="text-xs text-slate-500">
                          {time(p.paid_at)} · {p.receipt_number} · <MethodLabel method={p.method} /> {p.reference_no && `· ${p.reference_no}`}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </QueryState>

      <Card title={t('cash.recent')} padded={false}>
        <ul className="divide-y divide-slate-100">
          {history.data?.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{date(c.close_date)}</span>
              <span className="tabular-nums">{money(c.amount_confirmed)}</span>
              <StatusBadge status={c.status} />
            </li>
          ))}
          {history.data && !history.data.data.length && <li className="px-4 py-4 text-sm text-slate-500">{t('cash.noCloses')}</li>}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="primary"
        title={t('cash.confirmSubmit', { date: date(day) })}
        message={<Trans i18nKey="cash.confirmMessage" values={{ amount: money(toMinor(declared)) }} components={{ strong: <strong /> }} />}
        confirmLabel={t('action.submit')}
        loading={submit.isPending}
        onConfirm={() => submit.mutate(undefined)}
      />
    </div>
  );
}
