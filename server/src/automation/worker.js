// Günlük işçi (Faz 2, onaylı mod): kullanıcı başına arama → sayfa okuma → yapay zeka
// değerlendirmesi → onay bekleyen başvuru taslakları. Hiçbir e-posta burada gönderilmez;
// gönderim yalnızca kullanıcı panelden onayladığında yapılır.
import { runTask } from '../llm/runTask.js';
import * as P from './prompts.js';
import { dailyQueries } from './search.js';
import { variantsFor, searchTitles } from './roles.js';
import { shouldSkip, hasHiringSignal, domainMatches, rootName, hostOf } from './pages.js';
import { fixPhrases } from '../lib/phrases.js';

const MIN_SCORE = { job: 70, open_application: 65 };
const SEEN_DAYS = 120;
const FREE_MAIL = /@(gmail|hotmail|outlook|yahoo|yandex|icloud|live)\./i;
const STOP_CODES = new Set(['DAILY_CAPACITY_REACHED']);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// Türkiye saati (UTC+3, yaz saati uygulaması yok). "Bugün" Türkiye'de gece yarısı başlar.
const TR_OFFSET_MS = 3 * 3600 * 1000;
export const trHour = (now) => new Date(now.getTime() + TR_OFFSET_MS).getUTCHours();
export const dayStart = (now) => {
  const tr = new Date(now.getTime() + TR_OFFSET_MS);
  return new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()) - TR_OFFSET_MS).toISOString();
};

export { fixPhrases };

/** Normalises the signature and paragraphing of a generated cover letter. */
export function fixLetter(text, fullName) {
  let t = fixPhrases(String(text || '').trim().replace(/\r\n/g, '\n'));
  t = t.replace(/^(Merhaba[^,\n]{0,30},)\s*/, '$1\n\n');
  t = t.replace(/\[[^\]]*(ad|isim|name)[^\]]*\]/gi, fullName);
  let body = t.split(/\n\s*(Saygılarımla|Saygılar)\b/)[0].trimEnd();
  if (fullName && body.replace(/[ ,.]+$/, '').endsWith(fullName)) body = body.slice(0, body.lastIndexOf(fullName)).trimEnd();
  if (body && !/[.!?]$/.test(body)) body += '.';
  return fullName ? `${body}\n\nSaygılarımla,\n${fullName}` : `${body}\n\nSaygılarımla,`;
}

/** Çalışma şekli / şehir sütunları henüz yoksa (eski veritabanı) onlarsız kaydeder. */
async function insertApplication(supabase, row) {
  try {
    return await supabase.insert('applications', [row]);
  } catch (err) {
    const { work_mode: _w, city: _c, ...rest } = row;
    if (!('work_mode' in row)) throw err;
    return supabase.insert('applications', [rest]);
  }
}

