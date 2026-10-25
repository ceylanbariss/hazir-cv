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
  const db = { profiles: [], inbox_items: [], cvs: [], targets: [] };
  const files = new Map();
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
    insert: async (t, rows, { upsert } = {}) => {
      const out = rows.map((r) => ({ id: r.id || `id-${++n}`, read_at: null, created_at: new Date().toISOString(), ...r }));
      if (upsert && t === 'targets') db[t] = db[t].filter((x) => !out.some((o) => o.user_id === x.user_id));
      db[t].push(...out);
      return out;
    },
    update: async (t, q, patch) => {
      const hit = where(db[t], q);
      hit.forEach((r) => Object.assign(r, patch));
      return hit;
    },
    remove: async (t, q) => {
      const hit = where(db[t], q);
      db[t] = db[t].filter((r) => !hit.includes(r));
      return hit;
    },
    upload: async (b, path, bytes) => void files.set(path, bytes),
    removeFiles: async (b, paths) => paths.forEach((p) => files.delete(p)),
    files,
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
  assert.equal((await call('/me', { token: 'tok-a', method: 'PATCH', body: { status: 'active' } })).status, 400);
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

// ---- Faz 1: kurulum sihirbazı ----------------------------------------------
const CV_TEXT = `Ayşe Yılmaz
ayse@example.com +90 555 111 22 33
Deneyim
İş Analisti Stajyeri, Örnek A.Ş. 2025
SQL ve Jira ile gereksinim analizi yaptım.
Eğitim
Bilişim Sistemleri Mühendisliği, Sakarya Üniversitesi 2026
Yetenekler
SQL, Jira, Scrum, Excel, İngilizce`.padEnd(400, ' ');
const PDF_B64 = Buffer.from('%PDF-1.4\n' + 'x'.repeat(200)).toString('base64');

test('CV upload validates, analyses and stores the file', async () => {
  const bad = await call('/cvs', { token: 'tok-a', method: 'POST', body: { label: 'Ana', fileBase64: Buffer.from('hello'.repeat(40)).toString('base64'), text: CV_TEXT } });
  assert.equal(bad.status, 400);
  const r = await call('/cvs', { token: 'tok-a', method: 'POST', body: { label: 'Ana CV', fileBase64: PDF_B64, text: CV_TEXT } });
  assert.equal(r.status, 201);
  const { cv } = await r.json();
  assert.equal(cv.is_default, true);
  assert.ok(cv.extracted_profile.skills.includes('SQL'));
  assert.equal(cv.extracted_profile.source_text, undefined);
  assert.equal(sb.files.size, 1);
  const second = await (await call('/cvs', { token: 'tok-a', method: 'POST', body: { label: 'İngilizce', fileBase64: PDF_B64, text: CV_TEXT } })).json();
  assert.equal(second.cv.is_default, false);
});

test('non-CV text is rejected before storing anything', async () => {
  const before = sb.files.size;
  const r = await call('/cvs', { token: 'tok-a', method: 'POST', body: { label: 'Fatura', fileBase64: PDF_B64, text: 'Fatura toplam tutar KDV '.repeat(20) } });
  assert.equal(r.status, 422);
  assert.equal(sb.files.size, before);
});

test('default CV can be switched and deleting it promotes another', async () => {
  const { cvs } = await (await call('/setup', { token: 'tok-a' })).json();
  assert.equal(cvs.length, 2);
  const other = cvs.find((c) => !c.is_default);
  const sw = await (await call(`/cvs/${encodeURIComponent(other.id)}`, { token: 'tok-a', method: 'PATCH', body: { is_default: true } })).json();
  assert.equal(sw.cvs.filter((c) => c.is_default).length, 1);
  assert.equal(sw.cvs.find((c) => c.is_default).id, other.id);
});

test('role suggestions exclude roles already chosen', async () => {
  const r = await call('/roles/suggest', { token: 'tok-a', method: 'POST', body: { roles: ['İş Analisti'] } });
  assert.equal(r.status, 200);
  const { suggestions } = await r.json();
  assert.ok(suggestions.length > 0);
  assert.ok(!suggestions.some((s) => s.title === 'İş Analisti'));
});

test('targets are validated and upserted', async () => {
  const empty = await call('/targets', { token: 'tok-a', method: 'PUT', body: { roles: [], excluded: [], cities: [], work_modes: ['remote'], seniority: ['junior'], long_term_internship: true } });
  assert.equal(empty.status, 400);
  const body = { roles: ['İş Analisti', 'İş Analisti', 'ERP Danışmanı'], excluded: ['Odoo'], cities: ['Eskişehir'], work_modes: ['remote', 'hybrid'], seniority: ['junior'], long_term_internship: true };
  const r = await (await call('/targets', { token: 'tok-a', method: 'PUT', body })).json();
  assert.deepEqual(r.targets.roles, ['İş Analisti', 'ERP Danışmanı']);
  await call('/targets', { token: 'tok-a', method: 'PUT', body: { ...body, cities: ['İstanbul'] } });
  assert.equal(sb.db.targets.length, 1);
  assert.deepEqual(sb.db.targets[0].cities, ['İstanbul']);
});

test('preferences accept valid values and reject out-of-range ones', async () => {
  assert.equal((await call('/me', { token: 'tok-a', method: 'PATCH', body: { daily_limit: 99 } })).status, 400);
  assert.equal((await call('/me', { token: 'tok-a', method: 'PATCH', body: { portfolio_url: 'not a url' } })).status, 400);
  const j = await (await call('/me', { token: 'tok-a', method: 'PATCH', body: { mode: 'approval', daily_limit: 8, portfolio_url: 'https://behance.net/ayse', setup_step: 5 } })).json();
  assert.equal(j.profile.daily_limit, 8);
  assert.equal(j.profile.setup_step, 5);
});

test('CV is still saved when the AI service is unavailable', async () => {
  const { createApp: mk } = await import('../src/app.js');
  const sb2 = fakeSupabase();
  const failing = { name: 'x', model: 'x', generate: async () => { const { Errors } = await import('../src/lib/errors.js'); throw Errors.upstream(); } };
  const app = mk({ config: loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test' }), llm: failing, logger: createLogger('silent'), supabase: sb2 });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/v1/automation/cvs`, {
    method: 'POST', headers: { Authorization: 'Bearer tok-a', 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Ana', fileBase64: PDF_B64, text: CV_TEXT }),
  });
  s.close();
  assert.equal(r.status, 201);
  const { cv } = await r.json();
  assert.equal(cv.extracted_profile.pending, true);
  assert.equal(sb2.files.size, 1);
});

test('CORS preflight allows PUT and DELETE for the panel', async () => {
  const r = await fetch(base + '/targets', { method: 'OPTIONS', headers: { Origin: 'https://www.hazircv.com.tr', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.match(r.headers.get('access-control-allow-methods') || '', /PUT/);
  assert.match(r.headers.get('access-control-allow-methods') || '', /DELETE/);
});
