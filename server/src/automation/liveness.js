// İlan hâlâ başvuru alıyor mu? LinkedIn ve Kariyer.net ilanları için hafif bir kontrol.
// Sonuç: 'open' | 'closed' | 'unknown'. Emin olunamayan her durumda (engelleme, zaman aşımı,
// beklenmeyen sayfa) 'unknown' döner; ilan yanlışlıkla "kapandı" diye işaretlenmez.
import { canonicalJobUrl } from './alerts.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const ALLOWED_HOSTS = /^(www\.|tr\.)?(linkedin\.com|kariyer\.net)$/i;

// Kapanmış ilanlarda sayfada geçen ifadeler (küçük harfe çevrilmiş metinde aranır).
const CLOSED_TEXT = {
  kariyer: ['başvuruları artık kabul etmiyor', 'yayından kaldırılmıştır', 'ilan yayında değil', 'süresi dolmuştur'],
  linkedin: ['closed-job', 'no longer accepting applications', 'artık başvuru kabul etmiyor', 'artık başvuru kabul edilmiyor', 'this job is no longer available'],
};
// Açık bir ilan sayfasında bulunan ve ilanın gerçekten yüklendiğini gösteren işaretler.
const OPEN_TEXT = {
  kariyer: ['iş ilanı', 'is-ilani', 'ilana başvur', 'başvur'],
  linkedin: ['top-card-layout', 'show-more-less-html', 'description__text', 'apply'],
};

/** "31.10.2020" → Date (gün sonu, Türkiye saati), geçersizse null. */
export function parseTrDate(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 20, 59, 59)); // 23:59 TR
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Sayfa içeriğinden karar verir (ağ yok, test edilebilir).
 * @returns {{ status: 'open'|'closed'|'unknown', reason: string }}
 */
