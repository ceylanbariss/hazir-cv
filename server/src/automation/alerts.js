// Yönlendirilen iş alarmları: kullanıcı LinkedIn / Kariyer.net alarm e-postalarını
// <alert_code>@alarm.hazircv.com.tr adresine yönlendirir. Buradaki ilanlar ayrıştırılır,
// CV'ye göre puanlanır ve "İlanlar" sekmesinde listelenir. Bu sitelere asla otomatik
// başvuru yapılmaz; kullanıcı ilana kendisi gider.
import { runTask } from '../llm/runTask.js';
import * as P from './prompts.js';

const enc = encodeURIComponent;
const MAX_JOBS_PER_MAIL = 25;

export const SOURCE_LABEL = { linkedin: 'LinkedIn', kariyer: 'Kariyer.net', other: 'İş alarmı' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·', bull: '•' };
export const decodeEntities = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Minimal HTML → text for e-mail bodies. */
export function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h\d|table|td)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const clean = (s) => htmlToText(s).replace(/\s+/g, ' ').trim();

/** Stable, tracking-free listing URL for the sources we know; null for anything else. */
export function canonicalJobUrl(href) {
  const url = decodeEntities(href);
  const li = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/i);
  if (li) return `https://www.linkedin.com/jobs/view/${li[1]}/`;
  const kn = url.match(/kariyer\.net\/is-ilani\/([a-z0-9-]+)/i);
  if (kn) return `https://www.kariyer.net/is-ilani/${kn[1].toLowerCase()}`;
  return null;
}

const NAV_TEXT = /^(görüntüle|ilanı gör|ilana git|tümünü gör|daha fazla|view( job)?|see (all|more)( jobs)?|apply|başvur|hemen başvur|abonelikten çık|unsubscribe|ayarlar|settings|yardım|help|linkedin|kariyer\.net)$/i;

export function detectSource(from = '') {
  const f = String(from).toLowerCase();
  if (f.includes('forwarding-noreply@google.com')) return 'confirm';
  if (f.includes('linkedin.com')) return 'linkedin';
  if (f.includes('kariyer.net')) return 'kariyer';
  return 'other';
}

