// Sayfa okuma ve adres güvenliği (kişisel başvuru botundan taşındı).
// Kural: başvuru yalnızca sayfada gerçekten geçen, şirkete ait görünen bir adrese gönderilir.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const BLOCKED_DOMAINS = [
  'kariyer.net', 'linkedin.com', 'indeed.com', 'secretcv.com', 'yenibiris.com', 'eleman.net', 'glassdoor.com',
  'example.com', 'example.org', 'domain.com', 'email.com', 'sentry.io', 'wixpress.com', 'w3.org', 'google.com',
  'googlemail.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'microsoft.com',
  'apple.com', 'cloudflare.com', 'godaddy.com',
];
const BLOCKED_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'abuse', 'privacy', 'kvkk',
  'gdpr', 'webmaster', 'hostmaster', 'support', 'destek', 'satis', 'sales', 'muhasebe', 'fatura', 'billing', 'press',
  'basin', 'pazarlama', 'marketing',
];
const HR_HINTS = ['ik', 'hr', 'kariyer', 'career', 'careers', 'insankaynaklari', 'jobs', 'job', 'cv', 'basvuru', 'recruit', 'recruitment', 'talent', 'isealim'];
export const JOB_SITES = ['kariyer.net', 'linkedin.com', 'indeed.com', 'secretcv.com', 'yenibiris.com', 'eleman.net', 'isbul.net', 'kariyerim.com', 'glassdoor.com', 'youthall.com', 'toptalent.co'];
const SKIP_SITES = [
  ...JOB_SITES, 'resume.io', 'translate.google', 'docs.google', 'wikipedia.org', 'youtube.com', 'facebook.com',
  'instagram.com', 'twitter.com', 'x.com', 'reddit.com', 'eksisozluk.com', 'sikayetvar.com', 'novoresume', 'zety.',
  'canva.com', 'hazircv.com.tr',
];
const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yandex.com', 'yandex.com.tr', 'icloud.com', 'live.com', 'hotmail.com.tr', 'outlook.com.tr']);
const HIRING_SIGNALS = [
  'ekibimize katıl', 'ekibimize katil', 'aramıza katıl', 'aramiza katil', 'bize katıl', 'açık pozisyon', 'acik pozisyon',
  'kariyer fırsat', 'kariyer firsat', 'iş fırsat', 'özgeçmişinizi', 'ozgecmisinizi', "cv'nizi", 'cv’nizi', 'cvnizi',
  'başvurunuzu', 'basvurunuzu', 'join our team', "we're hiring", 'we are hiring', 'open positions', 'careers at',
  'işe alım süreci', 'ise alim sureci',
];
const SUBPAGES = ['/kariyer', '/insan-kaynaklari', '/careers', '/iletisim', '/contact'];

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const GENERIC_TLD = new Set(['com', 'net', 'org', 'tr', 'io', 'ai', 'co', 'info', 'biz', 'online', 'tech', 'app', 'dev']);
/** firma.com.tr / www.firma.com → firma */
export function rootName(domain) {
  const parts = String(domain).toLowerCase().replace(/^www\./, '').split('.');
  while (parts.length > 1 && GENERIC_TLD.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] || domain;
}

/** Only plain public http(s) hostnames: no IP literals, localhost or internal names. */
export function isPublicUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.startsWith('[') || /^[\d.]+$/.test(h)) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(h);
}

export const shouldSkip = (url) => {
  const h = hostOf(url);
  return !h || !isPublicUrl(url) || SKIP_SITES.some((s) => h.includes(s)) || /\.(edu|gov|k12)(\.[a-z]{2})?$/.test(h);
};

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** "ik [at] firma [dot] com" → "ik@firma.com" */
export const unobfuscate = (t) =>
  String(t)
    .replace(/\s*[[({]\s*(at|@)\s*[\])}]\s*/gi, '@')
    .replace(/\s*[[({]\s*(dot|nokta)\s*[\])}]\s*/gi, '.');

const isHr = (addr) => {
  const local = addr.split('@')[0];
  const pieces = local.split(/[._-]/);
  return HR_HINTS.some((p) => pieces.includes(p) || local.startsWith(p));
};

export function validEmails(list) {
  const out = [];
  for (let a of list) {
    a = a.trim().replace(/^\.+|\.+$/g, '').toLowerCase();
    const [local, domain] = a.split('@');
    if (!domain || !local) continue;
    if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
    if (/\.(edu|gov|k12|bel|pol|tsk|mil|ac)(\.[a-z]{2})?$/.test(domain)) continue; // üniversite, kamu, okul
    if (BLOCKED_PREFIXES.some((p) => local.startsWith(p)) || /\.(png|jpe?g|gif|webp|svg)$/.test(a)) continue;
    if (local.length > 40 || /^[0-9a-f]{16,}$/.test(local)) continue;
    if (!out.includes(a)) out.push(a);
  }
  return out.sort((x, y) => (isHr(x) ? 0 : 1) - (isHr(y) ? 0 : 1));
}

export function emailsIn(html, extra = '') {
  const mailto = [...String(html).matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const text = html ? unobfuscate(htmlToText(html)) : '';
  return validEmails(unobfuscate(`${text}\n${extra}\n${mailto.join(' ')}`).match(EMAIL_RE) || []);
}

export const hasHiringSignal = (page) => {
  const t = `${page.title} ${page.snippet} ${page.text}`.toLowerCase();
  return HIRING_SIGNALS.some((s) => t.includes(s));
};

export function domainMatches(email, siteHost) {
  const d = email.split('@')[1]?.toLowerCase() || '';
  return FREE_MAIL.has(d) || rootName(d) === rootName(siteHost);
}

export function createPageReader({ fetchImpl = fetch, timeoutMs = 12_000, maxBytes = 1_500_000 } = {}) {
  async function get(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // Redirects are followed by hand so every hop is checked (no requests to internal addresses).
      let current = url;
      for (let hop = 0; hop < 4; hop++) {
        if (!isPublicUrl(current)) return '';
        const res = await fetchImpl(current, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' }, redirect: 'manual', signal: ctrl.signal });
        const location = res.headers?.get?.('location');
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).toString();
          continue;
        }
        const type = res.headers?.get?.('content-type') || 'text/html';
        if (!res.ok || !type.includes('html')) return '';
        return (await res.text()).slice(0, maxBytes);
      }
      return '';
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reads a search hit; falls back to the site's career/contact pages when the page has no address. */
  return async function readPage(hit) {
    const page = { url: hit.url, host: hostOf(hit.url), title: hit.title || '', snippet: hit.snippet || '', text: '', emails: [] };
    const html = await get(hit.url);
    page.text = html ? unobfuscate(htmlToText(html)) : '';
    page.emails = emailsIn(html, `${page.snippet}\n${page.title}`);
    if (!page.emails.length && !JOB_SITES.some((s) => page.host.includes(s))) {
      const origin = new URL(hit.url).origin;
      const found = [];
      for (const path of SUBPAGES) {
        const sub = await get(origin + path);
        if (!sub) continue;
        const e = emailsIn(sub);
        if (!e.length) continue;
        for (const a of e) if (!found.includes(a)) found.push(a);
        page.text += `\n\n[${path} sayfasından]\n${unobfuscate(htmlToText(sub)).slice(0, 2000)}`;
        if (isHr(e[0])) break;
      }
      page.emails = validEmails(found);
    }
    if (!page.text) page.text = page.snippet;
    return page;
  };
}
