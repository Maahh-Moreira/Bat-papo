-- BATPAPO: gerenciamento de grupos (exclusão segura pelo proprietário).
-- Execute este arquivo no SQL Editor do projeto Supabase do BATPAPO.

create or replace function public.delete_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Você precisa estar conectado.';
  end if;

  select g.conversation_id into v_conversation_id
  from public.groups g
  where g.id = p_group_id and g.owner_id = v_actor_id;

  if v_conversation_id is null then
    raise exception 'Grupo não encontrado ou você não é o dono dele.';
  end if;

  -- A conversa possui ON DELETE CASCADE para grupo, membros, mensagens e reações.
  delete from public.conversations c where c.id = v_conversation_id;
  return true;
end;
$$;

revoke all on function public.delete_group(uuid) from public;
grant execute on function public.delete_group(uuid) to authenticated;

notify pgrst, 'reload schema';
