// Deterministic, offline LLM stand-in. Used for local development without an
// API key, for HTTP/integration tests and for smoke-testing the eval harness.
// It produces *plausible* structured output with simple heuristics; it is not
// meant to be good, only to exercise every code path.
//
// Fault injection: the mock tailor deliberately adds one fabricated metric to
// the first experience bullet, so the grounding guardrail can be seen working
// (and tested) without a real model. Disable with MOCK_INJECT_FABRICATION=false.
import { containsQuote, hasTerm, splitSentences, extractContacts, normalize } from '../pipeline/text.js';

const SKILLS = [
  'React', 'Next.js', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Python', 'FastAPI',
  'Django', 'Flask', 'Java', 'Spring Boot', 'C#', '.NET', 'Go', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Git', 'REST', 'GraphQL', 'Tailwind CSS', 'HTML', 'CSS',
  'Power BI', 'Tableau', 'Excel', 'SAP', 'Odoo', 'ERP', 'Jira', 'Scrum', 'Agile', 'UML', 'BPMN', 'Figma',
  'Machine Learning', 'LLM', 'RAG', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'Linux', 'Selenium', 'Postman',
  'İngilizce', 'English', 'Almanca', 'German',
];
const SOFT = [
  'iletişim', 'takım çalışması', 'problem çözme', 'analitik düşünme', 'liderlik',
  'communication', 'teamwork', 'problem solving', 'analytical thinking', 'leadership', 'stakeholder management',
];

