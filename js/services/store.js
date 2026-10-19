/**
 * In-memory reactive store with persistence.
 * Future: replace mutations with API calls + websocket updates.
 */
import { savePartial } from './storage.js';
import { uid } from '../utils/helpers.js';
import { supabase, profileToUser, uploadProfileImage, uploadGroupImage, resolvePublicImage } from './supabase.js';

let state = null;
const listeners = new Set();

/**
 * Bump this whenever the shape/content of the demo seed changes in a way
 * that should refresh existing demo installs (e.g. removing pre-filled
 * messages/groups). Real installs — where the user has registered their
 * own account or added data beyond the untouched demo seed — are never
 * touched by this.
 */
const SEED_VERSION = 2;

function isUntouchedDemoInstall(s) {
  const userIds = Object.keys(s.users || {});
  if (userIds.length === 0) return true; // empty store, safe to seed
  // Only the original demo users, nothing else — never a real account
  return userIds.every(id => DEMO_USER_IDS.includes(id))
    && userIds.length === DEMO_USER_IDS.length;
}

export async function initStore() {
  // O estado de autenticação vem do Supabase. Não criar contas/dados fictícios
  // nem copiar credenciais para localStorage.
  state = {
    users: {}, currentUserId: null, friends: {}, friendRequests: [],
    conversations: {}, messages: {}, groups: {}, notifications: [],
    settings: {}, drafts: {}, achievements: {}, blocked: {}, userStickers: {}
  };
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.user) {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) throw new Error(`Não foi possível carregar seu perfil: ${error.message}`);
    const user = profileToUser(profile, session.user.email || '');
    state.users[user.id] = user;
    state.currentUserId = user.id;
    const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (settings) {
      user.theme = settings.theme || 'dark';
      state.settings[user.id] = { theme: user.theme, notifications: settings.notifications_enabled, sound: settings.sound_enabled };
    }
    // Carrega os grupos dos quais a conta realmente participa no Supabase.
    await loadRemoteGroups(user.id);
  }
  supabase.auth.onAuthStateChange((_event, sessionNow) => {
    // Atualização de sessão é tratada no próximo carregamento de página; não tocar no estado
    // durante callbacks internos do SDK para evitar deadlocks de auth.
    if (!sessionNow) {
      state.currentUserId = null;
      notify();
    }
  });
  return state;
}

