// Rol genişletme: "İş Analisti" seçen kullanıcı için "Sistem Analisti", "Business Analyst",
// "Gereksinim Analisti" gibi aynı işin diğer başlıkları da aranır. Başlıklar yapay zekayla
// bir kez üretilir, hedeflerde (targets.role_variants) saklanır ve süreç içinde önbelleğe alınır.
import { runTask } from '../llm/runTask.js';
import * as P from './prompts.js';

const MAX_VARIANTS = 10;
const SENIORITY = /\b(junior|jr\.?|senior|sr\.?|kıdemli|stajyer|intern|lead|head)\b/giu;
const key = (s) => String(s).trim().toLocaleLowerCase('tr');
const cache = new Map(); // key(role) → variants

/** Başlık listesini temizler: kıdem kelimeleri, parantezler, tekrarlar ve rolün kendisi çıkar. */
export function cleanVariants(role, list) {
  const seen = new Set([key(role)]);
  const out = [];
  for (const raw of list || []) {
    const v = String(raw).replace(/\([^)]*\)/g, ' ').replace(SENIORITY, ' ').replace(/\s+/g, ' ').trim();
    if (v.length < 2 || v.length > 70 || seen.has(key(v))) continue;
    seen.add(key(v));
    out.push(v);
    if (out.length >= MAX_VARIANTS) break;
  }
  return out;
}

/**
 * { rol: [benzer başlıklar] }. Kayıtlı olanları kullanır, eksik roller için tek bir yapay zeka
 * çağrısı yapar. Yapay zeka çalışmazsa boş listeyle devam eder (arama yine ana rollerle yapılır).
 */
export async function variantsFor(ctx, roles, stored = {}) {
  const out = {};
  const missing = [];
  for (const r of roles) {
    const saved = stored?.[r];
    if (Array.isArray(saved)) out[r] = saved;
    else if (cache.has(key(r))) out[r] = cache.get(key(r));
    else missing.push(r);
  }
  if (missing.length && ctx.llm) {
    try {
      const res = await runTask(ctx, P.expandRoles({ roles: missing }));
      for (const r of missing) {
        const item = res.items.find((i) => key(i.role) === key(r)) || res.items[missing.indexOf(r)];
        const v = cleanVariants(r, item?.variants);
        cache.set(key(r), v);
        out[r] = v;
      }
      if (cache.size > 2000) cache.clear();
    } catch (err) {
      ctx.log?.warn('expand_roles_failed', { code: err.code, error: err.message });
    }
  }
  for (const r of missing) out[r] ||= [];
  return out;
}

/** Aranacak başlıklar: önce seçilen roller, sonra benzerleri (sırayla karışık). */
export function searchTitles(roles, variants) {
  const out = [];
  const seen = new Set();
  const push = (t) => { if (t && !seen.has(key(t))) { seen.add(key(t)); out.push(t); } };
  roles.forEach(push);
  for (let i = 0; i < MAX_VARIANTS; i++) for (const r of roles) push(variants?.[r]?.[i]);
  return out;
}
