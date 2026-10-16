# Deployment & rollout (v2 → v3)

Production today: client on **Vercel** (hazircv.com.tr), API on **Render** (`resumatch-backend-zsmt.onrender.com`).

## 0. Security first
1. In Google AI Studio, **revoke** the Gemini key that was committed in `server/debug.js` (it is still in git history), and any other key that may have been exposed.
2. Create a new key and put it **only** in Render's environment (`GEMINI_API_KEY`).

## 1. API (Render)
* Build command: `npm install`. Start command: `npm start` (or `node index.js`). Node ≥ 20.11.
* Root directory: `server`.
* Environment (see `server/.env.example`):
  * `LLM_PROVIDER=gemini`
  * `GEMINI_API_KEY=…`
  * `DAILY_BUDGET_USD=5` (adjust)
  * `ALLOWED_ORIGINS=https://hazircv.com.tr,https://www.hazircv.com.tr`
  * `ENABLE_LEGACY_OPTIMIZE=true` — **temporary**, only during the rollout below
* Health check path: `/api/v1/health`.

## 2. Zero-downtime order
1. Deploy the v3 API with `ENABLE_LEGACY_OPTIMIZE=true`. The live v2 client keeps working.
2. Open the Vercel **preview** deployment of the `v3` branch. Preview URLs are already allowed by `ALLOWED_ORIGIN_PATTERN`. Smoke test:
   * tailor (TR and EN)
   * gap integration
   * interview, including the report
   * screenshot OCR
3. Merge `v3` → `main` so Vercel deploys the v3 client to production.
4. Set `ENABLE_LEGACY_OPTIMIZE=false` on Render to close the open proxy for good.

## 3. Client (Vercel)
* Optional: `VITE_API_URL` (defaults to the Render URL).
* No other changes. `npm run build` as before.

## 4. After launch
* Run a live eval: `GEMINI_API_KEY=… npm run eval -- --repeat 3`. Commit the Markdown summary.
* Watch the Render logs. `llm_task` lines carry latency, tokens and cost per step; `input_flags` lines mark injection attempts.