async function loadRemoteGroups(userId) {
  const { data: ownMemberships, error: membershipError } = await supabase
    .from('conversation_members').select('conversation_id, role').eq('user_id', userId);
  if (membershipError) throw new Error(`Não foi possível carregar seus grupos: ${membershipError.message}`);
  const conversationIds = [...new Set((ownMemberships || []).map(m => m.conversation_id))];
  if (!conversationIds.length) return;
  const { data: remoteGroups, error: groupsError } = await supabase
    .from('groups').select('id, conversation_id, name, description, owner_id, icon_path, created_at')
    .in('conversation_id', conversationIds);
  if (groupsError) throw new Error(`Não foi possível carregar os grupos: ${groupsError.message}`);
  const groups = remoteGroups || [];
  if (!groups.length) return;
  const ids = groups.map(g => g.conversation_id);
  const { data: memberships, error: allMembersError } = await supabase
    .from('conversation_members').select('conversation_id, user_id, role').in('conversation_id', ids);
  if (allMembersError) throw new Error(`Não foi possível carregar os membros dos grupos: ${allMembersError.message}`);
  const memberIds = [...new Set((memberships || []).map(m => m.user_id))];
  if (memberIds.length) {
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', memberIds);
    if (profilesError) throw new Error(`Não foi possível carregar os perfis dos membros: ${profilesError.message}`);
    for (const profile of profiles || []) {
      if (!state.users[profile.id]) state.users[profile.id] = profileToUser(profile);
    }
  }
  const { data: remoteMessages, error: messagesError } = await supabase.from('messages')
    .select('id, conversation_id, sender_id, content, message_type, created_at, edited_at, reply_to_id')
    .in('conversation_id', ids).is('deleted_at', null).order('created_at', { ascending: true });
  if (messagesError) throw new Error(`Não foi possível carregar mensagens dos grupos: ${messagesError.message}`);
  for (const g of groups) {
    const participants = (memberships || []).filter(m => m.conversation_id === g.conversation_id).map(m => m.user_id);
    const channel = { id: g.conversation_id, name: 'geral', type: 'text' };
    state.groups[g.id] = {
      id: g.id, conversationId: g.conversation_id, name: g.name, description: g.description || '',
      icon: resolvePublicImage(g.icon_path), iconPath: g.icon_path || null, banner: null, bannerColor: '#5A189A', color: '#9B5DE5', ownerId: g.owner_id,
      members: participants, channels: [channel], createdAt: new Date(g.created_at).getTime()
    };
    state.conversations[g.conversation_id] = {
      id: g.conversation_id, type: 'group', groupId: g.id, channelId: g.conversation_id,
      participants, lastMessageAt: 0, lastMessage: '', unread: {}
    };
    state.messages[g.conversation_id] = (remoteMessages || []).filter(m => m.conversation_id === g.conversation_id).map(m => ({
      id: m.id, senderId: m.sender_id, content: m.content, type: m.message_type === 'image' ? 'image' : m.message_type === 'file' ? 'file' : m.message_type === 'sticker' ? 'sticker' : 'text',
      createdAt: new Date(m.created_at).getTime(), edited: !!m.edited_at, replyTo: m.reply_to_id || null, reactions: {}
    }));
    const last = state.messages[g.conversation_id].at(-1);
    if (last) { state.conversations[g.conversation_id].lastMessageAt = last.createdAt; state.conversations[g.conversation_id].lastMessage = last.content.slice(0, 80); }
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn(state));
}

function persist(keys) {
  // Não persistir dados sociais no navegador como se fossem compartilhados/seguros.
  // Os serviços remotos de cada funcionalidade são adicionados em etapas; por enquanto
  // apenas o estado em memória é atualizado.
  notify();
}

// ─── Auth ───────────────────────────────────────────

export async function register({ username, displayName, email, password }) {
  const uname = String(username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!/^[a-z0-9_]{3,24}$/.test(uname)) throw new Error('O nome de usuário deve ter de 3 a 24 caracteres (letras, números ou _).');
  if (!displayName || String(displayName).trim().length > 48) throw new Error('Informe um nome de exibição com até 48 caracteres.');
  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { data: { username: uname, display_name: String(displayName).trim() } }
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('O Supabase não retornou o usuário criado.');
  if (!data.session) {
    return { id: data.user.id, email: data.user.email, pendingEmailConfirmation: true, batId: null };
  }
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  if (profileError) throw new Error(`Conta criada, mas não foi possível carregar o perfil: ${profileError.message}`);
  const user = profileToUser(profile, data.user.email || '');
  state.users[user.id] = user;
  state.currentUserId = user.id;
  state.friends[user.id] = [];
  state.settings[user.id] = { theme: 'dark', notifications: true, sound: true };
  notify();
  return user;
}

