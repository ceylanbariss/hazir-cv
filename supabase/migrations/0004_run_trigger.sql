-- Taramanın nasıl başladığı: 'auto' (zamanlanmış) | 'manual' (panelden). Panelde gösterilir.
alter table public.run_logs add column if not exists trigger text;
