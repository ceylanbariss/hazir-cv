// Yönlendirilen iş alarmları ve günlük özet e-postası — sahte Supabase, sahte Resend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/lib/logger.js';
import { createMockProvider } from '../src/llm/mock.js';
import { createApp } from '../src/app.js';
import { canonicalJobUrl, extractJobs, parseForwardingConfirmation, findAlertCode, detectSource, htmlToText, handleInboundEmail } from '../src/automation/alerts.js';
import { verifySvix } from '../src/automation/mailer.js';
import { buildSummary, sendDailySummary } from '../src/automation/summary.js';

const UID = '33333333-3333-4333-8333-333333333333';
const CODE = 'abc123def4';
const DOMAIN = 'alarm.hazircv.com.tr';
const SECRET = 'cron-secret-xyz';
const WHSEC = `whsec_${Buffer.from('webhook-key-0123456789').toString('base64')}`;

function fakeSupabase() {
  const db = { profiles: [], inbox_items: [], cvs: [], targets: [], applications: [], alert_jobs: [], run_logs: [], gmail_connections: [], discoveries: [] };
  const val = (s) => decodeURIComponent(s);
  const where = (rows, q) => {
    const p = new URLSearchParams(q.replace(/\+/g, '%2B'));
    return rows.filter((r) =>
      [...p.entries()].every(([k, v]) => {
        if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
        if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
        if (v.startsWith('neq.')) return String(r[k]) !== v.slice(4);
        if (v.startsWith('gte.')) return typeof r[k] === 'number' ? r[k] >= Number(v.slice(4)) : r[k] != null && String(r[k]) >= v.slice(4);
        if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => val(x).replace(/^"|"$/g, '')).includes(r[k]);
        return true;
      }),
    );
  };
  const KEYS = { alert_jobs: ['user_id', 'url'], profiles: ['id'] };
  return {
    db,
    getUser: async (t) => (t === 'tok' ? { id: UID, email: 'c@x.com', user_metadata: {} } : null),
    select: async (t, q) => where(db[t], q).map((r) => ({ ...r })),
    insert: async (t, rows, { upsert } = {}) => {
      const out = rows.map((r) => ({ id: randomUUID(), read_at: null, created_at: new Date().toISOString(), ...r }));
      if (upsert && KEYS[t]) db[t] = db[t].filter((x) => !out.some((o) => KEYS[t].every((k) => o[k] === x[k])));
      db[t].push(...out);
      return out;
    },
    update: async (t, q, patch) => { const hit = where(db[t], q); hit.forEach((r) => Object.assign(r, patch)); return hit; },
    remove: async () => [],
  };
}

const LINKEDIN_HTML = `<html><body><table>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc&amp;refId=x"><img src="logo.png"></a></td>
<td><a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc">İş Analisti</a><p>Atlas Yazılım · İstanbul (Hibrit)</p></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4099999999/?x=1">Satış Temsilcisi</a><p>Kuzey A.Ş. · Ankara</p></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4099999999/">Görüntüle</a></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/search/?keywords=analist">Tümünü gör</a></td></tr>
</table></body></html>`;

function fakeMailer(received) {
  const sent = [];
  return { sent, from: 'Hazır CV <bildirim@hazircv.com.tr>', send: async (m) => { sent.push(m); return { id: 's1' }; }, getReceived: async (id) => received[id] };
}

const RECEIVED = {
  li: { id: 'li', from: 'LinkedIn İş Alarmları <jobalerts-noreply@linkedin.com>', to: ['c@gmail.com'], received_for: [`${CODE}@${DOMAIN}`], subject: '2 yeni iş', html: LINKEDIN_HTML, text: null, headers: {} },
  confirm: {
    id: 'confirm', from: 'Gmail Ekibi <forwarding-noreply@google.com>', to: [`${CODE}@${DOMAIN}`], received_for: [],
    subject: '(#728193645) Gmail Yönlendirme Onayı - c@gmail.com adresinden posta alma', text: 'Onaylamak için tıklayın:\nhttps://mail-settings.google.com/mail/vf-%5BABC%5D-xyz\nOnay kodu: 728193645', html: '', headers: {},
  },
  stranger: { id: 'stranger', from: 'x@y.com', to: ['someone@else.com'], received_for: [], subject: 'hi', html: LINKEDIN_HTML, headers: {} },
};

