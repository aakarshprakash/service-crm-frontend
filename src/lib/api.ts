/**
 * Thin fetch wrapper for the Laravel API.
 * - Cookie auth (Sanctum SPA session cookie, sent automatically by the browser on every
 *   request). The CSRF token is fetched from GET /api/v1/csrf-token and kept in memory
 *   rather than read from the XSRF-TOKEN cookie, since JS can't read a cookie set by a
 *   different root domain — this works same-origin, same-root-domain, or fully cross-site
 *   (e.g. Cloudflare Pages frontend + a separate API host), as long as CORS allows the
 *   frontend origin with credentials and the session cookie is SameSite=None; Secure for
 *   the cross-site case.
 * - Consistent ApiError with field errors for forms.
 */

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  code?: string;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}, code?: string) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.code = code;
  }

  /** First error message for a field (for inline form errors). */
  field(name: string): string | undefined {
    return this.errors[name]?.[0];
  }
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number; [key: string]: unknown };
}

export interface Envelope<T> {
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const BASE = API_ORIGIN + '/api/v1';

/** For direct <a href>/<img src> links that hit the API outside the fetch wrapper (downloads, images). */
export const API_BASE = BASE;
let csrfToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

async function ensureCsrf() {
  if (csrfToken) return;
  const res = await fetch(BASE + '/csrf-token', { credentials: 'include' });
  const json = await res.json();
  csrfToken = json.token;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function toQuery(params?: Query): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const isForm = body instanceof FormData;
  if (method !== 'GET') await ensureCsrf();

  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers,
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your internet connection and try again.');
  }

  // CSRF token expired → refresh once and retry.
  if (res.status === 419 && retry) {
    csrfToken = null;
    return request<T>(method, path, body, false);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthenticated && !path.startsWith('/auth/login')) onUnauthenticated();
    const message =
      res.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : json?.message || (res.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Request failed.');
    throw new ApiError(res.status, message, json?.errors ?? {}, json?.code);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + toQuery(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/** Download a binary (PDF / XLSX) through the authenticated session. */
export async function download(path: string, fallbackName: string): Promise<{ queued?: boolean; message?: string }> {
  const res = await fetch(BASE + path, { credentials: 'include', headers: { Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' } });
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const json = await res.json();
    if (!res.ok) throw new ApiError(res.status, json?.message || 'Download failed.', json?.errors ?? {});
    return { queued: Boolean(json?.data?.queued), message: json?.message };
  }
  if (!res.ok) throw new ApiError(res.status, 'Download failed.');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {};
}
