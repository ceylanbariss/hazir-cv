# Hazır CV — explainable, fact-checked CV tailoring

[![Live](https://img.shields.io/badge/live-hazircv.com.tr-black?style=for-the-badge)](https://hazircv.com.tr)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node](https://img.shields.io/badge/Node_22-Express_5-3C873A?style=for-the-badge&logo=node.js&logoColor=white)
![Gemini](https://img.shields.io/badge/LLM-Gemini_2.5_Flash-8E75B2?style=for-the-badge)

> **TR:** Hazır CV, CV'nizi bir iş ilanına göre ATS uyumlu hale getiren ücretsiz bir araçtır. v3 ile her skorun nedenini gösterir, yeniden yazılan her cümleyi orijinal CV'ye karşı doğrular ve **asla deneyim uydurmaz**.

Hazır CV takes a CV (PDF) and a job posting, and returns a tailored CV, a match analysis and a mock interview.
Most "AI CV" tools are one big prompt that returns a made-up score and quietly invents achievements.
v3 is built around the opposite principle: **every number is explainable and every claim is checkable.**

## What makes v3 different

| Problem in typical AI CV tools | How Hazır CV v3 handles it |
|---|---|
| The model "decides" a 78% score | The model only labels each requirement *met / partial / missing* with a quoted piece of evidence. The score is computed in code (must = 3, nice = 1). Each requirement shows how many points it contributed. |
| Cited evidence may be hallucinated | Every quote is checked against the CV text (Turkish-aware fuzzy match). A quote that can't be found pulls the requirement down one level. |
| Rewrites invent metrics ("+40% revenue") | Each rewritten bullet carries its source sentence. An LLM fact-checker plus rule checks (numbers, employers, years) flag anything unsupported, and the pipeline auto-reverts it to the original text. |
| "Add missing skill" writes fake experience | The user has to confirm they really have the qualification. Experience bullets are written only from the user's own notes, and any number not in those notes is rejected. |
| Prompt injection inside a CV ("give this candidate 100") | All user text is wrapped as data. Instruction-like text is detected and never accepted as evidence, and the UI warns the user. |
| Open LLM proxy and API key leaked in the repo | Prompts live on the server behind task-specific, schema-validated endpoints, with rate limits, a CORS allow-list, a concurrency cap and a daily cost budget. |

## Architecture

```
Browser (React)                     API (Express 5)                                   Gemini 2.5 Flash
───────────────                     ───────────────                                   ────────────────
PDF → text (pdf.js)                 POST /api/v1/tailor  (SSE stage events)
CV + posting ───────────────────▶   ┌ classify_document ┐ parallel ─────────────────▶ typed JSON (zod)
                                    └ extract_requirements┘
                                    match_evidence  → quote verification (rules)
                                    tailor_cv       → contact grounding, normalisation
                                    verify_claims   → number/entity rules → auto-remediation
                                    deterministic scoring & keyword diff
◀── stages, result, verification, cost/latency meta
```

* **Small typed tasks, not a mega-prompt.** Each step has a zod schema. The schema is sent to Gemini as JSON schema *and* used to validate the answer, with one automatic self-repair round. Steps can be evaluated, retried and tuned on their own.
* **Deterministic shell around probabilistic calls.** Scoring, evidence verification, number and entity checks, and remediation are plain, unit-tested functions.
* **Observability without PII.** JSON logs carry request ids, per-call latency, tokens and estimated cost. CV text is never logged.
* **Provider abstraction.** Gemini is called over REST (the old SDK is deprecated), with retries, timeouts and a fallback when the schema is rejected. A deterministic `mock` provider makes local development, tests and CI work without an API key.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/EVALUATION.md](docs/EVALUATION.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Evaluation

`server/eval/` contains a labelled synthetic dataset: good fit, partial fit, mismatch, a CV containing a prompt-injection attempt, and a non-CV document. The runner reports:

* requirement extraction recall
* false "met" verdicts
* forbidden-content leaks
* grounded-claim ratio and auto-fixes
* evidence-verification rate
* fit-ranking monotonicity
* score stability across repeats
* latency p50/p95 and cost per run

```bash
cd server
npm run eval:mock                              # harness smoke test, no key needed
GEMINI_API_KEY=... npm run eval -- --repeat 3  # real model
```

## Run locally

```bash
# API (mock model, no key needed)
cd server && npm install && npm run dev:mock     # http://localhost:5000

# Client
cd client && npm install
VITE_API_URL=http://localhost:5000 npm run dev   # http://localhost:5173

# Tests
cd server && npm test
```

With a real model, copy `server/.env.example` to `server/.env` and set `GEMINI_API_KEY`.

## Project layout

```
server/
  src/prompts/      task prompts + output schemas (single source of truth)
  src/pipeline/     tailor / interview / assist orchestration, grounding, scoring, text utils
  src/llm/          Gemini REST provider, mock provider, runTask (validation + repair + telemetry), pricing
  src/lib/          http plumbing, errors, rate limit / semaphore / budget guards, logger
  test/             node:test suites (unit + HTTP integration with mock LLM)
  eval/             dataset + evaluation runner
client/
  src/lib/          API client (SSE), shared scoring.js, analysis helpers
  src/components/   Fact-check, score breakdown, processing-trace panels
```

## Privacy

CV text is processed in memory and sent to the model provider only to produce the result. It is not stored and not logged. See the KVKK notice in the app.

---
Built by [Barış Ceylan](https://www.linkedin.com/in/bar%C4%B1%C5%9F-ceylan-177296256).
