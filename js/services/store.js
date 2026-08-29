/**
 * In-memory reactive store with persistence.
 * Future: replace mutations with API calls + websocket updates.
 */
import { loadStore, saveStore, savePartial, storage } from './storage.js';
import { createDemoData, DEMO_USER_IDS } from '../data/demo.js';
import { generateBatId, hashPassword, uid } from '../utils/helpers.js';

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

export function initStore() {
  state = loadStore();
  const savedVersion = storage.get('seedVersion', 0);
  const noUsers = !state.users || Object.keys(state.users).length === 0;

  if (noUsers || (savedVersion !== SEED_VERSION && isUntouchedDemoInstall(state))) {
    state = createDemoData();
    saveStore(state);
    storage.set('seedVersion', SEED_VERSION);
  } else if (savedVersion !== SEED_VERSION) {
    // Real data present — don't touch it, just mark as up to date.
    storage.set('seedVersion', SEED_VERSION);
  }
  return state;
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
  if (keys) {
    keys.forEach(k => savePartial(k, state[k]));
  } else {
    saveStore(state);
  }
  notify();
}

// ─── Auth ───────────────────────────────────────────

export function register({ username, displayName, email, password }) {
  const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (Object.values(state.users).some(u => u.username === uname)) {
    throw new Error('Nome de usuário já existe');
  }
  if (Object.values(state.users).some(u => u.email === email.toLowerCase())) {
    throw new Error('Email já cadastrado');
  }

  let batId;
  do { batId = generateBatId(); } while (Object.values(state.users).some(u => u.batId === batId));

  const id = uid('user');
  const user = {
    id,
    username: uname,
    displayName: displayName || uname,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    batId,
    avatar: null,
    banner: null,
    bannerColor: '#5A189A',
    frame: 'none',
    nameColor: '#E0AAFF',
    bio: '',
    pronouns: '',
    status: 'online',
    customStatus: '',
    badges: ['first_flight'],
    createdAt: Date.now(),
    theme: 'dark',
  };

  state.users[id] = user;
  state.friends[id] = [];
  state.currentUserId = id;
  state.settings[id] = { theme: 'dark', notifications: true, sound: true };
  state.achievements[id] = ['first_flight'];
  persist();
  return user;
}

export function login(identifier, password) {
  const hash = hashPassword(password);
  const user = Object.values(state.users).find(u =>
    (u.email === identifier.toLowerCase() || u.username === identifier.toLowerCase()) &&
    u.passwordHash === hash
  );
  if (!user) throw new Error('Credenciais inválidas');
  state.currentUserId = user.id;
  user.status = 'online';
  persist(['currentUserId', 'users']);
  return user;
}

export function logout() {
  if (state.currentUserId && state.users[state.currentUserId]) {
    state.users[state.currentUserId].status = 'offline';
  }
  state.currentUserId = null;
  persist(['currentUserId', 'users']);
}

export function getCurrentUser() {
  return state.currentUserId ? state.users[state.currentUserId] : null;
}

// ─── Profile ────────────────────────────────────────

export function updateProfile(updates) {
  const user = getCurrentUser();
  if (!user) return;
  Object.assign(user, updates);
  persist(['users']);
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

export function createGroup({ name, description, members = [] }) {
  const me = getCurrentUser();
  const id = uid('group');
  const group = {
    id,
    name,
    description: description || '',
    icon: null,
    banner: null,
    bannerColor: '#5A189A',
    color: '#9B5DE5',
    ownerId: me.id,
    members: [me.id, ...members.filter(m => m !== me.id)],
    channels: [
      { id: uid('ch'), name: 'geral', type: 'text' },
      { id: uid('ch'), name: 'memes', type: 'text' },
    ],
    createdAt: Date.now(),
  };
  state.groups[id] = group;

  // Create a conversation for each text channel
  group.channels.filter(ch => ch.type === 'text').forEach((ch, i) => {
    const convId = `conv_${id}_${ch.id}`;
    state.conversations[convId] = {
      id: convId,
      type: 'group',
      groupId: id,
      channelId: ch.id,
      participants: group.members,
      lastMessageAt: Date.now(),
      lastMessage: '',
      unread: {},
    };
    state.messages[convId] = [];
  });

  persist(['groups', 'conversations', 'messages']);
  return group;
}

export function updateGroup(groupId, updates) {
  const g = state.groups[groupId];
  if (!g) return null;
  const me = getCurrentUser();
  if (!me || !g.members.includes(me.id)) return null;
  if (updates.name !== undefined) g.name = String(updates.name).trim() || g.name;
  if (updates.icon !== undefined) g.icon = updates.icon;
  if (updates.description !== undefined) g.description = updates.description;
  if (updates.color !== undefined) g.color = updates.color;
  persist(['groups']);
  return g;
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