export async function login(identifier, password) {
  const loginValue = String(identifier || '').trim();
  if (loginValue.includes('@') === false) {
    throw new Error('Entre com seu e-mail. O acesso por nome de usuário será habilitado após adicionarmos uma função segura de consulta ao banco.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginValue.toLowerCase(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  if (profileError) throw new Error(`Login realizado, mas falhou ao carregar o perfil: ${profileError.message}`);
  const user = profileToUser(profile, data.user.email || '');
  state.users[user.id] = user;
  state.currentUserId = user.id;
  const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  if (settings) {
    user.theme = settings.theme || 'dark';
    state.settings[user.id] = { theme: user.theme, notifications: settings.notifications_enabled, sound: settings.sound_enabled };
  }
  notify();
  return user;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  state.currentUserId = null;
  state.users = {};
  notify();
}

export function getCurrentUser() {
  return state.currentUserId ? state.users[state.currentUserId] : null;
}

// ─── Profile ────────────────────────────────────────

export async function updateProfile(updates) {
  const user = getCurrentUser();
  if (!user) throw new Error('Você precisa estar conectado para salvar o perfil.');

  const columnMap = { displayName: 'display_name', bio: 'bio', pronouns: 'pronouns', bannerColor: 'banner_color', nameColor: 'name_color', frame: 'profile_frame', customStatus: 'custom_status', avatar: 'avatar_path', banner: 'banner_path' };
  const payload = {};
  const nextUser = { ...updates };

  // Primeiro envie imagens ao Storage; só salve os caminhos no perfil após upload bem-sucedido.
  for (const key of ['avatar', 'banner']) {
    if (typeof updates[key] === 'string' && updates[key].startsWith('data:')) {
      const path = await uploadProfileImage(updates[key], user.id, key);
      payload[columnMap[key]] = path;
      nextUser[key] = resolvePublicImage(path);
    } else if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = updates[key];
      // Converter URL pública antiga de volta para caminho relativo quando possível.
      if (typeof value === 'string' && value.includes('/storage/v1/object/public/avatars/')) {
        payload[columnMap[key]] = value.split('/storage/v1/object/public/avatars/')[1].split('?')[0];
      } else {
        payload[columnMap[key]] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(updates || {})) {
    if (columnMap[key] && key !== 'avatar' && key !== 'banner') payload[columnMap[key]] = value;
  }

  const { data, error } = await supabase.from('profiles').update(payload).eq('id', user.id).select('*').single();
  if (error) throw new Error(`Não foi possível salvar o perfil: ${error.message}`);
  const savedUser = profileToUser(data, user.email || '');
  Object.assign(user, savedUser, nextUser);
  // Preferir URLs públicas resolvidas a data URLs temporárias.
  if (payload.avatar_path) user.avatar = resolvePublicImage(payload.avatar_path);
  if (payload.banner_path) user.banner = resolvePublicImage(payload.banner_path);
  notify();
  return user;
}

// ─── Friends ────────────────────────────────────────

export function sendFriendRequest(batId) {
  const me = getCurrentUser();
  const target = Object.values(state.users).find(u => u.batId === batId.toUpperCase());
  if (!target) throw new Error('BAT-ID não encontrado');
  if (target.id === me.id) throw new Error('Você não pode adicionar a si mesmo');
  if ((state.friends[me.id] || []).includes(target.id)) throw new Error('Já são amigos');
  if (state.friendRequests.some(r => r.fromId === me.id && r.toId === target.id && r.status === 'pending')) {
    throw new Error('Solicitação já enviada');
  }

  const req = {
    id: uid('req'),
    fromId: me.id,
    toId: target.id,
    status: 'pending',
    createdAt: Date.now(),
  };
  state.friendRequests.push(req);

  state.notifications.unshift({
    id: uid('notif'),
    type: 'friend_request',
    fromId: me.id,
    text: `${me.displayName} enviou uma solicitação de amizade.`,
    read: false,
    createdAt: Date.now(),
    targetUserId: target.id,
  });

  persist(['friendRequests', 'notifications']);
  return req;
}

export function acceptFriendRequest(reqId) {
  const req = state.friendRequests.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;
  req.status = 'accepted';

  if (!state.friends[req.fromId]) state.friends[req.fromId] = [];
  if (!state.friends[req.toId]) state.friends[req.toId] = [];
  state.friends[req.fromId].push(req.toId);
  state.friends[req.toId].push(req.fromId);

  // Auto-create DM conversation
  const convId = getOrCreateDm(req.fromId, req.toId);

  state.notifications.unshift({
    id: uid('notif'),
    type: 'friend_accept',
    fromId: req.toId,
    text: `${state.users[req.toId]?.displayName} aceitou sua solicitação!`,
    read: false,
    createdAt: Date.now(),
    targetUserId: req.fromId,
  });

  persist(['friendRequests', 'friends', 'conversations', 'notifications']);
  return convId;
}

export function declineFriendRequest(reqId) {
  const req = state.friendRequests.find(r => r.id === reqId);
  if (req) req.status = 'declined';
  persist(['friendRequests']);
}

export function removeFriend(friendId) {
  const me = getCurrentUser();
  state.friends[me.id] = (state.friends[me.id] || []).filter(id => id !== friendId);
  state.friends[friendId] = (state.friends[friendId] || []).filter(id => id !== me.id);
  persist(['friends']);
}

export function getFriends(userId) {
  return (state.friends[userId] || []).map(id => state.users[id]).filter(Boolean);
}

export function getPendingRequests(userId) {
  return state.friendRequests.filter(r => r.toId === userId && r.status === 'pending');
}

// ─── Conversations & Messages ───────────────────────

export function getOrCreateDm(userA, userB) {
  const existing = Object.values(state.conversations).find(c =>
    c.type === 'dm' &&
    c.participants.includes(userA) &&
    c.participants.includes(userB)
  );
  if (existing) return existing.id;

  const id = `conv_${[userA, userB].sort().join('_')}`;
  state.conversations[id] = {
    id,
    type: 'dm',
    participants: [userA, userB],
    lastMessageAt: Date.now(),
    lastMessage: '',
    unread: { [userA]: 0, [userB]: 0 },
  };
  state.messages[id] = [];
  persist(['conversations', 'messages']);
  return id;
}

export function sendMessage(conversationId, content, type = 'text', extra = {}) {
  const me = getCurrentUser();
  if (!me) return null;
  if (!canAccessConversation(conversationId)) return null;

  const msg = {
    id: uid('msg'),
    senderId: me.id,
    content,
    type,
    createdAt: Date.now(),
    reactions: {},
    replyTo: extra.replyTo || null,
    ...extra,
  };

  if (!state.messages[conversationId]) state.messages[conversationId] = [];
  state.messages[conversationId].push(msg);

  const conv = state.conversations[conversationId];
  if (conv) {
    conv.lastMessageAt = msg.createdAt;
     conv.lastMessage = type === 'text' ? content.slice(0, 80) :
       type === 'image' ? '📷 Imagem' :
       type === 'banner' ? '🖼️ Banner' :
       type === 'file' ? '📎 Arquivo' :
       type === 'audio' ? '🎤 Áudio' :
       type === 'sticker' ? (extra && extra.isImageDataUrl ? 'Sticker' : '🦇 Sticker') : content.slice(0, 80);

    conv.participants.forEach(pid => {
      if (pid !== me.id) {
        if (!conv.unread) conv.unread = {};
        conv.unread[pid] = (conv.unread[pid] || 0) + 1;
      }
    });
  }

  // Persistir mensagens de texto dos grupos no banco real; o restante dos anexos será enviado ao Storage em etapa própria.
  const remoteConv = state.conversations[conversationId];
  if (remoteConv?.type === 'group' && type === 'text') {
    supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: me.id,
      content: String(content).slice(0, 10000),
      message_type: 'text',
      reply_to_id: null
    }).select('id, created_at').single().then(({ data, error }) => {
      if (error) { console.error('[BATPAPO] Falha ao salvar mensagem do grupo:', error.message); return; }
      msg.id = data.id;
      msg.createdAt = new Date(data.created_at).getTime();
      remoteConv.lastMessageAt = msg.createdAt;
      notify();
    });
  }

  // Clear draft
  if (state.drafts[conversationId]) {
    delete state.drafts[conversationId];
  }

  persist(['messages', 'conversations', 'drafts']);
  return msg;
}

/** Only allow access if current user is a participant */
export function canAccessConversation(conversationId) {
  const me = getCurrentUser();
  if (!me || !conversationId) return false;
  const conv = state.conversations[conversationId];
  if (!conv) return false;
  return Array.isArray(conv.participants) && conv.participants.includes(me.id);
}

export function getUserConversations(userId) {
  return Object.values(state.conversations)
    .filter(c => Array.isArray(c.participants) && c.participants.includes(userId))
    .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
}

export function getMessages(conversationId) {
  if (!canAccessConversation(conversationId)) return [];
  return state.messages[conversationId] || [];
}

export function markRead(conversationId) {
  const me = getCurrentUser();
  if (!me || !canAccessConversation(conversationId)) return;
  const conv = state.conversations[conversationId];
  if (conv && conv.unread) {
    conv.unread[me.id] = 0;
    persist(['conversations']);
  }
}

export function addReaction(conversationId, messageId, emoji) {
  const me = getCurrentUser();
  if (!me || !canAccessConversation(conversationId)) return;
  const msgs = state.messages[conversationId];
  if (!msgs) return;
  const msg = msgs.find(m => m.id === messageId);
  if (!msg) return;
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  const idx = msg.reactions[emoji].indexOf(me.id);
  if (idx >= 0) {
    msg.reactions[emoji].splice(idx, 1);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(me.id);
  }
  persist(['messages']);
}

export function deleteMessage(conversationId, messageId) {
  const me = getCurrentUser();
  if (!me || !canAccessConversation(conversationId)) return;
  const msgs = state.messages[conversationId];
  if (!msgs) return;
  const idx = msgs.findIndex(m => m.id === messageId && m.senderId === me.id);
  if (idx >= 0) {
    msgs.splice(idx, 1);
    persist(['messages']);
  }
}

export function editMessage(conversationId, messageId, newContent) {
  const me = getCurrentUser();
  if (!me || !canAccessConversation(conversationId)) return null;
  const msgs = state.messages[conversationId];
  if (!msgs) return null;
  const msg = msgs.find(m => m.id === messageId && m.senderId === me.id);
  if (!msg) return null;
  msg.content = newContent;
  msg.edited = true;
  msg.editedAt = Date.now();
  persist(['messages']);
  return msg;
}

export function setDraft(conversationId, text) {
  state.drafts[conversationId] = text;
  savePartial('drafts', state.drafts);
}

export function getDraft(conversationId) {
  return state.drafts[conversationId] || '';
}

// ─── Groups ─────────────────────────────────────────

export async function createGroup({ name, description, members = [] }) {
  const me = getCurrentUser();
  if (!me) throw new Error('Entre na sua conta para criar um grupo.');
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 60) throw new Error('O nome do grupo deve ter entre 1 e 60 caracteres.');

  // A RPC cria conversa, associação do dono e metadados em uma única transação.
  // Isso evita a falha de RLS ao tentar criar a conversa antes de ser membro dela.
  const { data: created, error: createError } = await supabase.rpc('create_group', {
    p_description: String(description || '').trim().slice(0, 500),
    p_name: cleanName
  });
  if (createError) {
    throw new Error(`Não foi possível criar o grupo: ${createError.message}. Confirme se executou a migração 202610190004_group_creation_and_badge_fix.sql no Supabase.`);
  }
  const remoteGroup = Array.isArray(created) ? created[0] : created;
  if (!remoteGroup?.id || !remoteGroup?.conversation_id) {
    throw new Error('O Supabase não retornou os dados do grupo criado. Confira a função create_group no SQL Editor.');
  }
  const conv = { id: remoteGroup.conversation_id, kind: 'group', title: remoteGroup.name, created_by: me.id };
  const group = {
    id: remoteGroup.id, conversationId: conv.id, name: remoteGroup.name, description: remoteGroup.description || '',
    icon: null, banner: null, bannerColor: '#5A189A', color: '#9B5DE5', ownerId: me.id,
    members: [me.id], channels: [{ id: conv.id, name: 'geral', type: 'text' }], createdAt: Date.now()
  };
  state.groups[group.id] = group;
  state.conversations[conv.id] = {
    id: conv.id, type: 'group', groupId: group.id, channelId: conv.id,
    participants: [me.id], lastMessageAt: Date.now(), lastMessage: '', unread: { [me.id]: 0 }
  };
  state.messages[conv.id] = [];
  notify();
  return group;
}

