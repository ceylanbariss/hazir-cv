// Deterministic, explainable match scoring.
//
// The LLM never outputs a score. It only classifies each requirement as
// met / partial / missing (with cited evidence). The number shown to the user
// is computed here, so every point can be traced to a requirement:
//
//   score(group) = Σ weight(r) · value(r) / Σ weight(r)      for r in group
//   weight: must = 3, nice = 1      value: met = 1, partial = 0.5, missing = 0
//
// "claimed" = the user explicitly confirmed a skill the CV did not show and
// added it to the CV; it counts as met but is labelled as self-declared in the UI.
//
// NOTE: this file is mirrored at client/src/lib/scoring.js (the client re-scores
// after edits). test/scoring-parity.test.js keeps the two copies identical.

export const IMPORTANCE_WEIGHT = { must: 3, nice: 1 };
export const STATUS_VALUE = { met: 1, partial: 0.5, missing: 0, claimed: 1 };
export const CATEGORY_GROUP = {
  hard_skill: 'skills',
  soft_skill: 'skills',
  language: 'skills',
  certification: 'skills',
  experience: 'experience',
  education: 'education',
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

/**
 * @param {Array<{category:string, importance:string, status:string}>} requirements
 * @returns {{overall:number|null, skills:number|null, experience:number|null, education:number|null}}
 */
export function computeScores(requirements = []) {
  const acc = { skills: [0, 0], experience: [0, 0], education: [0, 0] };
  let num = 0;
  let den = 0;
  for (const r of requirements) {
    const w = IMPORTANCE_WEIGHT[r.importance] ?? 1;
    const v = STATUS_VALUE[r.status] ?? 0;
    const g = CATEGORY_GROUP[r.category] || 'skills';
    acc[g][0] += w * v;
    acc[g][1] += w;
    num += w * v;
    den += w;
  }
  return {
    overall: pct(num, den),
    skills: pct(...acc.skills),
    experience: pct(...acc.experience),
    education: pct(...acc.education),
  };
}

/** Per-requirement contribution in score points, for the "why this score" view. */
export function contributions(requirements = []) {
  const den = requirements.reduce((s, r) => s + (IMPORTANCE_WEIGHT[r.importance] ?? 1), 0) || 1;
  return requirements.map((r) => {
    const w = IMPORTANCE_WEIGHT[r.importance] ?? 1;
    return {
      id: r.id,
      max: Number(((w / den) * 100).toFixed(1)),
      earned: Number((((w * (STATUS_VALUE[r.status] ?? 0)) / den) * 100).toFixed(1)),
    };
  });
}
