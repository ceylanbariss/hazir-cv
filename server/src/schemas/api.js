// Request contracts for the public API. Anything not matching is rejected
// with 400 before it can reach a (paid) model call.
import { z } from 'zod/v4';

const lang = z.enum(['tr', 'en']).default('tr');
const cv = z.string().trim().min(1, 'CV metni boş.').max(30_000, 'CV metni çok uzun.');
const jobPosting = z.string().trim().min(30, 'İş ilanı metni çok kısa.').max(20_000, 'İş ilanı metni çok uzun.');

export const TailorRequest = z.object({ cv, jobPosting, lang });

const history = z
  .array(z.object({ role: z.enum(['interviewer', 'candidate']), text: z.string().max(4000) }))
  .max(40);

export const InterviewTurnRequest = z.object({
  cv,
  jobPosting,
  lang,
  type: z.enum(['hr', 'tech']),
  history,
  focus: z.array(z.string().max(200)).max(8).optional(),
});

export const InterviewReportRequest = InterviewTurnRequest.extend({
  endReason: z.enum(['none', 'completed', 'abusive', 'off_topic', 'not_a_cv']).optional(),
});

export const AddItemRequest = z.object({
  section: z.enum([
    'summary',
    'education',
    'experience',
    'contactLink',
    'skills',
    'additional',
    'customDetailed',
    'customSimple',
    'customNew',
  ]),
  input: z.string().trim().min(1).max(4000),
  title: z.string().max(80).optional(),
  lang,
});

export const IntegrateGapsRequest = z.object({
  gaps: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  notes: z.string().max(3000).optional().default(''),
  lang,
  // Explicit user confirmation that they really have these qualifications.
  confirmed: z.literal(true, { message: 'Eklemeden önce bu yetkinliklere sahip olduğunuzu onaylamalısınız.' }),
});

export const OcrRequest = z.object({
  images: z
    .array(
      z.object({
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        data: z.string().max(7_000_000).regex(/^[A-Za-z0-9+/=\s]+$/, 'Geçersiz görsel verisi.'),
      }),
    )
    .min(1)
    .max(6),
});
