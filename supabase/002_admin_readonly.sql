-- L2Price — migração 002: dados compartilhados.
-- Administradores podem criar/editar/excluir; demais usuários logados só podem LER.
-- Rode no SQL Editor do Supabase (depois do schema.sql). Pode rodar mais de uma vez.

-- 1) Tabela de administradores
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "ler admins" on public.admins;
create policy "ler admins" on public.admins for select to authenticated using (true);
-- (sem policy de insert/update/delete: admins só são definidos pelo SQL Editor)

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- 2) Lista monitorada passa a ser única (um item aparece uma vez só)
alter table public.watch drop constraint if exists watch_pkey;
delete from public.watch a using public.watch b
  where a.item_id = b.item_id and a.created_at > b.created_at;
alter table public.watch add primary key (item_id);

-- 3) Configuração passa a ser uma linha só
delete from public.settings where user_id not in (select user_id from public.settings order by user_id limit 1);

-- 4) Novas regras de acesso
do $$
declare t text;
begin
  foreach t in array array['settings', 'watch', 'prices', 'trades'] loop
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('drop policy if exists "todos leem" on public.%I', t);
    execute format('drop policy if exists "admin escreve" on public.%I', t);
    execute format('create policy "todos leem" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin escreve" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 5) Tornar uma conta administradora (troque o e-mail e rode esta linha):
-- insert into public.admins (user_id) select id from auth.users where email = 'SEU-EMAIL@exemplo.com' on conflict do nothing;