const between = (text, tag) => {
  const m = text.match(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`));
  return m ? m[1] : '';
};
const jsonBetween = (text, tag) => {
  try {
    return JSON.parse(between(text, tag) || 'null');
  } catch {
    return null;
  }
};

const DATE_LINE = /((19|20)\d{2}|Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;

function parseCv(cv) {
  const lines = cv.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const name = lines[0] || '';
  const contacts = extractContacts(cv);
  const experience = [];
  const education = [];
  let section = '';
  for (const line of lines.slice(1)) {
    const h = normalize(line);
    if (/^(deneyim|is deneyimi|experience|work experience)$/.test(h)) { section = 'exp'; continue; }
    if (/^(egitim|education|sertifikalar|certificates)$/.test(h)) { section = 'edu'; continue; }
    if (/^(yetenekler|skills|beceriler|diller|languages|ek bilgiler|additional)$/.test(h)) { section = 'other'; continue; }
    if (section === 'exp') {
      if (/\|/.test(line) && DATE_LINE.test(line)) {
        const [role = '', company = '', date = ''] = line.split('|').map((s) => s.trim());
        experience.push({ role, company, date, bullets: [] });
      } else if (experience.length) {
        experience[experience.length - 1].bullets.push(line.replace(/^[-•*]\s*/, ''));
      }
    } else if (section === 'edu' && /\|/.test(line)) {
      const [degree = '', school = '', date = ''] = line.split('|').map((s) => s.trim());
      education.push({ degree, school, date, details: '' });
    }
  }
  return { name, contacts, experience, education };
}

const respond = (obj) => JSON.stringify(obj);

const handlers = {
  extract_profile(text) {
    const cv = between(text, 'cv');
    const p = parseCv(cv);
    const skills = SKILLS.filter((s) => hasTerm(cv, s)).slice(0, 20);
    return respond({
      full_name: p.name || '', headline: 'Aday', seniority: 'junior', years_experience: 1, city: '',
      roles_held: [], skills, education: [], languages: skills.filter((s) => /ingilizce|english/i.test(s)), summary: 'Mock profil.',
    });
  },

  suggest_roles(text) {
    const chosen = between(text, 'roles').split('\n').map((s) => s.trim().toLowerCase());
    const pool = ['İş Analisti', 'Business Analyst', 'Ürün Analisti', 'ERP Danışmanı', 'Proje Asistanı', 'Süreç Analisti'];
    return respond({ suggestions: pool.filter((t) => !chosen.includes(t.toLowerCase())).slice(0, 4).map((title) => ({ title, reason: 'Profiline uygun.' })) });
  },

  evaluate_page(text) {
    const page = between(text, 'page');
    const emails = (page.match(/Addresses found on the page: (.*)/) || [])[1]?.split(',').map((s) => s.trim()).filter(Boolean) || [];
    const cvId = (between(text, 'cvs').split('\n')[0] || '').split(':')[0].trim();
    const irrelevant = /kimya/i.test(page);
    const kind = irrelevant ? 'irrelevant' : /ilan|pozisyon/i.test(page) ? 'job' : 'open_application';
    return respond({
      kind, company: 'Test A.Ş.', position: 'İş Analisti', score: irrelevant ? 10 : 82, reason: 'Profil ile uyumlu.',
      email: emails[0] || '', cv_id: cvId, subject: 'İş Analisti Başvurusu', in_turkey: true, real_company: true, career_product: false,
      cover_letter: 'Merhaba,\n\nİlanınızı gördüm ve başvurmak istiyorum.\n\nDeneyimlerim ilanla örtüşüyor. CV\'m ektedir.\n\nSaygılarımla,\nAyşe',
    });
  },

  classify_document(text) {
    const cv = between(text, 'cv');
    const signals = [/@/, /deneyim|experience/i, /eğitim|education/i, /\+?\d[\d\s]{8,}/].filter((r) => r.test(cv)).length;
    return respond({ is_cv: signals >= 2, confidence: signals >= 2 ? 0.9 : 0.8, detected_language: /[ğış]/i.test(cv) ? 'tr' : 'en', reason: 'heuristic' });
  },

  extract_requirements(text) {
    const jd = between(text, 'job_posting');
    const reqs = [];
    const isNice = (term) => {
      const idx = normalize(jd).indexOf(normalize(term));
      const window = normalize(jd).slice(Math.max(0, idx - 80), idx + 80);
      return /tercih|plus|nice to have|bonus|avantaj/.test(window);
    };
    for (const s of SKILLS) if (hasTerm(jd, s)) reqs.push({ text: s, category: /ingilizce|english|almanca|german/i.test(s) ? 'language' : 'hard_skill', importance: isNice(s) ? 'nice' : 'must', keywords: [s] });
    for (const s of SOFT) if (hasTerm(jd, s)) reqs.push({ text: s, category: 'soft_skill', importance: 'nice', keywords: [s] });
    const years = jd.match(/(\d+)\+?\s*(yıl|years?)/i);
    if (years) reqs.unshift({ text: `En az ${years[1]} yıl deneyim`, category: 'experience', importance: 'must', keywords: [`${years[1]} yıl`] });
    if (/lisans|bachelor|üniversite|degree/i.test(jd)) reqs.push({ text: 'İlgili alanda lisans derecesi', category: 'education', importance: 'must', keywords: ['lisans'] });
    const title = jd.split('\n').map((l) => l.trim()).find(Boolean) || 'Pozisyon';
    return respond({
      job_title: title.slice(0, 80),
      company_name: '',
      seniority: /senior|kıdemli/i.test(jd) ? 'senior' : /junior|stajyer|intern|yeni mezun/i.test(jd) ? 'junior' : 'unspecified',
      requirements: (reqs.length ? reqs : [{ text: 'Genel uygunluk', category: 'experience', importance: 'must', keywords: [] }])
        .slice(0, 18)
        .map((r, i) => ({ id: `R${i + 1}`, ...r })),
    });
  },

  match_evidence(text) {
    const cv = between(text, 'cv');
    const reqs = jsonBetween(text, 'requirements') || [];
    const sentences = cv.split(/\n|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    return respond({
      matches: reqs.map((r) => {
        if (r.category === 'experience') {
          const yearsAsked = Number((r.text.match(/\d+/) || [0])[0]);
          const years = [...cv.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
          const span = years.length ? Math.max(...years) - Math.min(...years) : 0;
          const line = sentences.find((s) => /\b20\d{2}\b/.test(s)) || '';
          const status = span >= yearsAsked ? 'met' : span > 0 ? 'partial' : 'missing';
          return { id: r.id, status, evidence: line ? [line] : [], rationale: `Tarihlerden ~${span} yıl deneyim hesaplandı.` };
        }
        const terms = r.keywords?.length ? r.keywords : [r.text];
        const hit = sentences.find((s) => terms.some((k) => hasTerm(s, k)));
        return hit
          ? { id: r.id, status: 'met', evidence: [hit], rationale: 'CV içinde doğrudan geçiyor.' }
          : { id: r.id, status: 'missing', evidence: [], rationale: "CV'de bu konuda kanıt bulunamadı." };
      }),
    });
  },

  tailor_cv(text, opts) {
    const cv = between(text, 'cv');
    const reqs = jsonBetween(text, 'requirements') || [];
    const p = parseCv(cv);
    const metKeywords = reqs.filter((r) => r.status === 'met').flatMap((r) => r.keywords);
    const skills = SKILLS.filter((s) => hasTerm(cv, s)).sort((a, b) => metKeywords.includes(b) - metKeywords.includes(a)).slice(0, 12);
    const experience = p.experience.map((e) => ({
      role: e.role,
      company: e.company,
      date: e.date,
      bullets_v1: [...e.bullets],
      bullets_v3: [...e.bullets],
      bullet_sources: [...e.bullets],
    }));
    if (opts.injectFabrication && experience[0]?.bullets_v1.length) {
      experience[0].bullets_v1[0] = `${experience[0].bullets_v1[0].replace(/\.$/, '')} ve sistem performansını %37 artırdım.`;
    }
    const firstSentence = splitSentences(cv.split('\n').slice(1).join(' '))[0] || '';
    return respond({
      name: p.name,
      title: p.experience[0]?.role || '',
      location: '',
      phone: p.contacts.phone,
      email: p.contacts.email,
      linkedin: p.contacts.linkedin,
      summary_v1: skills.length ? `${skills.slice(0, 3).join(', ')} alanlarında deneyim kazandım.` : firstSentence,
      summary_v3: skills.length ? `${skills.slice(0, 3).join(', ')} alanlarında deneyimlidir.` : firstSentence,
      experience,
      education: p.education,
      skills,
      additional: [],
    });
  },

  verify_claims(text) {
    const cv = between(text, 'cv');
    const claims = jsonBetween(text, 'claims') || [];
    return respond({
      verdicts: claims.map((c) => ({
        id: c.id,
        verdict: containsQuote(cv, c.text, 0.6) || SKILLS.some((s) => normalize(s) === normalize(c.text) && hasTerm(cv, s)) ? 'supported' : 'embellished',
        note: '',
      })),
    });
  },

  interview_turn(text, _opts, system = '') {
    const history = between(text, 'history').split('\n').filter(Boolean);
    const asked = history.filter((l) => l.startsWith('Interviewer:')).length;
    const plan = [...system.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
    const last = history.at(-1) || '';
    if (/Candidate:\s*(asd+|sana ne|cırt)\s*$/i.test(last)) {
      return respond({ message: 'Bu tavır profesyonel bir mülakatta kabul edilemez. Görüşmeyi burada sonlandırıyorum.', terminate: true, terminate_reason: 'abusive' });
    }
    if (asked >= 8) return respond({ message: 'Katılımınız için teşekkürler, mülakatımızı burada tamamlıyoruz.', terminate: true, terminate_reason: 'completed' });
    const topic = plan[asked % Math.max(plan.length, 1)] || 'son projeniz';
    const opener = asked === 0 ? 'Merhaba, ben mülakatınızı yapacak kişiyim. ' : 'Teşekkürler. ';
    return respond({ message: `${opener}"${topic}" konusunda somut bir örnek anlatır mısınız?`, terminate: false, terminate_reason: 'none' });
  },

  interview_report(text, _opts, system) {
    const dims = (system.match(/use these exact keys, in this order\): ([^.]+)\./) || [, 'communication'])[1].split(', ');
    const answers = between(text, 'history').split('\n').filter((l) => l.startsWith('Candidate:'));
    const avgLen = answers.reduce((s, a) => s + a.length, 0) / Math.max(answers.length, 1);
    const score = avgLen > 200 ? 4 : avgLen > 80 ? 3 : 2;
    return respond({
      rubric: dims.map((d) => ({ dimension: d.trim(), score, note: 'Cevap uzunluğuna dayalı mock değerlendirme.' })),
      strengths: ['Sorulara yanıt verdi'],
      weaknesses: ['Daha somut örnekler verilebilir'],
      suggestions: ['Cevapları STAR yapısıyla kurgulayın'],
    });
  },

  integrate_gaps(text) {
    const gaps = jsonBetween(text, 'gaps') || [];
    const notes = between(text, 'notes');
    return respond({
      items: gaps.map((g) => {
        const isSkill = g.split(/\s+/).length <= 3 || SKILLS.some((s) => hasTerm(g, s));
        if (isSkill) return { original_gap: g, targetSection: 'skills', skill_content: g.split(/\s+/).slice(0, 3).join(' '), exp_content_v1: '', exp_content_v3: '' };
        if (notes && notes !== '(no notes)') return { original_gap: g, targetSection: 'experience', skill_content: '', exp_content_v1: notes.split('\n')[0], exp_content_v3: notes.split('\n')[0] };
        return { original_gap: g, targetSection: 'skip', skill_content: '', exp_content_v1: '', exp_content_v3: '' };
      }),
    });
  },

  ocr_job_posting() {
    return 'Mock OCR: Frontend Developer\nAranan nitelikler: React, TypeScript, REST, Git. En az 2 yıl deneyim.';
  },
};

function addItemMock(task, text) {
  const input = between(text, 'notes').trim();
  const lines = input.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  switch (task.replace('add_item_', '')) {
    case 'summary': return respond({ summary_v1: input, summary_v3: input });
    case 'education': return respond({ entry: { degree: lines[0] || input, school: lines[1] || '', date: '', details: '' } });
    case 'experience': return respond({ entry: { role: lines[0] || input, company: lines[1] || '', date: '', bullets_v1: lines.slice(2), bullets_v3: lines.slice(2) } });
    case 'contactLink': return respond({ link: { label: /github/i.test(input) ? 'GitHub' : 'Link', url: input.replace(/^https?:\/\//, '') } });
    case 'customDetailed': return respond({ entry: { role: lines[0] || input, company: '', date: '', bullets: lines.slice(1) } });
    case 'customNew': return respond({ type: 'simple', entries: [], items: lines });
    default: return respond({ items: lines });
  }
}

export function createMockProvider({ injectFabrication = process.env.MOCK_INJECT_FABRICATION !== 'false', latencyMs = 0 } = {}) {
  return {
    name: 'mock',
    model: 'mock',
    async generate(req) {
      if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
      const text = req.parts.map((p) => p.text || '').join('\n');
      const task = req.task || '';
      const handler = handlers[task];
      const out = task.startsWith('add_item_')
        ? addItemMock(task, text)
        : handler
          ? handler(text, { injectFabrication }, req.system || '')
          : respond({ candidates: [] });
      return {
        text: out,
        model: 'mock',
        finishReason: 'STOP',
        usage: { inputTokens: Math.ceil(text.length / 4), outputTokens: Math.ceil(out.length / 4), thinkingTokens: 0 },
        retries: 0,
      };
    },
  };
}
