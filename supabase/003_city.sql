-- L2Price — migração 003: cidade onde o preço foi visto.
-- Registros antigos ficam sem cidade (null); novos registros exigem cidade pelo site.
alter table public.prices add column if not exists city text;
create index if not exists prices_item_city on public.prices (item_id, city, date);
