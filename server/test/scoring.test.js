import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeScores, contributions } from '../src/pipeline/scoring.js';

const R = (category, importance, status) => ({ category, importance, status });

test('weighted score: must = 3, nice = 1; partial = 0.5', () => {
  const s = computeScores([R('hard_skill', 'must', 'met'), R('hard_skill', 'nice', 'missing'), R('experience', 'must', 'partial')]);
  // (3*1 + 1*0 + 3*0.5) / 7 = 0.642..
  assert.equal(s.overall, 64);
  assert.equal(s.skills, 75);
  assert.equal(s.experience, 50);
  assert.equal(s.education, null, 'no education requirement -> null, not a made-up number');
});

test('claimed counts as met', () => {
  assert.equal(computeScores([R('hard_skill', 'must', 'claimed')]).overall, 100);
});

test('contributions sum to the overall score', () => {
  const reqs = [R('hard_skill', 'must', 'met'), R('soft_skill', 'nice', 'partial'), R('education', 'must', 'missing')].map((r, i) => ({ ...r, id: `R${i}` }));
  const total = contributions(reqs).reduce((s, c) => s + c.earned, 0);
  assert.ok(Math.abs(total - computeScores(reqs).overall) <= 1);
});

test('client copy of scoring.js is identical (parity)', () => {
  const server = readFileSync(new URL('../src/pipeline/scoring.js', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/lib/scoring.js', import.meta.url), 'utf8');
  assert.equal(client, server);
});
