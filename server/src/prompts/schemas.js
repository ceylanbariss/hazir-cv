// Output contracts for every LLM task. These are the single source of truth:
// they are sent to the model as JSON schema AND used to validate the answer.
import { z } from 'zod/v4';

export const CATEGORIES = ['hard_skill', 'soft_skill', 'experience', 'education', 'language', 'certification'];

export const DocumentCheck = z.object({
  is_cv: z.boolean(),
  confidence: z.number().min(0).max(1),
  detected_language: z.enum(['tr', 'en', 'other']),
  reason: z.string(),
});

export const Requirement = z.object({
  id: z.string(),
  text: z.string().min(1),
  category: z.enum(CATEGORIES),
  importance: z.enum(['must', 'nice']),
  keywords: z.array(z.string()),
});

export const Requirements = z.object({
  job_title: z.string(),
  company_name: z.string(),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'unspecified']),
  requirements: z.array(Requirement).min(1),
});

export const EvidenceMatch = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['met', 'partial', 'missing']),
      evidence: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
});

const Experience = z.object({
  role: z.string(),
  company: z.string(),
  date: z.string(),
  bullets_v1: z.array(z.string()),
  bullets_v3: z.array(z.string()),
  bullet_sources: z.array(z.string()),
});

export const Tailored = z.object({
  name: z.string(),
  title: z.string(),
  location: z.string(),
  phone: z.string(),
  email: z.string(),
  linkedin: z.string(),
  summary_v1: z.string(),
  summary_v3: z.string(),
  experience: z.array(Experience),
  education: z.array(z.object({ degree: z.string(), school: z.string(), date: z.string(), details: z.string() })),
  skills: z.array(z.string()),
  additional: z.array(z.string()),
});

export const ClaimVerdicts = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['supported', 'embellished', 'unsupported']),
      note: z.string(),
    }),
  ),
});

export const InterviewTurn = z.object({
  message: z.string().min(1),
  terminate: z.boolean(),
  terminate_reason: z.enum(['none', 'not_a_cv', 'abusive', 'off_topic', 'completed']),
});

export const InterviewReport = z.object({
  rubric: z.array(
    z.object({
      dimension: z.string(),
      score: z.number().int().min(1).max(5),
      note: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const GapIntegration = z.object({
  items: z.array(
    z.object({
      original_gap: z.string(),
      targetSection: z.enum(['skills', 'experience', 'skip']),
      skill_content: z.string(),
      exp_content_v1: z.string(),
      exp_content_v3: z.string(),
    }),
  ),
});

// "Add item" assistant: one schema per target section, mirroring the client data model.
export const AddItem = {
  summary: z.object({ summary_v1: z.string(), summary_v3: z.string() }),
  education: z.object({
    entry: z.object({ degree: z.string(), school: z.string(), date: z.string(), details: z.string() }),
  }),
  experience: z.object({
    entry: z.object({
      role: z.string(),
      company: z.string(),
      date: z.string(),
      bullets_v1: z.array(z.string()),
      bullets_v3: z.array(z.string()),
    }),
  }),
  contactLink: z.object({ link: z.object({ label: z.string(), url: z.string() }) }),
  list: z.object({ items: z.array(z.string()) }),
  customDetailed: z.object({
    entry: z.object({ role: z.string(), company: z.string(), date: z.string(), bullets: z.array(z.string()) }),
  }),
  customNew: z.object({
    type: z.enum(['detailed', 'simple']),
    entries: z.array(
      z.object({ role: z.string(), company: z.string(), date: z.string(), bullets: z.array(z.string()) }),
    ),
    items: z.array(z.string()),
  }),
};