let server, base, sb, mailer;
before(async () => {
  sb = fakeSupabase();
  mailer = fakeMailer(RECEIVED);
  const config = loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test', CRON_SECRET: SECRET, RESEND_WEBHOOK_SECRET: WHSEC, APP_URL: 'https://hazircv.com.tr' });
  const app = createApp({ config, llm: createMockProvider(), logger: createLogger('silent'), supabase: sb, mailer });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api/v1/automation`;
  sb.db.profiles.push({ id: UID, email: 'c@x.com', full_name: 'Ceren Deneme', alert_code: CODE, setup_step: 6, status: 'active', kvkk_accepted_at: new Date().toISOString() });
  sb.db.cvs.push({ id: 'cv1', user_id: UID, is_default: true, extracted_profile: { full_name: 'Ceren Deneme', skills: ['SQL'] }, created_at: new Date().toISOString() });
  sb.db.targets.push({ user_id: UID, roles: ['İş Analisti'], excluded: ['satış'], cities: ['İstanbul'], work_modes: ['hybrid'], seniority: ['junior'] });
});
after(() => server.close());

const sign = (body, ts = Math.floor(Date.now() / 1000), id = 'msg_1') => {
  const sig = createHmac('sha256', Buffer.from(WHSEC.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` };
};
const hook = (emailId, headers) => {
  const body = JSON.stringify({ type: 'email.received', data: { email_id: emailId } });
  return fetch(`${base}/inbound/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || sign(body)) }, body });
};
const until = async (fn) => { for (let i = 0; i < 50; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } };

// ---- Birim testleri ------------------------------------------------------------------
test('job URLs are canonical and tracking-free', () => {
  assert.equal(canonicalJobUrl('https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc'), 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(canonicalJobUrl('https://tr.linkedin.com/jobs/view/is-analisti-at-atlas-4012345678?x=1'), 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(canonicalJobUrl('https://www.kariyer.net/is-ilani/atlas-is-analisti-3900123?utm=1'), 'https://www.kariyer.net/is-ilani/atlas-is-analisti-3900123');
  assert.equal(canonicalJobUrl('https://www.linkedin.com/comm/jobs/search/?keywords=a'), null);
});

test('alert e-mail yields one entry per job with title and context', () => {
  const jobs = extractJobs(LINKEDIN_HTML);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((j) => j.title), ['İş Analisti', 'Satış Temsilcisi']);
  assert.match(jobs[0].context, /Atlas Yazılım · İstanbul/);
  assert.equal(htmlToText('<p>a&amp;b</p><br>c&nbsp;d'), 'a&b\nc d');
});

test('Gmail forwarding confirmation: code, link and sender detection', () => {
  const c = parseForwardingConfirmation(RECEIVED.confirm);
  assert.equal(c.code, '728193645');
  assert.equal(c.url, 'https://mail-settings.google.com/mail/vf-%5BABC%5D-xyz');
  assert.equal(detectSource(RECEIVED.confirm.from), 'confirm');
  assert.equal(detectSource(RECEIVED.li.from), 'linkedin');
  assert.equal(detectSource('Kariyer.net <alarm@bildirim.kariyer.net>'), 'kariyer');
});

test('alert code is found in forwarded recipients only for our domain', () => {
  assert.equal(findAlertCode(RECEIVED.li, DOMAIN), CODE);
  assert.equal(findAlertCode({ headers: { 'X-Forwarded-To': `ABC123DEF4@${DOMAIN}` } }, DOMAIN), CODE);
  assert.equal(findAlertCode(RECEIVED.stranger, DOMAIN), null);
  assert.equal(findAlertCode({ to: [`${CODE}@alarm.hazircv.com.tr.evil.com`] }, DOMAIN), null);
});

test('svix signatures: valid, tampered, expired', () => {
  const body = '{"a":1}';
  const ts = 1_800_000_000;
  const h = sign(body, ts);
  const args = { id: h['svix-id'], timestamp: h['svix-timestamp'], signature: h['svix-signature'], secret: WHSEC, now: ts * 1000 };
  assert.equal(verifySvix({ ...args, body }), true);
  assert.equal(verifySvix({ ...args, body: '{"a":2}' }), false);
  assert.equal(verifySvix({ ...args, body, now: (ts + 3600) * 1000 }), false);
  assert.equal(verifySvix({ ...args, body, signature: `v1,AAAA ${h['svix-signature']}` }), true);
});

test('summary e-mail lists pending applications and alert jobs, HTML-escaped', () => {
  const m = buildSummary({ name: 'Ceren Deneme', appUrl: 'https://hazircv.com.tr', pending: [{ company: 'Atlas <b>', position: 'İş Analisti', score: 82 }], alerts: [{ title: 'Veri Analisti', company: 'Nova', score: 75, url: 'https://www.linkedin.com/jobs/view/1/', source: 'linkedin' }] });
  assert.equal(m.subject, 'Hazır CV · 1 başvuru onayını bekliyor, 1 yeni ilan');
  assert.match(m.text, /Merhaba Ceren,/);
  assert.match(m.text, /• Atlas <b> · İş Analisti \(82 puan\)/);
  assert.match(m.html, /Atlas &lt;b&gt;/);
  assert.doesNotMatch(m.html, /Atlas <b>/);
  assert.match(m.html, /https:\/\/hazircv\.com\.tr\/otomasyon/);
});

// ---- Uçtan uca ----------------------------------------------------------------------
test('inbound webhook rejects bad signatures and ignores other events', async () => {
  assert.equal((await hook('li', { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' })).status, 401);
  const body = JSON.stringify({ type: 'email.sent', data: {} });
  const r = await fetch(`${base}/inbound/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(body) }, body });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ignored, true);
  assert.equal(sb.db.alert_jobs.length, 0);
});

