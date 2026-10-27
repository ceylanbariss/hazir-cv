// Central, validated runtime configuration. Every knob lives here so that
// behaviour in production is explicit and reviewable (see .env.example).
import { z } from 'zod/v4';

// Hosting dashboards make it easy to type "False", " false" or '"false"'; normalise first.
const bool = (def) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/['"]/g, '').trim().toLowerCase() : v),
    z
      .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
      .default(def ? 'true' : 'false')
      .transform((v) => ['true', '1', 'yes', 'on'].includes(v)),
  );

const csv = (def) =>
  z
    .string()
    .default(def)
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // LLM
  LLM_PROVIDER: z.enum(['gemini', 'mock']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  // Asıl model yoğun/kotası dolu olduğunda sırayla denenecek yedekler ("" verilirse yedek yok).
  GEMINI_FALLBACK_MODELS: csv('gemini-2.5-flash-lite,gemini-2.5-flash'),
  // "json_schema" sends a response JSON schema to Gemini; "mime_only" only asks
  // for JSON. Responses are always validated with zod either way.
  GEMINI_STRUCTURED_MODE: z.enum(['json_schema', 'mime_only']).default('json_schema'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  // Cost guard (USD). Estimated from token usage; 0 disables the guard.
  DAILY_BUDGET_USD: z.coerce.number().min(0).default(5),
  MAX_CONCURRENT_PIPELINES: z.coerce.number().int().positive().default(8),

  // HTTP
  ALLOWED_ORIGINS: csv(
    'https://hazircv.com.tr,https://www.hazircv.com.tr,http://localhost:5173,http://127.0.0.1:5173',
  ),
  // Vercel preview deployments of this project, e.g. resumatch-v2-git-v3-xyz.vercel.app
  ALLOWED_ORIGIN_PATTERN: z.string().default('^https://resumatch-v2(-[a-z0-9-]+)?\\.vercel\\.app$'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // Kept only for a zero-downtime migration from the v2 client. Off by default.
  ENABLE_LEGACY_OPTIMIZE: bool(false),

  // Başvuru otomasyonu modülü (Supabase). Boşsa /api/v1/automation devre dışı kalır.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Faz 2: Gmail ile gönderim (Google OAuth istemcisi) ve refresh token şifreleme anahtarı.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TOKEN_ENC_KEY: z.string().optional(),
  // Günlük işçi: GitHub Actions bu sırla /internal uçlarını çağırır.
  CRON_SECRET: z.string().optional(),
  // İlan araması (ikisi de isteğe bağlı; önce Tavily, kota/hata olursa SerpApi).
  TAVILY_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  SEARCHES_PER_USER: z.coerce.number().int().min(1).max(10).default(4),
  PAGES_PER_USER: z.coerce.number().int().min(1).max(30).default(10),
  // Ücretsiz Gemini katmanı dakikada ~15 istek; işçi çağrılar arasında bu kadar bekler.
  WORKER_LLM_GAP_MS: z.coerce.number().int().min(0).default(4500),
  API_PUBLIC_URL: z.string().url().default('https://resumatch-backend-zsmt.onrender.com'),
  APP_URL: z.string().url().default('https://hazircv.com.tr'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.LLM_PROVIDER === 'gemini' && !cfg.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini (use LLM_PROVIDER=mock for local dev).');
  }
  // Tolerate keys pasted with quotes/whitespace in hosting dashboards.
  if (cfg.GEMINI_API_KEY) cfg.GEMINI_API_KEY = cfg.GEMINI_API_KEY.replace(/['"]/g, '').trim();
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENC_KEY', 'CRON_SECRET', 'TAVILY_API_KEY', 'SERPAPI_KEY']) {
    if (cfg[k]) cfg[k] = cfg[k].replace(/['"]/g, '').trim();
  }
  if (cfg.SUPABASE_URL) cfg.SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/$/, '');
  if (Boolean(cfg.SUPABASE_URL) !== Boolean(cfg.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set together.');
  }
  cfg.automationEnabled = Boolean(cfg.SUPABASE_URL);
  cfg.gmailEnabled = Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET && cfg.TOKEN_ENC_KEY);
  cfg.API_PUBLIC_URL = cfg.API_PUBLIC_URL.replace(/\/$/, '');
  cfg.APP_URL = cfg.APP_URL.replace(/\/$/, '');
  return Object.freeze({ ...cfg, originPattern: new RegExp(cfg.ALLOWED_ORIGIN_PATTERN) });
}
