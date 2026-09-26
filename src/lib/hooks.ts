import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData, type QueryKey } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ApiError, type Envelope, type Paginated } from './api';
import type { Lookups, Named } from './types';
import { toast } from '@/components/ui';

/** All dropdown data for forms – cached for 5 minutes. */
export function useLookups(enabled = true) {
  return useQuery({
    queryKey: ['lookups'],
    queryFn: () => api.get<Envelope<Lookups>>('/master/lookups').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useStaffOptions(role?: string) {
  return useQuery({
    queryKey: ['staff-options', role ?? 'all'],
    queryFn: () => api.get<Envelope<(Named & { role: string; branch_id: number | null; punch_status: string })[]>>('/users/options', { role }).then((r) => r.data),
    staleTime: 60_000,
  });
}

/** Paginated list whose filters live in the URL (shareable, back-button friendly). */
export function useListQuery<T>(key: string, path: string, defaults: Record<string, string> = {}, mapParams?: (f: Record<string, string>) => Record<string, string | undefined>) {
  const [params, setParams] = useSearchParams();
  const filters: Record<string, string> = { ...defaults };
  params.forEach((v, k) => (filters[k] = v));
  const requestParams = mapParams ? mapParams(filters) : filters;

  const query = useQuery({
    queryKey: [key, requestParams],
    queryFn: () => api.get<Paginated<T>>(path, requestParams),
    placeholderData: keepPreviousData,
  });

  const setFilter = (name: string, value: string | null | undefined) => {
    const next = new URLSearchParams(params);
    if (value === null || value === undefined || value === '') next.delete(name);
    else next.set(name, value);
    if (name !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return { ...query, filters, setFilter, clear };
}

/** Mutation with success toast + error toast (except field-level validation errors). */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, v: TVars) => void; toastValidation?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success ?? (result as { message?: string })?.message;
      if (msg) toast.success(msg);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(result, vars);
    },
    onError: (e) => {
      const hasFieldErrors = e instanceof ApiError && Object.keys(e.errors).length > 0;
      if (!hasFieldErrors || opts.toastValidation !== false) toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    },
  });
}

export function fieldError(error: unknown, name: string): string | undefined {
  return error instanceof ApiError ? error.field(name) : undefined;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
