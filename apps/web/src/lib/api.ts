/**
 * API client. Adds the Bearer token, refreshes once on 401 (httpOnly cookie), throws ApiError.
 *   api.get<T>(url, { params })   -> T                (unwraps { data })
 *   api.list<T>(url, params)      -> Paged<T>          ({ data, total, page, pageSize })
 *   api.post/put/patch/delete<T>(url, body?) -> T
 *   api.upload(file, { kind, visibility, onProgress }) -> { id, url }
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export interface Paged<T> { data: T[]; total: number; page: number; pageSize: number }

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setAuthLostHandler = (fn: (() => void) | null) => { onAuthLost = fn; };

/** Appends the short-lived token so <img src>/<a href> to protected /files/:id work. */
export function fileSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('/files/') || !accessToken) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(accessToken)}`;
}

type Params = Record<string, string | number | boolean | null | undefined>;
const qs = (p?: Params) => {
  if (!p) return '';
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!r.ok) return false;
        const j = await r.json();
        accessToken = j.data.accessToken as string;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

async function raw<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try {
    res = await fetch(`${BASE}${url}`, { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network problem. Please check your connection and try again.');
  }
  if (res.status === 401 && retry && !url.startsWith('/api/auth/')) {
    if (await refreshSession()) return raw<T>(method, url, body, false);
    accessToken = null;
    onAuthLost?.();
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json as T;
}

export const api = {
  async get<T>(url: string, o?: { params?: Params }): Promise<T> {
    return (await raw<{ data: T }>('GET', url + qs(o?.params))).data;
  },
  list<T>(url: string, params?: Params): Promise<Paged<T>> {
    return raw<Paged<T>>('GET', url + qs(params));
  },
  async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    return (await raw<{ data: T }>('POST', url, body ?? {})).data;
  },
  async put<T = unknown>(url: string, body?: unknown): Promise<T> {
    return (await raw<{ data: T }>('PUT', url, body ?? {})).data;
  },
  async patch<T = unknown>(url: string, body?: unknown): Promise<T> {
    return (await raw<{ data: T }>('PATCH', url, body ?? {})).data;
  },
  async delete<T = unknown>(url: string, body?: unknown): Promise<T> {
    return (await raw<{ data: T }>('DELETE', url, body)).data;
  },
  /** Raw blob download (receipts, exports). */
  async blob(url: string): Promise<Blob> {
    const res = await fetch(`${BASE}${url}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'ERROR', `Download failed (${res.status})`);
    return res.blob();
  },
  /** multipart upload with progress. Works before login for photo/document kinds (registration). */
  upload(file: File, o: { kind: string; visibility?: 'PUBLIC' | 'MEMBERS' | 'PRIVATE'; onProgress?: (pct: number) => void }): Promise<UploadedFile> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('kind', o.kind);
      fd.append('visibility', o.visibility ?? 'PRIVATE');
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/files`);
      if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) o.onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Network problem. Please try again.'));
      xhr.onload = () => {
        let j: { data?: UploadedFile; error?: { code?: string; message?: string } } = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && j.data) resolve(j.data);
        else reject(new ApiError(xhr.status, j.error?.code ?? 'ERROR', j.error?.message ?? 'Upload failed'));
      };
      xhr.send(fd);
    });
  },
};

export interface UploadedFile { id: number; url: string; mime?: string; size?: number; kind?: string; visibility?: string }

/** Authenticated download helper: fetches the blob and triggers a browser save. */
export async function downloadFile(url: string, filename: string) {
  const blob = await api.blob(url);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
