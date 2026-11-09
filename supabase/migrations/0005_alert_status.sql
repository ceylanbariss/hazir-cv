-- İş alarmı ilanlarının durumu: hâlâ başvuru alıyor mu?
-- status: 'open' | 'closed' | null (henüz bakılmadı ya da emin olunamadı)
alter table public.alert_jobs add column if not exists status text;
alter table public.alert_jobs add column if not exists checked_at timestamptz;
alter table public.alert_jobs add column if not exists closed_reason text;
create index if not exists alert_jobs_user_checked on public.alert_jobs (user_id, checked_at);
