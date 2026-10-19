/**
 * Demo seed data — clearly separated from real user data.
 * Used only when store is empty on first run.
 */
import { generateBatId, hashPassword } from '../utils/helpers.js';

const NOW = Date.now();

export const DEMO_USER_IDS = ['user_mariana', 'user_marcos', 'user_lucas', 'user_ana', 'user_rafa'];

export function createDemoData() {
  const users = {
    'user_mariana': {
      id: 'user_mariana',
      username: 'mariana',
      displayName: 'Mariana',
      email: 'mariana@batpapo.app',
      passwordHash: hashPassword('demo1234'),
      batId: 'BAT-7F29-XQ4',
      avatar: null,
      banner: null,
      bannerColor: '#5A189A',
      frame: 'neon',
      nameColor: '#E0AAFF',
      bio: 'Criadora de tocas e caçadora de memes 🦇💜',
      pronouns: 'ela/dela',
      status: 'online',
      customStatus: '🦇 Na toca',
      badges: ['founder', 'beta'],
      createdAt: NOW - 30 * 86400000,
      theme: 'dark',
    },
    'user_marcos': {
      id: 'user_marcos',
      username: 'marcos',
      displayName: 'Marcos',
      email: 'marcos@batpapo.app',
      passwordHash: hashPassword('demo1234'),
      batId: 'BAT-A3K8-MP2',
      avatar: null,
      banner: null,
      bannerColor: '#7B2CBF',
      frame: 'cyber',
      nameColor: '#4CC9F0',
      bio: 'Gamer e programador noturno',
      pronouns: 'ele/dele',
      status: 'online',
      customStatus: '🎮 Jogando',
      badges: ['beta'],
      createdAt: NOW - 25 * 86400000,
      theme: 'dark',
    },
    'user_lucas': {
      id: 'user_lucas',
      username: 'lucas',
      displayName: 'Lucas',
      email: 'lucas@batpapo.app',
      passwordHash: hashPassword('demo1234'),
      batId: 'BAT-9X2L-R7Q',
      avatar: null,
      banner: null,
      bannerColor: '#1A1A2E',
      frame: 'eclipse',
      nameColor: '#C77DFF',
      bio: 'Música, código e café ☕',
      pronouns: 'ele/dele',
      status: 'away',
      customStatus: '🎵 Ouvindo música',
      badges: [],
      createdAt: NOW - 20 * 86400000,
      theme: 'dark',
    },
    'user_ana': {
      id: 'user_ana',
      username: 'ana',
      displayName: 'Ana',
      email: 'ana@batpapo.app',
      passwordHash: hashPassword('demo1234'),
      batId: 'BAT-C4P1-W8N',
      avatar: null,
      banner: null,
      bannerColor: '#F72585',
      frame: 'plasma',
      nameColor: '#F72585',
      bio: 'Design + dark mode forever',
      pronouns: 'ela/dela',
      status: 'online',
      customStatus: '💻 Designando',
      badges: ['beta'],
      createdAt: NOW - 18 * 86400000,
      theme: 'dark',
    },
    'user_rafa': {
      id: 'user_rafa',
      username: 'rafa',
      displayName: 'Rafa',
      email: 'rafa@batpapo.app',
      passwordHash: hashPassword('demo1234'),
      batId: 'BAT-H6J3-T5V',
      avatar: null,
      banner: null,
      bannerColor: '#0D1B2A',
      frame: 'none',
      nameColor: '#FFFFFF',
      bio: '',
      pronouns: '',
      status: 'offline',
      customStatus: '',
      badges: [],
      createdAt: NOW - 10 * 86400000,
      theme: 'dark',
    },
  };

  // Only the demo users are pre-seeded. No default friendships, conversations,
  // messages, groups or notifications — the chat starts empty and real usage
  // (adding friends by BAT-ID, creating groups, sending messages) drives it all.
  const friends = {
    user_mariana: [],
    user_marcos: [],
    user_lucas: [],
    user_ana: [],
    user_rafa: [],
  };

  const friendRequests = [];
  const conversations = {};
  const messages = {};
  const groups = {};
  const notifications = [];

  return {
    users,
    friends,
    friendRequests,
    conversations,
    messages,
    groups,
    notifications,
    currentUserId: null,
    settings: {},
    drafts: {},
    achievements: {},
    blocked: {},
    userStickers: {},
  };
}
