// Express middleware: requires a Supabase access token (Authorization: Bearer …)
// and attaches the verified user as req.user. Short-lived in-memory cache keeps
// panel navigation from hitting Supabase Auth on every request.
import { Errors } from '../lib/errors.js';

export function requireUser(supabase, { cacheMs = 60_000, now = () => Date.now() } = {}) {
  const cache = new Map();
  return async (req, res, next) => {
    try {
      const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
      if (!m) throw Errors.unauthorized();
      const token = m[1].trim();
      const hit = cache.get(token);
      if (hit && hit.exp > now()) {
        req.user = hit.user;
        return next();
      }
      const user = await supabase.getUser(token);
      if (!user) throw Errors.unauthorized();
      if (cache.size > 5000) cache.clear();
      cache.set(token, { user, exp: now() + cacheMs });
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
