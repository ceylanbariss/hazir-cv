-- Faz 2: kullanıcının günlük taramanın çalışacağı saati seçebilmesi (Türkiye saati, 0-23).
alter table public.profiles
  add column if not exists scan_hour int not null default 9 check (scan_hour between 0 and 23);
