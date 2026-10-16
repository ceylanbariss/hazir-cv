// The CV tailoring pipeline.
//
//   ┌ validate (is this a CV?) ┐
//   └ requirements (posting)   ┘ → match (evidence) → tailor (rewrite) → verify (fact-check) → remediate
//        LLM  ×2 in parallel        LLM + quote check    LLM + rules        LLM + number rules    rules
//
// Each stage is a small, typed LLM call wrapped by deterministic checks.
// `onStage` streams progress to the client (SSE) so the UI shows real work,
// not a fake progress bar.
import * as P from '../prompts/tasks.js';
import { runTask } from '../llm/runTask.js';
import { Errors } from '../lib/errors.js';
import { looksLikeInjection } from './text.js';
import { computeScores, contributions } from './scoring.js';
import {
  attachEvidence,
  buildClaims,
  judgeClaims,
  remediate,
  entityIssues,
  groundContacts,
  addedKeywords,
  tailoredText,
} from './grounding.js';

const MIN_CV_CHARS = 150;

const stripMd = (s) => (typeof s === 'string' ? s.replace(/\*\*/g, '').replace(/^[•\-–*]\s*/, '').trim() : '');

function normaliseTailored(t) {
  const skills = [...new Set(t.skills.map(stripMd).filter(Boolean))]
    .filter((s) => s.split(/\s+/).length <= 3)
    .slice(0, 12);
  return {
    ...t,
    name: stripMd(t.name),
    title: stripMd(t.title),
    summary_v1: stripMd(t.summary_v1),
    summary_v3: stripMd(t.summary_v3),
    linkedin: (t.linkedin || '').replace(/^https?:\/\//i, '').replace(/^www\./i, ''),
    experience: t.experience.map((e) => {
      const v1 = e.bullets_v1.map(stripMd).filter(Boolean);
      const v3 = v1.map((b, i) => stripMd(e.bullets_v3[i]) || b);
      const src = v1.map((_, i) => e.bullet_sources[i] || '');
      return { ...e, role: stripMd(e.role), company: stripMd(e.company), date: stripMd(e.date), bullets_v1: v1, bullets_v3: v3, bullet_sources: src };
    }),
    skills,
    additional: t.additional.map(stripMd).filter(Boolean),
  };
}

export async function runTailorPipeline(ctx, { cv, jobPosting, lang }, onStage = () => {}) {
  const t0 = Date.now();
  const stages = [];
  const stage = async (name, fn) => {
    const s = Date.now();
    onStage({ name, status: 'start' });
    const out = await fn();
    const ms = Date.now() - s;
    stages.push({ name, ms });
    onStage({ name, status: 'done', ms });
    return out;
  };

  if (cv.trim().length < MIN_CV_CHARS) throw Errors.notCv();

  // 1) Validate + extract requirements in parallel (independent inputs).
  const [docCheck, reqOut] = await stage('analyze_inputs', () =>
    Promise.all([runTask(ctx, P.classifyDocument({ cv })), runTask(ctx, P.extractRequirements({ jobPosting, lang }))]),
  );
  if (!docCheck.is_cv && docCheck.confidence >= 0.6) throw Errors.notCv();

  // Ids must be unique for the matcher join; re-number if the model repeated any.
  const list = reqOut.requirements.slice(0, 20);
  const unique = new Set(list.map((r) => r.id)).size === list.length;
  const requirements = list.map((r, i) => ({
    ...r,
    id: unique && r.id ? r.id : `R${i + 1}`,
    keywords: r.keywords.slice(0, 4),
  }));

  // 2) Evidence matching (LLM) + quote verification (rules).
  const matchOut = await stage('match_evidence', () => runTask(ctx, P.matchEvidence({ cv, requirements, lang })));
  const enriched = attachEvidence(cv, requirements, matchOut.matches);

  // 3) Grounded rewrite.
  const rawTailored = await stage('tailor', () =>
    runTask(ctx, P.tailorCv({ cv, requirements: enriched, matches: enriched, jobTitle: reqOut.job_title, lang })),
  );
  let tailored = groundContacts(cv, normaliseTailored(rawTailored));

  // 4) Fact-check every claim (LLM) + number rules, then auto-remediate.
  const claims = buildClaims(tailored);
  const verdicts = await stage('verify', () =>
    claims.length ? runTask(ctx, P.verifyClaims({ cv, claims, lang })) : Promise.resolve({ verdicts: [] }),
  );
  const judged = judgeClaims(cv, claims, verdicts.verdicts);
  const { tailored: fixed, fixes } = remediate(tailored, judged);
  tailored = fixed;
  const entities = entityIssues(cv, tailored);

  // 5) Deterministic analysis for the UI.
  const scores = computeScores(enriched);
  const contrib = new Map(contributions(enriched).map((c) => [c.id, c]));
  const keywordOf = (r) => r.keywords[0] || r.text;
  const analysis = {
    scores,
    job: { title: reqOut.job_title, seniority: reqOut.seniority, company_name: reqOut.company_name },
    requirements: enriched.map((r) => ({ ...r, contribution: contrib.get(r.id) })),
    matches: {
      hard_skills: enriched.filter((r) => r.status === 'met' && ['hard_skill', 'certification', 'language'].includes(r.category)).map(keywordOf),
      soft_skills: enriched.filter((r) => r.status === 'met' && r.category === 'soft_skill').map(keywordOf),
    },
    gaps: enriched
      .filter((r) => r.status !== 'met')
      .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'must' ? -1 : 1))
      .map((r) => r.text),
    additions: addedKeywords(cv, tailoredText(tailored), enriched),
  };

  const count = (v) => judged.filter((c) => c.verdict === v).length;
  const verification = {
    summary: {
      total: judged.length,
      supported: count('supported'),
      embellished: count('embellished'),
      unsupported: count('unsupported'),
      auto_fixed: fixes.length,
      grounded_ratio: judged.length ? Number((count('supported') / judged.length).toFixed(3)) : 1,
    },
    claims: judged.map(({ id, section, exp, bullet, index, text, verdict, note, checked_by, remediation, source }) => ({
      id, section, exp, bullet, index, text, verdict, note, checked_by, remediation, source,
    })),
    fixes,
    entity_issues: entities,
  };

  const trace = ctx.trace || [];
  const sum = (k) => trace.reduce((s, x) => s + (x[k] || 0), 0);
  // Too few concrete requirements make any percentage misleading; tell the UI.
  if (enriched.length < 4) analysis.low_confidence = 'few_requirements';

  const inputFlags = [
    ...(looksLikeInjection(cv) ? ['possible_prompt_injection_in_cv'] : []),
    ...(looksLikeInjection(jobPosting) ? ['possible_prompt_injection_in_job_posting'] : []),
  ];
  if (inputFlags.length) ctx.log?.warn('input_flags', { inputFlags });

  const meta = {
    inputFlags,
    promptVersion: P.PROMPT_VERSION,
    model: trace[0]?.model,
    latencyMs: Date.now() - t0,
    llmCalls: trace.length,
    tokens: { input: sum('inputTokens'), output: sum('outputTokens'), thinking: sum('thinkingTokens') },
    costUsd: Number(sum('costUsd').toFixed(5)),
    stages,
  };

  return {
    ...tailored,
    // Legacy field kept for the existing editor/templates.
    experience: tailored.experience.map((e) => ({ ...e, bullets: [...e.bullets_v1] })),
    analysis,
    verification,
    meta,
  };
}
