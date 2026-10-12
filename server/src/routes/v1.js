import express from 'express';
import { z } from 'zod/v4';
import * as A from '../schemas/api.js';
import { Errors } from '../lib/errors.js';
import { rateLimit } from '../lib/guards.js';
import { openSse, wantsSse, toBody } from '../lib/http.js';
import { runTailorPipeline } from '../pipeline/tailor.js';
import * as interview from '../pipeline/interview.js';
import * as assist from '../pipeline/assist.js';
import { PROMPT_VERSION } from '../prompts/tasks.js';

const parse = (schema, body) => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    throw Errors.badRequest(first?.message || 'Geçersiz istek.', { issues: z.flattenError(r.error).fieldErrors });
  }
  return r.data;
};

export function v1Router({ deps, limiters }) {
  const { llm, budget, semaphore } = deps;
  const router = express.Router();
  const json = express.json({ limit: '300kb' });
  const jsonLarge = express.json({ limit: '25mb' });

  // Per-request context handed to every LLM task (telemetry is collected in `trace`).
  const ctxFor = (req) => ({ llm, budget, log: req.log, trace: [] });

  // Expensive multi-step work is admission-controlled.
  const withSlot = async (fn) => {
    budget.assertAvailable();
    const release = semaphore.tryAcquire();
    if (!release) throw Errors.busy();
    try {
      return await fn();
    } finally {
      release();
    }
  };

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '3.0.0',
      promptVersion: PROMPT_VERSION,
      provider: llm.name,
      model: llm.model,
      activePipelines: semaphore.active,
      budget: budget.snapshot(),
    });
  });

  router.post('/tailor', rateLimit(limiters.heavy, 'tailor'), json, async (req, res) => {
    const input = parse(A.TailorRequest, req.body);
    req.log.info('tailor_request', { cvChars: input.cv.length, jobChars: input.jobPosting.length, lang: input.lang });
    const ctx = ctxFor(req);

    if (!wantsSse(req)) {
      const result = await withSlot(() => runTailorPipeline(ctx, input));
      return res.json({ ...result, meta: { ...result.meta, requestId: req.id } });
    }

    // Streaming mode: validation errors above are still plain JSON (headers not sent yet).
    const sse = openSse(res);
    let closed = false;
    res.on('close', () => (closed = true));
    try {
      const result = await withSlot(() =>
        runTailorPipeline(ctx, input, (evt) => !closed && sse.send('stage', evt)),
      );
      if (!closed) sse.send('result', { ...result, meta: { ...result.meta, requestId: req.id } });
    } catch (err) {
      const appErr = err?.code ? err : Errors.upstream();
      if (!err?.code) req.log.error('tailor_failed', { err: err?.message });
      if (!closed) sse.send('error', toBody(appErr, req));
    } finally {
      sse.close();
    }
  });

  router.post('/interview/turn', rateLimit(limiters.chat, 'interview'), json, async (req, res) => {
    const input = parse(A.InterviewTurnRequest, req.body);
    budget.assertAvailable();
    res.json(await interview.nextTurn(ctxFor(req), input));
  });

  router.post('/interview/report', rateLimit(limiters.heavy, 'interview_report'), json, async (req, res) => {
    const input = parse(A.InterviewReportRequest, req.body);
    res.json(await withSlot(() => interview.report(ctxFor(req), input)));
  });

  router.post('/assist/add-item', rateLimit(limiters.chat, 'assist'), json, async (req, res) => {
    const input = parse(A.AddItemRequest, req.body);
    budget.assertAvailable();
    res.json(await assist.addItem(ctxFor(req), input));
  });

  router.post('/assist/integrate-gaps', rateLimit(limiters.chat, 'assist'), json, async (req, res) => {
    const input = parse(A.IntegrateGapsRequest, req.body);
    budget.assertAvailable();
    res.json(await assist.integrateGaps(ctxFor(req), input));
  });

  router.post('/ocr', rateLimit(limiters.heavy, 'ocr'), jsonLarge, async (req, res) => {
    const input = parse(A.OcrRequest, req.body);
    res.json(await withSlot(() => assist.ocr(ctxFor(req), input)));
  });

  router.use(() => {
    throw Errors.notFound();
  });

  return router;
}
