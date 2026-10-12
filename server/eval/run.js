#!/usr/bin/env node
// Offline evaluation harness for the tailoring pipeline.
//
//   npm run eval                          # real model (needs GEMINI_API_KEY)
//   npm run eval:mock                     # mock model: smoke-tests the harness itself
//   node eval/run.js --cases tr_frontend_fit,en_ml_fit --repeat 3 --out eval/results/run.json
//
// Writes a JSON file with every observation and a Markdown summary next to it.
// Metrics are defined in docs/EVALUATION.md.
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createLlm } from '../src/llm/index.js';
import { createBudget } from '../src/lib/guards.js';
import { runTailorPipeline } from '../src/pipeline/tailor.js';
import { hasTerm } from '../src/pipeline/text.js';
import { CASES } from './dataset.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const config = loadConfig();
const llm = createLlm(config);
const repeat = Number(args.repeat || 1);
const selected = args.cases ? CASES.filter((c) => args.cases.split(',').includes(c.id)) : CASES;
const outPath = args.out || `eval/results/${llm.name}-${new Date().toISOString().slice(0, 10)}.json`;
const budget = createBudget({ dailyUsd: 0 });

const pctl = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r3 = (x) => (x == null ? null : Number(x.toFixed(3)));

async function evaluate(c) {
  const ctx = { llm, budget, trace: [] };
  const t0 = Date.now();
  const obs = { id: c.id, fit: c.fit || null, checks: {} };
  try {
    const r = await runTailorPipeline(ctx, { cv: c.cv, jobPosting: c.jobPosting, lang: c.lang });
    obs.latencyMs = Date.now() - t0;
    obs.costUsd = r.meta.costUsd;
    obs.tokens = r.meta.tokens;
    obs.repairs = ctx.trace.filter((t) => t.repaired).length;
    obs.score = r.analysis.scores.overall;
    obs.scores = r.analysis.scores;
    obs.requirements = r.analysis.requirements.length;
    obs.verification = r.verification.summary;
    obs.entityIssues = r.verification.entity_issues.length;
    obs.inputFlags = r.meta.inputFlags;

    const quotes = r.analysis.requirements.flatMap((q) => q.evidence);
    obs.evidenceVerifiedRate = quotes.length ? quotes.filter((q) => q.verified).length / quotes.length : 1;
    obs.downgraded = r.analysis.requirements.filter((q) => q.model_status !== q.status).length;

    const reqText = r.analysis.requirements.map((q) => `${q.text} ${q.keywords.join(' ')}`).join('\n');
    if (c.mustExtract) {
      const found = c.mustExtract.filter((k) => hasTerm(reqText, k));
      obs.checks.extractionRecall = found.length / c.mustExtract.length;
    }
    if (c.mustStayMissing) {
      const wronglyMet = r.analysis.requirements.filter(
        (q) => q.status === 'met' && c.mustStayMissing.some((k) => hasTerm(`${q.text} ${q.keywords.join(' ')}`, k)),
      );
      obs.checks.noFalseMatches = wronglyMet.length === 0;
      if (wronglyMet.length) obs.falseMatches = wronglyMet.map((q) => q.text);
    }
    const finalText = JSON.stringify({ s: r.summary_v1, e: r.experience, k: r.skills, t: r.title });
    if (c.forbiddenInOutput) {
      const leaks = c.forbiddenInOutput.filter((f) => finalText.toLowerCase().includes(f.toLowerCase()));
      obs.checks.noForbiddenOutput = leaks.length === 0;
      if (leaks.length) obs.leaks = leaks;
    }
    obs.checks.noUnsupportedAfterFix = r.verification.claims.every((cl) => cl.verdict !== 'unsupported' || cl.remediation);
    obs.checks.noEntityIssues = obs.entityIssues === 0;
    if (c.expectError) obs.checks.expectedError = false;
  } catch (err) {
    obs.latencyMs = Date.now() - t0;
    obs.error = err.code || err.message;
    obs.costUsd = Number(ctx.trace.reduce((s, t) => s + t.costUsd, 0).toFixed(5));
    obs.checks.expectedError = c.expectError ? err.code === c.expectError : false;
  }
  return obs;
}

const observations = [];
for (let i = 0; i < repeat; i++) {
  for (const c of selected) {
    process.stdout.write(`▶ ${c.id} (run ${i + 1}/${repeat}) … `);
    const o = await evaluate(c);
    observations.push({ run: i + 1, ...o });
    const failed = Object.entries(o.checks).filter(([, v]) => v === false || (typeof v === 'number' && v < 1)).map(([k]) => k);
    console.log(o.error && !o.checks.expectedError ? `ERROR ${o.error}` : `score=${o.score ?? '-'} ${o.latencyMs}ms ${failed.length ? '✗ ' + failed.join(',') : '✓'}`);
  }
}

