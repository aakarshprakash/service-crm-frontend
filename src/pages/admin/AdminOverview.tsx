import { useQuery } from '@tanstack/react-query';
import { Building2, CreditCard, HardHat, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Envelope } from '@/lib/api';
import { money } from '@/lib/format';
import { Card, DataTable, PageHeader, QueryState, StatCard } from '@/components/ui';

interface Metrics {
  tenants: Record<string, number>;
  tenants_total: number;
  new_tenants_this_month: number;
  users: number;
  technicians: number;
  active_technicians_7d: number;
  jobs: { total: number; this_month: number; completed_this_month: number; trend: Record<string, number> };
  mrr: number;
  plans: { id: number; name: string; price: number; billing_cycle: string; tenants_count: number }[];
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ['platform-metrics'], queryFn: () => api.get<Envelope<Metrics>>('/admin/metrics').then((r) => r.data) });
  const d = q.data;
  const trend = Object.entries(d?.jobs.trend ?? {}).map(([month, total]) => ({ month, total }));

  return (
    <>
      <PageHeader title="Platform overview" description="Usage across all tenants. Tenant business data stays private to each tenant." />
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Tenants" value={d.tenants_total} icon={<Building2 className="h-5 w-5" />} hint={`${d.tenants.active ?? 0} active · ${d.tenants.trial ?? 0} trial · ${d.tenants.suspended ?? 0} suspended`} />
              <StatCard label="Monthly recurring revenue" value={money(d.mrr, 'INR')} icon={<CreditCard className="h-5 w-5" />} tone="green" hint={`${d.new_tenants_this_month} new tenants this month`} />
              <StatCard label="Active technicians" value={d.technicians} icon={<HardHat className="h-5 w-5" />} tone="violet" hint={`${d.active_technicians_7d} signed in over the last 7 days`} />
              <StatCard label="Office users" value={d.users - d.technicians} icon={<Users className="h-5 w-5" />} tone="slate" />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Jobs processed per month" className="lg:col-span-2">
                <p className="mb-3 text-sm text-slate-500">
                  {d.jobs.this_month.toLocaleString('en-IN')} created and {d.jobs.completed_this_month.toLocaleString('en-IN')} completed this month · {d.jobs.total.toLocaleString('en-IN')} all time
                </p>
                <div className="h-60" role="img" aria-label="Bar chart of jobs created per month across all tenants">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="total" name="Jobs" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        <LabelList dataKey="total" position="top" style={{ fontSize: 11, fill: '#334155' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Plans" padded={false}>
                <DataTable
                  rows={d.plans}
                  columns={[
                    { key: 'name', header: 'Plan', render: (p) => <span className="font-medium">{p.name}</span> },
                    { key: 'price', header: 'Price', render: (p) => `${money(p.price, 'INR')}/${p.billing_cycle === 'yearly' ? 'yr' : 'mo'}` },
                    { key: 'count', header: 'Tenants', render: (p) => p.tenants_count, className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
