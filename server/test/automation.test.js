// Automation module: auth gate, profile bootstrap, inbox scoping — against a fake Supabase.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/lib/logger.js';
import { createMockProvider } from '../src/llm/mock.js';
import { createApp } from '../src/app.js';
import { requireUser } from '../src/automation/auth.js';

const USERS = { 'tok-a': { id: '11111111-1111-4111-8111-111111111111', email: 'a@x.com', user_metadata: { full_name: 'Ayşe' } } };

function fakeSupabase() {
  const db = { profiles: [], inbox_items: [] };
  const where = (rows, q) => {
    const p = new URLSearchParams(q);
    return rows.filter((r) =>
      [...p.entries()].every(([k, v]) => {
        if (['select', 'order', 'limit'].includes(k)) return true;
        if (v === 'is.null') return r[k] == null;
        if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
        if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(r[k]);
        return true;
      }),
    );
  };
  let n = 0;
  return {
    db,
    getUser: async (t) => USERS[t] || null,
    select: async (t, q) => where(db[t], q),
    insert: async (t, rows) => {
      const out = rows.map((r) => ({ id: r.id || `id-${++n}`, read_at: null, created_at: new Date().toISOString(), ...r }));
      db[t].push(...out);
      return out;
    },
    update: async (t, q, patch) => {
      const hit = where(db[t], q);
      hit.forEach((r) => Object.assign(r, patch));
      return hit;
    },
  };
}

let server, base, sb;
before(async () => {
  sb = fakeSupabase();
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test' }), llm: createMockProvider(), logger: createLogger('silent'), supabase: sb });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api/v1/automation`;
});
after(() => server.close());

const call = (path, { token, method = 'GET', body } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('rejects requests without a valid token', async () => {
  assert.equal((await call('/me')).status, 401);
  const r = await call('/me', { token: 'bogus' });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, 'UNAUTHORIZED');
});

test('first visit creates the profile and a welcome inbox item', async () => {
  const r = await call('/me', { token: 'tok-a' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.created, true);
  assert.equal(j.profile.full_name, 'Ayşe');
  assert.equal(j.unreadCount, 1);
  const again = await (await call('/me', { token: 'tok-a' })).json();
  assert.equal(again.created, false);
  assert.equal(sb.db.profiles.length, 1);
});

test('inbox is scoped to the user and can be marked read', async () => {
  sb.db.inbox_items.push({ id: 'other', user_id: 'someone-else', kind: 'system', title: 'x', read_at: null });
  const { items } = await (await call('/inbox', { token: 'tok-a' })).json();
  assert.ok(items.length >= 1 && items.every((i) => i.user_id === USERS['tok-a'].id));
  const r = await call('/inbox/read', { token: 'tok-a', method: 'POST', body: { ids: [] } });
  assert.equal(r.status, 200);
  const me = await (await call('/me', { token: 'tok-a' })).json();
  assert.equal(me.unreadCount, 0);
  assert.equal(sb.db.inbox_items.find((i) => i.id === 'other').read_at, null);
});

test('PATCH /me validates input and records KVKK consent', async () => {
  assert.equal((await call('/me', { token: 'tok-a', method: 'PATCH', body: { mode: 'auto' } })).status, 400);
  const j = await (await call('/me', { token: 'tok-a', method: 'PATCH', body: { kvkk_accepted: true } })).json();
  assert.ok(j.profile.kvkk_accepted_at);
});

test('module answers NOT_CONFIGURED when Supabase is not set', async () => {
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test' }), llm: createMockProvider(), logger: createLogger('silent') });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/v1/automation/me`);
  assert.equal(r.status, 503);
  s.close();
});

test('config requires URL and service key together', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'mock', SUPABASE_URL: 'https://x.supabase.co' }), /together/);
  const c = loadConfig({ LLM_PROVIDER: 'mock', SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: ' "k" ' });
  assert.equal(c.SUPABASE_URL, 'https://x.supabase.co');
  assert.equal(c.SUPABASE_SERVICE_ROLE_KEY, 'k');
  assert.equal(c.automationEnabled, true);
});

test('auth cache avoids repeat lookups until expiry', async () => {
  let calls = 0, t = 0;
  const mw = requireUser({ getUser: async () => (calls++, USERS['tok-a']) }, { cacheMs: 1000, now: () => t });
  const req = { get: () => 'Bearer tok-a' };
  await new Promise((r) => mw(req, {}, r));
  await new Promise((r) => mw(req, {}, r));
  assert.equal(calls, 1);
  t = 2000;
  await new Promise((r) => mw(req, {}, r));
  assert.equal(calls, 2);
});
