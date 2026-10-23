// Dependency-free Supabase access over its HTTP APIs (Auth + PostgREST).
// The service-role key never leaves the server; RLS is bypassed here on purpose,
// so every query below MUST be scoped to the authenticated user's id.
import { Errors } from '../lib/errors.js';

export function createSupabase({ url, serviceKey, fetchImpl = fetch, timeoutMs = 10_000 }) {
  const base = url.replace(/\/$/, '');

  async function call(path, { method = 'GET', headers = {}, body, auth } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(base + path, {
        method,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${auth || serviceKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      throw Errors.upstream('Veritabanına şu an ulaşılamıyor. Lütfen tekrar deneyin.', { cause: err.message });
    } finally {
      clearTimeout(timer);
    }
  }

  const rest = async (path, opts) => {
    const r = await call('/rest/v1/' + path, opts);
    if (!r.ok) throw Errors.upstream('Veritabanı işlemi başarısız oldu.', { status: r.status, db: r.data?.message });
    return r.data;
  };

  return {
    /** Validates a user access token with Supabase Auth. Returns the user or null. */
    async getUser(accessToken) {
      const r = await call('/auth/v1/user', { auth: accessToken });
      return r.ok && r.data?.id ? r.data : null;
    },
    select: (table, query) => rest(`${table}?${query}`),
    insert: (table, rows, { upsert = false, onConflict } = {}) =>
      rest(`${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
        method: 'POST',
        headers: { Prefer: `return=representation${upsert ? ',resolution=merge-duplicates' : ''}` },
        body: rows,
      }),
    update: (table, query, patch) =>
      rest(`${table}?${query}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch }),
  };
}
