/**
 * Thin fetch wrapper for the Laravel API.
 * - Bearer-token auth (Sanctum personal access token) rather than a cookie session.
 *   The API is often served from a different domain than the app, and browsers block
 *   third-party cookies, so a session cookie set by the API would never be sent back.
 *   A token in the Authorization header has no such restriction, and it makes CSRF
 *   protection unnecessary — the browser can't attach it to a forged cross-site request.
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

/** For public <a href> links that hit the API outside the fetch wrapper (e.g. the payment-link PDF). */
export const API_BASE = BASE;

const TOKEN_KEY = 'servicecrm.token';
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / blocked storage — the session just won't survive a reload. */
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;

  const headers = authHeaders({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your internet connection and try again.');
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      setToken(null);
      onUnauthenticated?.();
    }
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

/**
 * Fetches an authenticated image as an object URL, since <img src> can't send the
 * Authorization header. Callers must URL.revokeObjectURL() the result when done.
 */
export async function imageObjectUrl(path: string): Promise<string> {
  const res = await fetch(BASE + path, { headers: authHeaders({ Accept: 'image/*' }) });
  if (!res.ok) throw new ApiError(res.status, 'Could not load image.');
  return URL.createObjectURL(await res.blob());
}

/** Download a binary (PDF / XLSX) as the authenticated user. */
export async function download(path: string, fallbackName: string): Promise<{ queued?: boolean; message?: string }> {
  const res = await fetch(BASE + path, { headers: authHeaders({ Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' }) });
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
