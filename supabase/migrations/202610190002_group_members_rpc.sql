-- BATPAPO: entrada segura de membros em grupos já criados.
-- Execute no SQL Editor do mesmo projeto Supabase após a migração inicial.
create or replace function public.add_group_member(p_group_id uuid, p_user_bat_id text)
returns table(user_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_target_user_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Você precisa estar conectado.';
  end if;

  select g.conversation_id into v_conversation_id
  from public.groups g
  where g.id = p_group_id
    and (
      g.owner_id = v_actor_id
      or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = g.conversation_id
          and cm.user_id = v_actor_id
          and cm.role in ('owner', 'admin')
      )
    );

  if v_conversation_id is null then
    raise exception 'Grupo não encontrado ou você não tem permissão para adicionar membros.';
  end if;

  select p.id into v_target_user_id
  from public.profiles p
  where upper(p.bat_id) = upper(trim(p_user_bat_id));

  if v_target_user_id is null then
    raise exception 'Nenhum usuário encontrado com esse BAT-ID.';
  end if;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (v_conversation_id, v_target_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return query select v_target_user_id, v_conversation_id;
end;
$$;
revoke all on function public.add_group_member(uuid, text) from public;
grant execute on function public.add_group_member(uuid, text) to authenticated;
