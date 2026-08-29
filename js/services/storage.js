/**
 * Storage layer — localStorage now, designed to swap for API later.
 * All data access goes through this service.
 */

const PREFIX = 'batpapo_';

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[storage] write failed', e);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },

  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }
};

export function loadStore() {
  return {
    users: storage.get('users', {}),
    currentUserId: storage.get('currentUserId', null),
    friends: storage.get('friends', {}),
    friendRequests: storage.get('friendRequests', []),
    conversations: storage.get('conversations', {}),
    messages: storage.get('messages', {}),
    groups: storage.get('groups', {}),
    notifications: storage.get('notifications', []),
    settings: storage.get('settings', {}),
    drafts: storage.get('drafts', {}),
    achievements: storage.get('achievements', {}),
    blocked: storage.get('blocked', {}),
    userStickers: storage.get('userStickers', {}),
  };
}

export function saveStore(store) {
  const keys = [
    'users', 'currentUserId', 'friends', 'friendRequests',
    'conversations', 'messages', 'groups', 'notifications',
    'settings', 'drafts', 'achievements', 'blocked', 'userStickers'
  ];
  keys.forEach(k => {
    if (store[k] !== undefined) storage.set(k, store[k]);
  });
}

export function savePartial(key, value) {
  storage.set(key, value);
}