export async function updateGroup(groupId, updates) {
  const g = state.groups[groupId];
  if (!g) return null;
  const me = getCurrentUser();
  if (!me || g.ownerId !== me.id) throw new Error('Somente o dono do grupo pode alterar estas informações.');
  const payload = {};
  if (updates.name !== undefined) payload.name = String(updates.name).trim().slice(0, 60) || g.name;
  if (updates.description !== undefined) payload.description = String(updates.description).trim().slice(0, 500);
  if (updates.icon !== undefined) {
    const iconPath = await uploadGroupImage(updates.icon, me.id, groupId);
    if (iconPath && !String(iconPath).startsWith('http') && !String(iconPath).startsWith('data:')) {
      payload.icon_path = iconPath;
    } else if (iconPath) {
      // Compatibilidade com URLs existentes, caso o bucket já tenha retornado URL.
      payload.icon_path = iconPath;
    }
  }
  if (Object.keys(payload).length) {
    const { data, error } = await supabase.from('groups').update(payload).eq('id', groupId).select('*').single();
    if (error) throw new Error(`Não foi possível atualizar o grupo: ${error.message}`);
    g.name = data.name; g.description = data.description || '';
    if (data.icon_path) { g.iconPath = data.icon_path; g.icon = resolvePublicImage(data.icon_path); }
    if (g.conversationId && updates.name !== undefined) {
      const { error: convError } = await supabase.from('conversations').update({ title: g.name }).eq('id', g.conversationId);
      if (convError) throw new Error(`O grupo foi atualizado, mas o título da conversa não: ${convError.message}`);
    }
  }
  if (updates.icon !== undefined && String(updates.icon || '').startsWith('http')) g.icon = updates.icon;
  if (updates.color !== undefined) g.color = updates.color;
  notify();
  return g;
}

