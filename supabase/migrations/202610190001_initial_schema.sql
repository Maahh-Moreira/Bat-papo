-- BATPAPO: esquema inicial seguro para Supabase/PostgreSQL.
-- Execute no SQL Editor de um projeto NOVO. Revise antes de usar em produção.
-- Senhas NÃO ficam em public.profiles: Supabase Auth administra credenciais.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 48),
  bat_id text not null unique,
  bio text not null default '' check (char_length(bio) <= 300),
  pronouns text not null default '' check (char_length(pronouns) <= 40),
  avatar_path text,
  banner_path text,
  banner_color text not null default '#5A189A',
  name_color text not null default '#ECECEF',
  profile_frame text not null default 'none',
  custom_status text not null default '' check (char_length(custom_status) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);
create unique index if not exists friend_requests_one_pending_pair
  on public.friend_requests (sender_id, receiver_id) where status = 'pending';

create table if not exists public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group')),
  title text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  content text not null default '' check (char_length(content) <= 10000),
  message_type text not null default 'text' check (message_type in ('text','image','file','sticker','system')),
  attachment_path text,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(content) > 0 or attachment_path is not null or message_type = 'system')
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('friend_request','friend_accept','message','group_invite','system')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','midnight','vampire','lilac','neon','amoled')),
  notifications_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

-- Perfil criado automaticamente após cadastro via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'bat'), '[^a-z0-9_]', '', 'g'));
  base_username := left(base_username, 18);
  if char_length(base_username) < 3 then base_username := 'bat' || left(replace(new.id::text, '-', ''), 6); end if;
  insert into public.profiles (id, username, display_name, bat_id)
  values (
    new.id,
    base_username || '_' || left(replace(new.id::text, '-', ''), 5),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', base_username), 48),
    'BAT-' || upper(left(replace(new.id::text, '-', ''), 4)) || '-' || upper(left(substr(replace(new.id::text, '-', ''), 5), 3))
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper SECURITY DEFINER evita recursão de RLS ao verificar participação.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = p_user_id
  );
$$;
revoke all on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

create or replace function public.is_conversation_creator(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.created_by = p_user_id
  );
$$;
revoke all on function public.is_conversation_creator(uuid, uuid) from public;
grant execute on function public.is_conversation_creator(uuid, uuid) to authenticated;

-- RLS: negar por padrão e conceder apenas o necessário.
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.groups enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.user_settings enable row level security;
alter table public.blocked_users enable row level security;
alter table public.stickers enable row level security;
alter table public.achievements enable row level security;

create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- O cadastro de perfil é responsabilidade do trigger; clientes não podem criar perfis arbitrários.

create policy "participants read friend requests" on public.friend_requests for select to authenticated using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy "users send own friend requests" on public.friend_requests for insert to authenticated with check (sender_id = (select auth.uid()) and sender_id <> receiver_id and status = 'pending' and responded_at is null);
create policy "receiver responds to request" on public.friend_requests for update to authenticated using (receiver_id = (select auth.uid()) and status = 'pending') with check (receiver_id = (select auth.uid()) and status in ('accepted','declined'));

-- Protege campos imutáveis e impede transições inválidas de solicitações.
create or replace function public.guard_friend_request_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Os participantes e a data da solicitação não podem ser alterados.';
  end if;
  if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
    raise exception 'Transição de solicitação inválida.';
  end if;
  new.responded_at := coalesce(new.responded_at, now());
  return new;
end;
$$;
create trigger guard_friend_request_update_before_update
before update on public.friend_requests
for each row execute function public.guard_friend_request_update();

create policy "friends can see own friendship rows" on public.friendships for select to authenticated using (user_low = (select auth.uid()) or user_high = (select auth.uid()));
-- Inserção/remoção de amizades deve ser feita por RPC validada, não por INSERT direto do cliente.

create policy "members read conversations" on public.conversations for select to authenticated using (public.is_conversation_member(id, (select auth.uid())));
create policy "authenticated users create conversations" on public.conversations for insert to authenticated with check (created_by = (select auth.uid()));
create policy "creators update conversations" on public.conversations for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

create policy "members list own memberships" on public.conversation_members for select to authenticated using (user_id = (select auth.uid()) or public.is_conversation_member(conversation_members.conversation_id, (select auth.uid())));
create policy "creator adds self as first member" on public.conversation_members for insert to authenticated with check (user_id = (select auth.uid()) and public.is_conversation_creator(conversation_id, (select auth.uid())));
-- Convites e entrada de terceiros devem ser implementados por RPC com validação de owner/admin.

create or replace function public.is_group_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group');
$$;
revoke all on function public.is_group_conversation(uuid) from public;
grant execute on function public.is_group_conversation(uuid) to authenticated;

create policy "group members read groups" on public.groups for select to authenticated using (public.is_conversation_member(groups.conversation_id, (select auth.uid())));
create policy "conversation owner creates group metadata" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()) and public.is_conversation_creator(conversation_id, (select auth.uid())) and public.is_group_conversation(conversation_id));
create policy "group owner updates group metadata" on public.groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "conversation members read messages" on public.messages for select to authenticated using (public.is_conversation_member(messages.conversation_id, (select auth.uid())));
create policy "members send messages as themselves" on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and public.is_conversation_member(messages.conversation_id, (select auth.uid())));
create policy "authors edit own messages" on public.messages for update to authenticated using (sender_id = (select auth.uid()) and public.is_conversation_member(messages.conversation_id, (select auth.uid()))) with check (sender_id = (select auth.uid()) and public.is_conversation_member(messages.conversation_id, (select auth.uid())));

-- Impede mover uma mensagem para outra conversa ou falsificar autoria/data.
create or replace function public.guard_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Não é permitido alterar a conversa, autoria ou data original da mensagem.';
  end if;
  return new;
end;
$$;
create trigger guard_message_update_before_update
before update on public.messages
for each row execute function public.guard_message_update();
create policy "authors delete own messages" on public.messages for delete to authenticated using (sender_id = (select auth.uid()));

create policy "members read reactions" on public.message_reactions for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id, (select auth.uid()))));
create policy "users manage own reactions" on public.message_reactions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id, (select auth.uid()))));
create policy "users remove own reactions" on public.message_reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy "users read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "users mark own notifications read" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Notificações devem ser criadas por triggers/RPC confiáveis, não pelo cliente diretamente.

create policy "users manage own settings" on public.user_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users manage blocks they created" on public.blocked_users for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
create policy "users manage own stickers" on public.stickers for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users read own achievements" on public.achievements for select to authenticated using (user_id = (select auth.uid()));
-- Conquistas devem ser concedidas por lógica confiável; sem INSERT/UPDATE/DELETE pelo cliente.

-- Buckets: avatares públicos; anexos de conversa privados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 15728640, array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain'])
on conflict (id) do nothing;

create policy "public can view avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "users upload avatar into own folder" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update avatar in own folder" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete avatar in own folder" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "conversation members read attachments" on storage.objects for select to authenticated using (
  bucket_id = 'chat-attachments' and public.is_conversation_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);
create policy "conversation members upload attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-attachments' and public.is_conversation_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);
