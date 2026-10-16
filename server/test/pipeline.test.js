import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../eval/dataset.js';
import { createMockProvider } from '../src/llm/mock.js';
import { runTailorPipeline } from '../src/pipeline/tailor.js';

const run = (id, opts) => {
  const c = CASES.find((x) => x.id === id);
  const events = [];
  const ctx = { llm: createMockProvider(opts), trace: [] };
  return runTailorPipeline(ctx, c, (e) => events.push(e)).then((r) => ({ r, events, ctx }));
};

test('streams stages in order and returns the client data model', async () => {
  const { r, events } = await run('tr_frontend_fit');
  const done = events.filter((e) => e.status === 'done').map((e) => e.name);
  assert.deepEqual(done, ['analyze_inputs', 'match_evidence', 'tailor', 'verify']);
  for (const k of ['name', 'summary_v1', 'summary_v3', 'experience', 'education', 'skills', 'analysis', 'verification', 'meta']) {
    assert.ok(k in r, `missing ${k}`);
  }
  assert.ok(Array.isArray(r.experience[0].bullets), 'legacy bullets field kept');
  assert.equal(typeof r.analysis.scores.overall, 'number');
  assert.equal(r.meta.llmCalls, 5);
});

test('guardrail: an injected fabricated metric is caught and reverted', async () => {
  const { r } = await run('tr_frontend_fit', { injectFabrication: true });
  const text = JSON.stringify(r.experience);
  assert.ok(!text.includes('%37'), 'fabricated metric must not reach the user');
  assert.equal(r.verification.fixes[0].action, 'reverted_to_original');
});

test('fit ranking: matching CV scores higher than a mismatched one for the same posting', async () => {
  const { r: fit } = await run('tr_frontend_fit');
  const { r: miss } = await run('tr_frontend_mismatch');
  assert.ok(fit.analysis.scores.overall > miss.analysis.scores.overall + 30);
});

test('non-CV input is rejected before any expensive step', async () => {
  const c = CASES.find((x) => x.id === 'not_a_cv_invoice');
  const ctx = { llm: createMockProvider(), trace: [] };
  await assert.rejects(runTailorPipeline(ctx, c), { code: 'NOT_A_CV' });
  assert.ok(ctx.trace.length <= 2);
});

test('prompt-injection text in the CV does not create evidence', async () => {
  const { r } = await run('tr_prompt_injection');
  const k8s = r.analysis.requirements.find((x) => x.keywords.includes('Kubernetes'));
  assert.notEqual(k8s.status, 'met');
  assert.ok(!JSON.stringify(r.experience).includes('10 yıl'));
  assert.deepEqual(r.meta.inputFlags, ['possible_prompt_injection_in_cv']);
});

test('a posting with very few requirements is flagged as low confidence', async () => {
  const c = CASES.find((x) => x.id === 'tr_frontend_fit');
  const ctx = { llm: createMockProvider(), trace: [] };
  const r = await runTailorPipeline(ctx, { cv: c.cv, jobPosting: 'Yapay zeka stajyeri arıyoruz. React bilen adaylar başvurabilir.', lang: 'tr' });
  assert.ok(r.analysis.requirements.length < 4);
  assert.equal(r.analysis.low_confidence, 'few_requirements');
});