/** Gmail's "confirm forwarding" e-mail: code and the confirmation link. */
export function parseForwardingConfirmation({ subject = '', text = '', html = '' }) {
  const body = `${text}\n${htmlToText(html)}\n${html}`;
  const code = (String(subject).match(/\(#(\d{5,})\)/) || body.match(/(?:onay kodu|confirmation code)\s*:?\s*(\d{5,})/i) || [])[1] || null;
  const url = (decodeEntities(body).match(/https:\/\/(?:mail-settings|mail)\.google\.com\/mail\/[^\s"'<>]+/) || [])[0] || null;
  const owner = (String(subject).match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || null;
  return { code, url, owner };
}

/**
 * Job links of an alert e-mail: [{ url, title, context }].
 * Known sources (LinkedIn, Kariyer.net) are matched by URL pattern; the text right after the
 * link (company · location in most alerts) is kept as context for the scorer.
 */
export function extractJobs(html) {
  const src = String(html || '');
  const byUrl = new Map();
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const url = canonicalJobUrl(m[2]);
    if (!url) continue;
    const text = clean(m[3]);
    const after = clean(src.slice(re.lastIndex, re.lastIndex + 600)).slice(0, 160);
    const cur = byUrl.get(url) || { url, title: '', context: '' };
    const usable = text.length >= 3 && text.length <= 140 && !NAV_TEXT.test(text);
    if (usable && text.length > cur.title.length) {
      cur.title = text;
      cur.context = after;
    }
    byUrl.set(url, cur);
  }
  return [...byUrl.values()].filter((j) => j.title).slice(0, MAX_JOBS_PER_MAIL);
}

/** The user's alert code from any address the message was delivered to. */
export function findAlertCode(mail, domain) {
  const d = String(domain || '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!d) return null;
  const h = mail?.headers || {};
  const pool = [
    ...[].concat(mail?.to || [], mail?.received_for || [], mail?.cc || [], mail?.bcc || []),
    h['delivered-to'], h['Delivered-To'], h['x-forwarded-to'], h['X-Forwarded-To'], h.to, h.To,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const m = pool.match(new RegExp(`(?<![a-z0-9._%+-])([a-z0-9]{6,32})@${d}(?![a-z0-9-]|\\.[a-z0-9])`));
  return m ? m[1] : null;
}

/**
 * Handles one received e-mail end to end. Never throws for content problems; returns a
 * { status, ... } summary for logging.
 */
export async function handleInboundEmail({ supabase, mailer, llm, budget, log, config, emailId, now = new Date() }) {
  const mail = await mailer.getReceived(emailId);
  const code = findAlertCode(mail, config.ALERT_DOMAIN);
  if (!code) return { status: 'ignored', reason: 'no_alert_code' };
  const [profile] = await supabase.select('profiles', `alert_code=eq.${enc(code)}&select=id,full_name`);
  if (!profile) return { status: 'ignored', reason: 'unknown_code' };
  const userId = profile.id;
  const source = detectSource(mail.from);

  if (source === 'confirm') {
    const c = parseForwardingConfirmation(mail);
    await supabase.insert('inbox_items', [
      {
        user_id: userId,
        kind: 'system',
        title: 'Gmail yönlendirme onayı geldi',
        body:
          `Gmail, iş alarmlarını Hazır CV'ye yönlendirmek için onay istiyor.${c.code ? ` Onay kodu: ${c.code}.` : ''} ` +
          (c.url ? `Onaylamak için bu bağlantıyı aç: ${c.url}` : 'Gmail ayarlarındaki Yönlendirme bölümüne bu kodu gir.'),
        data: { code: c.code, url: c.url },
      },
    ]);
    return { status: 'ok', kind: 'confirm' };
  }

  const jobs = extractJobs(mail.html || '');
  if (!jobs.length) return { status: 'ignored', reason: 'no_jobs', source };

  const known = new Set(
    (await supabase.select('alert_jobs', `user_id=eq.${enc(userId)}&url=in.(${jobs.map((j) => enc(`"${j.url}"`)).join(',')})&select=url`)).map((r) => r.url),
  );
  const fresh = jobs.filter((j) => !known.has(j.url));
  if (!fresh.length) return { status: 'ok', kind: 'jobs', added: 0, source };

  const scored = fresh.map((j) => ({ ...j, company: null, location: null, score: null, reason: null }));
  try {
    const [targets] = await supabase.select('targets', `user_id=eq.${enc(userId)}&select=roles,excluded,cities,work_modes,seniority`);
    const cvs = await supabase.select('cvs', `user_id=eq.${enc(userId)}&select=is_default,extracted_profile&order=created_at.asc`);
    const main = cvs.find((c) => c.is_default) || cvs[0];
    if (targets && main?.extracted_profile && llm) {
      const { source_text: _s, pending: _p, ...cvProfile } = main.extracted_profile;
      const v = await runTask({ llm, budget, log, trace: [] }, P.scoreAlertJobs({ profile: cvProfile, targets, jobs: fresh }));
      for (const it of v.items) {
        const row = scored[it.i];
        if (!row) continue;
        Object.assign(row, { company: it.company || null, location: it.location || null, score: it.score, reason: it.reason || null });
      }
    }
  } catch (err) {
    log?.warn('alert_score_failed', { userId, code: err.code, error: err.message });
  }

  const rows = scored.map((j) => ({
    user_id: userId,
    source,
    title: j.title.slice(0, 200),
    company: j.company?.slice(0, 120) || null,
    location: j.location?.slice(0, 80) || null,
    url: j.url,
    score: j.score,
    reason: j.reason?.slice(0, 300) || null,
    received_at: now.toISOString(),
  }));
  await supabase.insert('alert_jobs', rows, { upsert: true, onConflict: 'user_id,url' });

  const best = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 3);
  await supabase.insert('inbox_items', [
    {
      user_id: userId,
      kind: 'alert_jobs',
      title: `${rows.length} yeni ilan · ${SOURCE_LABEL[source]}`,
      body: best.map((r) => `${r.title}${r.company ? ` – ${r.company}` : ''}${r.score != null ? ` (${r.score} puan)` : ''}`).join(' · ') + '. Hepsi "İlanlar" sekmesinde.',
      data: { count: rows.length, source },
    },
  ]);
  return { status: 'ok', kind: 'jobs', added: rows.length, source };
}
