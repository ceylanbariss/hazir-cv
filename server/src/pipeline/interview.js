// Mock interview: stateless turns (the client holds the transcript) and a
// rubric-based report whose overall score is computed deterministically.
import * as P from '../prompts/tasks.js';
import { runTask } from '../llm/runTask.js';

export async function nextTurn(ctx, input) {
  const out = await runTask(ctx, P.interviewTurn(input));
  const asked = input.history.filter((m) => m.role === 'interviewer').length + 1;
  // The server, not the model, enforces the interview length.
  const done = out.terminate || asked > P.MAX_QUESTIONS;
  return {
    message: out.message.replace(/\[TERMINATE\]/gi, '').trim(),
    done,
    reason: done ? (out.terminate_reason === 'none' ? 'completed' : out.terminate_reason) : 'none',
    questionNumber: Math.min(asked, P.MAX_QUESTIONS),
    maxQuestions: P.MAX_QUESTIONS,
  };
}

export function rubricScore(rubric, { terminatedForConduct = false } = {}) {
  if (!rubric.length) return 0;
  const mean = rubric.reduce((s, r) => s + r.score, 0) / rubric.length;
  const score = Math.round(((mean - 1) / 4) * 100);
  return terminatedForConduct ? Math.min(score, 20) : score;
}

export async function report(ctx, input) {
  const out = await runTask(ctx, P.interviewReport(input));
  const dims = P.RUBRICS[input.type] || P.RUBRICS.hr;
  // Keep only the expected dimensions, in a stable order.
  const matched = dims.map((d) => out.rubric.find((r) => r.dimension === d)).filter(Boolean);
  // If the model renamed dimensions, fall back to its own list rather than scoring 0.
  const rubric = matched.length === dims.length ? matched : out.rubric.slice(0, dims.length);
  const answered = input.history.filter((m) => m.role === 'candidate').length;
  return {
    score: rubricScore(rubric, { terminatedForConduct: input.endReason === 'abusive' }),
    rubric,
    strengths: out.strengths.slice(0, 4),
    weaknesses: out.weaknesses.slice(0, 4),
    suggestions: out.suggestions.slice(0, 4),
    answered,
  };
}