// ---- aggregate ------------------------------------------------------------
const ok = observations.filter((o) => !o.error);
const checkNames = [...new Set(observations.flatMap((o) => Object.keys(o.checks)))];
const checkRates = Object.fromEntries(
  checkNames.map((k) => {
    const vals = observations.filter((o) => k in o.checks).map((o) => Number(o.checks[k]));
    return [k, r3(mean(vals))];
  }),
);
const byFit = Object.fromEntries(
  ['high', 'medium', 'low'].map((f) => [f, r3(mean(ok.filter((o) => o.fit === f).map((o) => o.score)))]),
);
const rankingOk = byFit.high != null && byFit.medium != null && byFit.low != null && byFit.high > byFit.medium && byFit.medium > byFit.low;

// Score stability across repeats (same input, same model).
const spread = selected
  .map((c) => ok.filter((o) => o.id === c.id).map((o) => o.score))
  .filter((xs) => xs.length > 1)
  .map((xs) => Math.max(...xs) - Math.min(...xs));

const summary = {
  provider: llm.name,
  model: llm.model,
  date: new Date().toISOString(),
  cases: selected.length,
  runs: observations.length,
  errors: observations.filter((o) => o.error && !o.checks.expectedError).length,
  checks: checkRates,
  meanScoreByFit: byFit,
  fitRankingMonotonic: rankingOk,
  groundedRatioMean: r3(mean(ok.map((o) => o.verification.grounded_ratio))),
  unsupportedClaimsPerRun: r3(mean(ok.map((o) => o.verification.unsupported))),
  autoFixesPerRun: r3(mean(ok.map((o) => o.verification.auto_fixed))),
  evidenceVerifiedRate: r3(mean(ok.map((o) => o.evidenceVerifiedRate))),
  schemaRepairsPerRun: r3(mean(ok.map((o) => o.repairs))),
  scoreSpreadMax: spread.length ? Math.max(...spread) : null,
  latencyMs: { p50: pctl(ok.map((o) => o.latencyMs), 50), p95: pctl(ok.map((o) => o.latencyMs), 95) },
  costUsd: { perRunMean: r3(mean(ok.map((o) => o.costUsd)) ?? 0), total: r3(observations.reduce((s, o) => s + (o.costUsd || 0), 0)) },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ summary, observations }, null, 2));

const md = `# Eval — ${summary.provider} / ${summary.model}

${summary.date} · ${summary.cases} cases × ${repeat} run(s) · ${summary.errors} unexpected error(s)

| Metric | Value |
|---|---|
${Object.entries(summary.checks).map(([k, v]) => `| check: ${k} | ${v} |`).join('\n')}
| fit ranking monotonic (high > medium > low) | ${summary.fitRankingMonotonic} (${JSON.stringify(summary.meanScoreByFit)}) |
| grounded ratio (mean, before auto-fix) | ${summary.groundedRatioMean} |
| unsupported claims / run (caught) | ${summary.unsupportedClaimsPerRun} |
| auto-fixes / run | ${summary.autoFixesPerRun} |
| evidence quotes verified | ${summary.evidenceVerifiedRate} |
| schema repairs / run | ${summary.schemaRepairsPerRun} |
| max score spread across repeats | ${summary.scoreSpreadMax ?? 'n/a (repeat=1)'} |
| latency p50 / p95 | ${summary.latencyMs.p50} / ${summary.latencyMs.p95} ms |
| cost / run (mean), total | $${summary.costUsd.perRunMean} , $${summary.costUsd.total} |

## Per case
| case | fit | score | grounded | unsupported→fixed | latency | failed checks |
|---|---|---|---|---|---|---|
${observations
  .map((o) => {
    const failed = Object.entries(o.checks).filter(([, v]) => v === false || (typeof v === 'number' && v < 1)).map(([k]) => k);
    return `| ${o.id} | ${o.fit ?? '-'} | ${o.score ?? o.error ?? '-'} | ${o.verification?.grounded_ratio ?? '-'} | ${o.verification ? `${o.verification.unsupported}→${o.verification.auto_fixed}` : '-'} | ${o.latencyMs}ms | ${failed.join(', ') || '—'} |`;
  })
  .join('\n')}
`;
writeFileSync(outPath.replace(/\.json$/, '.md'), md);
console.log(`\n${md}\nSaved ${outPath}`);
process.exit(summary.errors ? 1 : 0);
