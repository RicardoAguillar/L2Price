-- L2Price — schema do Supabase. Cole tudo no SQL Editor do projeto e clique em "Run".
-- Cada usuário só enxerga e altera os próprios dados (Row Level Security).

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  server  text not null default 'L2 Reborn — Legacy (C1)'
);

create table if not exists public.watch (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  item_id     text not null,
  fav         boolean not null default false,
  target      bigint,
  target_sell bigint,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.prices (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null,
  buy     bigint check (buy >= 0),
  sell    bigint check (sell >= 0),
  date    timestamptz not null default now(),
  note    text not null default '',
  check (buy is not null or sell is not null)
);
create index if not exists prices_user_item_date on public.prices (user_id, item_id, date);

create table if not exists public.trades (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null,
  type    text not null check (type in ('buy', 'sell')),
  qty     integer not null check (qty > 0),
  price   bigint not null check (price >= 0),
  date    timestamptz not null default now(),
  note    text not null default ''
);
create index if not exists trades_user_date on public.trades (user_id, date);

do $$
declare t text;
begin
  foreach t in array array['settings', 'watch', 'prices', 'trades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