export async function deleteGroup(groupId) {
  const group = state.groups[groupId];
  const me = getCurrentUser();
  if (!group || !me) throw new Error('Grupo indisponível.');
  if (group.ownerId !== me.id) throw new Error('Somente o dono do grupo pode excluí-lo.');
  const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
  if (error) throw new Error(`Não foi possível excluir o grupo: ${error.message}. Confira se executou a migração de gerenciamento de grupos no Supabase.`);
  const conversationId = group.conversationId;
  delete state.groups[groupId];
  if (conversationId) {
    delete state.conversations[conversationId];
    delete state.messages[conversationId];
  }
  notify();
  return true;
}

export async function addGroupMember(groupId, batId) {
  const group = state.groups[groupId];
  const me = getCurrentUser();
  if (!group || !me) throw new Error('Grupo indisponível.');
  if (group.ownerId !== me.id) throw new Error('Somente o dono do grupo pode adicionar membros por enquanto.');
  const { data, error } = await supabase.rpc('add_group_member', {
    p_group_id: groupId,
    p_user_bat_id: String(batId || '').trim().toUpperCase()
  });
  if (error) throw new Error(error.message || 'Não foi possível adicionar o membro.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.user_id) throw new Error('O Supabase não confirmou a entrada do membro.');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', row.user_id).single();
  if (profileError) throw new Error(`Membro adicionado, mas não foi possível carregar o perfil: ${profileError.message}`);
  state.users[profile.id] = profileToUser(profile);
  if (!group.members.includes(profile.id)) group.members.push(profile.id);
  const conv = state.conversations[group.conversationId];
  if (conv && !conv.participants.includes(profile.id)) conv.participants.push(profile.id);
  notify();
  return state.users[profile.id];
}

