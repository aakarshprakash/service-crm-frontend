import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { label, money, qty } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';
import { Badge, Card, EmptyState, Modal, SearchInput, Spinner, Tabs } from '@/components/ui';

/** FR-7.5: search spares / consumables and check availability across branches. */
export default function TechParts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | 'spare' | 'consumable'>('');
  const [open, setOpen] = useState<InventoryItem | null>(null);
  const q = useQuery({
    queryKey: ['tech-parts', search, type],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, type, active: 1, per_page: 30, branch_id: user?.branch_id ?? undefined }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold text-navy-900">{t('tech.spareInventory')}</h1>
      <SearchInput value={search} onChange={setSearch} placeholder={t('tech.searchParts')} />
      <Tabs value={type} onChange={setType} tabs={[{ value: '', label: t('common.all') }, { value: 'spare', label: t('tech.spares') }, { value: 'consumable', label: t('tech.consumables') }]} />
      <Card padded={false}>
        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !q.data?.data.length ? (
          <EmptyState title={t('tech.noParts')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {q.data.data.map((i) => {
              const stock = Number(i.stock_total ?? 0);
              return (
                <li key={i.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(i)}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{i.code}</span> · {label(i.type)} · {money(i.unit_price)}/{i.unit_of_measure}
                      </p>
                    </div>
                    <Badge tone={stock <= 0 ? 'red' : i.reorder_level > 0 && stock <= i.reorder_level ? 'amber' : 'green'}>
                      {qty(stock)} {i.unit_of_measure}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-center text-xs text-slate-500">{t('tech.partsHint')}</p>
      {open && <Availability item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Availability({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['availability', item.code],
    queryFn: () => api.get<Envelope<{ branches: { branch_id: number; branch: string; quantity: number }[] }>>(`/inventory/items/${encodeURIComponent(item.code)}/availability`).then((r) => r.data.branches),
  });
  return (
    <Modal open onClose={onClose} title={item.name} description={`${item.code} · ${money(item.unit_price)}/${item.unit_of_measure}`}>
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <p className="text-sm text-slate-500">{t('tech.notStocked')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {q.data.map((b) => (
            <li key={b.branch_id} className="flex justify-between py-2">
              <span>{b.branch}</span>
              <span className={b.quantity > 0 ? 'font-medium text-emerald-700' : 'text-red-600'}>
                {qty(b.quantity)} {item.unit_of_measure}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
