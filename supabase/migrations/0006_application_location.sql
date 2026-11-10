-- Onay bekleyen başvurularda gösterilen çalışma şekli ve şehir (ilan sayfasından okunur).
-- work_mode: 'remote' | 'hybrid' | 'onsite' | null (sayfada belirtilmemiş)
alter table public.applications add column if not exists work_mode text;
alter table public.applications add column if not exists city text;
