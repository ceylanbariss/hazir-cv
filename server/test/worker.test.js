// Faz 2: Gmail bağlantısı, günlük işçi ve onaylı gönderim — sahte Supabase, sahte arama,
// sahte sayfa okuyucu ve sahte Gmail ile uçtan uca.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/lib/logger.js';
import { createMockProvider } from '../src/llm/mock.js';
import { createApp } from '../src/app.js';
import { createSealer } from '../src/automation/crypto.js';
import { buildMime, encodeHeader } from '../src/automation/gmail.js';
import { dailyQueries } from '../src/automation/search.js';
import { validEmails, isPublicUrl, emailsIn, rootName, shouldSkip } from '../src/automation/pages.js';
import { checkVerdict, fixLetter } from '../src/automation/worker.js';

const UID = '22222222-2222-4222-8222-222222222222';
const USERS = { 'tok-b': { id: UID, email: 'b@x.com', user_metadata: { full_name: 'Barış Deneme' } } };
const SECRET = 'cron-secret-123';

function fakeSupabase() {
  const db = { profiles: [], inbox_items: [], cvs: [], targets: [], gmail_connections: [], discoveries: [], applications: [], run_logs: [] };
  const files = new Map();
  const where = (rows, q) => {
    const p = new URLSearchParams(q);
    return rows.filter((r) =>
      [...p.entries()].every(([k, v]) => {
        if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
        if (v === 'is.null') return r[k] == null;
        if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
        if (v.startsWith('neq.')) return String(r[k]) !== v.slice(4);
        if (v.startsWith('gte.')) return typeof r[k] === 'number' ? r[k] >= Number(v.slice(4)) : String(r[k] ?? '') >= v.slice(4);
        if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(r[k]);
        return true;
      }),
    );
  };
  const KEYS = { targets: ['user_id'], gmail_connections: ['user_id'], profiles: ['id'], discoveries: ['user_id', 'url'] };
  return {
    db,
    files,
    getUser: async (t) => USERS[t] || null,
    select: async (t, q) => where(db[t], q).map((r) => ({ ...r })),
    insert: async (t, rows, { upsert } = {}) => {
      const out = rows.map((r) => ({ id: r.id || randomUUID(), read_at: null, created_at: new Date().toISOString(), ...r }));
      if (upsert && KEYS[t]) db[t] = db[t].filter((x) => !out.some((o) => KEYS[t].every((k) => o[k] === x[k])));
      db[t].push(...out);
      return out;
    },
    update: async (t, q, patch) => {
      const hit = where(db[t], q);
      hit.forEach((r) => Object.assign(r, patch));
      return hit.map((r) => ({ ...r }));
    },
    remove: async (t, q) => {
      const hit = where(db[t], q);
      db[t] = db[t].filter((r) => !hit.includes(r));
      return hit;
    },
    upload: async (b, path, bytes) => void files.set(path, bytes),
    download: async (b, path) => files.get(path) || Buffer.from('%PDF-1.4 fake'),
    removeFiles: async (b, paths) => paths.forEach((p) => files.delete(p)),
  };
}

const PAGES = {
  'https://atlas.com.tr/kariyer/is-analisti': {
    title: 'İş Analisti ilanı – Atlas', snippet: 'Özgeçmişinizi ik@atlas.com.tr adresine gönderin',
    text: 'Atlas Yazılım İş Analisti pozisyonu ilanı. SQL ve süreç analizi. Özgeçmişinizi ik@atlas.com.tr adresine gönderin.', emails: ['ik@atlas.com.tr'],
  },
  'https://kuzey.com/hakkimizda': {
    title: 'Kuzey Kimya', snippet: 'kimya', text: 'Kimya üretimi. info@kuzey.com', emails: ['info@kuzey.com'],
  },
  'https://nova.com.tr/': { title: 'Nova', snippet: '', text: 'Hiç adres yok', emails: [] },
};

function fakeSearch() {
  let calls = 0;
  return {
    enabled: true,
    get calls() { return calls; },
    async search() {
      calls++;
      return { provider: 'fake', cached: false, results: Object.keys(PAGES).concat('https://www.kariyer.net/ilan/1').map((url) => ({ url, title: '', snippet: '' })) };
    },
  };
}
const fakeReadPage = async (hit) => ({ url: hit.url, host: new URL(hit.url).hostname.replace(/^www\./, ''), ...PAGES[hit.url] });

