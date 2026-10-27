// Günlük işçi (Faz 2, onaylı mod): kullanıcı başına arama → sayfa okuma → yapay zeka
// değerlendirmesi → onay bekleyen başvuru taslakları. Hiçbir e-posta burada gönderilmez;
// gönderim yalnızca kullanıcı panelden onayladığında yapılır.
import { runTask } from '../llm/runTask.js';
import * as P from './prompts.js';
import { dailyQueries } from './search.js';
import { shouldSkip, hasHiringSignal, domainMatches, rootName, hostOf } from './pages.js';

const MIN_SCORE = { job: 70, open_application: 65 };
const SEEN_DAYS = 120;
const FREE_MAIL = /@(gmail|hotmail|outlook|yahoo|yandex|icloud|live)\./i;
const STOP_CODES = new Set(['DAILY_CAPACITY_REACHED']);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

export const dayStart = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Normalises the signature and paragraphing of a generated cover letter. */
export function fixLetter(text, fullName) {
  let t = String(text || '').trim().replace(/\r\n/g, '\n');
  t = t.replace(/^(Merhaba[^,\n]{0,30},)\s*/, '$1\n\n');
  t = t.replace(/\[[^\]]*(ad|isim|name)[^\]]*\]/gi, fullName);
  let body = t.split(/\n\s*(Saygılarımla|Saygılar)\b/)[0].trimEnd();
  if (fullName && body.replace(/[ ,.]+$/, '').endsWith(fullName)) body = body.slice(0, body.lastIndexOf(fullName)).trimEnd();
  if (body && !/[.!?]$/.test(body)) body += '.';
  return fullName ? `${body}\n\nSaygılarımla,\n${fullName}` : `${body}\n\nSaygılarımla,`;
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

export async function listDueUsers(supabase) {
  const rows = await supabase.select('profiles', 'setup_step=gte.6&status=neq.paused&select=id');
  return rows.map((r) => r.id);
}

export async function runForUser({ supabase, llm, budget, search, readPage, log, config, userId, now = new Date(), force = false, sleep = sleepMs }) {
  const uid = enc(userId);
  const [profile] = await supabase.select('profiles', `id=eq.${uid}&select=*`);
  if (!profile) return { status: 'skipped', reason: 'no_profile' };
  if (profile.status === 'paused' || (profile.setup_step || 0) < 6) return { status: 'skipped', reason: 'not_ready' };

  const today = dayStart(now);
  if (!force) {
    const ran = await supabase.select('run_logs', `user_id=eq.${uid}&started_at=gte.${enc(today)}&select=id`);
    if (ran.length) return { status: 'skipped', reason: 'already_ran_today' };
  }

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

  const [run] = await supabase.insert('run_logs', [{ user_id: userId, started_at: now.toISOString() }]);
  const stats = { searches: 0, hits: 0, pages: 0, evaluated: 0, drafted: 0, errors: [] };

  try {
    // 1) Arama
    const queries = dailyQueries(
      { roles: targets.roles, cities: targets.cities, workModes: targets.work_modes, openApplications: profile.open_applications },
      { count: config.SEARCHES_PER_USER, day: now },
    );
    const seenUrls = new Set();
    const hits = [];
    for (const q of queries) {
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

    // 2) Daha önce görülen sayfaları ele, kalanları oku
    const since = new Date(now.getTime() - SEEN_DAYS * 86_400_000).toISOString();
    const seen = new Set((await supabase.select('discoveries', `user_id=eq.${uid}&seen_at=gte.${enc(since)}&select=url&limit=5000`)).map((d) => d.url));
    const fresh = hits.filter((h) => !seen.has(h.url)).slice(0, config.PAGES_PER_USER * 3);
    const pages = (await mapLimit(fresh, 4, readPage)).filter((p) => p.emails.length).slice(0, config.PAGES_PER_USER);
    stats.pages = pages.length;

    // 3) Şirket bekleme süresi ve günlük limit
    const cooldownSince = new Date(now.getTime() - profile.company_cooldown_days * 86_400_000).toISOString();
    const recent = await supabase.select('applications', `user_id=eq.${uid}&created_at=gte.${enc(cooldownSince)}&select=company_key,status,created_at`);
    const blocked = new Set(recent.filter((a) => !['skipped', 'failed'].includes(a.status)).map((a) => a.company_key));
    let todayCount = recent.filter((a) => a.created_at >= today).length;

    // 4) Değerlendirme
    const promptProfile = { ...cvProfile };
    const promptTargets = { roles: targets.roles, excluded: targets.excluded, cities: targets.cities, work_modes: targets.work_modes, seniority: targets.seniority, long_term_internship: targets.long_term_internship };
    const cvIds = new Set(cvs.map((c) => c.id));
    for (const page of pages) {
      if (todayCount >= profile.daily_limit) break;
      if (stats.evaluated > 0) await sleep(config.WORKER_LLM_GAP_MS);
      let v;
      try {
        v = await runTask(ctx, P.evaluatePage({ profile: promptProfile, targets: promptTargets, cvs, page, fullName, portfolioUrl: profile.portfolio_url }));
      } catch (err) {
        stats.errors.push(err.code || 'ERROR');
        if (STOP_CODES.has(err.code) || err.details?.status === 429) break;
        continue;
      }
      stats.evaluated++;
      const { kind, email, warnings } = checkVerdict(v, page, targets.excluded);
      await supabase.insert('discoveries', [{ user_id: userId, url: page.url, kind: kind === 'low_score' ? v.kind : kind, score: v.score, seen_at: now.toISOString() }], { upsert: true, onConflict: 'user_id,url' });
      if (kind !== 'job' && kind !== 'open_application') continue;

      const companyKey = rootName(FREE_MAIL.test(email) ? page.host : email.split('@')[1]);
      if (blocked.has(companyKey)) continue;
      blocked.add(companyKey);
      await supabase.insert('applications', [
        {
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
        },
      ]);
      stats.drafted++;
      todayCount++;
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
    return { status: 'ok', ...stats };
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
