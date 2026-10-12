import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../src/llm/mock.js';
import { nextTurn, report, rubricScore } from '../src/pipeline/interview.js';
import { integrateGaps } from '../src/pipeline/assist.js';

const ctx = () => ({ llm: createMockProvider(), trace: [] });
const base = { cv: 'Ali Veli\nali@x.com\nDeneyim ...', jobPosting: 'Frontend Developer, React, TypeScript aranıyor.', lang: 'tr', type: 'tech' };

test('rubricScore maps 1..5 to 0..100 and caps conduct terminations', () => {
  assert.equal(rubricScore([{ score: 5 }, { score: 5 }]), 100);
  assert.equal(rubricScore([{ score: 1 }]), 0);
  assert.equal(rubricScore([{ score: 3 }]), 50);
  assert.equal(rubricScore([{ score: 5 }], { terminatedForConduct: true }), 20);
});

test('first turn asks a question; abusive answer terminates', async () => {
  const first = await nextTurn(ctx(), { ...base, history: [], focus: ['React deneyimi'] });
  assert.equal(first.done, false);
  assert.equal(first.questionNumber, 1);
  const bad = await nextTurn(ctx(), { ...base, history: [{ role: 'interviewer', text: first.message }, { role: 'candidate', text: 'asd' }] });
  assert.equal(bad.done, true);
  assert.equal(bad.reason, 'abusive');
});

test('report returns rubric in fixed dimension order with deterministic score', async () => {
  const r = await report(ctx(), { ...base, history: [{ role: 'interviewer', text: 'Soru?' }, { role: 'candidate', text: 'x'.repeat(250) }] });
  assert.deepEqual(r.rubric.map((d) => d.dimension), ['technical_depth', 'problem_solving', 'communication', 'role_fit', 'specificity_star']);
  assert.equal(r.score, 75);
});

test('integrate-gaps never fabricates experience without user notes', async () => {
  const gaps = ['Docker', 'Müşteri ile doğrudan çalışarak gereksinim toplama deneyimi'];
  const noNotes = await integrateGaps(ctx(), { gaps, notes: '', lang: 'tr' });
  assert.deepEqual(noNotes.items.map((i) => i.targetSection), ['skills']);
  assert.deepEqual(noNotes.skipped, [gaps[1]]);
  const withNotes = await integrateGaps(ctx(), { gaps, notes: 'Stajda müşteri toplantılarında gereksinimleri not aldım.', lang: 'tr' });
  assert.equal(withNotes.items.length, 2);
});
