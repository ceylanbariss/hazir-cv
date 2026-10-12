// Small in-process protection primitives. They are intentionally dependency
// free; on a multi-instance deployment swap the stores for Redis (same API).
import { Errors } from './errors.js';

/** Fixed-window rate limiter keyed by an arbitrary string (usually ip + route group). */
export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  sweep.unref?.();

  return {
    /** Returns { ok, remaining, retryAfterSec } and records the hit when ok. */
    take(key) {
      const t = now();
      const rec = hits.get(key);
      if (!rec || t - rec.start >= windowMs) {
        hits.set(key, { start: t, count: 1 });
        return { ok: true, remaining: max - 1, retryAfterSec: 0 };
      }
      if (rec.count >= max) {
        return { ok: false, remaining: 0, retryAfterSec: Math.ceil((rec.start + windowMs - t) / 1000) };
      }
      rec.count += 1;
      return { ok: true, remaining: max - rec.count, retryAfterSec: 0 };
    },
    stop: () => clearInterval(sweep),
  };
}

export function rateLimit(limiter, group) {
  return (req, res, next) => {
    const r = limiter.take(`${group}:${req.ip}`);
    res.setHeader('RateLimit-Remaining', String(r.remaining));
    if (!r.ok) {
      res.setHeader('Retry-After', String(r.retryAfterSec));
      return next(Errors.rateLimited(r.retryAfterSec));
    }
    next();
  };
}

/** Bounded concurrency for expensive pipelines; rejects instead of queueing unboundedly. */
export function createSemaphore(max) {
  let active = 0;
  return {
    tryAcquire() {
      if (active >= max) return null;
      active += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          active -= 1;
        }
      };
    },
    get active() {
      return active;
    },
  };
}

/**
 * Daily spend guard based on *estimated* cost from token usage. The product is
 * free, so an abuse spike must degrade gracefully instead of burning the budget.
 */
export function createBudget({ dailyUsd, now = () => new Date() }) {
  let day = now().toISOString().slice(0, 10);
  let spent = 0;
  const roll = () => {
    const d = now().toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      spent = 0;
    }
  };
  return {
    assertAvailable() {
      roll();
      if (dailyUsd > 0 && spent >= dailyUsd) throw Errors.budgetExceeded();
    },
    record(usd) {
      roll();
      spent += usd || 0;
    },
    snapshot() {
      roll();
      return { day, spentUsd: Number(spent.toFixed(4)), limitUsd: dailyUsd };
    },
  };
}
