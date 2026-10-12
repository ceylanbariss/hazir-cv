// Small editor assistants: add an item to a section, integrate confirmed gaps, OCR.
import * as P from '../prompts/tasks.js';
import { runTask } from '../llm/runTask.js';
import { unsupportedNumbers } from './text.js';

export async function addItem(ctx, input) {
  const out = await runTask(ctx, P.addItem(input));
  if (input.section === 'customNew') {
    return out.type === 'detailed' ? { type: 'detailed', entries: out.entries } : { type: 'simple', items: out.items };
  }
  return out;
}

export async function integrateGaps(ctx, { gaps, notes, lang }) {
  const out = await runTask(ctx, P.integrateGaps({ gaps, notes, lang }));
  const allowed = new Set(gaps);
  const items = [];
  for (const it of out.items) {
    if (!allowed.has(it.original_gap) || it.targetSection === 'skip') continue;
    if (it.targetSection === 'skills' && it.skill_content.trim()) {
      items.push({ original_gap: it.original_gap, targetSection: 'skills', skill_content: it.skill_content.trim().split(/\s+/).slice(0, 3).join(' ') });
    }
    if (it.targetSection === 'experience' && it.exp_content_v1.trim()) {
      // Experience bullets must be backed by the user's own notes — including any numbers.
      if (!notes || unsupportedNumbers(notes, it.exp_content_v1).length) continue;
      items.push({
        original_gap: it.original_gap,
        targetSection: 'experience',
        exp_content_v1: it.exp_content_v1.trim(),
        exp_content_v3: (it.exp_content_v3 || it.exp_content_v1).trim(),
      });
    }
  }
  const skipped = gaps.filter((g) => !items.some((i) => i.original_gap === g));
  return { items, skipped };
}

export async function ocr(ctx, { images }) {
  const text = await runTask(ctx, P.ocrJobPosting({ images }));
  return { text: String(text).trim() };
}