/** Applies the server-side safety rules to the model's verdict. Returns { kind, warnings }. */
export function checkVerdict(v, page, excluded = []) {
  const warnings = [];
  let kind = v.kind;
  const email = (v.email || '').trim().toLowerCase();
  if (email && !page.emails.includes(email)) {
    warnings.push('sayfada olmayan adres');
    kind = 'irrelevant';
  }
  if (!email) kind = 'irrelevant';
  if (!v.in_turkey) { warnings.push('Türkiye dışı'); kind = 'irrelevant'; }
  if (!v.real_company) { warnings.push('kişisel site'); kind = 'irrelevant'; }
  if (kind === 'open_application' && v.career_product) { warnings.push('kariyer/İK ürünü'); kind = 'irrelevant'; }
  if (kind === 'open_application' && !hasHiringSignal(page)) { warnings.push('işe alım ifadesi yok'); kind = 'irrelevant'; }
  if (kind === 'open_application' && email && !domainMatches(email, page.host)) { warnings.push('alan adı uyuşmuyor'); kind = 'irrelevant'; }
  const pos = `${v.position} ${v.subject}`.toLocaleLowerCase('tr');
  if (excluded.some((x) => x && pos.includes(x.toLocaleLowerCase('tr')))) { warnings.push('hariç tutulan kelime'); kind = 'irrelevant'; }
  if (kind !== 'irrelevant' && v.score < MIN_SCORE[kind]) kind = 'low_score';
  return { kind, email, warnings };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Bir kullanıcının bugünkü otomatik tarama saatleri (Türkiye saati), ör. 12 → [12, 16, 20]. */
export function autoSlots(scanHour = 9, { runs = 3, gap = 4 } = {}) {
  const out = [];
  for (let i = 0; i < runs; i++) if (scanHour + i * gap <= 23) out.push(scanHour + i * gap);
  return out;
}

/**
 * Saatlik tetikte çalışacak kullanıcılar: bugün saati gelmiş otomatik dilim sayısı, bugün yapılan
 * (otomatik + elle) tarama sayısından fazla olanlar. Kaçırılan dilimler bir sonraki tetikte telafi edilir.
 */
export async function listDueUsers(supabase, now = new Date(), { runs = 3, gap = 4 } = {}) {
  let rows;
  try {
    rows = await supabase.select('profiles', 'setup_step=gte.6&status=neq.paused&select=id,scan_hour');
  } catch {
    rows = await supabase.select('profiles', 'setup_step=gte.6&status=neq.paused&select=id'); // sütun henüz eklenmemişse
  }
  const hour = trHour(now);
  const count = new Map();
  for (const r of await supabase.select('run_logs', `started_at=gte.${encodeURIComponent(dayStart(now))}&select=user_id`)) {
    count.set(r.user_id, (count.get(r.user_id) || 0) + 1);
  }
  return rows
    .filter((r) => autoSlots(r.scan_hour ?? 9, { runs, gap }).filter((h) => h <= hour).length > (count.get(r.id) || 0))
    .map((r) => r.id);
}

const REASONS = {
  'sayfada olmayan adres': 'sayfada güvenilir bir başvuru adresi yok',
  'Türkiye dışı': 'Türkiye dışında bir iş',
  'kişisel site': 'şirket sitesi değil',
  'kariyer/İK ürünü': 'işe alım / kariyer hizmeti satan bir şirket',
  'işe alım ifadesi yok': 'sayfada işe alım yaptıklarına dair ifade yok',
  'alan adı uyuşmuyor': 'e-posta adresi şirketin alan adıyla uyuşmuyor',
  'hariç tutulan kelime': 'hariç tuttuğun bir kelime geçiyor',
};
const whyRejected = (kind, v, warnings) => {
  if (kind === 'low_score') return `uygunluk puanı düşük (${v.score})`;
  if (warnings.length) return REASONS[warnings[0]] || warnings[0];
  if (!v.email) return 'başvuru için e-posta adresi yok';
  return v.reason || 'hedeflerine uymuyor';
};

/**
 * onProgress({ step, message, pct, stats }) is called at every meaningful step so the panel
 * can narrate the scan live. step: start | search | read | evaluate | draft | skip | done.
 */
export async function runForUser({ supabase, llm, budget, search, readPage, log, config, userId, now = new Date(), force = false, trigger = 'manual', sleep = sleepMs, onProgress = () => {} }) {
  const uid = enc(userId);
  const [profile] = await supabase.select('profiles', `id=eq.${uid}&select=*`);
  if (!profile) return { status: 'skipped', reason: 'no_profile' };
  if (profile.status === 'paused' || (profile.setup_step || 0) < 6) return { status: 'skipped', reason: 'not_ready' };

  const today = dayStart(now);
  // Günde en fazla RUNS_PER_DAY tarama (zamanlanmış + elle toplam). Her tarama farklı arama dilimini kullanır.
  const ranToday = (await supabase.select('run_logs', `user_id=eq.${uid}&started_at=gte.${enc(today)}&select=id`)).length;
  const maxRuns = config.RUNS_PER_DAY || 3;
  if (!force && ranToday >= maxRuns) return { status: 'skipped', reason: 'daily_runs_used', runsToday: ranToday, maxRuns };

  const [targets] = await supabase.select('targets', `user_id=eq.${uid}&select=*`);
  const cvs = await supabase.select('cvs', `user_id=eq.${uid}&select=id,label,is_default,extracted_profile&order=created_at.asc`);
  if (!targets || !targets.roles?.length || !cvs.length) return { status: 'skipped', reason: 'incomplete_setup' };

  const ctx = { llm, budget, log, trace: [] };
  const main = cvs.find((c) => c.is_default) || cvs[0];
  let { source_text: sourceText, pending, ...cvProfile } = main.extracted_profile || {};
  if (pending && sourceText) {
    try {
      cvProfile = await runTask(ctx, P.extractProfile({ cv: sourceText }));
      await supabase.update('cvs', `id=eq.${enc(main.id)}&user_id=eq.${uid}`, { extracted_profile: { ...cvProfile, source_text: sourceText } });
      await sleep(config.WORKER_LLM_GAP_MS);
    } catch (err) {
      log?.warn('worker_profile_failed', { userId, code: err.code });
      return { status: 'error', reason: 'profile_unavailable' };
    }
  }
  const fullName = profile.full_name || cvProfile.full_name || '';

  // trigger: 'auto' (zamanlanmış) | 'manual' (panelden). Sütun yoksa (eski veritabanı) onsuz kaydedilir.
  let run;
  try {
    [run] = await supabase.insert('run_logs', [{ user_id: userId, started_at: now.toISOString(), trigger }]);
  } catch {
    [run] = await supabase.insert('run_logs', [{ user_id: userId, started_at: now.toISOString() }]);
  }
  const stats = { searches: 0, hits: 0, pages: 0, evaluated: 0, drafted: 0, errors: [] };
  const emit = (step, message, pct) => {
    try { onProgress({ step, message, pct: Math.round(pct), stats: { searches: stats.searches, hits: stats.hits, pages: stats.pages, evaluated: stats.evaluated, drafted: stats.drafted } }); } catch { /* izleyici koptu */ }
  };
  emit('start', `Profilini ve hedeflerini okudum: ${targets.roles.slice(0, 3).join(', ')}${targets.roles.length > 3 ? '…' : ''}`, 3);

  try {
    // 0) Benzer başlıklar: "İş Analisti" → "Sistem Analisti", "Business Analyst", … (bir kez üretilip saklanır)
    const variants = await variantsFor(ctx, targets.roles, targets.role_variants);
    if (targets.roles.some((r) => !Array.isArray(targets.role_variants?.[r]))) {
      await supabase.update('targets', `user_id=eq.${uid}`, { role_variants: variants }).catch(() => {}); // sütun yoksa atla
    }
    const similar = searchTitles(targets.roles, variants).slice(targets.roles.length);

    // 1) Arama: aramaların yarısı seçilen rollerle, yarısı benzer başlıklarla
    const where = { cities: targets.cities, workModes: targets.work_modes, openApplications: profile.open_applications };
    const total = config.SEARCHES_PER_USER;
    const mainCount = similar.length ? Math.ceil(total / 2) : total;
    const queries = [
      ...dailyQueries({ roles: targets.roles, ...where }, { count: mainCount, day: now, offset: ranToday }),
      ...(similar.length ? dailyQueries({ roles: similar, ...where }, { count: total - mainCount, day: now, offset: ranToday }) : []),
    ];
    const seenUrls = new Set();
    const hits = [];
    for (const [qi, q] of queries.entries()) {
      emit('search', `İnternette arıyorum: ${q.replace(/"/g, '')}`, 5 + (qi / queries.length) * 20);
      const r = await search.search(q, today.slice(0, 10));
      if (!r.cached && r.provider) stats.searches++;
      for (const h of r.results) {
        const url = h.url.split('#')[0];
        if (seenUrls.has(url) || shouldSkip(url)) continue;
        seenUrls.add(url);
        hits.push({ ...h, url });
      }
    }
    stats.hits = hits.length;
    emit('search', hits.length ? `${hits.length} sayfa buldum. Daha önce baktıklarımı ve ilan sitelerini eliyorum.` : 'Bu aramalarda uygun sayfa çıkmadı.', 25);

    // 2) Daha önce görülen sayfaları ele, kalanları oku
    const since = new Date(now.getTime() - SEEN_DAYS * 86_400_000).toISOString();
    const seen = new Set((await supabase.select('discoveries', `user_id=eq.${uid}&seen_at=gte.${enc(since)}&select=url&limit=5000`)).map((d) => d.url));
    const fresh = hits.filter((h) => !seen.has(h.url)).slice(0, config.PAGES_PER_USER * 3);
    let read = 0;
    const pages = (
      await mapLimit(fresh, 4, async (h) => {
        const p = await readPage(h);
        read++;
        emit('read', `Sayfayı okuyorum: ${p.host || hostOf(h.url)}${p.emails.length ? ' · başvuru adresi var' : ''}`, 25 + (read / Math.max(fresh.length, 1)) * 25);
        return p;
      })
    )
      .filter((p) => p.emails.length)
      .slice(0, config.PAGES_PER_USER);
    stats.pages = pages.length;
    emit('read', pages.length ? `${pages.length} sayfada başvuru adresi var. Tek tek değerlendiriyorum.` : 'Okuduğum sayfalarda başvuru adresi bulamadım.', 50);

    // 3) Şirket bekleme süresi ve günlük limit
    const cooldownSince = new Date(now.getTime() - profile.company_cooldown_days * 86_400_000).toISOString();
    const recent = await supabase.select('applications', `user_id=eq.${uid}&created_at=gte.${enc(cooldownSince)}&select=company_key,status,created_at`);
    const blocked = new Set(recent.filter((a) => !['skipped', 'failed'].includes(a.status)).map((a) => a.company_key));
    let todayCount = recent.filter((a) => a.created_at >= today).length;

    // 4) Değerlendirme
    const promptProfile = { ...cvProfile };
    const promptTargets = { roles: targets.roles, similar_titles: similar, excluded: targets.excluded, cities: targets.cities, work_modes: targets.work_modes, seniority: targets.seniority, long_term_internship: targets.long_term_internship };
    const cvIds = new Set(cvs.map((c) => c.id));
    for (const [pi, page] of pages.entries()) {
      if (todayCount >= profile.daily_limit) {
        emit('skip', `Günlük limitine (${profile.daily_limit}) ulaştım, kalan sayfalar yarına kaldı.`, 95);
        break;
      }
      const pct = 50 + (pi / pages.length) * 45;
      emit('evaluate', `İlanı CV'nle karşılaştırıyorum: ${page.title?.slice(0, 70) || page.host}`, pct);
      if (stats.evaluated > 0) await sleep(config.WORKER_LLM_GAP_MS);
      let v;
      try {
        v = await runTask(ctx, P.evaluatePage({ profile: promptProfile, targets: promptTargets, cvs, page, fullName, portfolioUrl: profile.portfolio_url }));
      } catch (err) {
        stats.errors.push(err.code || 'ERROR');
        if (STOP_CODES.has(err.code) || err.details?.status === 429) {
          emit('skip', 'Yapay zekanın bugünkü kullanım hakkı doldu; kalanlara yarın bakacağım.', 95);
          break;
        }
        emit('skip', `${page.host}: değerlendirilemedi, sıradakine geçiyorum.`, pct);
        continue;
      }
      stats.evaluated++;
      const { kind, email, warnings } = checkVerdict(v, page, targets.excluded);
      await supabase.insert('discoveries', [{ user_id: userId, url: page.url, kind: kind === 'low_score' ? v.kind : kind, score: v.score, seen_at: now.toISOString() }], { upsert: true, onConflict: 'user_id,url' });
      const label = [v.company || page.host, v.position].filter(Boolean).join(' · ');
      if (kind !== 'job' && kind !== 'open_application') {
        emit('skip', `Elendi — ${label}: ${whyRejected(kind, v, warnings)}`, pct + 3);
        continue;
      }

      const companyKey = rootName(FREE_MAIL.test(email) ? page.host : email.split('@')[1]);
      if (blocked.has(companyKey)) {
        emit('skip', `Atlandı — ${label}: bu şirkete yakın zamanda başvurulmuş`, pct + 3);
        continue;
      }
      blocked.add(companyKey);
      const WORK_MODES = new Set(['remote', 'hybrid', 'onsite']);
      const where = { work_mode: WORK_MODES.has(v.work_mode) ? v.work_mode : null, city: String(v.city || '').trim().slice(0, 60) || null };
      await insertApplication(supabase, {
          ...where,
          user_id: userId,
          company: (v.company || hostOf(page.url)).slice(0, 120),
          company_key: companyKey,
          position: v.position || null,
          recipient: email,
          source_url: page.url,
          channel: 'email',
          kind,
          score: v.score,
          reason: [v.reason, ...warnings].filter(Boolean).join(' · ').slice(0, 300),
          cover_letter: fixLetter(v.cover_letter, fullName),
          subject: (v.subject || `Başvuru – ${fullName}`).replace(/\s+/g, ' ').slice(0, 150),
          cv_id: cvIds.has(v.cv_id) ? v.cv_id : main.id,
          status: 'pending_approval',
      });
      stats.drafted++;
      todayCount++;
      emit('draft', `Uygun buldum — ${label} (${v.score} puan). Ön yazıyı hazırladım, onayına sundum.`, pct + 3);
    }

    if (stats.drafted) {
      await supabase.insert('inbox_items', [
        {
          user_id: userId,
          kind: 'needs_approval',
          title: `${stats.drafted} başvuru onayını bekliyor`,
          body: 'Asistan bugün sana uygun ilanlar buldu ve ön yazıları hazırladı. "Onay bekleyenler" sekmesinden kontrol edip gönderebilirsin.',
          data: { count: stats.drafted },
        },
      ]);
    }
    emit('done', stats.drafted ? `Bitti: ${stats.drafted} başvuru onayını bekliyor.` : 'Bitti: bu taramada sana uygun yeni ilan çıkmadı. Bir sonraki taramada tekrar bakacağım.', 100);
    return { status: 'ok', ...stats, trigger, runsToday: ranToday + 1, maxRuns };
  } catch (err) {
    stats.errors.push(err.code || err.message);
    log?.error('worker_failed', { userId, error: err.message });
    return { status: 'error', ...stats };
  } finally {
    const cost = ctx.trace.reduce((s, t) => s + (t.costUsd || 0), 0);
    await supabase
      .update('run_logs', `id=eq.${enc(run.id)}`, {
        finished_at: new Date().toISOString(),
        searches: stats.searches,
        drafted: stats.drafted,
        llm_cost_usd: Number(cost.toFixed(5)),
        error: stats.errors.length ? stats.errors.slice(0, 5).join(', ') : null,
      })
      .catch(() => {});
    log?.info('worker_user_done', { userId, ...stats });
  }
}
