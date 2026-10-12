// USD per 1M tokens. Used for *estimates* in logs, API meta and the daily
// budget guard. Update when the provider changes prices; unknown models fall
// back to the most expensive known entry so the guard errs on the safe side.
export const PRICES = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  mock: { input: 0, output: 0 },
};

const FALLBACK = PRICES['gemini-2.5-pro'];

export function estimateCostUsd(model, usage = {}) {
  const p = PRICES[model] || FALLBACK;
  const input = usage.inputTokens || 0;
  // Thinking tokens are billed as output tokens.
  const output = (usage.outputTokens || 0) + (usage.thinkingTokens || 0);
  return (input * p.input + output * p.output) / 1_000_000;
}
