import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { Tabs } from '@/components/ui';

/**
 * Money received is one screen with two tabs: payments against bills, and money received without a bill.
 * Each tab is its own address, so links and the browser's back button keep working.
 */
export function MoneyInTabs({ current }: { current: 'bills' | 'other' }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const tabs = [
    ...(can('payments.record') ? [{ value: 'bills' as const, label: 'Bill payments' }] : []),
    ...(can('expenses.manage') ? [{ value: 'other' as const, label: 'Other income (no bill)' }] : []),
  ];
  if (tabs.length < 2) return null;
  return <Tabs className="mb-5" value={current} onChange={(v) => navigate(v === 'bills' ? '/accounts/receipts' : '/accounts/income')} tabs={tabs} />;
}

/** Expenses the office records, and the claims staff send from the app for approval, as two tabs of one screen. */
export function MoneyOutTabs({ current }: { current: 'expenses' | 'claims' }) {
  const navigate = useNavigate();
  const claims = useQuery({
    queryKey: ['expense-claims', { status: 'pending', per_page: '1' }],
    queryFn: () => api.get<{ meta: { pending_count?: number; pending_amount?: number } }>('/expense-claims', { status: 'pending', per_page: 1 }),
  });
  const waiting = claims.data?.meta.pending_count ?? 0;
  return (
    <Tabs
      className="mb-5"
      value={current}
      onChange={(v) => navigate(v === 'expenses' ? '/accounts/expenses' : '/accounts/expense-claims')}
      tabs={[
        { value: 'expenses', label: 'Expenses' },
        { value: 'claims', label: 'Staff claims to approve', count: waiting || undefined },
      ]}
    />
  );
}
