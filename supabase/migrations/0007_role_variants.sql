-- Rol genişletme: her rol için aramaya eklenen benzer başlıklar.
-- { "İş Analisti": ["Sistem Analisti", "Business Analyst", ...], ... }
alter table public.targets add column if not exists role_variants jsonb not null default '{}'::jsonb;
