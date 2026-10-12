import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import { runTask, parseJsonLoose } from '../src/llm/runTask.js';
import { createBudget } from '../src/lib/guards.js';

const fakeLlm = (responses) => {
  const calls = [];
  return {
    calls,
    async generate(req) {
      calls.push(req);
      const text = responses.shift();
      return { text, model: 'gemini-2.5-flash', usage: { inputTokens: 1000, outputTokens: 100, thinkingTokens: 50 }, retries: 0 };
    },
  };
};

const task = { name: 't', system: 's', parts: [{ text: 'x' }], schema: z.object({ a: z.number() }) };

test('parses fenced JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"a":1} thanks'), { a: 1 });
});

test('valid output passes and records telemetry + cost', async () => {
  const trace = [];
  const budget = createBudget({ dailyUsd: 1 });
  const out = await runTask({ llm: fakeLlm(['{"a":1}']), trace, budget }, task);
  assert.deepEqual(out, { a: 1 });
  assert.equal(trace.length, 1);
  // 1000 in * 0.3/M + 150 out * 2.5/M
  assert.equal(trace[0].costUsd, 0.000675);
  assert.equal(budget.snapshot().spentUsd, 0.0007);
});

test('one self-repair round fixes schema violations', async () => {
  const llm = fakeLlm(['{"a":"one"}', '{"a":1}']);
  const trace = [];
  const out = await runTask({ llm, trace }, task);
  assert.deepEqual(out, { a: 1 });
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].parts.at(-1).text, /did not match the required JSON schema/);
  assert.equal(trace[0].repaired, true);
});

test('persistent invalid output becomes a typed error', async () => {
  await assert.rejects(runTask({ llm: fakeLlm(['nope', 'still nope']), trace: [] }, task), { code: 'INVALID_MODEL_OUTPUT' });
});

test('budget guard blocks calls once the daily estimate is spent', async () => {
  const budget = createBudget({ dailyUsd: 0.0001 });
  budget.record(0.0002);
  await assert.rejects(runTask({ llm: fakeLlm(['{"a":1}']), trace: [], budget }, task), { code: 'DAILY_CAPACITY_REACHED' });
});
