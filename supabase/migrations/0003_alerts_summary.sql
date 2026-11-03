-- Günlük özet e-postası tercihi ve iş alarmı ilanlarının hızlı listelenmesi.
alter table public.profiles
  add column if not exists daily_summary boolean not null default true;

create index if not exists alert_jobs_user_received on public.alert_jobs (user_id, received_at desc);
