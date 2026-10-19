/** Utility helpers for BATPAPO */

export function uid(prefix = '') {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase() +
            Math.random().toString(36).slice(2, 4).toUpperCase();
  return prefix ? `${prefix}-${s}` : s;
}

export function generateBatId() {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  const b = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `BAT-${a}-${b}`;
}

export function hashPassword(pw) {
  // Demo only — replace with real hashing (bcrypt/argon2) on backend
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return `demo_${Math.abs(h).toString(16)}`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'Ontem';
  if (days < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTimeShort(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function parseMentions(text) {
  return escapeHtml(text).replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const EMOJIS = {
  smileys: ['😀','😂','🤣','😊','😍','🥰','😎','🤩','😭','😤','🤯','😱','🥺','😴','🤒','🤠','😈','👻','🦇','💜'],
  people: ['👋','👍','👎','👏','🙌','🤝','💪','✌️','🤞','🫶','🫡','🤓','🧐'],
  animals: ['🦇','🐱','🐶','🦊','🐺','🦁','🐸','🦋','🐝','🦄'],
  food: ['🍕','🍔','🍟','🌮','🍩','☕','🧃','🍦','🍪','🥑'],
  activities: ['🎮','🎯','⚽','🏀','🎵','🎸','🎤','🎬','🏆','🎲'],
  objects: ['💻','📱','⌨️','🖥️','📷','💡','🔮','💎','🔥','✨'],
  symbols: ['❤️','💜','💙','💚','💛','🧡','🖤','💯','✅','❌','⭐','🌙','⚡']
};

export const STICKERS = [
  { id: 'bat-happy', emoji: '🦇', label: 'Bati Feliz' },
  { id: 'bat-love', emoji: '💜', label: 'Amor' },
  { id: 'bat-fire', emoji: '🔥', label: 'Fogo' },
  { id: 'bat-cool', emoji: '😎', label: 'Cool' },
  { id: 'bat-cry', emoji: '😭', label: 'Choro' },
  { id: 'bat-party', emoji: '🎉', label: 'Festa' },
  { id: 'bat-sleep', emoji: '😴', label: 'Sono' },
  { id: 'bat-wave', emoji: '👋', label: 'Oi' },
];

export const FRAMES = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'neon', name: 'Neon Roxo' },
  { id: 'plasma', name: 'Plasma' },
  { id: 'cyber', name: 'Cyber' },
  { id: 'eclipse', name: 'Eclipse' },
  { id: 'cristal', name: 'Cristal' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'fogo', name: 'Fogo Roxo' },
  { id: 'estelar', name: 'Estelar' },
  { id: 'wings', name: 'Bat Wings' },
];

export const NAME_COLORS = [
  '#E0AAFF', '#C77DFF', '#9B5DE5', '#F72585', '#4CC9F0',
  '#3DDB8A', '#F5C542', '#FF6B6B', '#FFFFFF', '#FF9F1C'
];

export const ACHIEVEMENTS = [
  { id: 'first_flight', icon: '🦇', name: 'Primeiro voo', desc: 'Você criou sua conta.', check: (u) => true },
  { id: 'first_friend', icon: '💜', name: 'Primeira amizade', desc: 'Você adicionou seu primeiro amigo.', check: (u, s) => (s.friends[u.id] || []).length > 0 },
  { id: 'parrot', icon: '💬', name: 'Papagaio', desc: 'Enviou 100 mensagens.', check: (u, s) => Object.values(s.messages).flat().filter(m => m.senderId === u.id).length >= 100 },
  { id: 'archivist', icon: '📁', name: 'Arquivista', desc: 'Enviou 10 arquivos.', check: () => false },
  { id: 'nocturnal', icon: '🔥', name: 'Noturno', desc: 'Passou tempo conversando à noite.', check: () => false },
  { id: 'founder', icon: '👑', name: 'Fundador', desc: 'Membro fundador do BATPAPO.', check: (u) => u.badges?.includes('founder') },
];
