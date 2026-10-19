-- BATPAPO: registro administrativo dos desenvolvedores originais.
-- A tabela pode ser consultada pelo cliente para mostrar o selo, mas clientes
-- comuns não recebem permissões de INSERT, UPDATE ou DELETE.

create table if not exists public.original_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  badge_label text not null default 'Desenvolvedora original do BATPAPO',
  created_at timestamptz not null default now()
);

alter table public.original_developers enable row level security;

drop policy if exists "Anyone can read original developer badges" on public.original_developers;
create policy "Anyone can read original developer badges"
  on public.original_developers for select
  using (true);

-- Conta oficial confirmada pela proprietária.
insert into public.original_developers (user_id, badge_label)
values ('3dadac15-9a3d-45bb-844b-bc74ce8c13cb', 'Desenvolvedora original do BATPAPO')
on conflict (user_id) do update set badge_label = excluded.badge_label;

-- Intencionalmente não há políticas de escrita para anon/authenticated.
-- A manutenção dessa lista deve ser feita pelo painel SQL administrativo.
