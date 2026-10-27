// İlan araması: önce Tavily (ayda 1000 ücretsiz), kota/hata olursa SerpApi (ayda 250).
// Aynı gün aynı sorgu bir kez aranır ve sonuç kullanıcılar arasında paylaşılır.
// Sorgular kullanıcının rolleri × şehirleri × şablonlardan üretilir ve günler arasında döner.

const TAVILY_URL = 'https://api.tavily.com/search';
const SERPAPI_URL = 'https://serpapi.com/search';

export function createSearch({ tavilyKey, serpKey, fetchImpl = fetch, timeoutMs = 30_000, log } = {}) {
  const cache = new Map(); // `${day}|${query}` → results
  const providers = [];
  if (tavilyKey) providers.push({ name: 'tavily', run: tavily });
  if (serpKey) providers.push({ name: 'serpapi', run: serpapi });

  async function req(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`${res.status} ${data?.error || data?.detail?.error || ''}`.trim());
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function tavily(query) {
    const data = await req(TAVILY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tavilyKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 10, search_depth: 'basic', country: 'turkey' }),
    });
    return (data?.results || []).map((r) => ({ url: r.url, title: r.title || '', snippet: (r.content || '').slice(0, 400) }));
  }

  async function serpapi(query) {
    const q = new URLSearchParams({ engine: 'google', q: query, gl: 'tr', hl: 'tr', google_domain: 'google.com.tr', num: '10', tbs: 'qdr:m', api_key: serpKey });
    const data = await req(`${SERPAPI_URL}?${q}`, { method: 'GET' });
    return (data?.organic_results || []).map((r) => ({ url: r.link, title: r.title || '', snippet: r.snippet || '' }));
  }

  return {
    enabled: providers.length > 0,
    /** Returns { results, cached, provider }. Never throws; logs and returns [] if every provider fails. */
    async search(query, day = new Date().toISOString().slice(0, 10)) {
      const key = `${day}|${query}`;
      if (cache.has(key)) return { results: cache.get(key), cached: true, provider: 'cache' };
      for (const p of providers) {
        try {
          const results = (await p.run(query)).filter((r) => /^https?:\/\//.test(r.url || ''));
          if (cache.size > 2000) cache.clear();
          cache.set(key, results);
          return { results, cached: false, provider: p.name };
        } catch (err) {
          log?.warn('search_failed', { provider: p.name, error: String(err.message).slice(0, 200) });
        }
      }
      return { results: [], cached: false, provider: null };
    },
  };
}

// ---- Sorgu üretimi -------------------------------------------------------------
const JOB_TEMPLATES = [
  (r, c) => `"${r}" iş ilanı "özgeçmişinizi" "adresine" ${c}`,
  (r, c) => `"${r}" pozisyonu "cv" "gönderebilirsiniz" ${c}`,
  (r, c) => `${r} ilanı başvuru e-posta ${c}`,
];
const OPEN_TEMPLATES = [
  (r, c) => `${r} "ekibimize katılın" "özgeçmişinizi" ${c}`,
  (r, c) => `${r} şirketi kariyer "insan kaynakları" "açık pozisyonlar" ${c}`,
];

/** Today's slice of all role × place × template combinations (rotates daily so coverage grows over time). */
export function dailyQueries({ roles = [], cities = [], workModes = [], openApplications = true }, { count = 4, day = new Date() } = {}) {
  const places = [];
  if (workModes.some((m) => m !== 'remote')) places.push(...cities);
  if (workModes.includes('remote') || !places.length) places.push('uzaktan');
  const templates = openApplications ? [...JOB_TEMPLATES, ...OPEN_TEMPLATES] : JOB_TEMPLATES;
  const all = [];
  for (const t of templates) for (const r of roles) for (const c of places) all.push(t(r, c).replace(/\s+/g, ' ').trim());
  // Stable pseudo-random order so a daily slice mixes roles, places and templates.
  const hash = (s) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
  const unique = [...new Set(all)].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  if (!unique.length) return [];
  const n = Math.min(count, unique.length);
  const ordinal = Math.floor(day.getTime() / 86_400_000);
  const start = (ordinal * n) % unique.length;
  return Array.from({ length: n }, (_, i) => unique[(start + i) % unique.length]);
}
