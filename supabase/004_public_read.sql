-- L2Price — migração 004: leitura pública (sem login).
-- Visitantes (anon) e usuários logados podem LER; somente administradores escrevem.
do $$
declare t text;
begin
  foreach t in array array['settings', 'watch', 'prices', 'trades'] loop
    execute format('drop policy if exists "todos leem" on public.%I', t);
    execute format('create policy "todos leem" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Visitantes podem perguntar "sou admin?" (a resposta é sempre falso para eles).
grant execute on function public.is_admin() to anon;
