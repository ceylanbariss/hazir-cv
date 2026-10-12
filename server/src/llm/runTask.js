// Executes one LLM "task" (prompt + schema) with structured-output parsing,
// zod validation, a single self-repair round and per-call telemetry.
import { z } from 'zod/v4';
import { Errors } from '../lib/errors.js';
import { estimateCostUsd } from './pricing.js';

const jsonSchemaCache = new WeakMap();

export function toGeminiSchema(schema) {
  if (!jsonSchemaCache.has(schema)) {
    const js = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' });
    delete js.$schema;
    jsonSchemaCache.set(schema, js);
  }
  return jsonSchemaCache.get(schema);
}

export function parseJsonLoose(text) {
  const cleaned = String(text)
    .replace(/^﻿/, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Salvage the outermost object/array if the model wrapped it in prose.
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('not json');
  }
}

/**
 * @param {object} ctx  { llm, budget, log, trace: [] }
 * @param {object} task { name, system, parts, schema, temperature?, thinkingBudget?, maxOutputTokens? }
 */
export async function runTask(ctx, task) {
  const { llm, budget, log } = ctx;
  budget?.assertAvailable();
  const started = Date.now();
  const jsonSchema = task.schema ? toGeminiSchema(task.schema) : undefined;
  const totals = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  let retries = 0;
  let repaired = false;

  const call = async (parts) => {
    const out = await llm.generate({
      task: task.name,
      system: task.system,
      parts,
      json: Boolean(task.schema),
      jsonSchema,
      temperature: task.temperature,
      thinkingBudget: task.thinkingBudget,
      maxOutputTokens: task.maxOutputTokens,
    });
    totals.inputTokens += out.usage.inputTokens;
    totals.outputTokens += out.usage.outputTokens;
    totals.thinkingTokens += out.usage.thinkingTokens;
    retries += out.retries || 0;
    return out;
  };

  const finish = (data, model) => {
    const ms = Date.now() - started;
    const costUsd = estimateCostUsd(model, totals);
    budget?.record(costUsd);
    const entry = { task: task.name, ms, model, ...totals, costUsd: Number(costUsd.toFixed(6)), retries, repaired };
    ctx.trace?.push(entry);
    log?.info('llm_task', entry);
    return data;
  };

  let out = await call(task.parts);
  if (!task.schema) return finish(out.text, out.model);

  const validate = (text) => {
    let raw;
    try {
      raw = parseJsonLoose(text);
    } catch {
      return { ok: false, error: 'Response was not valid JSON.' };
    }
    const r = task.schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data };
    return { ok: false, error: z.prettifyError(r.error).slice(0, 1500) };
  };

  let v = validate(out.text);
  if (!v.ok) {
    // One self-repair round: show the model its output and the validation error.
    repaired = true;
    out = await call([
      ...task.parts,
      {
        text:
          `\n\nYour previous answer did not match the required JSON schema.\n` +
          `Validation errors:\n${v.error}\n\nPrevious answer:\n${String(out.text).slice(0, 6000)}\n\n` +
          `Return ONLY the corrected JSON object.`,
      },
    ]);
    v = validate(out.text);
  }
  if (!v.ok) {
    finish(null, out.model);
    throw Errors.invalidModelOutput({ task: task.name, error: v.error.slice(0, 300) });
  }
  return finish(v.data, out.model);
}
