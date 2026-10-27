// Deterministic text utilities used by grounding checks and scoring.
// Turkish-aware: "İ/ı" casing and diacritics are folded so that
// "Yazılım Geliştirme" and "yazilim gelistirme" compare equal.

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function fold(text = '') {
  return String(text)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] || c);
}

/** Lowercased, diacritic-folded, punctuation-collapsed form for comparisons. */
export function normalize(text = '') {
  return fold(text)
    .replace(/[“”"'’`´]/g, '')
    .replace(/[^\p{L}\p{N}+#.%/-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text = '') {
  return normalize(text)
    .split(' ')
    .map((t) => t.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(Boolean);
}

/**
 * Does `quote` appear in `source`? Exact match after normalisation, otherwise
 * the best sliding window must share >= `threshold` of the quote's tokens
 * (tolerates the model fixing a typo or dropping a word, rejects inventions).
 */
export function containsQuote(source, quote, threshold = 0.8) {
  const q = normalize(quote);
  if (!q) return false;
  const s = normalize(source);
  if (s.includes(q)) return true;
  const qt = tokens(quote);
  if (qt.length < 3) return false;
  const st = tokens(source);
  const need = new Map();
  for (const t of qt) need.set(t, (need.get(t) || 0) + 1);
  const win = qt.length + 2;
  let best = 0;
  for (let i = 0; i + 1 <= st.length; i++) {
    const have = new Map();
    let hit = 0;
    for (let j = i; j < Math.min(st.length, i + win); j++) {
      const t = st[j];
      const n = need.get(t) || 0;
      const h = have.get(t) || 0;
      if (h < n) {
        have.set(t, h + 1);
        hit += 1;
      }
    }
    best = Math.max(best, hit / qt.length);
    if (best >= threshold) return true;
  }
  return false;
}

/** Keyword/phrase presence with word boundaries, folded. Handles "C#", "Node.js", "CI/CD". */
export function hasTerm(text, term) {
  const t = normalize(term);
  if (!t) return false;
  const hay = ` ${normalize(text)} `;
  return hay.includes(` ${t} `);
}

/**
 * Numbers that carry factual weight: percentages, money, counts, years.
 * Used to catch fabricated metrics ("increased sales by 40%").
 */
export function factualNumbers(text = '') {
  const out = new Set();
  // Turkish writes percentages as "%20", English as "20%".
  const re = /(%\s*)?(\d+(?:[.,]\d+)?)\s*(%|k\b|m\b|bin\b|milyon\b|milyar\b|\+)?/gi;
  for (const m of String(text).matchAll(re)) {
    const n = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    const unit = m[1] ? '%' : (m[3] || '').toLowerCase();
    out.add(`${n}${unit}`);
  }
  return out;
}

/** Numbers present in `claim` that never occur in `source`. */
export function unsupportedNumbers(source, claim) {
  const src = factualNumbers(source);
  const srcBare = new Set([...src].map((x) => x.replace(/[^\d.]/g, '')));
  return [...factualNumbers(claim)].filter((n) => !src.has(n) && !srcBare.has(n.replace(/[^\d.]/g, '')));
}

export function splitSentences(text = '') {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[\p{Lu}0-9])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s,;)]+/i;

export function extractContacts(text = '') {
  return {
    email: text.match(EMAIL_RE)?.[0] || '',
    phone: (text.match(PHONE_RE)?.[1] || '').trim(),
    linkedin: (text.match(LINKEDIN_RE)?.[0] || '').replace(/^https?:\/\//i, '').replace(/^www\./i, ''),
  };
}

const PROFILE_HOSTS = [
  ['github.com', 'GitHub'], ['gitlab.com', 'GitLab'], ['behance.net', 'Behance'], ['dribbble.com', 'Dribbble'],
  ['medium.com', 'Medium'], ['kaggle.com', 'Kaggle'], ['huggingface.co', 'Hugging Face'], ['stackoverflow.com', 'Stack Overflow'],
];
const URL_RE = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s,;)|<>"']*)?/gi;

/** Profile links other than LinkedIn found in the CV text (GitHub, Behance, …), deduplicated. */
export function extractProfileLinks(text = '') {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(URL_RE)) {
    const host = m[1].toLowerCase();
    const hit = PROFILE_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`));
    if (!hit) continue;
    const path = (m[2] || '').replace(/[.]+$/, '').replace(/\/$/, '');
    if (!path || path === '/') continue; // yalnızca alan adı: profil değil
    const url = `${host}${path}`;
    if (seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    out.push({ label: hit[1], url });
  }
  return out.slice(0, 4);
}

const INJECTION_RE =
  /(ignore|disregard|forget)\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?)|önceki\s+(tüm\s+)?(talimat|komut)|(talimat|komut)[a-zçğıöşü]*\s+(yok\s+say|unut|görmezden)|system\s+(prompt|instruction)|sistem\s+(talimat|komut)|you\s+are\s+now\b|\b(give|assign)\s+(this\s+candidate|me)\s+\d+|\d+\s*puan\s+ver/i;

/** Heuristic detector for prompt-injection attempts embedded in user documents. */
export function looksLikeInjection(text = '') {
  return INJECTION_RE.test(String(text));
}

/** Strip sequences that could break out of the XML-ish data envelopes in prompts. */
export function sanitizeForPrompt(text = '', maxLen = 40_000) {
  return String(text)
    .replace(/<\/?\s*(cv|job_posting|requirements|claims|history|notes|tailored)[^>]*>/gi, ' ')
    .replace(/\u0000/g, '')
    .slice(0, maxLen);
}
