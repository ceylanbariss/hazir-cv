// Deterministic guardrails around the LLM steps. These run without any model
// call and are the reason the product can say "we don't invent facts":
//  1. evidence quotes cited by the matcher must really exist in the CV;
//  2. numbers in rewritten text must exist in the CV;
//  3. employers / dates must survive the rewrite;
//  4. unsupported rewritten claims are auto-reverted to the original CV text.
import { containsQuote, looksLikeInjection, hasTerm, unsupportedNumbers, splitSentences, normalize, extractContacts, extractProfileLinks } from './text.js';

const DOWNGRADE = { met: 'partial', partial: 'missing', missing: 'missing' };

/** Merge matcher output into requirements and verify every cited quote. */
export function attachEvidence(cv, requirements, matches) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  return requirements.map((r) => {
    const m = byId.get(r.id);
    if (!m) {
      return { ...r, status: 'missing', model_status: 'missing', evidence: [], evidence_verified: false, rationale: '' };
    }
    const evidence = (m.evidence || [])
      .filter((q) => typeof q === 'string' && q.trim())
      .slice(0, 2)
      .map((quote) => ({
        quote: quote.trim(),
        // Text that reads like an instruction to the AI is never accepted as evidence.
        verified: containsQuote(cv, quote) && !looksLikeInjection(quote),
      }));
    const anyVerified = evidence.some((e) => e.verified);
    let status = m.status;
    // A positive verdict whose evidence cannot be found in the CV is downgraded one level.
    if (status !== 'missing' && !anyVerified) status = DOWNGRADE[status];
    return {
      ...r,
      status,
      model_status: m.status,
      evidence,
      evidence_verified: anyVerified,
      rationale: m.rationale || '',
    };
  });
}

/** Flatten the tailored CV into individually checkable claims. */
export function buildClaims(t) {
  const claims = [];
  splitSentences(t.summary_v1).forEach((text, i) => claims.push({ id: `S${i + 1}`, section: 'summary', index: i, text }));
  t.experience.forEach((exp, e) => {
    exp.bullets_v1.forEach((text, b) =>
      claims.push({ id: `E${e + 1}.${b + 1}`, section: 'experience', exp: e, bullet: b, text, source: exp.bullet_sources?.[b] || '' }),
    );
  });
  t.skills.forEach((text, i) => claims.push({ id: `K${i + 1}`, section: 'skills', index: i, text }));
  return claims;
}

/** Combine LLM verdicts with deterministic number checks (deterministic wins). */
export function judgeClaims(cv, claims, verdicts) {
  const byId = new Map((verdicts || []).map((v) => [v.id, v]));
  return claims.map((c) => {
    const v = byId.get(c.id);
    let verdict = v?.verdict || 'supported';
    let note = v?.note || '';
    const badNumbers = unsupportedNumbers(cv, c.text);
    if (badNumbers.length) {
      verdict = 'unsupported';
      note = `CV'de geçmeyen sayı/metrik: ${badNumbers.join(', ')}`;
    }
    const sourceVerified = c.source ? containsQuote(cv, c.source, 0.75) : false;
    return { ...c, verdict, note, checked_by: badNumbers.length ? 'rule' : v ? 'llm' : 'none', source_verified: sourceVerified };
  });
}

/**
 * Apply the remediation policy and return the cleaned CV + an audit log.
 *  - unsupported experience bullet -> replaced with its verified original CV text, else removed
 *  - unsupported skill -> removed
 *  - summary sentences and "embellished" claims -> flagged only (user decides in the UI)
 */
export function remediate(tailored, judged) {
  const t = structuredClone(tailored);
  const fixes = [];
  const removeBullets = new Map(); // exp -> Set(bullet)
  const removeSkills = new Set();

  for (const c of judged) {
    if (c.verdict !== 'unsupported') continue;
    if (c.section === 'experience') {
      const exp = t.experience[c.exp];
      if (c.source && c.source_verified) {
        exp.bullets_v1[c.bullet] = c.source;
        if (exp.bullets_v3[c.bullet] !== undefined) exp.bullets_v3[c.bullet] = c.source;
        fixes.push({ claim: c.id, action: 'reverted_to_original', before: c.text, after: c.source });
        c.remediation = 'reverted_to_original';
      } else {
        if (!removeBullets.has(c.exp)) removeBullets.set(c.exp, new Set());
        removeBullets.get(c.exp).add(c.bullet);
        fixes.push({ claim: c.id, action: 'removed', before: c.text });
        c.remediation = 'removed';
      }
    } else if (c.section === 'skills') {
      removeSkills.add(c.index);
      fixes.push({ claim: c.id, action: 'removed', before: c.text });
      c.remediation = 'removed';
    }
  }
  for (const [e, set] of removeBullets) {
    const exp = t.experience[e];
    const keep = (_, i) => !set.has(i);
    exp.bullets_v1 = exp.bullets_v1.filter(keep);
    exp.bullets_v3 = exp.bullets_v3.filter(keep);
    exp.bullet_sources = (exp.bullet_sources || []).filter(keep);
  }
  t.skills = t.skills.filter((_, i) => !removeSkills.has(i));
  return { tailored: t, fixes };
}

/** Employers, titles and years must come from the CV. */
export function entityIssues(cv, tailored) {
  const issues = [];
  const cvNorm = normalize(cv);
  tailored.experience.forEach((exp, i) => {
    if (exp.company && !cvNorm.includes(normalize(exp.company)) && !containsQuote(cv, exp.company, 0.67)) {
      issues.push({ path: `experience[${i}].company`, value: exp.company, issue: 'company_not_in_cv' });
    }
    for (const year of exp.date.match(/\b(19|20)\d{2}\b/g) || []) {
      if (!cv.includes(year)) issues.push({ path: `experience[${i}].date`, value: exp.date, issue: 'year_not_in_cv' });
    }
  });
  tailored.education.forEach((ed, i) => {
    for (const year of ed.date.match(/\b(19|20)\d{2}\b/g) || []) {
      if (!cv.includes(year)) issues.push({ path: `education[${i}].date`, value: ed.date, issue: 'year_not_in_cv' });
    }
  });
  return issues;
}

/** Contact details are copied from the CV by regex when the model's value is not in the CV. */
export function groundContacts(cv, t) {
  const found = extractContacts(cv);
  const out = { ...t };
  for (const key of ['email', 'phone', 'linkedin']) {
    const val = (t[key] || '').trim();
    const inCv = val && normalize(cv).replace(/\s/g, '').includes(normalize(val).replace(/\s/g, ''));
    if (!inCv) out[key] = found[key] || '';
  }
  // GitHub, Behance gibi profil bağlantıları doğrudan CV metninden alınır (yapay zeka uydurmasın).
  out.links = extractProfileLinks(cv);
  return out;
}

/** Posting keywords that the rewrite surfaced but the original CV did not contain verbatim. */
export function addedKeywords(cv, tailoredText, requirements) {
  const added = new Set();
  for (const r of requirements) {
    if (r.status === 'missing') continue;
    for (const k of r.keywords) if (hasTerm(tailoredText, k) && !hasTerm(cv, k)) added.add(k);
  }
  return [...added];
}

export function tailoredText(t) {
  return [
    t.title,
    t.summary_v1,
    ...t.experience.flatMap((e) => [e.role, ...e.bullets_v1]),
    ...t.skills,
    ...t.education.map((e) => `${e.degree} ${e.details}`),
    ...t.additional,
  ].join('\n');
}
