// /api/v1/automation — başvuru otomasyonu modülü (Faz 0: hesap + gelen kutusu).
import express from 'express';
import { z } from 'zod/v4';
import { Errors } from '../lib/errors.js';
import { rateLimit } from '../lib/guards.js';
import { requireUser } from '../automation/auth.js';

const uid = (req) => encodeURIComponent(req.user.id);

const WELCOME = {
  kind: 'welcome',
  title: 'Başvuru asistanına hoş geldin',
  body:
    'Hesabın oluşturuldu. Kurulumu tamamladığında her gün bulunan ilanlar, onay bekleyen başvurular ve günlük özet ' +
    'hem e-postana hem de buradaki gelen kutusuna düşecek.',
};

const PatchProfile = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  kvkk_accepted: z.literal(true).optional(),
}).strict();

export function automationRouter({ supabase, limiter }) {
  const router = express.Router();
  const json = express.json({ limit: '50kb' });
  router.use(rateLimit(limiter, 'automation'), requireUser(supabase));

  /** Ensures a profile row exists for the signed-in user (first visit creates it). */
  async function ensureProfile(req) {
    const rows = await supabase.select('profiles', `id=eq.${uid(req)}&select=*`);
    if (rows.length) return { profile: rows[0], created: false };
    const meta = req.user.user_metadata || {};
    const [profile] = await supabase.insert(
      'profiles',
      [{ id: req.user.id, email: req.user.email, full_name: meta.full_name || meta.name || null, avatar_url: meta.avatar_url || null }],
      { upsert: true, onConflict: 'id' },
    );
    await supabase.insert('inbox_items', [{ user_id: req.user.id, ...WELCOME }]);
    return { profile, created: true };
  }

  router.get('/me', async (req, res) => {
    const { profile, created } = await ensureProfile(req);
    const unread = await supabase.select('inbox_items', `user_id=eq.${uid(req)}&read_at=is.null&select=id`);
    res.json({ profile, created, unreadCount: unread.length });
  });

  router.patch('/me', json, async (req, res) => {
    const r = PatchProfile.safeParse(req.body ?? {});
    if (!r.success) throw Errors.badRequest('Geçersiz istek.');
    await ensureProfile(req);
    const patch = { updated_at: new Date().toISOString() };
    if (r.data.full_name) patch.full_name = r.data.full_name;
    if (r.data.kvkk_accepted) patch.kvkk_accepted_at = new Date().toISOString();
    const [profile] = await supabase.update('profiles', `id=eq.${uid(req)}`, patch);
    res.json({ profile });
  });

  router.get('/inbox', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const items = await supabase.select(
      'inbox_items',
      `user_id=eq.${uid(req)}&select=id,kind,title,body,data,read_at,created_at&order=created_at.desc&limit=${limit}`,
    );
    res.json({ items });
  });

  router.post('/inbox/read', json, async (req, res) => {
    const ids = z.array(z.string().uuid()).max(100).safeParse(req.body?.ids);
    if (!ids.success) throw Errors.badRequest('Geçersiz istek.');
    const filter = ids.data.length ? `&id=in.(${ids.data.join(',')})` : '';
    await supabase.update('inbox_items', `user_id=eq.${uid(req)}&read_at=is.null${filter}`, { read_at: new Date().toISOString() });
    res.json({ ok: true });
  });

  return router;
}
