// /api/v1/automation — başvuru otomasyonu modülü.
// Faz 0: hesap + gelen kutusu. Faz 1: kurulum sihirbazı (CV, roller, konum, tercihler).
// Faz 2: Gmail bağlantısı, günlük işçi (onaylı mod), onay bekleyen başvurular ve gönderim.
import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod/v4';
import { Errors, AppError } from '../lib/errors.js';
import { rateLimit } from '../lib/guards.js';
import { requireUser } from '../automation/auth.js';
import { runTask } from '../llm/runTask.js';
import * as P from '../automation/prompts.js';
import { buildMime } from '../automation/gmail.js';
import { runForUser, listDueUsers, dayStart } from '../automation/worker.js';

const uid = (req) => encodeURIComponent(req.user.id);
const MAX_CVS = 3;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const AI_SOFT_FAILURES = new Set(['UPSTREAM_ERROR', 'INVALID_MODEL_OUTPUT', 'DAILY_CAPACITY_REACHED', 'BUSY']);

const WELCOME = {
  kind: 'welcome',
  title: 'Başvuru asistanına hoş geldin',
  body:
    'Hesabın oluşturuldu. Kurulumu tamamladığında her gün bulunan ilanlar, onay bekleyen başvurular ve günlük özet ' +
    'hem e-postana hem de buradaki gelen kutusuna düşecek.',
};

const text = (max) => z.string().trim().min(1).max(max);
const list = (max, len = 60) => z.array(text(len)).max(max).transform((a) => [...new Set(a)]);

const PatchProfile = z
  .object({
    full_name: text(120).optional(),
    kvkk_accepted: z.literal(true).optional(),
    mode: z.enum(['approval', 'auto']).optional(),
    daily_limit: z.number().int().min(1).max(30).optional(),
    company_cooldown_days: z.number().int().min(7).max(180).optional(),
    open_applications: z.boolean().optional(),
    portfolio_url: z.union([z.literal(''), z.url().max(300)]).optional(),
    setup_step: z.number().int().min(1).max(8).optional(),
  })
  .strict();

const Targets = z
  .object({
    roles: list(15).refine((a) => a.length > 0, 'En az bir rol seçmelisin.'),
    excluded: list(20),
    cities: list(10, 40),
    work_modes: z.array(z.enum(['remote', 'hybrid', 'onsite'])).min(1, 'En az bir çalışma şekli seç.').max(3),
    seniority: z.array(z.enum(P.SENIORITY)).min(1, 'En az bir kıdem seç.').max(4),
    long_term_internship: z.boolean(),
  })
  .strict();

const NewCv = z.object({
  label: text(40),
  fileName: z.string().max(200).optional(),
  fileBase64: z.string().min(100),
  text: z.string().min(200, 'PDF\'ten yeterli metin okunamadı. Metin tabanlı bir PDF yükle.').max(60_000),
});

const parse = (schema, body) => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw Errors.badRequest(r.error.issues[0]?.message || 'Geçersiz istek.');
  return r.data;
};

const AppPatch = z
  .object({
    subject: text(150).optional(),
    cover_letter: text(3000).optional(),
    status: z.enum(['skipped', 'pending_approval']).optional(),
  })
  .strict();
const APP_STATUSES = ['pending_approval', 'skipped', 'sent', 'failed', 'replied', 'interview', 'rejected'];
const APP_FIELDS = 'id,company,position,recipient,source_url,kind,score,reason,cover_letter,subject,cv_id,status,error,created_at,sent_at';

const secretMatches = (given, expected) => {
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
};

const pdfName = (fullName) => `${(fullName || 'CV').trim().replace(/\s+/g, '_')}_CV.pdf`;

