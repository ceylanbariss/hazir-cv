// Google Gemini provider over the public REST API (no SDK: the old
// @google/generative-ai package is deprecated and we only need one endpoint).
import { Errors } from '../lib/errors.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGeminiProvider(config, { fetchImpl = fetch } = {}) {
  const { GEMINI_API_KEY, GEMINI_MODEL, LLM_TIMEOUT_MS, LLM_MAX_RETRIES, GEMINI_STRUCTURED_MODE } = config;
  // Yoğunluk (503), kota (429) ya da zaman aşımında sıradaki modele geçilir.
  const MODELS = [GEMINI_MODEL, ...(config.GEMINI_FALLBACK_MODELS || []).filter((m) => m && m !== GEMINI_MODEL)];
  let schemaSupported = GEMINI_STRUCTURED_MODE === 'json_schema';

  async function once(model, body, signal) {
    const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, json };
  }

  /**
   * @param {object} req
   * @param {string} req.system      system instruction
   * @param {Array}  req.parts       user content parts ({text} | {inlineData})
   * @param {object} [req.jsonSchema] JSON schema for structured output
   * @param {boolean} [req.json]     ask for JSON output
   * @param {number} [req.temperature]
   * @param {number} [req.thinkingBudget]
   */
  async function generate(req) {
    let lastErr;
    for (const [i, model] of MODELS.entries()) {
      try {
        const out = await generateWith(model, req);
        return i ? { ...out, fallbackFrom: GEMINI_MODEL } : out;
      } catch (err) {
        lastErr = err;
        const d = err.details || {};
        const transient = d.reason === 'timeout' || d.status === 429 || d.status >= 500 || d.status === 404;
        if (!transient || i === MODELS.length - 1) throw err;
      }
    }
    throw lastErr;
  }

  async function generateWith(model, req) {
    const generationConfig = {
      temperature: req.temperature ?? 0.2,
      ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      // Yedek modeller farklı nesilden olabilir (ör. "minimal" düşünmeyi desteklemeyen 3.8 Flash);
      // onlara düşünme ayarı gönderilmez, modelin varsayılanı kullanılır.
      ...(req.thinkingBudget !== undefined && model === GEMINI_MODEL ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } } : {}),
    };
    if (req.json || req.jsonSchema) generationConfig.responseMimeType = 'application/json';
    if (req.jsonSchema && schemaSupported) generationConfig.responseJsonSchema = req.jsonSchema;

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: req.parts }],
      generationConfig,
    };

    let attempt = 0;
    for (;;) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
      let result;
      try {
        result = await once(model, body, ctrl.signal);
      } catch (err) {
        clearTimeout(timer);
        // Zaman aşımında aynı modeli tekrar beklemek yerine yedek modele geç (varsa).
        const timedOut = err.name === 'AbortError';
        if (attempt < LLM_MAX_RETRIES && !(timedOut && model !== MODELS[MODELS.length - 1])) {
          attempt += 1;
          await sleep(backoff(attempt));
          continue;
        }
        throw Errors.upstream(undefined, { reason: err.name === 'AbortError' ? 'timeout' : err.message });
      }
      clearTimeout(timer);
      const { status, json } = result;

      // Some model versions reject responseJsonSchema; degrade once to plain JSON mode
      // (zod still validates the output, so correctness is preserved).
      if (status === 400 && generationConfig.responseJsonSchema && /schema/i.test(JSON.stringify(json))) {
        schemaSupported = false;
        delete generationConfig.responseJsonSchema;
        continue;
      }
      if ((status === 429 || status >= 500) && attempt < LLM_MAX_RETRIES) {
        attempt += 1;
        await sleep(backoff(attempt));
        continue;
      }
      if (status !== 200) {
        throw Errors.upstream(undefined, { status, error: json?.error?.message?.slice(0, 200) });
      }

      const cand = json.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('');
      if (!text) {
        throw Errors.upstream('Yapay zeka boş yanıt döndürdü.', {
          finishReason: cand?.finishReason,
          blockReason: json.promptFeedback?.blockReason,
        });
      }
      const u = json.usageMetadata || {};
      return {
        text,
        model,
        finishReason: cand?.finishReason,
        usage: {
          inputTokens: u.promptTokenCount || 0,
          outputTokens: u.candidatesTokenCount || 0,
          thinkingTokens: u.thoughtsTokenCount || 0,
        },
        retries: attempt,
      };
    }
  }

  return { name: 'gemini', model: GEMINI_MODEL, generate };
}

const backoff = (attempt) => Math.min(8000, 600 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 300);
