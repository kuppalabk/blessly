import { API_URL } from '../config';

export class ApiError extends Error {
  /** Field-level messages from validation errors, keyed by field name. */
  fields?: Record<string, string>;
  constructor(public status: number, public code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.fields = fields;
  }
}

/**
 * Calls the Blessly API. The session is kept in the platform cookie store, the same
 * httpOnly cookie the website uses, so no token handling is needed in the app.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'x-client': 'native',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // The server sends { error: "message", code: "...", fields?: {...} }.
    const message = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    const code = typeof data.code === 'string' ? data.code : 'error';
    const fields = (data.fields as Record<string, string> | undefined) ?? undefined;
    throw new ApiError(res.status, code, message, fields);
  }
  return data as T;
}
