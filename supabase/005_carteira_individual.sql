-- L2Price — migração 005: carteira individual.
-- Cada usuário logado vê e altera somente as próprias operações da carteira.
-- As demais tabelas (preços, monitorados, ajustes) continuam públicas para leitura.
drop policy if exists "todos leem" on public.trades;
drop policy if exists "admin escreve" on public.trades;
drop policy if exists "dono" on public.trades;
create policy "dono" on public.trades for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
