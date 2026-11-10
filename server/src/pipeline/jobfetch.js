// İlan bağlantısından ilan metnini getirir (CV aracındaki "bağlantıdan getir").
// Yalnızca herkese açık http(s) adresleri; her yönlendirme adımı ayrıca denetlenir.
import { isPublicUrl, htmlToText, hostOf } from '../automation/pages.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_TEXT = 15_000;

/** linkedin.com/jobs/view/…-123 veya ?currentJobId=123 → misafir ilan uç noktası. */
export function linkedinGuestUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1] || u.searchParams.get('currentJobId');
  return id && /^\d{6,}$/.test(id) ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}` : null;
}

function* jsonLdNodes(html) {
  for (const m of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) stack.push(...n);
      else if (n && typeof n === 'object') {
        yield n;
        if (n['@graph']) stack.push(n['@graph']);
      }
    }
  }
}

const clip = (t) => String(t || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
const tagText = (html, re) => {
  const m = String(html).match(re);
  return m ? htmlToText(m[1]).replace(/\s+/g, ' ').trim() : '';
};

/** HTML'den başlık, şirket ve ilan metnini çıkarır. Önce JobPosting verisi, sonra LinkedIn kartı, en son sayfanın tamamı. */
export function parseJobPage(html, { source = '' } = {}) {
  for (const n of jsonLdNodes(html)) {
    const type = [].concat(n['@type'] || []);
    if (!type.includes('JobPosting') || !n.description) continue;
    const org = n.hiringOrganization;
    const desc = htmlToText(String(n.description).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    const title = htmlToText(n.title || '');
    const company = htmlToText((typeof org === 'string' ? org : org?.name) || '');
    return { title, company, text: clip([title, company, desc].filter(Boolean).join('\n\n')) };
  }
  if (source === 'linkedin') {
    const title = tagText(html, /<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/i);
    const company = tagText(html, /<a[^>]*topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/i);
    const desc = String(html).match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const criteria = [...String(html).matchAll(/description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((m) => `${htmlToText(m[1]).trim()}: ${htmlToText(m[2]).trim()}`)
      .join('\n');
    if (desc) return { title, company, text: clip([title, company, htmlToText(desc), criteria].filter(Boolean).join('\n\n')) };
  }
  const title = tagText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const body = String(html).match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  return { title, company: '', text: clip(htmlToText(body.replace(/<(header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, ' '))) };
}

export function createJobFetcher({ fetchImpl = fetch, timeoutMs = 12_000, maxBytes = 2_000_000 } = {}) {
  /** @returns {Promise<{ ok: boolean, title?: string, company?: string, text?: string, source?: string, reason?: string }>} */
  return async function fetchJob(url) {
    if (!isPublicUrl(url)) return { ok: false, reason: 'invalid_url' };
    const guest = linkedinGuestUrl(url);
    const source = guest ? 'linkedin' : hostOf(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let current = guest || url;
      for (let hop = 0; hop < 5; hop++) {
        if (!isPublicUrl(current)) return { ok: false, reason: 'blocked_redirect' };
        const res = await fetchImpl(current, {
          headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8', Accept: 'text/html,application/xhtml+xml' },
          redirect: 'manual',
          signal: ctrl.signal,
        });
        const location = res.headers?.get?.('location');
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).toString();
          continue;
        }
        if (res.status === 404 || res.status === 410) return { ok: false, reason: 'not_found' };
        const type = res.headers?.get?.('content-type') || 'text/html';
        if (!res.ok || !type.includes('html')) return { ok: false, reason: 'unreadable' };
        const html = (await res.text()).slice(0, maxBytes);
        const job = parseJobPage(html, { source });
        if (job.text.length < 150) return { ok: false, reason: 'too_short' };
        return { ok: true, source, ...job };
      }
      return { ok: false, reason: 'too_many_redirects' };
    } catch {
      return { ok: false, reason: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  };
}
