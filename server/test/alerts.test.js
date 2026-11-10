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
import { buildSummary, sendDailySummary, summaryHeadline } from '../src/automation/summary.js';
import { judgeListing, checkUrlFor, createListingChecker, refreshListings, parseTrDate, extractWorkInfo, mergeLocation } from '../src/automation/liveness.js';

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
        if (k === 'or' && v === '(status.is.null,status.neq.closed)') return r.status == null || r.status !== 'closed';
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
    remove: async (t, q) => { const hit = where(db[t], q); db[t] = db[t].filter((r) => !hit.includes(r)); return hit; },
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
// Ağa çıkmayan sahte kontrol: 4099999999 kapanmış, diğerleri açık.
const checked = [];
const fakeChecker = async (url) => { checked.push(url); return /4099999999/.test(url) ? { status: 'closed', reason: 'başvuruya kapandı' } : { status: 'open', reason: 'başvuru alıyor' }; };
before(async () => {
  sb = fakeSupabase();
  mailer = fakeMailer(RECEIVED);
  const config = loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test', CRON_SECRET: SECRET, RESEND_WEBHOOK_SECRET: WHSEC, APP_URL: 'https://hazircv.com.tr' });
  const app = createApp({ config, llm: createMockProvider(), logger: createLogger('silent'), supabase: sb, mailer, checkListing: fakeChecker });
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
  const m = buildSummary({ name: 'Ceren Deneme', appUrl: 'https://hazircv.com.tr', stats: { searches: 4, pages: 12, drafted: 1 }, pending: [{ company: 'Atlas <b>', position: 'İş Analisti', score: 82 }], alerts: [{ title: 'Veri Analisti', company: 'Nova', score: 75, url: 'https://www.linkedin.com/jobs/view/1/', source: 'linkedin' }] });
  assert.equal(m.subject, 'Ceren, 1 başvurun onay bekliyor, 1 yeni ilan da sana çok uygun');
  assert.match(m.preview, /^Atlas <b> · İş Analisti için ön yazın hazır/);
  assert.match(m.html, /display:none[^>]*>Atlas &lt;b&gt; · İş Analisti için ön yazın hazır/); // bildirimde görünen ön izleme
  assert.match(m.text, /Merhaba Ceren,/);
  assert.match(m.text, /Bugün senin için 4 arama yaptım, 12 şirket sayfasını inceledim ve 1 başvuru hazırladım\./);
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

  // Kullanıcı bir ilanı kaldırabilir (yalnızca kendi ilanını)
  const del = await fetch(`${base}/alerts/${sales.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer tok' } });
  assert.equal(del.status, 200);
  assert.equal(sb.db.alert_jobs.length, 1);
  sb.db.alert_jobs.push({ ...sales }); // sonraki testler için geri koy
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
  assert.equal(r1.alerts, 2); // hepsi listelenir: uygun olanlar üstte, diğerleri ayrı başlıkta
  const mail = mailer.sent.at(-1);
  assert.equal(mail.to, 'c@x.com');
  assert.match(mail.text, /İş Analisti – Atlas Yazılım \(80 puan\)/);
  assert.match(mail.text, /DİĞER İLANLAR \(puanı düşük kalanlar\)\n• Satış Temsilcisi – Kuzey A\.Ş\. \(30 puan\)/);
  assert.ok(mail.text.indexOf('İş Analisti') < mail.text.indexOf('Satış Temsilcisi'));
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now })).reason, 'already_sent');
  // Aynı gün sonraki tarama: yeni taslak yoksa ikinci e-posta gitmez, yeni taslak varsa gider.
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now, stats: { searches: 6, drafted: 0 } })).reason, 'already_sent');
  const extra = await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now, stats: { searches: 6, pages: 2, drafted: 1 } });
  assert.equal(extra.sent, true);
  assert.equal(extra.alerts, 0); // ilk özette listelenen ilanlar tekrar gelmez

  // Ertesi gün yeni bir şey yok: elle çağrıda gitmez, zamanlanmış taramadan sonra kısa özet gider.
  const tomorrow = new Date(now.getTime() + 30 * 3600 * 1000);
  sb.db.applications = sb.db.applications.filter((a) => a.id !== 'a1');
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now: tomorrow })).reason, 'nothing_new');
  const quiet = await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now: tomorrow, stats: { searches: 6, pages: 3, drafted: 0 } });
  assert.equal(quiet.sent, true);
  assert.match(mailer.sent.at(-1).subject, /bugün sana uygun yeni ilan çıkmadı$/i);
  assert.match(mailer.sent.at(-1).text, /6 arama yaptım, 3 şirket sayfasını/);

  sb.db.inbox_items = sb.db.inbox_items.filter((i) => i.kind !== 'daily_summary');
  sb.db.profiles[0].daily_summary = false;
  assert.equal((await sendDailySummary({ supabase: sb, mailer, config: cfg, userId: UID, now })).reason, 'disabled');
  sb.db.profiles[0].daily_summary = true;
  assert.equal((await sendDailySummary({ supabase: sb, mailer: null, config: cfg, userId: UID, now })).reason, 'no_mailer');

  const r = await fetch(`${base}/me`, { method: 'PATCH', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_summary: false }) });
  assert.equal(r.status, 200);
  assert.equal(sb.db.profiles[0].daily_summary, false);
});


// ---- İlan hâlâ başvuru alıyor mu? -------------------------------------------------
const NOW = new Date('2026-11-09T12:00:00Z');
const KARIYER_OPEN = `<html><head><title>İş Analisti İş İlanı</title></head><body>${'x'.repeat(600)} <div class="job-detail">İş Analisti</div><button>İlana Başvur</button><script>var d={closingDate:"30.11.2026"}</script></body></html>`;
const KARIYER_CLOSED = `<html><body>${'x'.repeat(600)} <div class="warning">Bu ilan başvuruları artık kabul etmiyor.</div> Hemen ilanlara başvur!</body></html>`;
const KARIYER_EXPIRED = `<html><body>${'x'.repeat(600)} İş İlanı <button>İlana Başvur</button> closingDate:31.10.2026</body></html>`;
const LI_OPEN = `<section class="top-card-layout">${'x'.repeat(600)}<div class="show-more-less-html">Açıklama</div><button>Apply</button></section>`;
const LI_CLOSED = `<section class="top-card-layout">${'x'.repeat(600)}<figure class="closed-job"><span>No longer accepting applications</span></figure></section>`;

test('listing status: Kariyer.net and LinkedIn pages are classified, unsure cases stay unknown', () => {
  const k = (html, extra = {}) => judgeListing({ source: 'kariyer', status: 200, finalUrl: 'https://www.kariyer.net/is-ilani/x-1', html, now: NOW, ...extra }).status;
  assert.equal(k(KARIYER_OPEN), 'open');
  assert.equal(k(KARIYER_CLOSED), 'closed');
  assert.equal(k(KARIYER_EXPIRED), 'closed'); // son başvuru tarihi geçmiş
  assert.equal(k(KARIYER_OPEN, { finalUrl: 'https://www.kariyer.net/is-ilanlari' }), 'closed'); // ilan yerine aramaya yönlendirildi
  assert.equal(k('', { status: 404 }), 'closed');
  assert.equal(k('', { status: 429 }), 'unknown');
  assert.equal(k('<html>kısa</html>'), 'unknown');
  const l = (html, extra = {}) => judgeListing({ source: 'linkedin', status: 200, finalUrl: 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1', html, now: NOW, ...extra }).status;
  assert.equal(l(LI_OPEN), 'open');
  assert.equal(l(LI_CLOSED), 'closed');
  assert.equal(l('', { status: 999 }), 'unknown'); // LinkedIn engeli: kapandı denmez
  assert.equal(l(LI_OPEN, { finalUrl: 'https://www.linkedin.com/authwall?x' }), 'unknown');
  assert.equal(parseTrDate('31.10.2026').toISOString(), '2026-10-31T20:59:59.000Z');
  assert.equal(parseTrDate('bozuk'), null);
});

test('listing checker: guest URL for LinkedIn, follows redirects only on the two sites', async () => {
  assert.deepEqual(checkUrlFor('https://www.linkedin.com/comm/jobs/view/4012345678/?trk=1'), { source: 'linkedin', url: 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4012345678' });
  assert.equal(checkUrlFor('https://example.com/job'), null);
  const asked = [];
  const pages = {
    'https://www.kariyer.net/is-ilani/analist-1': { status: 301, location: '/is-ilanlari' },
    'https://www.kariyer.net/is-ilanlari': { status: 200, body: KARIYER_OPEN },
    'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4012345678': { status: 200, body: LI_CLOSED },
    'https://www.kariyer.net/is-ilani/kacak-2': { status: 302, location: 'https://evil.example.com/x' },
  };
  const fetchImpl = async (url) => {
    asked.push(url);
    const p = pages[url] || { status: 404 };
    return { status: p.status, headers: { get: (h) => (h === 'location' ? p.location || null : null) }, text: async () => p.body || '' };
  };
  const check = createListingChecker({ fetchImpl });
  assert.equal((await check('https://www.kariyer.net/is-ilani/analist-1', NOW)).status, 'closed');
  assert.equal((await check('https://www.linkedin.com/jobs/view/4012345678/', NOW)).status, 'closed');
  assert.equal((await check('https://www.kariyer.net/is-ilani/kacak-2', NOW)).status, 'unknown');
  assert.ok(!asked.some((u) => u.includes('evil.example.com')));
  assert.equal((await check('https://example.com/job', NOW)).reason, 'desteklenmeyen kaynak');
  const failing = createListingChecker({ fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal((await failing('https://www.kariyer.net/is-ilani/x-1', NOW)).status, 'unknown');
});

test('closed listings: refreshed in the background, marked in İlanlar, left out of the summary', async () => {
  const fresh = new Date();
  sb.db.alert_jobs = sb.db.alert_jobs.filter((j) => j.user_id !== UID);
  sb.db.inbox_items = sb.db.inbox_items.filter((i) => i.kind !== 'daily_summary');
  sb.db.applications = [];
  sb.db.profiles[0].daily_summary = true;
  sb.db.alert_jobs.push(
    { id: randomUUID(), user_id: UID, source: 'linkedin', title: 'İş Analisti', url: 'https://www.linkedin.com/jobs/view/4012345678/', score: 80, received_at: fresh.toISOString() },
    { id: randomUUID(), user_id: UID, source: 'linkedin', title: 'Satış Temsilcisi', url: 'https://www.linkedin.com/jobs/view/4099999999/', score: 70, received_at: fresh.toISOString() },
    { id: randomUUID(), user_id: UID, source: 'kariyer', title: 'Eski', url: 'https://www.kariyer.net/is-ilani/eski-1', score: 60, received_at: '2026-01-01T00:00:00.000Z' },
  );
  checked.length = 0;
  const r = await fetch(`${base}/alerts/check`, { method: 'POST', headers: { Authorization: 'Bearer tok' } });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.checked, 2); // 45 günden eski ilan kontrol edilmez
  assert.equal(data.closed, 1);
  assert.equal(data.items.find((j) => j.title === 'Satış Temsilcisi').status, 'closed');
  assert.equal(data.items.find((j) => j.title === 'İş Analisti').status, 'open');

  // Dakikada bir kontrol; hemen tekrar çağrılırsa yalnızca liste döner.
  const again = await (await fetch(`${base}/alerts/check`, { method: 'POST', headers: { Authorization: 'Bearer tok' } })).json();
  assert.equal(again.skipped, 'throttled');
  // 12 saat geçmeden aynı ilan tekrar kontrol edilmez; kapanmış ilan hiç tekrar edilmez.
  const r2 = await refreshListings({ supabase: sb, checkListing: fakeChecker, userId: UID, now: new Date(fresh.getTime() + 3600_000), workInfoSince: '2000-01-01' });
  assert.equal(r2.checked, 0);
  const r3 = await refreshListings({ supabase: sb, checkListing: fakeChecker, userId: UID, now: new Date(fresh.getTime() + 13 * 3600_000), workInfoSince: '2000-01-01' });
  assert.equal(r3.checked, 1);

  const mail = await sendDailySummary({ supabase: sb, mailer, config: { APP_URL: 'https://hazircv.com.tr' }, userId: UID, now: fresh, stats: { searches: 1, drafted: 0 } });
  assert.equal(mail.sent, true);
  assert.equal(mail.alerts, 1);
  assert.doesNotMatch(mailer.sent.at(-1).text, /Satış Temsilcisi/);

  // Kurulum rehberi bilgileri: onay bağlantısı ve son alarm zamanı.
  const list = await (await fetch(`${base}/alerts`, { headers: { Authorization: 'Bearer tok' } })).json();
  assert.ok(list.setup);
  assert.match(list.setup.confirmUrl || '', /mail-settings\.google\.com/);
  assert.ok(list.setup.lastAlertAt);
  assert.ok(Array.isArray(list.setup.roles));
});

test('summary subject greets by first name and names the best match', () => {
  const good = [{ title: 'Junior Software Engineer', company: 'Insider One', score: 95 }, { title: 'CRM Analyst', company: 'Trendyol', score: 90 }, { title: 'İş Analisti', company: 'AloTech', score: 88 }, { title: 'Analist', company: 'Nova', score: 70 }];
  const h = summaryHeadline({ name: 'Barış Ceylan', pending: [], good, rest: [] });
  assert.equal(h.subject, 'Barış, sana uygun 4 yeni ilan buldum, en iyisi Insider One (95 puan) 🎯');
  assert.equal(h.preview, 'En uygunu: Junior Software Engineer – Insider One (95 puan). Ayrıca Trendyol, AloTech ve dahası.');
  assert.equal(summaryHeadline({ name: '', pending: [], good: [], rest: [] }).subject, 'Bugün sana uygun yeni ilan çıkmadı');
  assert.equal(summaryHeadline({ name: 'Ali', pending: [], good: [], rest: [{ title: 'x', score: 10 }] }).subject, 'Ali, 1 yeni ilan geldi, ama hiçbiri tam sana göre değil');
  assert.equal(summaryHeadline({ name: 'Ali', pending: [{ company: 'Atlas', position: 'Analist' }], good: [], rest: [] }).subject, 'Ali, 1 başvurun hazır, göndermek için onayını bekliyor');
});

test('work mode is read from the listing page when the alert e-mail lacks it', () => {
  const li = '<span class="topcard__flavor topcard__flavor--bullet"> İstanbul, Türkiye </span><div class="show-more-less-html__markup"><p>Lokasyon: Şişli, İstanbul</p><p>**Çalışma Model Ofisten</p></div>';
  assert.deepEqual(extractWorkInfo({ source: 'linkedin', html: li }), { mode: 'onsite', city: 'İstanbul' });
  assert.equal(extractWorkInfo({ source: 'linkedin', html: '<span class="topcard__flavor--bullet">Ankara (Hybrid)</span>' }).mode, 'hybrid');
  assert.equal(extractWorkInfo({ source: 'linkedin', html: '<div class="show-more-less-html__markup">tamamen uzaktan ve hibrit çalışma</div>' }).mode, null); // çelişkili → belirtilmemiş
  assert.equal(extractWorkInfo({ source: 'kariyer', html: 'workmodeltext="İş Yerinde" … benzer: workmodeltext="Hibrit"' }).mode, 'onsite');
  assert.equal(mergeLocation('İstanbul', { mode: 'onsite' }), 'İstanbul (Ofiste)');
  assert.equal(mergeLocation('İstanbul (Hibrit)', { mode: 'onsite' }), 'İstanbul (Hibrit)'); // e-postadaki bilgi korunur
  assert.equal(mergeLocation('', { mode: 'remote', city: 'İzmir' }), 'İzmir (Uzaktan)');
  assert.equal(mergeLocation(null, {}), null);
});