export function automationRouter({ supabase, limiter, heavyLimiter, llm, budget, config = {}, gmail = null, sealer = null, search = null, readPage = null }) {
  const router = express.Router();
  const json = express.json({ limit: '50kb' });
  const jsonUpload = express.json({ limit: '8mb' });
  const running = new Set(); // aynı kullanıcı için eşzamanlı işçi çalışmasın
  const workerReady = Boolean(search?.enabled && readPage);

  async function runWorker(userId, log, opts = {}) {
    if (running.has(userId)) return { status: 'skipped', reason: 'already_running' };
    running.add(userId);
    try {
      return await runForUser({ supabase, llm, budget, search, readPage, log, config, userId, ...opts });
    } finally {
      running.delete(userId);
    }
  }

  // ---- Herkese açık uçlar (oturum gerektirmez) -----------------------------------
  // Google OAuth dönüşü: kodu refresh token ile değiştirir, şifreleyip saklar, panele döner.
  router.get('/gmail/callback', rateLimit(limiter, 'automation'), async (req, res) => {
    const back = (status) => res.redirect(302, `${config.APP_URL || ''}/otomasyon?gmail=${status}`);
    if (!gmail || !sealer) return back('unavailable');
    const state = sealer.verify(req.query.state);
    if (!state?.uid) return back('expired');
    if (req.query.error || !req.query.code) return back('denied');
    try {
      const t = await gmail.exchangeCode(String(req.query.code));
      if (!t.scopes.includes('gmail.send')) return back('scope');
      if (!t.refreshToken) return back('error');
      await supabase.insert(
        'gmail_connections',
        [{ user_id: state.uid, google_email: t.email || state.email, refresh_token_enc: sealer.encrypt(t.refreshToken), scopes: t.scopes, connected_at: new Date().toISOString() }],
        { upsert: true, onConflict: 'user_id' },
      );
      await supabase.insert('inbox_items', [{ user_id: state.uid, kind: 'system', title: 'Gmail bağlandı', body: `Onayladığın başvurular ${t.email || 'Gmail adresinden'} gönderilecek. Bağlantıyı Ayarlar sekmesinden istediğin an kaldırabilirsin.` }]);
      back('ok');
    } catch (err) {
      req.log.warn('gmail_callback_failed', { code: err.code, details: err.details });
      back('error');
    }
  });

  // GitHub Actions günlük tetikleyicisi: önce kullanıcı listesini alır, sonra her kullanıcı için ayrı çağırır.
  const cronOnly = (req, res, next) => (secretMatches(req.get('x-cron-secret'), config.CRON_SECRET) ? next() : next(Errors.notFound()));
  router.post('/internal/users', cronOnly, async (req, res) => {
    res.json({ users: workerReady ? await listDueUsers(supabase) : [], workerReady });
  });
  router.post('/internal/run/:userId', cronOnly, async (req, res) => {
    const userId = z.uuid().parse(req.params.userId);
    if (!workerReady) throw Errors.notConfigured();
    res.json(await runWorker(userId, req.log));
  });

  router.use(rateLimit(limiter, 'automation'), requireUser(supabase));
  const heavy = heavyLimiter ? rateLimit(heavyLimiter, 'automation_ai') : (req, res, next) => next();
  const ctxFor = (req) => ({ llm, budget, log: req.log, trace: [] });

  /** Ensures a profile row exists for the signed-in user (first visit creates it). */
  async function ensureProfile(req) {
    const rows = await supabase.select('profiles', `id=eq.${uid(req)}&select=*`);
    if (rows.length) return { profile: rows[0], created: false };
    const meta = req.user.user_metadata || {};
    const [profile] = await supabase.insert(
      'profiles',
      [{ id: req.user.id, email: req.user.email, full_name: meta.full_name || meta.name || null, avatar_url: meta.avatar_url || meta.picture || null }],
      { upsert: true, onConflict: 'id' },
    );
    await supabase.insert('inbox_items', [{ user_id: req.user.id, ...WELCOME }]);
    return { profile, created: true };
  }

  const listCvs = (req) =>
    supabase.select('cvs', `user_id=eq.${uid(req)}&select=id,label,is_default,extracted_profile,created_at&order=created_at.asc`);

  router.get('/me', async (req, res) => {
    const { profile, created } = await ensureProfile(req);
    const unread = await supabase.select('inbox_items', `user_id=eq.${uid(req)}&read_at=is.null&select=id`);
    res.json({ profile, created, unreadCount: unread.length });
  });

  router.patch('/me', json, async (req, res) => {
    const data = parse(PatchProfile, req.body);
    await ensureProfile(req);
    const { kvkk_accepted, ...rest } = data;
    const patch = { ...rest, updated_at: new Date().toISOString() };
    if (kvkk_accepted) patch.kvkk_accepted_at = new Date().toISOString();
    const [profile] = await supabase.update('profiles', `id=eq.${uid(req)}`, patch);
    res.json({ profile });
  });

  // ---- Kurulum sihirbazı ---------------------------------------------------
  router.get('/setup', async (req, res) => {
    const { profile } = await ensureProfile(req);
    const [cvs, targets] = await Promise.all([listCvs(req), supabase.select('targets', `user_id=eq.${uid(req)}&select=*`)]);
    res.json({ profile, cvs, targets: targets[0] || null });
  });

  router.post('/cvs', heavy, jsonUpload, async (req, res) => {
    const data = parse(NewCv, req.body);
    await ensureProfile(req);
    const existing = await listCvs(req);
    if (existing.length >= MAX_CVS) throw Errors.badRequest(`En fazla ${MAX_CVS} CV yükleyebilirsin. Yenisini eklemek için birini sil.`);

    const bytes = Buffer.from(data.fileBase64, 'base64');
    if (bytes.length > MAX_PDF_BYTES) throw Errors.badRequest('PDF en fazla 5 MB olabilir.');
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw Errors.badRequest('Dosya geçerli bir PDF değil.');

    // Yapay zeka analizi (CV kontrolü + profil). Servis geçici olarak ulaşılamazsa CV yine kaydedilir,
    // profil sonradan çıkarılabilir; kullanıcı kurulumda takılmaz.
    let profile = null;
    try {
      budget.assertAvailable();
      const ctx = ctxFor(req);
      const check = await runTask(ctx, P.classifyDocument({ cv: data.text }));
      if (!check.is_cv) throw Errors.notCv();
      profile = await runTask(ctx, P.extractProfile({ cv: data.text }));
    } catch (err) {
      if (err.code === 'NOT_A_CV' || !AI_SOFT_FAILURES.has(err.code)) throw err;
      req.log.warn('cv_analysis_skipped', { code: err.code });
    }

    const id = randomUUID();
    const storagePath = `${req.user.id}/${id}.pdf`;
    await supabase.upload('cvs', storagePath, bytes, 'application/pdf');
    const [cv] = await supabase.insert('cvs', [
      { id, user_id: req.user.id, label: data.label, storage_path: storagePath, extracted_profile: { ...(profile || { pending: true }), source_text: data.text.slice(0, 40_000) }, is_default: existing.length === 0 },
    ]);
    const { source_text, ...publicProfile } = cv.extracted_profile; // eslint-disable-line no-unused-vars
    res.status(201).json({ cv: { id: cv.id, label: cv.label, is_default: cv.is_default, created_at: cv.created_at, extracted_profile: publicProfile } });
  });

  router.patch('/cvs/:id', json, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const data = parse(z.object({ label: text(40).optional(), is_default: z.literal(true).optional() }).strict(), req.body);
    const owned = await supabase.select('cvs', `id=eq.${id}&user_id=eq.${uid(req)}&select=id`);
    if (!owned.length) throw Errors.notFound();
    if (data.is_default) await supabase.update('cvs', `user_id=eq.${uid(req)}&is_default=eq.true`, { is_default: false });
    await supabase.update('cvs', `id=eq.${id}&user_id=eq.${uid(req)}`, data);
    res.json({ cvs: await listCvs(req) });
  });

  router.delete('/cvs/:id', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const [cv] = await supabase.remove('cvs', `id=eq.${id}&user_id=eq.${uid(req)}`);
    if (!cv) throw Errors.notFound();
    await supabase.removeFiles('cvs', [cv.storage_path]);
    let cvs = await listCvs(req);
    if (cv.is_default && cvs.length) {
      await supabase.update('cvs', `id=eq.${cvs[0].id}&user_id=eq.${uid(req)}`, { is_default: true });
      cvs = await listCvs(req);
    }
    res.json({ cvs });
  });

  router.post('/roles/suggest', heavy, json, async (req, res) => {
    const { roles } = parse(z.object({ roles: z.array(text(60)).max(15) }), req.body);
    const cvs = await listCvs(req);
    const main = cvs.find((c) => c.is_default) || cvs[0];
    if (!main) throw Errors.badRequest('Rol önerisi için önce bir CV yükle.');
    const { source_text, ...profile } = main.extracted_profile || {}; // eslint-disable-line no-unused-vars
    const out = await runTask(ctxFor(req), P.suggestRoles({ profile, roles }));
    const chosen = new Set(roles.map((r) => r.toLocaleLowerCase('tr')));
    res.json({ suggestions: out.suggestions.filter((s) => !chosen.has(s.title.toLocaleLowerCase('tr'))) });
  });

  router.put('/targets', json, async (req, res) => {
    const data = parse(Targets, req.body);
    await ensureProfile(req);
    const [targets] = await supabase.insert('targets', [{ user_id: req.user.id, ...data, updated_at: new Date().toISOString() }], {
      upsert: true,
      onConflict: 'user_id',
    });
    res.json({ targets });
  });

  // ---- Gmail bağlantısı -------------------------------------------------------
  router.get('/gmail', async (req, res) => {
    const [conn] = await supabase.select('gmail_connections', `user_id=eq.${uid(req)}&select=google_email,connected_at`);
    res.json({ available: Boolean(gmail && sealer), connected: Boolean(conn), email: conn?.google_email || null, connectedAt: conn?.connected_at || null });
  });

  router.post('/gmail/connect', async (req, res) => {
    if (!gmail || !sealer) throw Errors.notConfigured();
    await ensureProfile(req);
    const state = sealer.sign({ uid: req.user.id, email: req.user.email });
    res.json({ url: gmail.authUrl({ state, loginHint: req.user.email }) });
  });

  router.delete('/gmail', async (req, res) => {
    const [conn] = await supabase.remove('gmail_connections', `user_id=eq.${uid(req)}`);
    if (conn && gmail && sealer) {
      try { await gmail.revoke(sealer.decrypt(conn.refresh_token_enc)); } catch { /* bağlantı zaten silindi */ }
    }
    res.json({ connected: false });
  });

  // ---- Başvurular ---------------------------------------------------------------
  router.get('/applications', async (req, res) => {
    const status = String(req.query.status || '');
    const statuses = status.split(',').filter((x) => APP_STATUSES.includes(x));
    const filter = statuses.length ? `&status=in.(${statuses.join(',')})` : '';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await supabase.select('applications', `user_id=eq.${uid(req)}${filter}&select=${APP_FIELDS}&order=created_at.desc&limit=${limit}`);
    const cvs = await listCvs(req);
    const label = Object.fromEntries(cvs.map((c) => [c.id, c.label]));
    res.json({ items: items.map((a) => ({ ...a, cv_label: label[a.cv_id] || null })) });
  });

  const ownedApp = async (req) => {
    const id = z.uuid().parse(req.params.id);
    const [app] = await supabase.select('applications', `id=eq.${id}&user_id=eq.${uid(req)}&select=*`);
    if (!app) throw Errors.notFound();
    return app;
  };

  router.patch('/applications/:id', json, async (req, res) => {
    const data = parse(AppPatch, req.body);
    const app = await ownedApp(req);
    if (!['pending_approval', 'skipped', 'failed'].includes(app.status)) throw Errors.badRequest('Gönderilmiş bir başvuru düzenlenemez.');
    const [updated] = await supabase.update('applications', `id=eq.${app.id}&user_id=eq.${uid(req)}`, data);
    res.json({ application: updated });
  });

  router.post('/applications/:id/send', heavy, async (req, res) => {
    if (!gmail || !sealer) throw Errors.notConfigured();
    const app = await ownedApp(req);
    if (!['pending_approval', 'failed'].includes(app.status)) throw Errors.badRequest('Bu başvuru zaten gönderilmiş ya da atlanmış.');
    if (!app.recipient) throw Errors.badRequest('Bu başvurunun alıcı adresi yok.');
    const { profile } = await ensureProfile(req);
    const sentToday = await supabase.select('applications', `user_id=eq.${uid(req)}&status=eq.sent&sent_at=gte.${encodeURIComponent(dayStart(new Date()))}&select=id`);
    if (sentToday.length >= profile.daily_limit) throw Errors.badRequest(`Günlük gönderim limitine (${profile.daily_limit}) ulaştın. Limiti Ayarlar'dan değiştirebilir ya da yarın gönderebilirsin.`);

    const [conn] = await supabase.select('gmail_connections', `user_id=eq.${uid(req)}&select=*`);
    if (!conn) throw new AppError('GMAIL_NOT_CONNECTED', 409, 'Göndermek için önce Gmail hesabını bağla.');
    const cvs = await supabase.select('cvs', `user_id=eq.${uid(req)}&select=id,storage_path,is_default,extracted_profile`);
    const cv = cvs.find((c) => c.id === app.cv_id) || cvs.find((c) => c.is_default) || cvs[0];
    if (!cv) throw Errors.badRequest('Ekleyecek bir CV bulunamadı. Önce CV yükle.');
    const fullName = profile.full_name || cv.extracted_profile?.full_name || '';

    try {
      const access = await gmail.accessToken(sealer.decrypt(conn.refresh_token_enc));
      const bytes = await supabase.download('cvs', cv.storage_path);
      const mime = buildMime({ from: conn.google_email, fromName: fullName, to: app.recipient, subject: app.subject, text: app.cover_letter, attachment: { filename: pdfName(fullName), bytes } });
      await gmail.send(access, mime);
    } catch (err) {
      if (err.code === 'GMAIL_REVOKED') await supabase.remove('gmail_connections', `user_id=eq.${uid(req)}`);
      await supabase.update('applications', `id=eq.${app.id}&user_id=eq.${uid(req)}`, { error: String(err.message).slice(0, 300) });
      throw err;
    }
    const [updated] = await supabase.update('applications', `id=eq.${app.id}&user_id=eq.${uid(req)}`, { status: 'sent', sent_at: new Date().toISOString(), error: null });
    await supabase.insert('inbox_items', [{ user_id: req.user.id, kind: 'sent', title: `Başvuru gönderildi: ${app.company}`, body: `${app.position || 'Açık başvuru'} · ${app.recipient}`, data: { application_id: app.id } }]);
    res.json({ application: updated });
  });

  // Kullanıcının kendi taramasını elle başlatması (günde bir kez; zamanlanmış çalışmayla aynı kural).
  // ?stream=1 → adımlar canlı olarak NDJSON satırları halinde akar ({type:'progress'|'result'|'error'}).
  router.post('/run', heavy, async (req, res) => {
    if (!workerReady) throw Errors.notConfigured();
    await ensureProfile(req);
    if (req.query.stream !== '1') return res.json(await runWorker(req.user.id, req.log));

    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    let open = true;
    req.on('close', () => { open = false; });
    const write = (obj) => { if (open) res.write(`${JSON.stringify(obj)}\n`); };
    const beat = setInterval(() => write({ type: 'ping' }), 15_000);
    try {
      const result = await runWorker(req.user.id, req.log, { onProgress: (p) => write({ type: 'progress', ...p }) });
      write({ type: 'result', ...result });
    } catch (err) {
      req.log.warn('run_stream_failed', { code: err.code, error: err.message });
      write({ type: 'error', code: err.code || 'ERROR', message: err.code ? err.message : 'Tarama tamamlanamadı. Daha sonra tekrar dene.' });
    } finally {
      clearInterval(beat);
      res.end();
    }
  });

  // ---- Gelen kutusu --------------------------------------------------------
  router.get('/inbox', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const items = await supabase.select(
      'inbox_items',
      `user_id=eq.${uid(req)}&select=id,kind,title,body,data,read_at,created_at&order=created_at.desc&limit=${limit}`,
    );
    res.json({ items });
  });

  router.post('/inbox/read', json, async (req, res) => {
    const ids = z.array(z.uuid()).max(100).safeParse(req.body?.ids);
    if (!ids.success) throw Errors.badRequest('Geçersiz istek.');
    const filter = ids.data.length ? `&id=in.(${ids.data.join(',')})` : '';
    await supabase.update('inbox_items', `user_id=eq.${uid(req)}&read_at=is.null${filter}`, { read_at: new Date().toISOString() });
    res.json({ ok: true });
  });

  return router;
}
