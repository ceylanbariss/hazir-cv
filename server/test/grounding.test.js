import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachEvidence, buildClaims, judgeClaims, remediate, entityIssues, groundContacts, addedKeywords } from '../src/pipeline/grounding.js';

const CV = `Ayşe Kaya ayse@example.com
Backend Developer | Acme | 2021 - 2024
- Python ile REST servisleri yazdım.
- PostgreSQL sorgularını optimize ettim.`;

test('attachEvidence downgrades verdicts whose quotes are not in the CV', () => {
  const reqs = [
    { id: 'R1', text: 'Python', category: 'hard_skill', importance: 'must', keywords: ['Python'] },
    { id: 'R2', text: 'Kubernetes', category: 'hard_skill', importance: 'must', keywords: ['Kubernetes'] },
  ];
  const out = attachEvidence(CV, reqs, [
    { id: 'R1', status: 'met', evidence: ['Python ile REST servisleri yazdım.'], rationale: '' },
    { id: 'R2', status: 'met', evidence: ['Kubernetes cluster yönettim'], rationale: '' }, // hallucinated quote
  ]);
  assert.equal(out[0].status, 'met');
  assert.equal(out[0].evidence_verified, true);
  assert.equal(out[1].status, 'partial');
  assert.equal(out[1].model_status, 'met');
  assert.equal(out[1].evidence_verified, false);
});

const tailored = () => ({
  name: 'Ayşe Kaya', title: 'Backend Developer', location: '', phone: '', email: 'wrong@x.com', linkedin: '',
  summary_v1: 'Python ile backend geliştiriyorum. 10 yıllık deneyimim var.', summary_v3: '',
  experience: [{
    role: 'Backend Developer', company: 'Acme', date: '2021 - 2024',
    bullets_v1: ['Python ile RESTful API geliştirdim.', 'Sorgu sürelerini %60 azalttım.', 'Kubernetes kümeleri yönettim.'],
    bullets_v3: ['a', 'b', 'c'],
    bullet_sources: ['Python ile REST servisleri yazdım.', 'PostgreSQL sorgularını optimize ettim.', ''],
  }],
  education: [], skills: ['Python', 'Kubernetes'], additional: [],
});

test('number rule overrides an LLM "supported" verdict, and remediation reverts/removes', () => {
  const t = tailored();
  const claims = buildClaims(t);
  const verdicts = claims.map((c) => ({ id: c.id, verdict: c.text.includes('Kubernetes') ? 'unsupported' : 'supported', note: '' }));
  const judged = judgeClaims(CV, claims, verdicts);
  const metric = judged.find((c) => c.id === 'E1.2');
  assert.equal(metric.verdict, 'unsupported');
  assert.equal(metric.checked_by, 'rule');
  assert.equal(judged.find((c) => c.id === 'S2').verdict, 'unsupported', '"10 yıllık" is not in the CV');

  const { tailored: fixed, fixes } = remediate(t, judged);
  assert.deepEqual(fixed.experience[0].bullets_v1, ['Python ile RESTful API geliştirdim.', 'PostgreSQL sorgularını optimize ettim.']);
  assert.equal(fixed.experience[0].bullet_sources.length, 2);
  assert.deepEqual(fixed.skills, ['Python']);
  assert.equal(fixed.summary_v1, t.summary_v1, 'summary is flagged, never silently edited');
  assert.equal(fixes.length, 3);
});

test('entityIssues catches invented employers and years', () => {
  const t = tailored();
  t.experience[0].company = 'Google';
  t.experience[0].date = '2019 - 2024';
  const issues = entityIssues(CV, t);
  assert.deepEqual(issues.map((i) => i.issue).sort(), ['company_not_in_cv', 'year_not_in_cv']);
});

test('groundContacts replaces contact data that is not in the CV', () => {
  assert.equal(groundContacts(CV, tailored()).email, 'ayse@example.com');
});

test('addedKeywords lists posting terms surfaced by the rewrite', () => {
  const reqs = [{ status: 'met', keywords: ['RESTful API', 'Python'] }, { status: 'missing', keywords: ['Kubernetes'] }];
  assert.deepEqual(addedKeywords(CV, 'Python ile RESTful API geliştirdim. Kubernetes', reqs), ['RESTful API']);
});
