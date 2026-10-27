import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../src/llm/gemini.js';
import { createRateLimiter, createSemaphore, createBudget } from '../src/lib/guards.js';
import { loadConfig } from '../src/config.js';

const cfg = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash', LLM_TIMEOUT_MS: 1000, LLM_MAX_RETRIES: 2, GEMINI_STRUCTURED_MODE: 'json_schema' };
const ok = (text) => ({
  status: 200,
  body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking...', thought: true }, { text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 } },
});
const fakeFetch = (seq, seen = []) => async (url, init) => {
  seen.push({ url, body: JSON.parse(init.body), headers: init.headers });
  const next = seq.shift();
  return { status: next.status, text: async () => JSON.stringify(next.body) };
};

test('gemini: key in header (not URL), thought parts skipped, usage mapped', async () => {
  const seen = [];
  const p = createGeminiProvider(cfg, { fetchImpl: fakeFetch([ok('{"a":1}')], seen) });
  const out = await p.generate({ system: 's', parts: [{ text: 'u' }], jsonSchema: { type: 'object' } });
  assert.equal(out.text, '{"a":1}');
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 5, thinkingTokens: 3 });
  assert.ok(!seen[0].url.includes('key='));
  assert.equal(seen[0].headers['x-goog-api-key'], 'k');
  assert.deepEqual(seen[0].body.generationConfig.responseJsonSchema, { type: 'object' });
});

test('gemini: retries 429/5xx, then succeeds', async () => {
  const p = createGeminiProvider(cfg, { fetchImpl: fakeFetch([{ status: 429, body: {} }, { status: 503, body: {} }, ok('x')]) });
  const out = await p.generate({ system: 's', parts: [{ text: 'u' }] });
  assert.equal(out.retries, 2);
});

test('gemini: falls back to plain JSON mode if the schema is rejected', async () => {
  const seen = [];
  const p = createGeminiProvider(cfg, {
    fetchImpl: fakeFetch([{ status: 400, body: { error: { message: 'Invalid JSON schema' } } }, ok('{}')], seen),
  });
  await p.generate({ system: 's', parts: [{ text: 'u' }], jsonSchema: { type: 'object' } });
  assert.equal(seen[1].body.generationConfig.responseJsonSchema, undefined);
  assert.equal(seen[1].body.generationConfig.responseMimeType, 'application/json');
});

test('gemini: non-retryable error surfaces as UPSTREAM_ERROR', async () => {
  const p = createGeminiProvider(cfg, { fetchImpl: fakeFetch([{ status: 403, body: { error: { message: 'denied' } } }]) });
  await assert.rejects(p.generate({ system: 's', parts: [] }), { code: 'UPSTREAM_ERROR' });
});

test('rate limiter: fixed window', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
  assert.ok(rl.take('a').ok);
  assert.ok(rl.take('a').ok);
  const blocked = rl.take('a');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 1);
  assert.ok(rl.take('b').ok, 'keys are independent');
  t = 1000;
  assert.ok(rl.take('a').ok, 'window resets');
  rl.stop();
});

test('semaphore rejects beyond capacity and release is idempotent', () => {
  const s = createSemaphore(1);
  const release = s.tryAcquire();
  assert.equal(s.tryAcquire(), null);
  release();
  release();
  assert.equal(s.active, 0);
});

test('budget resets daily', () => {
  let d = new Date('2026-01-01T10:00:00Z');
  const b = createBudget({ dailyUsd: 1, now: () => d });
  b.record(2);
  assert.throws(() => b.assertAvailable(), { code: 'DAILY_CAPACITY_REACHED' });
  d = new Date('2026-01-02T00:00:01Z');
  b.assertAvailable();
});

test('config requires a key for gemini and accepts mock without one', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'gemini' }), /GEMINI_API_KEY/);
  const c = loadConfig({ LLM_PROVIDER: 'mock', ENABLE_LEGACY_OPTIMIZE: 'true' });
  assert.equal(c.ENABLE_LEGACY_OPTIMIZE, true);
  assert.ok(c.originPattern.test('https://resumatch-v2-git-v3-ceylanbariss.vercel.app'));
  assert.ok(!c.originPattern.test('https://evil.vercel.app'));
  assert.equal(loadConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: '"abc" ' }).GEMINI_API_KEY, 'abc');
});

test('boolean env values are tolerant of casing, spaces and quotes', () => {
  for (const v of ['False', ' false ', '"false"', 'FALSE', '0', 'off']) {
    assert.equal(loadConfig({ LLM_PROVIDER: 'mock', ENABLE_LEGACY_OPTIMIZE: v }).ENABLE_LEGACY_OPTIMIZE, false, v);
  }
  assert.equal(loadConfig({ LLM_PROVIDER: 'mock', ENABLE_LEGACY_OPTIMIZE: 'True' }).ENABLE_LEGACY_OPTIMIZE, true);
  assert.equal(loadConfig({ LLM_PROVIDER: 'mock' }).ENABLE_LEGACY_OPTIMIZE, false);
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'mock', ENABLE_LEGACY_OPTIMIZE: 'maybe' }), /ENABLE_LEGACY_OPTIMIZE/);
});

test('gemini: falls back to the next model when the primary is overloaded', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('primary-model')) return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 1 } }), { status: 200 });
  };
  const g = createGeminiProvider({ ...cfg, GEMINI_MODEL: 'primary-model', GEMINI_FALLBACK_MODELS: ['backup-model'], LLM_MAX_RETRIES: 0 }, { fetchImpl });
  const out = await g.generate({ system: 's', parts: [{ text: 'x' }] });
  assert.equal(out.model, 'backup-model');
  assert.equal(out.fallbackFrom, 'primary-model');
  assert.ok(calls[0].includes('primary-model') && calls[1].includes('backup-model'));
});

test('gemini: does not fall back on a client error', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 400 }); };
  const g = createGeminiProvider({ ...cfg, GEMINI_STRUCTURED_MODE: 'mime_only', GEMINI_FALLBACK_MODELS: ['backup-model'], LLM_MAX_RETRIES: 0 }, { fetchImpl });
  await assert.rejects(g.generate({ system: 's', parts: [{ text: 'x' }] }), (e) => e.code === 'UPSTREAM_ERROR');
  assert.equal(n, 1);
});