test('LinkedIn alert → scored jobs in İlanlar, inbox note, duplicates skipped', async () => {
  assert.equal((await hook('li')).status, 200);
  await until(() => sb.db.alert_jobs.length === 2 && sb.db.inbox_items.some((i) => i.kind === 'alert_jobs'));
  const [analyst, sales] = ['İş Analisti', 'Satış Temsilcisi'].map((t) => sb.db.alert_jobs.find((j) => j.title === t));
  assert.equal(analyst.url, 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(analyst.company, 'Atlas Yazılım');
  assert.equal(analyst.score, 80);
  assert.equal(sales.score, 30);
  assert.equal(analyst.source, 'linkedin');
  const note = sb.db.inbox_items.find((i) => i.kind === 'alert_jobs');
  assert.match(note.title, /2 yeni ilan · LinkedIn/);

  const again = await handleInboundEmail({ supabase: sb, mailer, llm: createMockProvider(), config: { ALERT_DOMAIN: DOMAIN }, emailId: 'li' });
  assert.equal(again.added, 0);
  assert.equal(sb.db.alert_jobs.length, 2);

  const r = await fetch(`${base}/alerts`, { headers: { Authorization: 'Bearer tok' } });
  const data = await r.json();
  assert.equal(data.address, `${CODE}@${DOMAIN}`);
  assert.equal(data.items.length, 2);
});

test('forwarding confirmation lands in the inbox with code and link; strangers are ignored', async () => {
  await hook('confirm');
  await until(() => sb.db.inbox_items.some((i) => i.title === 'Gmail yönlendirme onayı geldi'));
  const item = sb.db.inbox_items.find((i) => i.title === 'Gmail yönlendirme onayı geldi');
  assert.match(item.body, /Onay kodu: 728193645/);
  assert.match(item.body, /https:\/\/mail-settings\.google\.com\/mail\/vf-/);
  const r = await handleInboundEmail({ supabase: sb, mailer, config: { ALERT_DOMAIN: DOMAIN }, emailId: 'stranger' });
  assert.equal(r.reason, 'no_alert_code');
});

test('daily summary: sent once a day, only with news, respects the opt-out', async () => {
  const now = new Date();
  sb.db.applications.push({ id: 'a1', user_id: UID, company: 'Atlas', position: 'İş Analisti', score: 82, status: 'pending_approval', created_at: now.toISOString() });
  const cfg = { APP_URL: 'https://hazircv.com.tr' };
  const r1 = await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now });
  assert.equal(r1.sent, true);
  assert.equal(r1.pending, 1);
  assert.equal(r1.alerts, 1); // İş Analisti (80) geçer, Satış (30) eşiğin altında
  const mail = mailer.sent.at(-1);
  assert.equal(mail.to, 'c@x.com');
  assert.match(mail.text, /İş Analisti – Atlas Yazılım \(80 puan\)/);
  assert.doesNotMatch(mail.text, /Satış Temsilcisi/);
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now })).reason, 'already_sent');

  sb.db.inbox_items = sb.db.inbox_items.filter((i) => i.kind !== 'daily_summary');
  sb.db.profiles[0].daily_summary = false;
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now })).reason, 'disabled');
  sb.db.profiles[0].daily_summary = true;
  assert.equal((await sendDailySummary({ supabase: sb, mailer: null, config: cfg, userId: UID, now })).reason, 'no_mailer');

  const r = await fetch(`${base}/me`, { method: 'PATCH', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_summary: false }) });
  assert.equal(r.status, 200);
  assert.equal(sb.db.profiles[0].daily_summary, false);
});
