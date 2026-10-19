-- BATPAPO: correção transacional da criação de grupos e permissões do badge.
-- Execute no SQL Editor do Supabase já configurado para o BATPAPO.

-- Cria conversa, adiciona o criador como owner e cria os metadados do grupo
-- em uma única transação. A identidade vem de auth.uid(), nunca do cliente.
create or replace function public.create_group(p_name text, p_description text default '')
returns table (
  id uuid,
  conversation_id uuid,
  name text,
  description text,
  owner_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_name text;
  v_description text;
  v_conversation_id uuid;
  v_group_id uuid;
  v_created_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Você precisa estar autenticado para criar um grupo.';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_description := left(btrim(coalesce(p_description, '')), 500);
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'O nome do grupo deve ter entre 1 e 60 caracteres.';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', v_name, v_user_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'owner');

  insert into public.groups (conversation_id, name, description, owner_id)
  values (v_conversation_id, v_name, v_description, v_user_id)
  returning public.groups.id, public.groups.created_at
    into v_group_id, v_created_at;

  return query select v_group_id, v_conversation_id, v_name, v_description, v_user_id, v_created_at;
end;
$$;

revoke all on function public.create_group(text, text) from public;
grant execute on function public.create_group(text, text) to authenticated;

-- Garantir que usuários autenticados consigam consultar o badge, sem poder alterá-lo.
grant select on table public.original_developers to authenticated;
alter table public.original_developers enable row level security;
drop policy if exists "Anyone can read original developer badges" on public.original_developers;
create policy "Authenticated users can read original developer badges"
  on public.original_developers for select to authenticated using (true);
revoke insert, update, delete, truncate, references, trigger on table public.original_developers from anon, authenticated;

-- Registra/atualiza a conta oficial confirmada pela proprietária.
insert into public.original_developers (user_id, badge_label)
values ('3dadac15-9a3d-45bb-844b-bc74ce8c13cb', 'Desenvolvedora original do BATPAPO')
on conflict (user_id) do update set badge_label = excluded.badge_label;

-- Atualiza o cache do PostgREST para a nova RPC ficar disponível imediatamente.
notify pgrst, 'reload schema';