export function getGroup(groupId) {
  return state.groups[groupId] || null;
}

export function getUserGroups(userId) {

  return Object.values(state.groups).filter(g => g.members.includes(userId));
}

export function getGroupConversations(groupId) {
  return Object.values(state.conversations)
    .filter(c => c.type === 'group' && c.groupId === groupId)
    .sort((a, b) => {
      const ga = (state.groups[groupId]?.channels || []).find(ch => ch.id === a.channelId);
      const gb = (state.groups[groupId]?.channels || []).find(ch => ch.id === b.channelId);
      return (ga?.name || '').localeCompare(gb?.name || '');
    });
}

export function getChannelName(groupId, channelId) {
  const ch = (state.groups[groupId]?.channels || []).find(c => c.id === channelId);
  return ch ? ch.name : 'canal';
}

// ─── Notifications ──────────────────────────────────

export function getNotifications(userId) {
  return state.notifications.filter(n => {
    if (n.targetUserId) return n.targetUserId === userId;
    // Message notifications tied to a conversation the user participates in
    if (n.conversationId) {
      const conv = state.conversations[n.conversationId];
      return conv && Array.isArray(conv.participants) && conv.participants.includes(userId);
    }
    // Friend requests without target should not leak
    return false;
  });
}

export function markNotificationRead(id) {
  const n = state.notifications.find(x => x.id === id);
  if (n) n.read = true;
  persist(['notifications']);
}

