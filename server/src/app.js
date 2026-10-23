import express from 'express';
import cors from 'cors';
import { requestContext, securityHeaders, corsOptions, errorHandler } from './lib/http.js';
import { createRateLimiter, createSemaphore, createBudget, rateLimit } from './lib/guards.js';
import { Errors } from './lib/errors.js';
import { v1Router } from './routes/v1.js';
import { automationRouter } from './routes/automation.js';
import { createSupabase } from './automation/supabase.js';

const HOUR = 60 * 60 * 1000;

/**
 * Builds the Express app. Dependencies are injected so tests can run the real
 * HTTP stack against a mock LLM.
 */
export function createApp({ config, llm, logger, budget, semaphore, limiters, supabase } = {}) {
  const deps = {
    config,
    llm,
    budget: budget || createBudget({ dailyUsd: config.DAILY_BUDGET_USD }),
    semaphore: semaphore || createSemaphore(config.MAX_CONCURRENT_PIPELINES),
  };
  const lim = limiters || {
    heavy: createRateLimiter({ windowMs: HOUR, max: 20 }), // full pipelines, OCR, reports
    chat: createRateLimiter({ windowMs: HOUR, max: 150 }), // interview turns, editor assists
    automation: createRateLimiter({ windowMs: HOUR, max: 600 }), // signed-in panel
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestContext(logger));
  app.use(securityHeaders());
  app.use(cors(corsOptions(config)));

  app.get('/', (req, res) => res.json({ service: 'hazircv-api', status: 'ok', docs: '/api/v1/health' }));
  const db =
    supabase ||
    (config.automationEnabled ? createSupabase({ url: config.SUPABASE_URL, serviceKey: config.SUPABASE_SERVICE_ROLE_KEY }) : null);
  if (db) {
    app.use('/api/v1/automation', automationRouter({ supabase: db, limiter: lim.automation || lim.chat }));
  } else {
    app.use('/api/v1/automation', (req, res, next) => next(Errors.notConfigured()));
  }
  app.use('/api/v1', v1Router({ deps, limiters: lim }));

  if (config.ENABLE_LEGACY_OPTIMIZE) {
    // v2 client compatibility for a zero-downtime rollout. Only plain prompt
    // pass-through, still rate-limited and budget-guarded. Disable after the
    // v3 client is live (ENABLE_LEGACY_OPTIMIZE=false).
    app.post('/optimize', rateLimit(lim.heavy, 'legacy'), express.json({ limit: '25mb' }), async (req, res) => {
      deps.budget.assertAvailable();
      const sys = req.body?.systemInstruction?.parts?.[0]?.text || '';
      const parts = (req.body?.contents?.[0]?.parts || []).slice(0, 8);
      if (!parts.length) throw Errors.badRequest('Boş istek.');
      const out = await llm.generate({
        system: sys.slice(0, 20_000),
        parts,
        json: req.body?.generationConfig?.responseMimeType === 'application/json',
      });
      req.log.warn('legacy_optimize_used');
      res.json({ candidates: [{ content: { parts: [{ text: out.text.replace(/```json|```/g, '').trim() }] } }] });
    });
  }

  app.use((req, res, next) => next(Errors.notFound()));
  app.use(errorHandler());
  return app;
}
