# Architecture & design decisions

## Context

v2 was a single-page React app that built prompts in the browser and sent them through an Express endpoint (`/optimize`), which forwarded *any* system prompt to Gemini. The model returned the tailored CV and its own "ATS score" in one call. The client then nudged the score by hand-tuned amounts (+4 for each added skill, −5 for each removed bullet).

That design had five concrete problems:

1. **Security.** The open proxy let anyone use the API key for arbitrary prompts. A second key was hard-coded in a committed script.
2. **Trust.** Scores were not explainable. Nothing stopped the model from inventing achievements, and the "fill the gap" feature explicitly told the model to write experience *as if the candidate had it*.
3. **Reliability.** The response JSON was cleaned with string replaces, there was no schema validation, and a bug meant the interview report was never shown.
4. **Operability.** No tests, no evals, and no visibility into latency or cost.
5. **Maintainability.** Prompts, UI and business logic were mixed together in one 3,300-line component.

## Decisions

### D1 — Prompts and orchestration live on the server
Each user-facing capability is its own endpoint with a request schema: `tailor`, `interview/turn`, `interview/report`, `assist/add-item`, `assist/integrate-gaps`, `ocr`. The browser sends data, never instructions. Prompts are versioned (`PROMPT_VERSION`), and the version is returned in every response's `meta`.

### D2 — Small typed tasks instead of one mega-prompt
`tailor` runs five LLM tasks:

1. `classify_document` and `extract_requirements` run in parallel.
2. `match_evidence`
3. `tailor_cv`
4. `verify_claims`

Each task has a zod schema. `runTask` sends the schema to Gemini (`responseJsonSchema`), validates the reply, and on failure runs **one** self-repair round that shows the model its own output and the validation errors. Splitting the work costs about 2–3× the tokens of a single call (still under $0.01 per run with Flash). In exchange:

* each step can be evaluated and improved independently;
* a failure retries one small step, not the whole thing;
* steps can be checked against each other: the matcher's quotes against the CV, the writer's claims against the fact-checker.

### D3 — The model classifies; code scores
The model never outputs a number the user sees. It labels each requirement as `met`, `partial` or `missing`, with verbatim evidence. The score is then

```
score = Σ w·v / Σ w      w: must=3, nice=1     v: met=1, partial=0.5, missing=0, claimed=1
```

It is computed per group (skills / experience / education) and overall. A group with no requirements shows "—" instead of an invented 50%. The same `scoring.js` file runs on the client for re-scoring after edits, and a test keeps the two copies byte-identical.

### D4 — Guardrails are deterministic
These checks are rule-based and unit-tested; no model is involved:

* **Evidence verification.** Each quote must be found in the CV, using Turkish-aware normalisation and token-window fuzzy matching (≥ 80% of the quote's tokens). If no quote for a positive verdict can be verified, the verdict drops one level.
* **Number rule.** Any number or percentage in a rewritten claim that does not appear in the CV makes the claim `unsupported`. This overrides the LLM judge.
* **Entities.** Employers and years in the rewritten CV must exist in the original.
* **Contacts.** Email, phone and LinkedIn are copied from the CV with regexes whenever the model's value is not found in the CV.
* **Remediation policy.**
  * An unsupported experience bullet is reverted to its verified source sentence, or removed if it has none.
  * An unsupported skill is removed.
  * Summary sentences and claims judged `embellished` are only flagged. The user can revert them with one click.

### D5 — Prompt-injection posture
* All user text is wrapped in tagged envelopes, and envelope tags are stripped from the input.
* Every prompt states that text inside the envelopes is data.
* A detector for instruction-like phrasing (TR/EN) does two things: such text is never accepted as evidence, and the response's `meta.inputFlags` reports it so the UI can tell the user.
* `eval/dataset.js` includes an injection case.

### D6 — Honest gap integration
Integrating a missing requirement needs `confirmed: true`, which the API enforces. Tools and skills become skill entries. Experience-type gaps become bullets **only** when the user's notes describe them, and any number not present in those notes is rejected. Requirements added this way are marked `claimed` ("self-declared" in the UI) and score like `met`, because the CV now honestly contains them.

### D7 — Real progress over fake progress
`POST /tailor` with `Accept: text/event-stream` streams `stage` events (`start`/`done` with timings), then a `result` or `error` event. The progress bar moves within each stage's real window. Without the header the endpoint returns plain JSON, which is what the eval runner and tests use.

### D8 — Protecting a free product
Because the product is free and the API key belongs to us, the API is protected in layers. All of these are in-process and dependency-free, behind interfaces that can be swapped for Redis on multi-instance hosting:

* per-IP fixed-window rate limits per route group;
* a concurrency semaphore for heavy pipelines (excess requests get 503 `BUSY` instead of an unbounded queue);
* a **daily budget guard** based on estimated token cost (503 `DAILY_CAPACITY_REACHED`);
* a CORS allow-list that includes Vercel preview URLs;
* security headers and request size limits.

### D9 — No new runtime dependencies beyond `zod`
Gemini is called through `fetch` because `@google/generative-ai` is deprecated. Rate limiting and security headers are small, tested modules instead of extra packages.

## Request lifecycle (tailor)

```
POST /api/v1/tailor
 ├─ rateLimit(heavy) → json(300kb) → zod(TailorRequest)
 ├─ budget.assertAvailable → semaphore.tryAcquire
 └─ runTailorPipeline
     ├─ stage analyze_inputs: classify_document ∥ extract_requirements
     ├─ stage match_evidence: LLM → attachEvidence (quote verification, downgrade)
     ├─ stage tailor:         LLM → normalise → groundContacts
     ├─ stage verify:         buildClaims → LLM verdicts → judgeClaims (number rule) → remediate → entityIssues
     └─ computeScores, contributions, addedKeywords, meta (tokens, cost, stages, inputFlags)
```

## Known limitations / next steps

* PDF text extraction in the browser loses layout. Scanned PDFs are not supported (they could go through the existing OCR task).
* Rate limit, budget and semaphore are per instance. Move them to Redis before scaling horizontally.
* The eval set is small and synthetic. Next: grow it with anonymised, consented real cases and add human-labelled gold matches.
* `App.jsx` is still large. New features live in `components/` and `lib/`; the editor and templates should be extracted next.
