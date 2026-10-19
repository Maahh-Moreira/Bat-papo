-- BATPAPO: amizades persistentes e busca de membros por BAT-ID.
-- Execute no SQL Editor do projeto Supabase do BATPAPO.

create or replace function public.send_friend_request_by_bat_id(p_bat_id text)
returns table(request_id uuid, receiver_id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_id uuid;
  v_request_id uuid;
  v_status text;
  v_created_at timestamptz;
  v_low uuid;
  v_high uuid;
begin
  if v_actor_id is null then raise exception 'Você precisa estar conectado.'; end if;
  if nullif(btrim(p_bat_id), '') is null then raise exception 'Digite o BAT-ID da pessoa.'; end if;

  select p.id into v_target_id
  from public.profiles as p
  where upper(btrim(p.bat_id)) = upper(btrim(p_bat_id))
  limit 1;
  if v_target_id is null then raise exception 'BAT-ID não encontrado. Confira o código e tente novamente.'; end if;
  if v_target_id = v_actor_id then raise exception 'Você não pode adicionar a si mesmo.'; end if;

  v_low := least(v_actor_id, v_target_id);
  v_high := greatest(v_actor_id, v_target_id);
  if exists (select 1 from public.friendships f where f.user_low = v_low and f.user_high = v_high) then
    raise exception 'Vocês já são amigos.';
  end if;
  if exists (select 1 from public.friend_requests r where r.sender_id = v_actor_id and r.receiver_id = v_target_id and r.status = 'pending') then
    raise exception 'Você já enviou uma solicitação para essa pessoa.';
  end if;
  if exists (select 1 from public.friend_requests r where r.sender_id = v_target_id and r.receiver_id = v_actor_id and r.status = 'pending') then
    raise exception 'Essa pessoa já enviou uma solicitação para você. Confira suas solicitações recebidas.';
  end if;

  insert into public.friend_requests as fr(sender_id, receiver_id, status)
  values (v_actor_id, v_target_id, 'pending')
  returning fr.id, fr.status, fr.created_at
  into v_request_id, v_status, v_created_at;

  return query select v_request_id, v_target_id, v_status, v_created_at;
end;
$$;
revoke all on function public.send_friend_request_by_bat_id(text) from public;
grant execute on function public.send_friend_request_by_bat_id(text) to authenticated;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns table(sender_id uuid, receiver_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_sender_id uuid;
  v_receiver_id uuid;
  v_new_status text;
  v_low uuid;
  v_high uuid;
begin
  if v_actor_id is null then raise exception 'Você precisa estar conectado.'; end if;

  update public.friend_requests as r
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where r.id = p_request_id
    and r.receiver_id = v_actor_id
    and r.status = 'pending'
  returning r.sender_id, r.receiver_id, r.status
  into v_sender_id, v_receiver_id, v_new_status;

  if v_sender_id is null then raise exception 'Solicitação não encontrada ou já respondida.'; end if;

  if p_accept then
    v_low := least(v_sender_id, v_receiver_id);
    v_high := greatest(v_sender_id, v_receiver_id);
    insert into public.friendships(user_low, user_high)
    values (v_low, v_high)
    on conflict (user_low, user_high) do nothing;
  end if;

  return query select v_sender_id, v_receiver_id, v_new_status;
end;
$$;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friend(p_friend_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_low uuid;
  v_high uuid;
begin
  if v_actor_id is null then raise exception 'Você precisa estar conectado.'; end if;
  if p_friend_id is null or p_friend_id = v_actor_id then raise exception 'Amigo inválido.'; end if;
  v_low := least(v_actor_id, p_friend_id);
  v_high := greatest(v_actor_id, p_friend_id);
  delete from public.friendships f where f.user_low = v_low and f.user_high = v_high;
  if not found then raise exception 'Essa amizade não foi encontrada.'; end if;
  return true;
end;
$$;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Corrige conflitos entre nomes de saída da função e nomes de colunas.
create or replace function public.add_group_member(p_group_id uuid, p_user_bat_id text)
returns table(user_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_conversation_id uuid;
  v_target_user_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then raise exception 'Você precisa estar conectado.'; end if;

  select g.conversation_id into v_conversation_id
  from public.groups as g
  where g.id = p_group_id
    and (g.owner_id = v_actor_id or exists (
      select 1 from public.conversation_members as cm
      where cm.conversation_id = g.conversation_id
        and cm.user_id = v_actor_id
        and cm.role in ('owner', 'admin')
    ));
  if v_conversation_id is null then
    raise exception 'Grupo não encontrado ou você não tem permissão para adicionar membros.';
  end if;

  select p.id into v_target_user_id
  from public.profiles as p
  where upper(btrim(p.bat_id)) = upper(btrim(p_user_bat_id))
  limit 1;
  if v_target_user_id is null then raise exception 'BAT-ID não encontrado. Confira o código e tente novamente.'; end if;
  if v_target_user_id = v_actor_id then raise exception 'Você já faz parte deste grupo.'; end if;

  insert into public.conversation_members as cm (conversation_id, user_id, role)
  values (v_conversation_id, v_target_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return query select v_target_user_id, v_conversation_id;
end;
$$;
revoke all on function public.add_group_member(uuid, text) from public;
grant execute on function public.add_group_member(uuid, text) to authenticated;

notify pgrst, 'reload schema';
