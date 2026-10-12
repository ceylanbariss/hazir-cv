// End-to-end HTTP tests: real Express stack + mock LLM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/lib/logger.js';
import { createMockProvider } from '../src/llm/mock.js';
import { createApp } from '../src/app.js';
import { createRateLimiter } from '../src/lib/guards.js';
import { CASES } from '../eval/dataset.js';

let server;
let base;
const fit = CASES.find((c) => c.id === 'tr_frontend_fit');

before(async () => {
  const config = loadConfig({ LLM_PROVIDER: 'mock', NODE_ENV: 'test' });
  const app = createApp({
    config,
    llm: createMockProvider(),
    logger: createLogger('silent'),
    limiters: { heavy: createRateLimiter({ windowMs: 60_000, max: 6 }), chat: createRateLimiter({ windowMs: 60_000, max: 50 }) },
  });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health', async () => {
  const r = await fetch(`${base}/api/v1/health`);
  const j = await r.json();
  assert.equal(j.status, 'ok');
  assert.equal(j.provider, 'mock');
  assert.ok(r.headers.get('x-request-id'));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('tailor (JSON mode) returns analysis, verification and meta', async () => {
  const r = await post('/api/v1/tailor', { cv: fit.cv, jobPosting: fit.jobPosting, lang: 'tr' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.analysis.requirements.length > 0);
  assert.ok(j.verification.summary.total > 0);
  assert.equal(j.meta.requestId, r.headers.get('x-request-id'));
});

test('tailor (SSE mode) streams stages then a result', async () => {
  const r = await post('/api/v1/tailor', { cv: fit.cv, jobPosting: fit.jobPosting, lang: 'tr' }, { Accept: 'text/event-stream' });
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const text = await r.text();
  const events = [...text.matchAll(/event: (\w+)/g)].map((m) => m[1]);
  assert.equal(events.at(-1), 'result');
  assert.ok(events.filter((e) => e === 'stage').length >= 8);
});

test('SSE mode reports domain errors as an error event', async () => {
  const inv = CASES.find((c) => c.id === 'not_a_cv_invoice');
  const r = await post('/api/v1/tailor', { cv: inv.cv, jobPosting: inv.jobPosting }, { Accept: 'text/event-stream' });
  const text = await r.text();
  assert.match(text, /event: error/);
  assert.match(text, /NOT_A_CV/);
});

test('validation errors are 400 with a stable code and no model call', async () => {
  const r = await post('/api/v1/tailor', { cv: 'x', jobPosting: 'kısa' });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.error.code, 'BAD_REQUEST');
});

test('integrate-gaps requires explicit confirmation', async () => {
  const r = await post('/api/v1/assist/integrate-gaps', { gaps: ['Docker'], lang: 'tr' });
  assert.equal(r.status, 400);
  const ok = await post('/api/v1/assist/integrate-gaps', { gaps: ['Docker'], lang: 'tr', confirmed: true });
  assert.equal(ok.status, 200);
});

test('CORS: allow-listed origin passes, unknown origin is rejected', async () => {
  const good = await fetch(`${base}/api/v1/health`, { headers: { Origin: 'https://hazircv.com.tr' } });
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://hazircv.com.tr');
  const bad = await fetch(`${base}/api/v1/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('legacy open proxy is disabled by default', async () => {
  const r = await post('/optimize', { contents: [{ parts: [{ text: 'hi' }] }] });
  assert.equal(r.status, 404);
});

test('rate limit returns 429 with Retry-After', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = await post('/api/v1/interview/report', { cv: fit.cv, jobPosting: fit.jobPosting, type: 'hr', history: [] });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});
