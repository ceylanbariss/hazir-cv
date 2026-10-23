-- Başvuru otomasyonu modülü — ilk şema (Faz 0).
-- Supabase SQL Editor'da bir kez çalıştırılır. Tüm tablolarda RLS açıktır:
-- tarayıcı (anon/authenticated anahtar) yalnızca kendi satırlarını OKUYABİLİR.
-- Tüm yazma işlemleri sunucudan service-role anahtarıyla yapılır (RLS'yi atlar).

create extension if not exists pgcrypto;

-- Kullanıcı profili ve otomasyon ayarları (auth.users ile 1-1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  -- yönlendirilen iş alarmları için: <alert_code>@alarm.hazircv.com.tr
  alert_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  mode text not null default 'approval' check (mode in ('approval', 'auto')),
  daily_limit int not null default 10 check (daily_limit between 0 and 30),
  company_cooldown_days int not null default 30 check (company_cooldown_days between 7 and 180),
  open_applications boolean not null default true,
  portfolio_url text,
  status text not null default 'setup' check (status in ('setup', 'active', 'paused')),
  setup_step int not null default 1,
  kvkk_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Yüklenen CV'ler (dosya Supabase Storage 'cvs' kovasında)
create table if not exists public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  storage_path text not null,
  extracted_profile jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Hedefler: roller, hariçler, konum, çalışma şekli, kıdem
create table if not exists public.targets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  roles text[] not null default '{}',
  excluded text[] not null default '{}',
  cities text[] not null default '{}',
  work_modes text[] not null default '{}',      -- remote | hybrid | onsite
  seniority text[] not null default '{}',       -- intern | junior | mid
  long_term_internship boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Gmail gönderim bağlantısı. Tarayıcıya HİÇ açılmaz (politika yok).
create table if not exists public.gmail_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,   -- sunucuda AES-256-GCM ile şifrelenmiş
  scopes text not null,
  connected_at timestamptz not null default now()
);

-- Keşifte görülen sayfalar (tekrar işlememek için)
create table if not exists public.discoveries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null,
  kind text,                -- job | open_application | irrelevant
  score int,
  seen_at timestamptz not null default now(),
  primary key (user_id, url)
);

-- Başvurular (taslak → onay → gönderildi)
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company text not null,
  company_key text not null,
  position text,
  recipient text,
  source_url text,
  channel text not null default 'email',
  kind text,                 -- job | open_application
  score int,
  reason text,
  cover_letter text,
  subject text,
  cv_id uuid references public.cvs (id) on delete set null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'skipped', 'sent', 'failed', 'replied', 'interview', 'rejected')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists applications_user_created on public.applications (user_id, created_at desc);
create index if not exists applications_company on public.applications (user_id, company_key, sent_at desc);

-- Yönlendirilen LinkedIn / Kariyer.net alarm ilanları
create table if not exists public.alert_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null,
  title text not null,
  company text,
  location text,
  url text not null,
  score int,
  reason text,
  cover_letter text,
  received_at timestamptz not null default now(),
  unique (user_id, url)
);

-- Hesap içi gelen kutusu: günlük özet, gönderilen başvuru, onay bekleyen vb.
-- E-postayla gönderilen her bildirim buraya da düşer.
create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,        -- welcome | daily_summary | needs_approval | sent | reply | system
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inbox_user_created on public.inbox_items (user_id, created_at desc);

-- Günlük çalışma kayıtları (maliyet ve hata takibi)
create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  searches int default 0,
  llm_cost_usd numeric(10, 5) default 0,
  sent int default 0,
  drafted int default 0,
  error text
);

-- RLS: herkes yalnızca kendi satırlarını okur
alter table public.profiles enable row level security;
alter table public.cvs enable row level security;
alter table public.targets enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.discoveries enable row level security;
alter table public.applications enable row level security;
alter table public.alert_jobs enable row level security;
alter table public.inbox_items enable row level security;
alter table public.run_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cvs','targets','discoveries','applications','alert_jobs','inbox_items','run_logs'] loop
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
-- gmail_connections: bilinçli olarak politika yok → tarayıcıdan erişilemez.

-- CV dosyaları için özel (private) kova; kullanıcı yalnızca kendi klasörünü okur
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false) on conflict (id) do nothing;
drop policy if exists "own cv files read" on storage.objects;
create policy "own cv files read" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