export function clearNotifications(userId) {
  state.notifications = state.notifications.filter(n =>
    n.targetUserId && n.targetUserId !== userId
  );
  persist(['notifications']);
}

// ─── Settings / Theme ───────────────────────────────

export function setTheme(theme) {
  const me = getCurrentUser();
  if (!me) return;
  me.theme = theme;
  if (!state.settings[me.id]) state.settings[me.id] = {};
  state.settings[me.id].theme = theme;
  applyTheme(theme);
  persist(['users', 'settings']);
  supabase.from('user_settings').upsert({ user_id: me.id, theme, notifications_enabled: state.settings[me.id]?.notifications ?? true, sound_enabled: state.settings[me.id]?.sound ?? true }).then(({ error }) => { if (error) console.error('[BATPAPO] Falha ao salvar tema:', error.message); });
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme || theme === 'dark') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function getUser(id) {
  return state.users[id] || null;
}

export function searchUsers(query) {
  const q = query.toLowerCase();
  return Object.values(state.users).filter(u =>
    u.username.includes(q) ||
    u.displayName.toLowerCase().includes(q) ||
    u.batId.toLowerCase().includes(q)
  );
}

// ─── Custom Stickers ───────────────────────────────

export function getUserStickers(userId) {
  const me = state.currentUserId ? state.users[state.currentUserId] : null;
  const uid = me ? me.id : null;
  // public sticker pack of the requested user (own by default)
  const pack = state.userStickers[userId] || [];
  return pack;
}

export function addSticker(sticker) {
  const me = getCurrentUser();
  if (!me) return null;
  const id = uid('stic');
  const record = {
    id,
    userId: me.id,
    image: sticker.image,     // data URL
    name: sticker.name || 'Sticker',
    createdAt: Date.now(),
  };
  if (!state.userStickers[me.id]) state.userStickers[me.id] = [];
  state.userStickers[me.id].unshift(record);
  persist(['userStickers']);
  return record;
}

export function deleteSticker(stickerId) {
  const me = getCurrentUser();
  if (!me || !state.userStickers[me.id]) return;
  state.userStickers[me.id] = state.userStickers[me.id].filter(s => s.id !== stickerId);
  persist(['userStickers']);
}

export function updateSticker(stickerId, updates) {
  const me = getCurrentUser();
  if (!me || !state.userStickers[me.id]) return null;
  const sticker = state.userStickers[me.id].find(s => s.id === stickerId);
  if (!sticker) return null;
  Object.assign(sticker, updates);
  persist(['userStickers']);
  return sticker;
}
