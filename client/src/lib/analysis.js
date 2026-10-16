// Client-side bookkeeping for the analysis returned by the API. Scores are
// always re-derived with the same deterministic formula as the server.
import { computeScores } from './scoring.js';

const POSITIVE = new Set(['met', 'claimed']);

export function recompute(analysis) {
  if (!analysis?.requirements?.length) return analysis;
  const reqs = analysis.requirements;
  return {
    ...analysis,
    scores: computeScores(reqs),
    gaps: reqs
      .filter((r) => !POSITIVE.has(r.status))
      .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'must' ? -1 : 1))
      .map((r) => r.text),
  };
}

/** The user confirmed they have this qualification and added it to the CV. */
export function claimRequirement(analysis, gapText) {
  if (!analysis?.requirements) return analysis;
  const requirements = analysis.requirements.map((r) =>
    r.text === gapText && !POSITIVE.has(r.status) ? { ...r, claimed_from: r.status, status: 'claimed' } : r,
  );
  return recompute({ ...analysis, requirements });
}

/** The user removed the item they had added for this requirement. */
export function unclaimRequirement(analysis, gapText) {
  if (!analysis?.requirements) return analysis;
  const requirements = analysis.requirements.map((r) =>
    r.text === gapText && r.status === 'claimed' ? { ...r, status: r.claimed_from || 'missing', claimed_from: undefined } : r,
  );
  return recompute({ ...analysis, requirements });
}

/** Interview focus areas: unmet must-haves first, then the remaining must-haves. */
export function interviewFocus(analysis, max = 6) {
  const reqs = analysis?.requirements || [];
  const order = (r) => (r.importance === 'must' ? 0 : 2) + (r.status === 'met' ? 1 : 0);
  return [...reqs].sort((a, b) => order(a) - order(b)).slice(0, max).map((r) => r.text);
}