function fakeGmail() {
  const sent = [];
  return {
    sent,
    authUrl: ({ state }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
    exchangeCode: async (code) => (code === 'good' ? { refreshToken: 'refresh-xyz', email: 'b@gmail.com', scopes: 'openid email https://www.googleapis.com/auth/gmail.send' } : { refreshToken: null, email: null, scopes: 'openid' }),
    accessToken: async (rt) => (rt === 'refresh-xyz' ? 'access-1' : Promise.reject(new Error('bad'))),
    send: async (token, mime) => { sent.push({ token, mime }); return { id: 'm1' }; },
    revoke: async () => {},
  };
}

let server, base, sb, gm, srch;
before(async () => {
  sb = fakeSupabase();
  gm = fakeGmail();
  srch = fakeSearch();
  const config = loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test', TOKEN_ENC_KEY: 'test-key', CRON_SECRET: SECRET, WORKER_LLM_GAP_MS: '0', APP_URL: 'https://hazircv.com.tr' });
  const app = createApp({ config, llm: createMockProvider(), logger: createLogger('silent'), supabase: sb, gmail: gm, search: srch, readPage: fakeReadPage });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api/v1/automation`;

  // Kurulumu tamamlanmış bir kullanıcı
  sb.db.profiles.push({ id: UID, email: 'b@x.com', full_name: 'Barış Deneme', mode: 'approval', daily_limit: 10, company_cooldown_days: 30, open_applications: true, status: 'setup', setup_step: 6, kvkk_accepted_at: new Date().toISOString() });
  sb.db.cvs.push({ id: 'cv-1', user_id: UID, label: 'Ana CV', storage_path: `${UID}/cv-1.pdf`, is_default: true, extracted_profile: { full_name: 'Barış Deneme', skills: ['SQL'] }, created_at: new Date().toISOString() });
  sb.db.targets.push({ user_id: UID, roles: ['İş Analisti'], excluded: [], cities: ['Ankara'], work_modes: ['remote', 'hybrid'], seniority: ['junior'], long_term_internship: true });
});
after(() => server.close());

const call = (path, { token = 'tok-b', method = 'GET', body, headers = {}, redirect } = {}) =>
  fetch(base + path, {
    method,
    redirect,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

// ---- Birim testleri --------------------------------------------------------------
test('sealer encrypts and decrypts; state is signed and expires', () => {
  const s = createSealer('k');
  const sealed = s.encrypt('refresh-token');
  assert.notEqual(sealed, 'refresh-token');
  assert.equal(s.decrypt(sealed), 'refresh-token');
  assert.throws(() => createSealer('other').decrypt(sealed));
  const st = s.sign({ uid: 'u' }, 1000, 0);
  assert.equal(s.verify(st, 10).uid, 'u');
  assert.equal(s.verify(st, 5000), null);
  assert.equal(s.verify(st.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), 10), null);
});

test('MIME message has encoded subject, UTF-8 body and an ASCII attachment name', () => {
  const mime = buildMime({ from: 'b@gmail.com', fromName: 'Barış', to: 'ik@atlas.com.tr', subject: 'İş Analisti Başvurusu', text: 'Merhaba,\nÖn yazı', attachment: { filename: 'Barış Deneme_CV.pdf', bytes: Buffer.from('%PDF') }, boundary: 'B' });
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /filename="Baris_Deneme_CV.pdf"/);
  assert.match(mime, /--B--/);
  assert.equal(encodeHeader('Plain'), 'Plain');
});

test('daily queries rotate and respect work modes', () => {
  const t = { roles: ['İş Analisti', 'Veri Analisti'], cities: ['Ankara'], workModes: ['onsite'], openApplications: false };
  const a = dailyQueries(t, { count: 3, day: new Date('2026-10-27') });
  const b = dailyQueries(t, { count: 3, day: new Date('2026-10-28') });
  assert.equal(a.length, 3);
  assert.ok(a.every((q) => q.includes('Ankara')));
  assert.notDeepEqual(a, b);
  assert.ok(dailyQueries({ ...t, workModes: ['remote'] }, { count: 2 }).every((q) => q.includes('uzaktan')));
});

test('address safety rules', () => {
  assert.deepEqual(validEmails(['noreply@firma.com', 'ik@firma.com.tr', 'info@uni.edu.tr', 'a@kariyer.net', 'satis@firma.com']), ['ik@firma.com.tr']);
  assert.deepEqual(emailsIn('<a href="mailto:hr@acme.com">x</a> kariyer [at] acme [dot] com').sort(), ['hr@acme.com', 'kariyer@acme.com']);
  assert.equal(rootName('www.firma.com.tr'), 'firma');
  assert.equal(isPublicUrl('http://169.254.169.254/latest'), false);
  assert.equal(isPublicUrl('http://localhost:3000'), false);
  assert.equal(isPublicUrl('https://firma.com.tr/kariyer'), true);
  assert.equal(shouldSkip('https://www.linkedin.com/jobs/1'), true);
});

test('verdict checks reject unsafe or weak results', () => {
  const page = { url: 'https://acme.com/kariyer', host: 'acme.com', title: '', snippet: '', text: 'Ekibimize katılın', emails: ['ik@acme.com'] };
  const ok = { kind: 'open_application', email: 'ik@acme.com', score: 80, in_turkey: true, real_company: true, career_product: false, position: 'İş Analisti', subject: '' };
  assert.equal(checkVerdict(ok, page).kind, 'open_application');
  assert.equal(checkVerdict({ ...ok, email: 'ceo@acme.com' }, page).kind, 'irrelevant');
  assert.equal(checkVerdict({ ...ok, in_turkey: false }, page).kind, 'irrelevant');
  assert.equal(checkVerdict({ ...ok, score: 50 }, page).kind, 'low_score');
  assert.equal(checkVerdict(ok, { ...page, text: 'Hakkımızda' }).kind, 'irrelevant');
  assert.equal(checkVerdict({ ...ok, position: 'Satış Temsilcisi' }, page, ['satış']).kind, 'irrelevant');
  assert.match(fixLetter('Merhaba, metin', 'Ayşe Y'), /Saygılarımla,\nAyşe Y$/);
});

// ---- HTTP uçları ------------------------------------------------------------------
test('internal endpoints require the cron secret', async () => {
  assert.equal((await call('/internal/users', { token: null, method: 'POST' })).status, 404);
  const r = await call('/internal/users', { token: null, method: 'POST', headers: { 'x-cron-secret': SECRET } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).users, [UID]);
});

test('worker drafts approval-pending applications and runs once per day', async () => {
  const r = await call(`/internal/run/${UID}`, { token: null, method: 'POST', headers: { 'x-cron-secret': SECRET } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.status, 'ok');
  assert.equal(j.drafted, 1); // Atlas ilanı; Kuzey Kimya alakasız, Nova adressiz, kariyer.net atlanır
  const app = sb.db.applications[0];
  assert.equal(app.status, 'pending_approval');
  assert.equal(app.recipient, 'ik@atlas.com.tr');
  assert.equal(app.company_key, 'atlas');
  assert.match(app.cover_letter, /Saygılarımla,\nBarış Deneme$/);
  assert.equal(sb.db.discoveries.length, 2);
  assert.equal(sb.db.inbox_items.at(-1).kind, 'needs_approval');
  assert.equal(sb.db.run_logs.length, 1);
  assert.ok(sb.db.run_logs[0].finished_at);

  const again = await (await call(`/internal/run/${UID}`, { token: null, method: 'POST', headers: { 'x-cron-secret': SECRET } })).json();
  assert.equal(again.reason, 'already_ran_today');
});

test('lists pending applications and allows editing', async () => {
  const list = await (await call('/applications?status=pending_approval')).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].cv_label, 'Ana CV');
  const id = list.items[0].id;
  const r = await call(`/applications/${id}`, { method: 'PATCH', body: { subject: 'Yeni konu' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).application.subject, 'Yeni konu');
  assert.equal((await call(`/applications/${id}`, { method: 'PATCH', body: { status: 'sent' } })).status, 400);
});

test('sending requires a Gmail connection', async () => {
  const id = sb.db.applications[0].id;
  const r = await call(`/applications/${id}/send`, { method: 'POST' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, 'GMAIL_NOT_CONNECTED');
});

test('Gmail connect → callback stores an encrypted refresh token', async () => {
  const st = await (await call('/gmail')).json();
  assert.equal(st.available, true);
  assert.equal(st.connected, false);
  const { url } = await (await call('/gmail/connect', { method: 'POST' })).json();
  const state = new URL(url).searchParams.get('state');

  const bad = await call(`/gmail/callback?code=good&state=tampered`, { token: null, redirect: 'manual' });
  assert.match(bad.headers.get('location'), /gmail=expired/);
  const noScope = await call(`/gmail/callback?code=nope&state=${encodeURIComponent(state)}`, { token: null, redirect: 'manual' });
  assert.match(noScope.headers.get('location'), /gmail=scope/);

  const ok = await call(`/gmail/callback?code=good&state=${encodeURIComponent(state)}`, { token: null, redirect: 'manual' });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), 'https://hazircv.com.tr/otomasyon?gmail=ok');
  const conn = sb.db.gmail_connections[0];
  assert.equal(conn.google_email, 'b@gmail.com');
  assert.ok(!conn.refresh_token_enc.includes('refresh-xyz'));
  const now = await (await call('/gmail')).json();
  assert.equal(now.connected, true);
  assert.equal(now.email, 'b@gmail.com');
});

test('approved application is sent from the user Gmail with the CV attached', async () => {
  const id = sb.db.applications[0].id;
  const r = await call(`/applications/${id}/send`, { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).application.status, 'sent');
  assert.equal(gm.sent.length, 1);
  assert.match(gm.sent[0].mime, /To: ik@atlas.com.tr/);
  assert.match(gm.sent[0].mime, /application\/pdf/);
  assert.equal((await call(`/applications/${id}/send`, { method: 'POST' })).status, 400); // ikinci kez gönderilmez
  assert.equal(sb.db.inbox_items.at(-1).kind, 'sent');
});

test('disconnecting Gmail removes the stored token', async () => {
  const r = await call('/gmail', { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(sb.db.gmail_connections.length, 0);
});