export function judgeListing({ source, status, finalUrl = '', html = '', now = new Date() }) {
  if (status === 404 || status === 410) return { status: 'closed', reason: 'ilan sayfası kaldırılmış' };
  if (status !== 200) return { status: 'unknown', reason: `yanıt ${status || 'yok'}` };
  if (source === 'kariyer' && finalUrl && !/\/is-ilani\//i.test(finalUrl)) return { status: 'closed', reason: 'ilan sayfası kaldırılmış' };
  if (source === 'linkedin' && finalUrl && /\/(login|authwall|checkpoint)/i.test(finalUrl)) return { status: 'unknown', reason: 'giriş istendi' };
  const text = String(html).toLowerCase();
  if (CLOSED_TEXT[source]?.some((s) => text.includes(s))) return { status: 'closed', reason: 'başvuruya kapandı' };
  if (source === 'kariyer') {
    const closing = parseTrDate((String(html).match(/closingDate["':\s]*["']?(\d{1,2}\.\d{1,2}\.\d{4})/i) || [])[1]);
    if (closing && closing < now) return { status: 'closed', reason: 'son başvuru tarihi geçti' };
  }
  if (text.length > 500 && OPEN_TEXT[source]?.some((s) => text.includes(s))) return { status: 'open', reason: 'başvuru alıyor' };
  return { status: 'unknown', reason: 'sayfa tanınmadı' };
}

// ---- Çalışma şekli ve şehir (ilan sayfasından) --------------------------------------
const MODE_WORDS = [
  ['remote', /^(uzaktan|remote|evden|tamamen uzaktan|full remote)/],
  ['hybrid', /^(hibrit|hybrid)/],
  ['onsite', /^(ofisten|ofis|ofiste|iş yerinde|işyerinde|yerinde|on-?site|office|in-office)/],
];
const modeOf = (word) => MODE_WORDS.find(([, re]) => re.test(String(word || '').trim().toLocaleLowerCase('tr')))?.[0] || null;
const stripTags = (html) => String(html).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// "Çalışma Modeli: Ofisten", "Work model - Hybrid", "Çalışma Şekli: Uzaktan"
const LABELED = /(?:çalışma\s*(?:model(?:i)?|şekli|tipi|biçimi|düzeni|tercihi)|work(?:ing)?\s*(?:model|type|arrangement|mode|style)|workplace(?:\s*type)?)\s*[:：\-–*]*\s*(tamamen uzaktan|uzaktan|remote|evden|hibrit|hybrid|ofisten|ofiste|ofis|iş yerinde|işyerinde|on-?site|office)/i;
const STRONG = [
  ['remote', /(tamamen uzaktan|%100 uzaktan|100% remote|fully remote|uzaktan çalışma modeli|remote position)/i],
  ['hybrid', /(hibrit çalışma|hybrid work|hibrit model|hybrid model)/i],
  ['onsite', /(ofisten çalışma|iş yerinde çalışma|on-site position|ofis ortamında tam zamanlı)/i],
];

/** İlan sayfasından çalışma şekli ve şehir; emin olunamazsa null. */
export function extractWorkInfo({ source, html }) {
  const raw = String(html || '');
  let mode = null;
  let city = null;
  if (source === 'kariyer') {
    // Sayfadaki ilk workmodeltext ilanın kendisine aittir (sonrakiler "benzer ilanlar").
    mode = modeOf((raw.match(/workmodeltext="([^"]+)"/i) || [])[1]);
  } else if (source === 'linkedin') {
    const bullet = stripTags((raw.match(/topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').trim();
    if (bullet) {
      const inParen = (bullet.match(/\(([^)]+)\)/) || [])[1];
      if (inParen) mode = modeOf(inParen);
      city = bullet.replace(/\([^)]*\)/g, '').split(',')[0].trim() || null;
    }
    if (!mode) {
      const text = stripTags((raw.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || raw);
      const labeled = text.match(LABELED);
      if (labeled) mode = modeOf(labeled[1]);
      else {
        const hits = STRONG.filter(([, re]) => re.test(text)).map(([m]) => m);
        if (hits.length === 1) mode = hits[0];
      }
    }
  }
  return { mode, city };
}

const MODE_LABEL = { remote: 'Uzaktan', hybrid: 'Hibrit', onsite: 'Ofiste' };
const HAS_MODE = /(uzaktan|remote|hibrit|hybrid|ofis|on-?site|yerinde)/i;
/** Konum metnine eksik çalışma şeklini / şehri ekler: "İstanbul" + ofis → "İstanbul (Ofiste)". */
export function mergeLocation(location, { mode, city }) {
  const loc = String(location || '').trim();
  if (HAS_MODE.test(loc) || (!mode && (loc || !city))) return loc || null;
  const base = loc || city || '';
  const out = `${base}${mode ? `${base ? ' ' : ''}(${MODE_LABEL[mode]})` : ''}`.trim();
  return out.slice(0, 80) || null;
}

/** LinkedIn misafir ilan uç noktası: giriş istemeyen, yalnızca ilan kartını döndüren küçük sayfa. */
export function checkUrlFor(url) {
  const canon = canonicalJobUrl(url);
  if (!canon) return null;
  const li = canon.match(/linkedin\.com\/jobs\/view\/(\d+)/);
  if (li) return { source: 'linkedin', url: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${li[1]}` };
  return { source: 'kariyer', url: canon };
}

export function createListingChecker({ fetchImpl = fetch, timeoutMs = 9_000, maxBytes = 1_500_000 } = {}) {
  return async function checkListing(listingUrl, now = new Date()) {
    const target = checkUrlFor(listingUrl);
    if (!target) return { status: 'unknown', reason: 'desteklenmeyen kaynak' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let current = target.url;
      for (let hop = 0; hop < 4; hop++) {
        const host = new URL(current).hostname;
        if (!ALLOWED_HOSTS.test(host)) return { status: 'unknown', reason: 'başka siteye yönlendirdi' };
        const res = await fetchImpl(current, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' }, redirect: 'manual', signal: ctrl.signal });
        const location = res.headers?.get?.('location');
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).toString();
          continue;
        }
        const html = res.status === 200 ? (await res.text()).slice(0, maxBytes) : '';
        const verdict = judgeListing({ source: target.source, status: res.status, finalUrl: current, html, now });
        return verdict.status === 'open' ? { ...verdict, ...extractWorkInfo({ source: target.source, html }) } : verdict;
      }
      return { status: 'unknown', reason: 'çok fazla yönlendirme' };
    } catch {
      return { status: 'unknown', reason: 'erişilemedi' };
    } finally {
      clearTimeout(timer);
    }
  };
}

const RECHECK_MS = 12 * 3600 * 1000;
// Çalışma şekli okuması bu tarihte eklendi: konumunda çalışma şekli olmayan ilanlara bir kez daha bakılır.
const WORK_INFO_SINCE = '2026-11-10T13:30:00.000Z';
const MAX_AGE_MS = 45 * 86_400_000;

/**
 * Bir kullanıcının ilanlarını yeniden kontrol eder: kapanmış olarak bilinmeyen, son 45 günde gelmiş
 * ve son 12 saatte bakılmamış ilanlar. Sütunlar henüz yoksa (eski veritabanı) sessizce atlar.
 * @returns {{ checked: number, closed: number, skipped?: string }}
 */
export async function refreshListings({ supabase, checkListing, userId, limit = 20, now = new Date(), log, concurrency = 3 }) {
  if (!checkListing) return { checked: 0, closed: 0, skipped: 'no_checker' };
  const enc = encodeURIComponent;
  let rows;
  try {
    rows = await supabase.select(
      'alert_jobs',
      `user_id=eq.${enc(userId)}&received_at=gte.${enc(new Date(now.getTime() - MAX_AGE_MS).toISOString())}&or=(status.is.null,status.neq.closed)&select=id,url,location,checked_at&order=checked_at.asc.nullsfirst&limit=${limit * 3}`,
    );
  } catch {
    return { checked: 0, closed: 0, skipped: 'no_columns' };
  }
  const due = rows
    .filter(
      (r) =>
        r.status !== 'closed' &&
        (!r.checked_at || now.getTime() - new Date(r.checked_at).getTime() > RECHECK_MS || (!HAS_MODE.test(r.location || '') && r.checked_at < WORK_INFO_SINCE)),
    )
    .sort((a, b) => String(a.checked_at || '').localeCompare(String(b.checked_at || '')))
    .slice(0, limit);
  let i = 0;
  let closed = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, due.length) }, async () => {
      while (i < due.length) {
        const row = due[i++];
        const r = await checkListing(row.url, now);
        const patch = { checked_at: now.toISOString() };
        if (r.status !== 'unknown') patch.status = r.status;
        if (r.status === 'closed') { patch.closed_reason = r.reason; closed++; }
        const location = mergeLocation(row.location, r);
        if (location && location !== (row.location || null)) patch.location = location;
        await supabase.update('alert_jobs', `id=eq.${enc(row.id)}&user_id=eq.${enc(userId)}`, patch).catch((err) => log?.warn('listing_update_failed', { error: err.message }));
      }
    }),
  );
  log?.info('listings_checked', { userId, checked: due.length, closed });
  return { checked: due.length, closed };
}
