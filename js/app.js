/**
 * BATPAPO — Main Application SPA
 */
import { logoHtml, mascotHtml } from './utils/assets.js';
import { icon } from './utils/icons.js';
import { openCropper } from './utils/cropper.js';
import {
  formatTime, formatTimeShort, formatFileSize, greeting,
  escapeHtml, parseMentions, fileToDataUrl, EMOJIS, STICKERS, FRAMES, NAME_COLORS
} from './utils/helpers.js';
import * as store from './services/store.js';
import { supabase } from './services/supabase.js';

let route = 'landing';
let activeConvId = null;
let activeNav = 'home';
let replyTo = null;
let editingMsg = null;
let showEmojiPicker = false;
let showStickerPicker = false;
let showInfoPanel = false;
let showUserMenu = false;
let reactionPickerMsgId = null;
let settingsTab = 'account';
let recording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStart = 0;
let convSearchQuery = '';
/** Draft for profile lab — only persisted on Save */
let profileDraft = null;

function isAnimatedImage(file) {
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  if (t === 'image/gif' || t === 'image/webp') return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.gif') || name.endsWith('.webp');
}

function getProfileDraft() {
  const user = store.getCurrentUser();
  if (!user) return null;
  if (!profileDraft || profileDraft._userId !== user.id) {
    profileDraft = {
      _userId: user.id,
      displayName: user.displayName || '',
      bio: user.bio || '',
      customStatus: user.customStatus || '',
      frame: user.frame || 'none',
      nameColor: user.nameColor || '#E0AAFF',
      bannerColor: user.bannerColor || '#5A189A',
      avatar: user.avatar || null,
      banner: user.banner || null,
    };
  }
  return profileDraft;
}

/** True when the profile lab draft has unsaved edits relative to the saved user */
function isProfileDraftDirty() {
  if (route !== 'profile' && route !== 'profile-lab') return false;
  const user = store.getCurrentUser();
  const d = profileDraft;
  if (!user || !d || d._userId !== user.id) return false;
  return (
    d.displayName !== (user.displayName || '') ||
    d.bio !== (user.bio || '') ||
    d.customStatus !== (user.customStatus || '') ||
    d.frame !== (user.frame || 'none') ||
    d.nameColor !== (user.nameColor || '#E0AAFF') ||
    d.bannerColor !== (user.bannerColor || '#5A189A') ||
    d.banner !== (user.banner || null) ||
    d.avatar !== (user.avatar || null)
  );
}

/** Ask for confirmation before leaving the profile lab with unsaved changes. Returns true if navigation may proceed. */
function confirmLeaveIfDirty() {
  if (!isProfileDraftDirty()) return true;
  const ok = confirm('Você tem alterações não salvas no perfil. Sair mesmo assim e perder as alterações?');
  if (ok) profileDraft = null; // discard on confirmed exit
  return ok;
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('hiding'); setTimeout(() => el.remove(), 250); }, 3200);
}

function openModal(title, bodyHtml, footerHtml = '') {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header"><h3 class="modal-title">${title}</h3>
    <button class="btn-icon" id="modal-close" aria-label="Fechar">${icon('x',16)}</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  </div></div>`;
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') closeModal(); };
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// O selo é consultado na tabela protegida original_developers do Supabase.
// Ele aparece somente no cartão de perfil, nunca ao lado do nome nas mensagens.
async function openUserProfile(userId) {
  const person = store.getUser(userId);
  if (!person) { toast('Perfil ainda não carregado.', 'warning'); return; }
  // Fallback visual para a conta oficial confirmada; o selo não concede permissões.
  // Assim ele continua aparecendo mesmo se a tabela ainda não estiver visível via API.
  const isOfficialDeveloperAccount = person.id === '3dadac15-9a3d-45bb-844b-bc74ce8c13cb';
  let isOriginalDeveloper = isOfficialDeveloperAccount;
  try {
    const { data, error } = await supabase.from('original_developers')
      .select('user_id').eq('user_id', person.id).maybeSingle();
    if (error) throw error;
    isOriginalDeveloper = isOfficialDeveloperAccount || Boolean(data);
  } catch (error) {
    console.warn('Não foi possível verificar o selo de desenvolvedor:', error.message);
  }
  openModal('Perfil', `<div class="bat-user-profile">
    <div class="bat-user-banner" style="background:${person.banner ? 'transparent' : (person.bannerColor || '#5A189A')}">${person.banner ? `<img src="${escapeHtml(person.banner)}" alt="Banner do perfil"/>` : ''}</div>
    <div class="bat-user-profile-main">${renderAvatar(person, 'xl', false)}
      <div class="bat-user-profile-name">${escapeHtml(person.displayName || person.username || 'Usuário')}${isOriginalDeveloper ? '<span class="original-dev-badge" title="Desenvolvedor original do BATPAPO">&lt;/&gt;</span>' : ''}</div>
      <div class="bat-user-profile-handle">@${escapeHtml(person.username || '')}</div>
      <div class="bat-user-profile-id">${escapeHtml(person.batId || '')}</div>
      ${person.customStatus ? `<p class="bat-user-profile-status">${escapeHtml(person.customStatus)}</p>` : ''}
      ${person.bio ? `<p class="bat-user-profile-bio">${escapeHtml(person.bio)}</p>` : '<p class="bat-user-profile-bio muted">Este usuário ainda não adicionou uma descrição.</p>'}
    </div>
  </div>`, `<button class="btn btn-secondary" data-close-modal>Fechar</button>${person.id !== store.getCurrentUser()?.id ? `<button class="btn btn-primary" id="profile-send-message">Enviar mensagem</button>` : ''}`);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.getElementById('profile-send-message')?.addEventListener('click', () => {
    const me = store.getCurrentUser();
    if (!me) return;
    try {
      const convId = store.getOrCreateDm(me.id, person.id);
      activeConvId = convId; closeModal(); navigate('messages');
    } catch (error) { toast(error.message || 'Não foi possível abrir a conversa.', 'error'); }
  });
}

/** Fullscreen lightbox for viewing images, banners and files sent in chat */
function openLightbox({ src, fileName, isImage = true, isPdf = false }) {
  const root = document.getElementById('modal-root');
  const bodyHtml = isImage
    ? `<img class="lightbox-img" src="${src}" alt="${escapeHtml(fileName || 'Imagem')}" />`
    : isPdf
      ? `<iframe class="lightbox-pdf" src="${src}" title="${escapeHtml(fileName || 'Documento')}"></iframe>`
      : `<div class="lightbox-file"><span class="lightbox-file-icon">📄</span><div class="lightbox-file-name">${escapeHtml(fileName || 'arquivo')}</div><p class="lightbox-file-hint">Pré-visualização não disponível para este tipo de arquivo. Use o botão de download.</p></div>`;
  root.innerHTML = `<div class="lightbox-overlay" id="lightbox-overlay">
    <button class="lightbox-close" id="lightbox-close" aria-label="Fechar">${icon('x',16)}</button>
    ${fileName ? `<a class="lightbox-download" href="${src}" download="${escapeHtml(fileName)}" title="Baixar">⬇</a>` : ''}
    <div class="lightbox-body">${bodyHtml}</div>
  </div>`;
  const overlay = document.getElementById('lightbox-overlay');
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.getElementById('lightbox-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', onKey);
}

function renderCustomStickersGrid() {
  const user = store.getCurrentUser();
  if (!user) return '<div class="empty-state" style="padding:24px"><p style="color:var(--text-muted)">Nenhum sticker personalizado.</p></div>';
  const stickers = store.getUserStickers(user.id);
  if (!stickers.length) {
    return `<div class="empty-state" style="padding:20px;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:4px">🎨</div>
      <p style="color:var(--text-muted);font-size:0.85rem">Crie stickers personalizados na Sticker Studio!</p>
    </div>`;
  }
  return stickers.map(s =>
    `<button type="button" class="sticker-custom" data-sticker-id="${s.id}" title="${s.name}">
       <img src="${s.image}" alt="${s.name}" />
     </button>`
  ).join('');
}

function renderAvatar(user, size = 'md', showStatus = true) {
  if (!user) return `<div class="avatar avatar-${size}">?</div>`;
  const initial = (user.displayName || user.username || '?')[0].toUpperCase();
  const hasFrame = user.frame && user.frame !== 'none';
  const img = user.avatar
    ? `<img src="${user.avatar}" alt="${escapeHtml(user.displayName || '')}" />`
    : initial;
  const status = showStatus && user.status
    ? `<span class="avatar-status ${user.status}"></span>`
    : '';
  const inner = `<div class="avatar avatar-${size}">${img}${status}</div>`;
  if (!hasFrame) return inner;
  return `<div class="avatar-frame ${user.frame}">${inner}</div>`;
}

function navigate(path) {
  if (path !== route && !confirmLeaveIfDirty()) return;
  const pages = {
    landing: 'index.html',
    login: 'login.html',
    register: 'register.html',
    home: 'home.html',
    messages: 'messages.html',
    chat: 'messages.html',
    friends: 'friends.html',
    groups: 'groups.html',
    profile: 'profile.html',
    'profile-lab': 'profile.html',
    notifications: 'notifications.html',
    'sticker-studio': 'stickers.html',
    settings: 'settings.html',
  };
  const file = pages[path] || 'index.html';
  // Preserve the selected conversation when navigation loads another HTML page.
  if (path === 'messages' && activeConvId) {
    try { sessionStorage.setItem('batpapo:pending-conversation', activeConvId); } catch (_) {}
  }
  // same page? just re-render
  const current = (location.pathname.split('/').pop() || 'index.html');
  if (current === file) {
    route = path;
    showUserMenu = false;
    render();
    return;
  }
  location.href = file;
}

function handleRoute() {
  const file = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
  const map = {
    'index.html': 'landing',
    'login.html': 'login',
    'register.html': 'register',
    'home.html': 'home',
    'messages.html': 'messages',
    'friends.html': 'friends',
    'groups.html': 'groups',
    'profile.html': 'profile-lab',
    'notifications.html': 'notifications',
    'stickers.html': 'sticker-studio',
    'settings.html': 'settings',
  };
  const hash = map[file] || 'landing';
  const user = store.getCurrentUser();
  const authPages = ['home','messages','chat','friends','groups','profile','profile-lab','settings','notifications','sticker-studio'];
  const publicPages = ['login','register','landing'];
  if (authPages.includes(hash) && !user) {
    location.href = 'login.html';
    return;
  }
  if (publicPages.includes(hash) && user && hash !== 'landing') {
    // already logged in visiting login/register -> home
    if (hash === 'login' || hash === 'register') {
      location.href = 'home.html';
      return;
    }
  }
  route = hash;
  if (hash === 'messages') {
    try {
      const pendingConvId = sessionStorage.getItem('batpapo:pending-conversation');
      if (pendingConvId) {
        sessionStorage.removeItem('batpapo:pending-conversation');
        if (store.canAccessConversation(pendingConvId)) activeConvId = pendingConvId;
      }
    } catch (_) {}
  }
  render();
}

function renderLanding() {
  return `<div class="landing">
    <header class="landing-header">
      <div class="brand"><span class="brand-mark">B</span><span class="brand-name">BATPAPO</span></div>
      <div class="nav-actions">
        <button type="button" class="btn btn-ghost" data-go="login">Entrar</button>
        <button type="button" class="btn btn-primary" data-go="register">Criar conta</button>
      </div>
    </header>

    <section class="landing-hero">
      <div class="hero-copy">
        <h1>Entre na toca.</h1>
        <p class="lead">Converse, compartilhe, crie grupos e transforme seus papos em experiências únicas.</p>
        <div class="landing-actions">
          <button type="button" class="btn btn-primary" data-go="register">Criar conta grátis</button>
          <button type="button" class="btn btn-secondary" data-go="login">Já tenho conta</button>
        </div>
      </div>
      <div class="hero-visual">${mascotHtml(280)}</div>
    </section>

    <section class="landing-features-wrap">
      <div class="landing-features-head">
        <h2>Feito para sua galera</h2>
        <p>Tudo que você precisa pra manter o papo rolando.</p>
      </div>
      <div class="landing-features">
        <div class="feature-card">
          <div class="feat-icon">${icon('message',18)}</div>
          <h3>Chats privados</h3>
          <p>Mensagens, arquivos, stickers e reações.</p>
        </div>
        <div class="feature-card">
          <div class="feat-icon">${icon('hash',18)}</div>
          <h3>BAT-ID único</h3>
          <p>Adicione amigos pelo código BAT-XXXX-XXX.</p>
        </div>
        <div class="feature-card">
          <div class="feat-icon">${icon('users',18)}</div>
          <h3>Grupos e canais</h3>
          <p>Tocas com canais de texto e identidade própria.</p>
        </div>
        <div class="feature-card">
          <div class="feat-icon">${icon('user',18)}</div>
          <h3>Perfil personalizável</h3>
          <p>Avatar, banner, molduras e cores.</p>
        </div>
        <div class="feature-card">
          <div class="feat-icon">${icon('moon',18)}</div>
          <h3>Temas</h3>
          <p>Escuro, meia-noite, carmesim e mais.</p>
        </div>
        <div class="feature-card">
          <div class="feat-icon">${icon('bell',18)}</div>
          <h3>Notificações</h3>
          <p>Mensagens, menções e pedidos de amizade.</p>
        </div>
      </div>
    </section>

    <footer class="landing-footer">
      <p>BATPAPO — Seu papo. Sua toca. Sua galera.</p>
      <p class="footer-copy">© 2026 BATPAPO</p>
    </footer>
  </div>`;
}

function renderLogin() {
  return `<div class="auth-page"><div class="auth-card animate-in">
    <button type="button" class="auth-back" data-go="landing" aria-label="Voltar">${icon('chevronLeft',18)} Voltar</button>
    <div class="auth-logo">${logoHtml(56)}<h1>BATPAPO</h1><p>Seu papo. Sua toca. Sua galera.</p></div>
    <div class="auth-mascot" id="login-mascot">${mascotHtml(56)}</div>
    <h2>Entrar na toca</h2>
    <form id="login-form">
      <div class="input-group"><label class="input-label">Email ou usuário</label>
        <input class="input" type="text" name="identifier" placeholder="mariana ou mariana@email.com" required autocomplete="username" /></div>
      <div class="input-group"><label class="input-label">Senha</label>
        <input class="input" type="password" name="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:0.85rem;color:var(--text-secondary)">
        <input type="checkbox" name="remember" style="accent-color:var(--bat-purple)" /> Lembrar login</label>
      <button type="submit" class="btn btn-primary" style="width:100%">Entrar</button>
    </form>
    <div class="auth-footer">Não tem conta? <a href="#" data-go="register">Criar conta</a></div>
    <div style="text-align:center;margin-top:16px;font-size:0.8rem;color:var(--text-muted)">Demo: mariana / demo1234</div>
  </div></div>`;
}

function renderRegister() {
  return `<div class="auth-page"><div class="auth-card animate-in">
    <button type="button" class="auth-back" data-go="landing" aria-label="Voltar">${icon('chevronLeft',18)} Voltar</button>
    <div class="auth-logo">${logoHtml(56)}<h1>BATPAPO</h1><p>Seu papo. Sua toca. Sua galera.</p></div>
    <div class="auth-mascot" id="register-mascot">${mascotHtml(56)}</div>
    <h2>Criar sua conta</h2>
    <form id="register-form">
      <div class="input-group"><label class="input-label">Nome de usuário</label>
        <input class="input" type="text" name="username" placeholder="mariana" required pattern="[a-zA-Z0-9_]{3,20}" />
        <span class="input-hint">Apenas letras, números e _</span></div>
      <div class="input-group"><label class="input-label">Nome de exibição</label>
        <input class="input" type="text" name="displayName" placeholder="Mariana" required /></div>
      <div class="input-group"><label class="input-label">Email</label>
        <input class="input" type="email" name="email" placeholder="voce@email.com" required /></div>
      <div class="input-group"><label class="input-label">Senha</label>
        <input class="input" type="password" name="password" placeholder="Mínimo 6 caracteres" required minlength="6" /></div>
      <div class="input-group"><label class="input-label">Confirmar senha</label>
        <input class="input" type="password" name="password2" placeholder="Repita a senha" required /></div>
      <button type="submit" class="btn btn-primary" style="width:100%">Criar conta</button>
    </form>
    <div class="auth-footer">Já tem conta? <a href="#" data-go="login">Entrar</a></div>
  </div></div>`;
}

function renderShell(content) {
  const user = store.getCurrentUser();
  if (!user) return content;
  const notifs = store.getNotifications(user.id).filter(n => !n.read);
  const totalUnread = store.getUserConversations(user.id)
    .reduce((sum, c) => sum + (c.unread?.[user.id] || 0), 0);

  return `<div class="app-shell">
    <aside class="icon-sidebar">
      <button class="logo-btn" data-nav="home" data-tooltip="Início">${logoHtml(32)}</button>
      <button class="nav-icon ${activeNav==='home'?'active':''}" data-nav="home" data-tooltip="Início">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
      </button>
      <button class="nav-icon ${activeNav==='messages'?'active':''}" data-nav="messages" data-tooltip="Mensagens">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        ${totalUnread>0?`<span class="nav-badge">${totalUnread>9?'9+':totalUnread}</span>`:''}
      </button>
      <button class="nav-icon ${activeNav==='friends'?'active':''}" data-nav="friends" data-tooltip="Amigos">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
      </button>
      <button class="nav-icon ${activeNav==='groups'?'active':''}" data-nav="groups" data-tooltip="Grupos">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
      </button>
      <button class="nav-icon ${activeNav==='notifications'?'active':''}" data-nav="notifications" data-tooltip="Notificações">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
         ${notifs.length>0?`<span class="nav-badge">${notifs.length}</span>`:''}
       </button>
       <button class="nav-icon ${activeNav==='stickers'?'active':''}" data-nav="sticker-studio" data-tooltip="Sticker Studio">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12l1.7-1.7c.7-.7 1.8-.8 2.5-.1l.1.1.6.6.9-.9c.4-.4 1.1-.3 1.5.1l2.1 2.1c.4.4.3 1.1-.1 1.5l-.9.9-.6-.6-.1-.1-.1-.1c.1.7.1 1.4.1 2.1H2zm12-7h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>
       </button>
      <div class="spacer"></div>
      <button class="nav-icon ${activeNav==='settings'?'active':''}" data-nav="settings" data-tooltip="Configurações">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      </button>
      <button class="user-btn ${showUserMenu?'active':''}" id="user-menu-btn">${renderAvatar(user,'sm',false)}</button>
        ${showUserMenu?`<div class="user-menu" id="user-menu">
         <div class="um-header">
           <div class="um-name">${escapeHtml(user.displayName)}</div>
           <div class="um-status"><span class="status-dot ${user.status||'offline'}"></span>${escapeHtml(user.customStatus||user.status||'offline')}</div>
         </div>
         <button type="button" data-nav="profile-lab">${icon('user',16)} Meu perfil</button>
         <button type="button" data-nav="profile-lab">${icon('edit',16)} Personalizar</button>
         <button type="button" data-nav="sticker-studio">${icon('sticker',16)} Sticker Studio</button>
         <button type="button" data-nav="settings">${icon('settings',16)} Configurações</button>
         <div class="um-divider"></div>
         <button type="button" id="btn-logout" class="danger">${icon('logOut',16)} Sair</button>
       </div>`:''}
    </aside>
    ${content}
    <nav class="mobile-nav">
      <button class="nav-icon ${activeNav==='home'?'active':''}" data-nav="home">${icon('home',20)}</button>
      <button class="nav-icon ${activeNav==='messages'?'active':''}" data-nav="messages">${icon('message',20)}${totalUnread>0?`<span class="nav-badge">${totalUnread}</span>`:''}</button>
      <button class="nav-icon ${activeNav==='friends'?'active':''}" data-nav="friends">${icon('users',20)}</button>
      <button class="nav-icon ${activeNav==='groups'?'active':''}" data-nav="groups">${icon('hash',20)}</button>
      <button class="nav-icon ${activeNav==='notifications'?'active':''}" data-nav="notifications">${icon('bell',20)}</button>
      <button class="nav-icon ${activeNav==='stickers'?'active':''}" data-nav="sticker-studio">${icon('sticker',20)}</button>
      <button class="nav-icon ${activeNav==='settings'?'active':''}" data-nav="settings">${icon('settings',20)}</button>
    </nav>
  </div>`;
}

function renderHome() {
  const user = store.getCurrentUser();
  const friends = store.getFriends(user.id);
  const onlineFriends = friends.filter(f => f.status==='online'||f.status==='away');
  const groups = store.getUserGroups(user.id);
  const notifs = store.getNotifications(user.id).filter(n => !n.read);
  const totalUnread = store.getUserConversations(user.id)
    .reduce((sum, c) => sum + (c.unread?.[user.id] || 0), 0);

  return renderShell(`<div class="main-area"><div class="home-view animate-in">
    <h1 class="home-greeting">${greeting()}, ${escapeHtml(user.displayName)}</h1>
    <p class="home-sub">${escapeHtml(user.customStatus || 'Bem-vindo de volta.')}</p>

    <div class="home-stats">
      <button type="button" class="home-stat" data-nav="messages">${icon('message',16)} <strong>${totalUnread}</strong> mensagens</button>
      <button type="button" class="home-stat" data-nav="friends">${icon('users',16)} <strong>${onlineFriends.length}</strong> online</button>
      <button type="button" class="home-stat" data-nav="groups">${icon('hash',16)} <strong>${groups.length}</strong> grupos</button>
      <button type="button" class="home-stat" data-nav="notifications">${icon('bell',16)} <strong>${notifs.length}</strong> alertas</button>
    </div>

    <div class="home-section">
      <h2>Amigos online</h2>
      <div class="home-list">
        ${onlineFriends.length===0
          ? `<div class="empty-state" style="padding:24px"><h3 style="font-size:0.95rem">Ninguém online agora</h3></div>`
          : onlineFriends.slice(0,8).map(f => `<button type="button" class="nav-item" data-dm="${f.id}">${renderAvatar(f,'md')}<div class="item-info"><div class="item-name">${escapeHtml(f.displayName)}</div><div class="item-preview">${escapeHtml(f.customStatus||f.status||'')}</div></div></button>`).join('')}
      </div>
    </div>

    <div class="home-section">
      <h2>Seus grupos</h2>
      <div class="home-list">
        ${groups.length===0
          ? `<div class="empty-state" style="padding:24px"><h3 style="font-size:0.95rem">Nenhum grupo ainda</h3><button class="btn btn-primary btn-sm" data-nav="groups" style="margin-top:8px">Criar grupo</button></div>`
          : groups.map(g => `<button type="button" class="nav-item" data-group="${g.id}">${g.icon?`<img class="avatar avatar-md" src="${g.icon}" alt="" style="border-radius:8px;object-fit:cover"/>`:`<div class="avatar avatar-md" style="border-radius:8px;background:${g.color||'var(--accent)'}">${icon('hash',16)}</div>`}<div class="item-info"><div class="item-name">${escapeHtml(g.name)}</div><div class="item-preview">${g.members.length} membros</div></div></button>`).join('')}
      </div>
    </div>
  </div></div>`);
}


function renderMessages() {
  const user = store.getCurrentUser();
  const state = store.getState();
  const convs = store.getUserConversations(user.id);
  // Never keep an active conversation the user cannot access
  if (activeConvId && !store.canAccessConversation(activeConvId)) {
    activeConvId = null;
  }

  const q = convSearchQuery.trim().toLowerCase();
  const convsWithNames = convs.map(c => {
    let name, avatar;
    if (c.type==='dm') {
      const other = state.users[c.participants.find(p=>p!==user.id)];
      name = other?.displayName||'Desconhecido';
      avatar = renderAvatar(other,'md');
    } else {
      const group = state.groups[c.groupId];
      name = group ? `${group.name}` : 'Grupo';
      // Mostrar a imagem do grupo também na lista de conversas, não apenas dentro do chat.
      avatar = group?.icon
        ? `<img class="avatar avatar-md" src="${escapeHtml(group.icon)}" alt="" style="border-radius:8px;object-fit:cover"/>`
        : `<div class="avatar avatar-md" style="border-radius:8px;background:${group?.color||'var(--bat-purple)'}">${icon('sticker',18)}</div>`;
    }
    return { c, name, avatar };
  });
  const filtered = q ? convsWithNames.filter(x => x.name.toLowerCase().includes(q) || (x.c.lastMessage||'').toLowerCase().includes(q)) : convsWithNames;

  // Determine if viewing a group chat
  const activeConv = activeConvId ? state.conversations[activeConvId] : null;
  const isGroupView = activeConv && activeConv.type === 'group';
  const activeGroup = isGroupView ? state.groups[activeConv.groupId] : null;
  const activeGroupConvs = isGroupView
    ? store.getGroupConversations(activeConv.groupId).map(chConv => {
        const ch = (activeGroup?.channels || []).find(c => c.id === chConv.channelId);
        return { conv: chConv, channel: ch };
      })
    : [];

  // Build nav list: channel list for group view, conversation list otherwise
  let listHtml;
  if (isGroupView && activeGroup) {
    listHtml = `<div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button class="btn-icon" id="back-to-conv-list" title="Voltar para conversas">←</button>
        <div style="font-weight:700;font-size:0.95rem">${escapeHtml(activeGroup.name)}</div>
      </div>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px">Canais</p>
      ${activeGroupConvs.map(({conv: chConv, channel: ch}) => {
        const unread = chConv.unread?.[user.id] || 0;
        const isActive = chConv.id === activeConvId;
        return `<div class="nav-item ${isActive?'active':''} channel-item" data-conv="${chConv.id}">
          <span style="font-size:0.85rem;color:var(--text-muted);margin-right:4px">#</span>
          <div class="item-info">
            <div class="item-name" style="font-size:0.9rem">${escapeHtml(ch?.name || 'canal')}</div>
          </div>
          ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
        </div>`;
      }).join('')}
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">Membros: ${activeGroup.members.length}</p>
      </div>
    </div>`;
  } else {
    listHtml = convs.length===0
      ? `<div class="empty-state">${mascotHtml(64)}<h3>Silêncio na toca...</h3><p>Comece uma conversa com um amigo.</p><button class="btn btn-primary btn-sm" data-nav="friends">Encontrar amigos</button></div>`
      : filtered.length===0
      ? `<div class="empty-state">${mascotHtml(56)}<h3>Nenhum resultado</h3><p>Nenhuma conversa encontrada para "${escapeHtml(convSearchQuery)}".</p></div>`
      : filtered.map(({c,name,avatar}) => {
          const unread = c.unread?.[user.id]||0;
          return `<div class="nav-item ${activeConvId===c.id?'active':''}" data-conv="${c.id}">
            ${avatar}<div class="item-info"><div class="item-name">${escapeHtml(name)}</div>
            <div class="item-preview">${escapeHtml(c.lastMessage||'')}</div></div>
            <div class="item-meta"><span class="item-time">${c.lastMessageAt?formatTimeShort(c.lastMessageAt):''}</span>
            ${unread>0?`<span class="unread-badge">${unread}</span>`:''}</div></div>`;
        }).join('');
  }

  let chatHtml;
  if (activeConvId && state.conversations[activeConvId]) {
    chatHtml = renderChat(activeConvId);
  } else {
    chatHtml = `<div class="main-area"><div class="empty-state" style="flex:1">${mascotHtml(96)}<h3>Selecione uma conversa</h3><p>Escolha um papo na lista ao lado.</p></div></div>`;
  }

  return renderShell(`<div class="nav-panel"><div class="nav-panel-header"><h2>${isGroupView ? '#' + escapeHtml(activeGroup?.name || '') : 'Mensagens'}</h2>${isGroupView ? '' : '<button type="button" class="btn btn-primary btn-sm" id="btn-create-group-messages" title="Criar grupo">＋ Grupo</button>'}</div>
    ${isGroupView ? '' : `<div class="nav-panel-search"><input class="input" type="search" id="conv-search" placeholder="Buscar conversas..." value="${escapeHtml(convSearchQuery)}" /></div>`}
    <div class="nav-panel-list">${listHtml}</div></div>${chatHtml}`);
}

function renderChat(convId) {
  const user = store.getCurrentUser();
  const state = store.getState();
  if (!store.canAccessConversation(convId)) {
    activeConvId = null;
    return `<div class="main-area"><div class="empty-state" style="flex:1">${mascotHtml(96)}<h3>Conversa indisponível</h3><p>Você não tem acesso a esta conversa.</p></div></div>`;
  }
  const conv = state.conversations[convId];
  const msgs = store.getMessages(convId);
  store.markRead(convId);
  // O painel de membros e as configurações precisam do grupo no escopo do chat.
  // Sem esta referência, renderChat lançava ReferenceError: activeGroup is not defined.
  const activeGroup = conv?.type === 'group' ? state.groups[conv.groupId] : null;

  let title='', subtitle='', other=null;
  if (conv.type==='dm') {
    other = state.users[conv.participants.find(p=>p!==user.id)];
    title = other?.displayName||'?';
    subtitle = other?.customStatus||other?.status||'';
  } else {
    const group = state.groups[conv.groupId];
    title = group?.name||'Grupo';
    subtitle = `${group?.members.length||0} membros`;
  }

  let lastAuthor=null, lastDay=null;
  const msgsHtml = msgs.map(m => {
    const sender = state.users[m.senderId];
    const isGrouped = lastAuthor===m.senderId;
    const day = new Date(m.createdAt).toDateString();
    let divider='';
    if (day!==lastDay) { divider=`<div class="msg-divider">${formatTime(m.createdAt)}</div>`; lastDay=day; }
    lastAuthor=m.senderId;

    const reactionsHtml = m.reactions&&Object.keys(m.reactions).length
      ? `<div class="msg-reactions">${Object.entries(m.reactions).map(([emoji,users])=>
          `<button class="reaction ${users.includes(user.id)?'mine':''}" data-react="${m.id}" data-emoji="${emoji}">${emoji} ${users.length}</button>`
        ).join('')}</div>` : '';

     let contentHtml='';
     if (m.type==='text') contentHtml=parseMentions(m.content);
     else if (m.type==='image') contentHtml=`<div class="img-msg" data-view-img="${m.id}" title="Ver em tela cheia"><img src="${m.content}" alt="Imagem"/></div>`;
     else if (m.type==='banner') contentHtml=`<div class="banner-msg" data-view-img="${m.id}" title="Ver em tela cheia"><img src="${m.content}" alt="Banner"/></div>`;
     else if (m.type==='file') contentHtml=`<div class="file-card" data-view-file="${m.id}" title="Ver arquivo"><span class="file-icon">📄</span><div class="file-info"><div class="file-name">${escapeHtml(m.fileName||'arquivo')}</div><div class="file-size">${formatFileSize(m.fileSize||0)}</div></div></div>`;
     else if (m.type==='audio') {
       const bars=Array.from({length:20},()=>Math.random()*20+4);
       contentHtml=`<div class="audio-msg"><button class="play-btn">▶</button><div class="waveform">${bars.map(h=>`<span style="height:${h}px"></span>`).join('')}</div><span class="duration">${m.duration||'0:05'}</span></div>`;
     }
     else if (m.type==='sticker') {
       if (m.isImageDataUrl && m.content.startsWith('data:image')) {
         contentHtml=`<div class="sticker-msg img" data-view-img="${m.id}" title="Ver em tela cheia"><img src="${m.content}" alt="Sticker"/></div>`;
       } else {
         contentHtml=`<div class="sticker-msg" style="font-size:4rem">${m.content}</div>`;
       }
     }
     else contentHtml=escapeHtml(m.content);

    const replyHtml = m.replyTo ? (()=>{
      const orig=msgs.find(x=>x.id===m.replyTo);
      return orig?`<div class="msg-reply">${escapeHtml(state.users[orig.senderId]?.displayName||'')}: ${escapeHtml((orig.content||'').slice(0,60))}</div>`:'';
    })() : '';

    return `${divider}<div class="message ${isGrouped?'grouped':''}" data-msg="${m.id}">
       <button type="button" class="msg-avatar profile-click-target" data-profile-user="${m.senderId}" title="Ver perfil">${renderAvatar(sender,'sm',false)}</button>
       <div class="msg-body">
         <div class="msg-header"><button type="button" class="msg-author profile-click-target" data-profile-user="${m.senderId}" style="color:${sender?.nameColor||'var(--bat-purple-soft)'}">${escapeHtml(sender?.displayName||'?')}</button>
         <span class="msg-time">${formatTimeShort(m.createdAt)}</span></div>
         ${replyHtml}<div class="msg-content">${contentHtml}${m.edited ? '<span class="msg-edited">(editado)</span>' : ''}</div>${reactionsHtml}
       </div>
       <div class="msg-actions">
         <button data-action="reply" data-msg="${m.id}" title="Responder">${icon('reply',16)}</button>
         <button data-action="react" data-msg="${m.id}" title="Reagir">${icon('smile',18)}</button>
         ${m.senderId===user.id?`<button data-action="edit" data-msg="${m.id}" title="Editar">${icon('edit',16)}</button>`:''}
         ${m.senderId===user.id?`<button data-action="delete" data-msg="${m.id}" title="Excluir">${icon('trash',16)}</button>`:''}
       </div>
       ${reactionPickerMsgId===m.id ? `<div class="reaction-picker" data-rpmsg="${m.id}">
         ${['👍','💜','😂','🔥','😢','😮','😡','🦇','👀','💯','🎉','❤️'].map(em => `<button class="rp-emoji" data-react-emoji="${em}" title="${em}">${em}</button>`).join('')}
       </div>` : ''}
    </div>`;
  }).join('');

  const draft = store.getDraft(convId);
  const allEmojis = Object.values(EMOJIS).flat();

  return `<div class="main-area" style="position:relative" id="chat-main">
    <div class="chat-header">
      ${other
        ? renderAvatar(other,'sm')
        : (state.groups[conv.groupId]?.icon
            ? `<img class="avatar avatar-sm" src="${state.groups[conv.groupId].icon}" alt="" style="border-radius:8px;object-fit:cover"/>`
            : `<div class="avatar avatar-sm" style="border-radius:8px;background:${state.groups[conv.groupId]?.color||'var(--accent)'}">${icon('hash',16)}</div>`)}
      <div class="chat-header-text">
        <div class="chat-title">${escapeHtml(title)}</div>
        <div class="chat-status">${escapeHtml(subtitle)}</div>
      </div>
      <div class="header-actions">
        ${conv.type==='group'
          ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-group-settings" title="Adicionar pessoas, editar ou excluir este grupo">${icon('settings',16)} <span>Gerenciar grupo</span></button>`
          : `<button type="button" class="btn-icon" id="toggle-info" title="Perfil">${icon('user',18)}</button>`}
      </div>
    </div>
    <div class="messages-area" id="messages-area">${msgsHtml||`<div class="empty-state">${mascotHtml(64)}<h3>Comece o papo!</h3><p>Envie a primeira mensagem.</p></div>`}</div>
    ${replyTo?`<div style="padding:8px 16px;background:var(--bg-surface);border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:0.85rem">
      <span>Respondendo...</span><button class="btn-icon" id="cancel-reply" style="margin-left:auto">${icon('x',16)}</button></div>`:''}
    ${editingMsg?`<div class="editing-bar"><span class="editing-bar-icon">✏️</span><span>Editando mensagem</span><button class="btn-icon" id="cancel-edit" style="margin-left:auto">${icon('x',16)}</button></div>`:''}
    <div class="chat-input-bar" style="position:relative">
      ${showEmojiPicker?`<div class="picker-popup" id="emoji-picker"><div class="emoji-grid">${allEmojis.map(e=>`<button data-emoji-insert="${e}">${e}</button>`).join('')}</div></div>`:''}
      ${showStickerPicker?`<div class="picker-popup" id="sticker-picker">
        <div class="picker-tabs">
          <button type="button" class="tab-btn active" data-tab="default">Padrão</button>
          <button type="button" class="tab-btn" data-tab="custom">Seus stickers</button>
        </div>
        <div class="sticker-panel" data-panel="default">
          <div class="sticker-grid">${STICKERS.map(s=>`<button data-sticker="${s.emoji}" title="${s.label}">${s.emoji}</button>`).join('')}</div>
        </div>
        <div class="sticker-panel" data-panel="custom" style="display:none">
          <div class="sticker-grid" id="custom-stickers-grid">
            ${renderCustomStickersGrid()}
          </div>
        </div>
      </div>`:''}
      ${recording?`<div class="recording-bar"><span class="rec-dot"></span><span class="rec-time" id="rec-time">0:00</span>
        <button class="btn btn-sm btn-danger" id="cancel-rec">Cancelar</button>
        <button class="btn btn-sm btn-primary" id="stop-rec">Enviar</button></div>`
      :`<div class="chat-input-wrap">
         <div class="chat-toolbar">
           <button id="btn-attach" data-tooltip="Arquivo">${icon('paperclip',18)}</button>
           <button id="btn-banner" data-tooltip="Enviar banner">🖼️</button>
           <button id="btn-emoji" data-tooltip="Emoji">${icon('smile',18)}</button>
           <button id="btn-sticker" data-tooltip="Stickers">${icon('sticker',18)}</button>
           <button id="btn-mic" data-tooltip="Áudio">${icon('mic',18)}</button>
         </div>
         <textarea id="msg-input" rows="1" placeholder="Digite uma mensagem..." autocomplete="off">${escapeHtml(draft)}</textarea>
         <button class="btn-send" id="btn-send"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
       </div>
       <input type="file" id="file-input" hidden accept="image/*,video/*,.pdf,.zip,.doc,.docx,.txt,.js,.py,.json" />
       <input type="file" id="banner-input" hidden accept="image/*" />`}
    </div>
  </div>
  ${conv.type === 'group' && activeGroup ? `<aside class="group-members-panel"><div class="group-members-heading">Membros <span>${activeGroup.members.length}</span></div>
    ${activeGroup.members.map(memberId => { const member = state.users[memberId]; if (!member) return ''; return `<button type="button" class="group-member profile-click-target" data-profile-user="${member.id}">${renderAvatar(member,'sm',false)}<span class="group-member-info"><strong>${escapeHtml(member.displayName || member.username)}</strong><small>${member.id === activeGroup.ownerId ? 'Dono do grupo' : escapeHtml(member.customStatus || 'Membro')}</small></span>${member.id === activeGroup.ownerId ? '<span class="group-owner-dot" title="Dono">●</span>' : ''}</button>`; }).join('')}
  </aside>` : ''}
  ${showInfoPanel&&other?`     <aside class="info-panel open">
    <div class="info-banner" style="${other.banner?'background:transparent;':'background:'+(other.bannerColor||'var(--bg-surface)')}">${other.banner?`<img src="${other.banner}" alt=""/>`:''}
      <div class="info-avatar-wrap">${renderAvatar(other,'xl')}</div></div>
    <div class="info-content">
      <div class="info-name" style="color:${other.nameColor||'inherit'}">${escapeHtml(other.displayName)}</div>
      <div class="info-username">@${escapeHtml(other.username)}</div>
      <div class="bat-id">${other.batId}</div>
      ${other.bio?`<p class="info-bio">${escapeHtml(other.bio)}</p>`:''}
      ${other.badges?.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${other.badges.map(b=>`<span class="badge badge-${b}">${b}</span>`).join('')}</div>`:''}
      <div class="info-section"><h4>Status</h4><p><span class="status-dot ${other.status}"></span> ${escapeHtml(other.customStatus||other.status)}</p></div>
    </div>
  </aside>`:''}`;
}

function renderFriends() {
  const user = store.getCurrentUser();
  const friends = store.getFriends(user.id);
  const pending = store.getPendingRequests(user.id);
  return renderShell(`<div class="main-area"><div class="home-view animate-in">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <h1 style="font-size:1.5rem;font-weight:800">Meus Bats</h1>
      <button class="btn btn-primary" id="btn-add-friend">+ Adicionar amigo</button>
    </div>
    ${pending.length>0?`<h3 style="margin-bottom:12px;font-size:0.9rem;color:var(--text-muted)">Solicitações (${pending.length})</h3>
      ${pending.map(r=>{const from=store.getUser(r.fromId);return `<div class="friend-request">${renderAvatar(from,'md')}
        <div><div style="font-weight:600">${escapeHtml(from?.displayName||'?')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">@${escapeHtml(from?.username||'')} · ${from?.batId||''}</div></div>
        <div class="req-actions"><button class="btn btn-primary btn-sm" data-accept="${r.id}">Aceitar</button>
        <button class="btn btn-ghost btn-sm" data-decline="${r.id}">Recusar</button></div></div>`;}).join('')}`:''}
    <h3 style="margin:20px 0 12px;font-size:0.9rem;color:var(--text-muted)">Amigos (${friends.length})</h3>
    ${friends.length===0?`<div class="empty-state">${mascotHtml(80)}<h3>Você ainda está voando sozinho.</h3><p>Adicione amigos pelo BAT-ID.</p>
      <button class="btn btn-primary" id="btn-add-friend-empty">Encontrar amigos</button></div>`
      :friends.map(f=>`<div class="nav-item"><button type="button" class="profile-click-target" data-profile-user="${f.id}" style="padding:0;border:0;background:transparent">${renderAvatar(f,'md')}</button>
        <div class="item-info"><button type="button" class="profile-click-target item-name" data-profile-user="${f.id}" style="padding:0;border:0;background:transparent;color:inherit;text-align:left">${escapeHtml(f.displayName)}</button>
        <div class="item-preview">${escapeHtml(f.customStatus||f.status)} · ${f.batId}</div></div>
        <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" data-dm="${f.id}">Mensagem</button>
        <button class="btn btn-icon" data-remove-friend="${f.id}" data-tooltip="Remover amigo" title="Remover amigo">🗑</button>
        </div></div>`).join('')}
  </div></div>`);
}

function renderGroups() {
  const user = store.getCurrentUser();
  const groups = store.getUserGroups(user.id);
  return renderShell(`<div class="main-area"><div class="home-view animate-in">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <h1 style="font-size:1.5rem;font-weight:800">Grupos</h1>
      <button class="btn btn-primary" id="btn-create-group">+ Criar Grupo</button>
    </div>
    ${groups.length===0?`<div class="empty-state">${mascotHtml(80)}<h3>Ainda não existe nenhuma toca.</h3>
      <button class="btn btn-primary" id="btn-create-group-empty">Criar grupo</button></div>`
      :`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
        ${groups.map(g=>`<div class="card" style="cursor:pointer" data-open-group="${g.id}">
          <div style="height:80px;border-radius:var(--radius-md);background:${g.bannerColor||g.color};margin-bottom:12px;display:flex;align-items:center;justify-content:center;font-size:2rem">${icon('sticker',18)}</div>
          <h3 style="font-size:1.1rem">${escapeHtml(g.name)}</h3>
          <p style="font-size:0.85rem;color:var(--text-muted);margin:4px 0 8px">${escapeHtml(g.description||'')}</p>
          <span style="font-size:0.8rem;color:var(--text-secondary)">${g.members.length} membros · ${g.channels.length} canais</span>
        </div>`).join('')}
      </div>`}
  </div></div>`);
}

function renderProfileLab() {
  const user = store.getCurrentUser();
  const d = getProfileDraft();
  const previewUser = {
    ...user,
    displayName: d.displayName,
    bio: d.bio,
    customStatus: d.customStatus,
    frame: d.frame,
    nameColor: d.nameColor,
    bannerColor: d.bannerColor,
    avatar: d.avatar,
    banner: d.banner,
  };
  const dirty = (
    d.displayName !== (user.displayName || '') ||
    d.bio !== (user.bio || '') ||
    d.customStatus !== (user.customStatus || '') ||
    d.frame !== (user.frame || 'none') ||
    d.nameColor !== (user.nameColor || '#E0AAFF') ||
    d.bannerColor !== (user.bannerColor || '#5A189A') ||
    d.banner !== (user.banner || null) ||
    d.avatar !== (user.avatar || null)
  );

  return renderShell(`<div class="main-area"><div class="profile-lab animate-in">
    <div class="lab-header">
      <div>
        <h1 class="lab-title">Laboratório do Perfil</h1>
        <p class="lab-sub">Monte seu visual. As mudanças só valem depois de salvar.</p>
      </div>
      <div class="lab-header-actions">
        ${dirty ? '<span class="lab-dirty">Alterações não salvas</span>' : ''}
        <button class="btn btn-secondary" id="lab-reset" ${dirty ? '' : 'disabled'}>Descartar</button>
        <button class="btn btn-primary" id="lab-save" ${dirty ? '' : 'disabled'}>Salvar perfil</button>
      </div>
    </div>
    <div class="lab-grid">
      <div class="lab-preview">
        <div class="preview-banner" id="lab-banner-btn" style="${d.banner ? 'background:transparent;' : 'background:' + (d.bannerColor || 'var(--bg-surface)')}">
          ${d.banner ? `<img src="${d.banner}" alt=""/>` : ''}
          <div class="banner-edit-hint">${icon('camera',20)}<span>Alterar banner</span></div>
          <input type="file" id="lab-banner" accept="image/*" hidden />
        </div>
        <div class="preview-body">
          <div class="preview-avatar-wrap">
            <button type="button" class="preview-avatar-btn" id="lab-avatar-btn" title="Trocar foto de perfil">
              ${renderAvatar(previewUser, 'xxl', false)}
              <span class="avatar-hover-overlay">
                <span class="avatar-hover-icon">${icon('image',18)}</span>
                <span class="avatar-hover-text">Trocar foto</span>
              </span>
            </button>
            <input type="file" id="lab-avatar" accept="image/*" hidden />
          </div>
          <div class="preview-info">
            <div class="preview-name" style="color:${d.nameColor || 'inherit'}">${escapeHtml(d.displayName || 'Seu nome')}${user.id === '3dadac15-9a3d-45bb-844b-bc74ce8c13cb' ? '<span class="original-dev-badge" title="Desenvolvedora original do BATPAPO" aria-label="Desenvolvedora original do BATPAPO">&lt;/&gt;</span>' : ''}</div>
            <div class="preview-username">@${escapeHtml(user.username)}</div>
            <div class="bat-id preview-batid">${user.batId} <button type="button" class="btn btn-ghost btn-sm" id="copy-batid">Copiar</button></div>
            ${d.customStatus ? `<div class="preview-status">${escapeHtml(d.customStatus)}</div>` : ''}
            ${d.bio ? `<p class="preview-bio">${escapeHtml(d.bio)}</p>` : '<p class="preview-bio muted">Nenhuma bio ainda</p>'}
            ${user.badges?.length ? `<div class="preview-badges">${user.badges.map(b => `<span class="badge badge-${b}">${b === 'first_flight' ? 'Primeiro voo' : b}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="lab-controls">
        <div class="lab-section">
          <h4>Nome de exibição</h4>
          <input class="input" id="lab-display" value="${escapeHtml(d.displayName)}" maxlength="32" />
        </div>
        <div class="lab-section">
          <h4>Bio</h4>
          <textarea class="textarea" id="lab-bio" rows="3" maxlength="200" placeholder="Conte um pouco sobre você...">${escapeHtml(d.bio)}</textarea>
        </div>
        <div class="lab-section">
          <h4>Status personalizado</h4>
          <input class="input" id="lab-status" value="${escapeHtml(d.customStatus)}" placeholder="Na toca" maxlength="40" />
        </div>
        <div class="lab-section">
          <h4>Moldura</h4>
          <div class="frame-grid">
            ${FRAMES.map(f => `<button type="button" class="frame-option ${d.frame === f.id ? 'selected' : ''}" data-frame="${f.id}">${f.id === 'none' ? '—' : f.name}</button>`).join('')}
          </div>
        </div>
        <div class="lab-section">
          <h4>Cor do nome</h4>
          <div class="color-swatches">
            ${NAME_COLORS.map(c => `<button type="button" class="color-swatch ${d.nameColor === c ? 'selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
          </div>
        </div>
        <div class="lab-section">
          <h4>Cor do banner</h4>
          <div class="color-swatches">
            ${['#5A189A','#7B2CBF','#9B5DE5','#F72585','#1A1A2E','#0D1B2A','#4CC9F0','#3DDB8A'].map(c =>
              `<button type="button" class="color-swatch ${d.bannerColor === c ? 'selected' : ''}" data-banner-color="${c}" style="background:${c}" aria-label="Banner ${c}"></button>`
            ).join('')}
          </div>
        </div>
      </div>
    </div>
  </div></div>`);
}

function renderStickerStudio() {
  const user = store.getCurrentUser();
  const stickers = store.getUserStickers(user.id);
  return renderShell(`<div class="main-area"><div class="home-view animate-in">
    <div class="studio-header">
      <div>
        <h1 class="studio-title">Sticker Studio</h1>
        <p class="studio-sub">Sua coleção de figurinhas personalizadas.</p>
      </div>
      <button type="button" class="btn btn-primary" id="studio-upload-btn">${icon('plus',16)} Novo sticker</button>
      <input type="file" id="studio-input" accept="image/png,image/webp,image/gif,image/jpeg" hidden />
    </div>
    ${stickers.length === 0
      ? `<div class="empty-state">
          <h3>Você ainda não possui stickers</h3>
          <p>Crie seu primeiro sticker para adicioná-lo à coleção e usar no chat.</p>
          <button type="button" class="btn btn-primary" id="studio-empty-btn" style="margin-top:12px">${icon('plus',16)} Novo sticker</button>
        </div>`
      : `<div class="sticker-studio-grid">${stickers.map(s => `
          <div class="sticker-studio-item">
            <div class="sticker-studio-preview" data-edit-sticker="${s.id}" title="Editar">
              <img src="${s.image}" alt="${escapeHtml(s.name)}" />
            </div>
            <div class="sticker-studio-name">${escapeHtml(s.name)}</div>
            <button type="button" class="sticker-studio-del" data-del-sticker="${s.id}" title="Excluir">${icon('x',14)}</button>
          </div>
        `).join('')}</div>`}
  </div></div>`);
}


function renderNotifications() {
  const user = store.getCurrentUser();
  const notifs = store.getNotifications(user.id);
  return renderShell(`<div class="main-area"><div class="home-view animate-in">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <h1 style="font-size:1.5rem;font-weight:800">Notificações</h1>
      <button class="btn btn-ghost btn-sm" id="clear-notifs">Limpar todas</button>
    </div>
    ${notifs.length===0?`<div class="empty-state">${mascotHtml(64)}<h3>Nenhuma notificação</h3><p>A toca está quieta...</p></div>`
      :notifs.map(n=>`<div class="notif-item ${n.read?'':'unread'}" data-notif="${n.id}">
        ${mascotHtml(36)}<div class="notif-text">${escapeHtml(n.text)}</div>
        <div class="notif-time">${formatTime(n.createdAt)}</div></div>`).join('')}
  </div></div>`);
}

function renderSettings() {
  const user = store.getCurrentUser();
  const tabs = [
    {id:'account',label:'Minha conta'},{id:'appearance',label:'Aparência'},
    {id:'privacy',label:'Privacidade'},{id:'notifications',label:'Notificações'},{id:'security',label:'Segurança'},{id:'data',label:'Dados'}
  ];
  let panel='';
  if (settingsTab==='account') {
    panel=`<h2>Minha conta</h2>
      <div class="settings-group"><h3>Username</h3><div class="input-group"><input class="input" value="@${escapeHtml(user.username)}" disabled/></div></div>
      <div class="settings-group"><h3>Email</h3><div class="input-group"><input class="input" value="${escapeHtml(user.email)}" disabled/></div></div>
      <div class="settings-group"><h3>BAT-ID</h3><div class="bat-id">${user.batId} <button class="btn btn-ghost btn-sm" id="copy-batid">Copiar</button></div></div>`;
  } else if (settingsTab==='appearance') {
    const themes=[{id:'dark',name:'Escuro',colors:'#151518'},{id:'midnight',name:'Meia-noite',colors:'#181e2c'},{id:'vampire',name:'Carmesim',colors:'#221818'},{id:'lilac',name:'Lilás',colors:'#1f1a28'},{id:'neon',name:'Violeta',colors:'#1a1424'},{id:'amoled',name:'AMOLED',colors:'#0a0a0a'}];
    panel=`<h2>Aparência</h2><div class="settings-group"><h3>Tema</h3><div class="theme-grid">${themes.map(t=>`<div class="theme-option ${(user.theme||'dark')===t.id?'selected':''}" data-theme="${t.id}"><div class="theme-preview" style="background:${t.colors}"><span style="display:block;height:100%;width:30%;background:var(--accent);opacity:0.85;border-radius:4px 0 0 4px"></span></div><span>${t.name}</span></div>`).join('')}</div></div>`;
  } else if (settingsTab==='data') {
    panel=`<h2>Dados</h2><div class="settings-group"><h3>Exportar</h3><button class="btn btn-secondary" id="btn-export">Exportar meus dados (JSON)</button></div>
      <div class="settings-group"><h3>Zona de perigo</h3><button class="btn btn-danger" id="btn-reset-demo">Resetar dados demo</button></div>`;
  } else {
    panel=`<h2>${tabs.find(t=>t.id===settingsTab)?.label||''}</h2><p style="color:var(--text-secondary)">Configurações de ${settingsTab} — preparadas para backend.</p>`;
  }
  return renderShell(`<div class="settings-view">
    <nav class="settings-nav">${tabs.map(t=>`<button class="${settingsTab===t.id?'active':''}" data-settings-tab="${t.id}">${t.label}</button>`).join('')}</nav>
    <div class="settings-content animate-in">${panel}</div>
  </div>`);
}

function render() {
  const app = document.getElementById('app');
  let html = '';
  switch (route) {
    case 'landing': html = renderLanding(); break;
    case 'login': html = renderLogin(); break;
    case 'register': html = renderRegister(); break;
    case 'home': activeNav='home'; html=renderHome(); break;
    case 'messages': case 'chat': activeNav='messages'; html=renderMessages(); break;
    case 'friends': activeNav='friends'; html=renderFriends(); break;
    case 'groups': activeNav='groups'; html=renderGroups(); break;
    case 'profile': case 'profile-lab': activeNav='home'; html=renderProfileLab(); break;
    case 'notifications': activeNav='notifications'; html=renderNotifications(); break;
    case 'sticker-studio': activeNav='stickers'; html=renderStickerStudio(); break;
    case 'settings': activeNav='settings'; html=renderSettings(); break;
    default: html = store.getCurrentUser() ? renderHome() : renderLanding();
  }
  app.innerHTML = html;
  bindEvents();
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}

function bindEvents() {
  document.querySelectorAll('[data-profile-user]').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openUserProfile(el.dataset.profileUser); };
  });
  document.querySelectorAll('[data-go]').forEach(el => { el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.go); }; });
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.onclick = () => { const nav=el.dataset.nav; navigate(nav==='profile-lab'?'profile-lab':nav); showUserMenu=false; };
  });

  const umBtn = document.getElementById('user-menu-btn');
  if (umBtn) umBtn.onclick = (e) => { e.stopPropagation(); showUserMenu=!showUserMenu; render(); };
  if (showUserMenu) {
    const closer = (e) => {
      const menu = document.getElementById('user-menu');
      if (menu && !menu.contains(e.target) && e.target !== umBtn && !umBtn?.contains(e.target)) {
        showUserMenu = false;
        document.removeEventListener('mousedown', closer);
        render();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closer), 0);
  }
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (!confirmLeaveIfDirty()) return;
    try { await store.logout(); } catch (err) { toast(err.message || 'Não foi possível sair.', 'error'); return; }
    activeConvId = null; replyTo = null; editingMsg = null; showInfoPanel = false; showUserMenu = false; activeNav = 'home'; profileDraft = null;
    toast('Até logo','info'); navigate('landing');
  });

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      try {
        await store.login(fd.get('identifier'), fd.get('password'));
         activeConvId = null; replyTo = null; editingMsg = null; showInfoPanel = false; showUserMenu = false; showEmojiPicker = false; showStickerPicker = false; profileDraft = null;
        store.applyTheme(store.getCurrentUser()?.theme); toast('Bem-vindo de volta!','success'); navigate('home');
      }
      catch (err) { toast(err.message,'error'); }
    };
    const pw = document.getElementById('login-password');
    const mascot = document.getElementById('login-mascot');
    if (pw && mascot) {

    }
  }

  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(regForm);
      if (fd.get('password')!==fd.get('password2')) { toast('Senhas não conferem','error'); return; }
      try {
        const user = await store.register({ username:fd.get('username'), displayName:fd.get('displayName'), email:fd.get('email'), password:fd.get('password') });
        if (user.pendingEmailConfirmation) { toast('Conta criada! Confirme seu e-mail pelo link enviado antes de entrar.', 'success'); navigate('login'); return; }
        activeConvId = null; replyTo = null; showInfoPanel = false; showUserMenu = false; profileDraft = null;
        toast(`Conta criada! Seu BAT-ID: ${user.batId}`,'success');
        navigate('home');
      } catch (err) { toast(err.message,'error'); }
    };
  }

  const convSearch = document.getElementById('conv-search');
  if (convSearch) {
    convSearch.oninput = () => {
      convSearchQuery = convSearch.value;
      render();
      const el = document.getElementById('conv-search');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }
  document.getElementById('back-to-conv-list')?.addEventListener('click', () => {
    activeConvId = null; render();
  });

   document.querySelectorAll('[data-conv]').forEach(el => { el.onclick = () => { activeConvId=el.dataset.conv; showInfoPanel=false; editingMsg=null; reactionPickerMsgId=null; render(); }; });
  document.querySelectorAll('[data-dm]').forEach(el => {
    el.onclick = () => { activeConvId=store.getOrCreateDm(store.getCurrentUser().id, el.dataset.dm); navigate('messages'); };
  });

  const msgInput = document.getElementById('msg-input');
  const btnSend = document.getElementById('btn-send');
  if (msgInput && btnSend && activeConvId) {
    const send = () => {
      const text = msgInput.value.trim();
      if (!text) return;
      if (editingMsg) {
        store.editMessage(activeConvId, editingMsg.id, text);
        editingMsg = null;
        toast('Mensagem editada', 'info');
      } else {
        store.sendMessage(activeConvId, text, 'text', { replyTo: replyTo?.id||null });
      }
      replyTo = null; msgInput.value = ''; msgInput.style.height = 'auto';
      showEmojiPicker = false; showStickerPicker = false; render();
    };
    btnSend.onclick = send;
    msgInput.onkeydown = (e) => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); send(); } };
    msgInput.oninput = () => { store.setDraft(activeConvId, msgInput.value); msgInput.style.height='auto'; msgInput.style.height=Math.min(msgInput.scrollHeight,120)+'px'; };
  }

  document.getElementById('btn-emoji')?.addEventListener('click', () => { showEmojiPicker=!showEmojiPicker; showStickerPicker=false; render(); });
  document.getElementById('btn-sticker')?.addEventListener('click', () => { showStickerPicker=!showStickerPicker; showEmojiPicker=false; render(); });
  document.querySelectorAll('[data-emoji-insert]').forEach(el => {
    el.onclick = () => {
      const input=document.getElementById('msg-input');
      if(input){ input.value+=el.dataset.emojiInsert; if(activeConvId) store.setDraft(activeConvId, input.value); input.focus(); }
      showEmojiPicker=false; render();
    };
  });
  document.querySelectorAll('[data-sticker]').forEach(el => {
    el.onclick = () => { if(activeConvId){ store.sendMessage(activeConvId, el.dataset.sticker, 'sticker', { replyTo: replyTo?.id||null }); replyTo=null; showStickerPicker=false; render(); } };
  });
  // custom image stickers
  document.querySelectorAll('[data-sticker-id]').forEach(el => {
    el.onclick = () => {
      if (!activeConvId) return;
      const sid = el.dataset.stickerId;
      const user = store.getCurrentUser();
      const s = store.getUserStickers(user.id).find(x => x.id === sid);
      if (!s) return;
      store.sendMessage(activeConvId, s.image, 'sticker', { replyTo: replyTo?.id||null, isImageDataUrl: true });
      replyTo = null; showStickerPicker = false; render();
    };
  });
  // custom sticker panel tabs
  document.querySelectorAll('.picker-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      const panel = btn.dataset.tab;
      document.querySelectorAll('.picker-tabs .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.sticker-panel').forEach(p => p.style.display = (p.dataset.panel === panel) ? 'block' : 'none');
    };
  });

  document.getElementById('btn-attach')?.addEventListener('click', () => document.getElementById('file-input')?.click());

  document.getElementById('file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConvId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('Arquivo muito grande (máx. 8 MB)', 'warning');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    if (file.type.startsWith('image/')) {
      // Envio direto — sem editor de corte
      store.sendMessage(activeConvId, dataUrl, 'image', {
        fileName: file.name,
        fileSize: file.size,
        replyTo: replyTo?.id || null,
      });
      replyTo = null;
      toast('Imagem enviada', 'success');
      render();
    } else {
      store.sendMessage(activeConvId, dataUrl, 'file', {
        fileName: file.name,
        fileSize: file.size,
        replyTo: replyTo?.id || null,
      });
      replyTo = null;
      toast('Arquivo enviado', 'success');
      render();
    }
  });

  document.getElementById('btn-mic')?.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Áudio não suportado','warning'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      let cancelled = false;
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t=>t.stop());
        if (cancelled) { recording=false; render(); return; }
        const blob = new Blob(audioChunks, { type:'audio/webm' });
        const dataUrl = await fileToDataUrl(blob);
        const duration = Math.round((Date.now()-recordingStart)/1000);
        store.sendMessage(activeConvId, dataUrl, 'audio', { duration:`0:${String(duration).padStart(2,'0')}`, fileSize:blob.size, replyTo: replyTo?.id||null });
        replyTo=null;
        recording=false; toast('Áudio enviado!','success'); render();
      };
      mediaRecorder.start(); recording=true; recordingStart=Date.now(); render();
      document.getElementById('cancel-rec')?.addEventListener('click', () => { cancelled = true; if(mediaRecorder&&recording) mediaRecorder.stop(); });
      const interval = setInterval(() => {
        const el=document.getElementById('rec-time');
        if(!el||!recording){clearInterval(interval);return;}
        const s=Math.round((Date.now()-recordingStart)/1000);
        el.textContent=`0:${String(s).padStart(2,'0')}`;
      },200);
    } catch { toast('Permissão de microfone negada','error'); }
  });
  document.getElementById('stop-rec')?.addEventListener('click', () => { if(mediaRecorder&&recording) mediaRecorder.stop(); });

  document.querySelectorAll('[data-action="reply"]').forEach(el => {
    el.onclick = () => { replyTo=store.getMessages(activeConvId).find(m=>m.id===el.dataset.msg); render(); document.getElementById('msg-input')?.focus(); };
  });
  document.getElementById('cancel-reply')?.addEventListener('click', () => { replyTo=null; render(); });
   document.querySelectorAll('[data-action="react"]').forEach(el => {
     el.onclick = (e) => {
       e.stopPropagation();
       reactionPickerMsgId = (reactionPickerMsgId === el.dataset.msg) ? null : el.dataset.msg;
       render();
     };
   });
  document.querySelectorAll('[data-react]').forEach(el => { el.onclick = () => { store.addReaction(activeConvId, el.dataset.react, el.dataset.emoji); render(); }; });
   document.querySelectorAll('[data-action="delete"]').forEach(el => {
     el.onclick = () => { if(confirm('Excluir mensagem?')){ store.deleteMessage(activeConvId, el.dataset.msg); render(); } };
   });
   document.querySelectorAll('[data-action="edit"]').forEach(el => {
     el.onclick = () => {
       const msgs = store.getMessages(activeConvId);
       const msg = msgs.find(m => m.id === el.dataset.msg);
       if (msg) { editingMsg = msg; render(); const inp = document.getElementById('msg-input'); if(inp){ inp.value = msg.content; inp.focus(); } }
     };
   });
   document.getElementById('cancel-edit')?.addEventListener('click', () => { editingMsg = null; render(); });
   // Fullscreen viewer for sent images, banners, stickers and files
   document.querySelectorAll('[data-view-img]').forEach(el => {
     el.onclick = (e) => {
       e.stopPropagation();
       const msg = store.getMessages(activeConvId).find(m => m.id === el.dataset.viewImg);
       if (!msg) return;
       openLightbox({ src: msg.content, fileName: msg.fileName, isImage: true });
     };
   });
   document.querySelectorAll('[data-view-file]').forEach(el => {
     el.onclick = (e) => {
       e.stopPropagation();
       const msg = store.getMessages(activeConvId).find(m => m.id === el.dataset.viewFile);
       if (!msg) return;
       const isPdf = typeof msg.content === 'string' && msg.content.startsWith('data:application/pdf');
       openLightbox({ src: msg.content, fileName: msg.fileName, isImage: false, isPdf });
     };
   });
   document.querySelectorAll('[data-react-emoji]').forEach(el => {
     el.onclick = (e) => {
       e.stopPropagation();
       if (!activeConvId) return;
       store.addReaction(activeConvId, el.dataset.rpmsg, el.dataset.reactEmoji);
       reactionPickerMsgId = null; render();
     };
   });
   const msgArea = document.getElementById('messages-area');
   if (msgArea) msgArea.addEventListener('click', (e) => {
     if (reactionPickerMsgId && !e.target.closest('.reaction-picker') && !e.target.closest('[data-action="react"]')) {
       reactionPickerMsgId = null; render();
     }
   });

  document.getElementById('toggle-info')?.addEventListener('click', () => { showInfoPanel=!showInfoPanel; render(); });

  document.getElementById('btn-group-settings')?.addEventListener('click', () => {
    const conv = store.getState().conversations[activeConvId];
    if (!conv || conv.type !== 'group') return;
    const g = store.getGroup(conv.groupId);
    if (!g) return;
    openModal('Configurações do grupo', `
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Nome</label>
        <input class="input" id="g-edit-name" value="${escapeHtml(g.name)}" maxlength="40"/>
      </div>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Descrição</label>
        <textarea class="textarea" id="g-edit-description" maxlength="500" placeholder="Sobre o grupo...">${escapeHtml(g.description || '')}</textarea>
      </div>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Foto do grupo</label>
        <div style="display:flex;align-items:center;gap:12px">
          <div id="g-icon-preview-wrap" style="width:64px;height:64px;flex:0 0 64px;border-radius:10px;overflow:hidden;background:${g.color||'var(--accent)'};display:flex;align-items:center;justify-content:center">
            ${g.icon ? `<img id="g-icon-preview" src="${g.icon}" alt="Prévia da foto do grupo" style="width:100%;height:100%;object-fit:cover"/>` : `<span id="g-icon-placeholder">${icon('hash',22)}</span><img id="g-icon-preview" src="" alt="Prévia da foto do grupo" style="display:none;width:100%;height:100%;object-fit:cover"/>`}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="g-edit-icon-btn">Escolher imagem</button>
          <input type="file" id="g-edit-icon" accept="image/*" hidden />
        </div>
        <small style="color:var(--text-muted)">A prévia aparece aqui. Clique em Salvar para guardar a imagem.</small>
      </div>
      ${String(g.ownerId) === String(store.getCurrentUser()?.id) ? `<div class="input-group" style="margin-top:16px"><label class="input-label">Adicionar membro pelo BAT-ID</label><div style="display:flex;gap:8px"><input class="input" id="g-add-member-batid" placeholder="BAT-XXXX-XXX" style="text-transform:uppercase"/><button type="button" class="btn btn-secondary" id="g-add-member-btn">Adicionar</button></div><small style="color:var(--text-muted)">A pessoa precisa ter uma conta no BATPAPO.</small></div>` : ''}
    `, `${String(g.ownerId) === String(store.getCurrentUser()?.id) ? '<button class="btn btn-danger" id="g-delete-btn">Excluir grupo</button>' : ''}<button class="btn btn-secondary" data-close-modal>Cancelar</button><button class="btn btn-primary" id="g-edit-save">Salvar</button>`);

    let pendingIcon = g.icon;
    document.getElementById('g-edit-icon-btn')?.addEventListener('click', () => document.getElementById('g-edit-icon')?.click());
    document.getElementById('g-edit-icon')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'warning'); return; }
      const dataUrl = await fileToDataUrl(file);
      openCropper({
        imageSrc: dataUrl, aspectRatio: 'square', title: 'Foto do grupo',
        onComplete: (cropped) => {
          pendingIcon = cropped;
          const preview = document.getElementById('g-icon-preview');
          const placeholder = document.getElementById('g-icon-placeholder');
          if (preview) { preview.src = cropped; preview.style.display = 'block'; }
          if (placeholder) placeholder.style.display = 'none';
          toast('Prévia atualizada. Clique em Salvar para guardar a imagem.', 'info');
        }
      });
    });
    document.getElementById('g-add-member-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('g-add-member-batid');
      const batId = input?.value?.trim();
      if (!batId) { toast('Digite o BAT-ID da pessoa.', 'warning'); return; }
      const btn = document.getElementById('g-add-member-btn'); btn.disabled = true; btn.textContent = 'Adicionando...';
      try {
        const added = await store.addGroupMember(g.id, batId);
        toast(`${added.displayName} entrou no grupo.`, 'success'); closeModal(); render();
      } catch (err) { toast(err.message || 'Não foi possível adicionar a pessoa.', 'error'); btn.disabled = false; btn.textContent = 'Adicionar'; }
    });
    document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
    document.getElementById('g-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`Excluir o grupo \"${g.name}\" permanentemente? As mensagens e os dados da conversa também serão apagados.`)) return;
      const btn = document.getElementById('g-delete-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }
      try {
        await store.deleteGroup(g.id);
        activeConvId = null;
        try { sessionStorage.removeItem('batpapo:pending-conversation'); } catch (_) {}
        toast('Grupo excluído.', 'success'); closeModal(); navigate('messages'); render();
      } catch (err) { toast(err.message || 'Não foi possível excluir o grupo.', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Excluir grupo'; } }
    });
    document.getElementById('g-edit-save')?.addEventListener('click', async () => {
      const name = document.getElementById('g-edit-name')?.value?.trim();
      const description = document.getElementById('g-edit-description')?.value?.trim() || '';
      try {
        await store.updateGroup(g.id, { name, description, icon: pendingIcon });
        toast('Grupo atualizado', 'success'); closeModal(); render();
      } catch (err) { toast(err.message || 'Não foi possível atualizar o grupo.', 'error'); }
    });
  });


  const addFriend = () => {
    openModal('Adicionar amigo', `<p style="margin-bottom:12px;color:var(--text-secondary);font-size:0.9rem">Digite o BAT-ID do amigo</p>
      <div class="input-group"><input class="input" id="friend-batid" placeholder="BAT-7F29-XQ4" style="text-transform:uppercase;font-family:var(--font-mono)"/></div>`,
      `<button class="btn btn-ghost" id="modal-cancel">Cancelar</button><button class="btn btn-primary" id="modal-confirm-friend">Enviar pedido</button>`);
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-confirm-friend').onclick = () => {
      try { store.sendFriendRequest(document.getElementById('friend-batid').value.trim()); toast('Pedido enviado','success'); closeModal(); render(); }
      catch(err){ toast(err.message,'error'); }
    };
  };
  document.getElementById('btn-add-friend')?.addEventListener('click', addFriend);
  document.getElementById('btn-add-friend-empty')?.addEventListener('click', addFriend);
  document.querySelectorAll('[data-accept]').forEach(el => { el.onclick = () => { store.acceptFriendRequest(el.dataset.accept); toast('Amigo adicionado','success'); render(); }; });
  document.querySelectorAll('[data-decline]').forEach(el => { el.onclick = () => { store.declineFriendRequest(el.dataset.decline); render(); }; });
  document.querySelectorAll('[data-remove-friend]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const friend = store.getUser(el.dataset.removeFriend);
      if (confirm(`Remover ${friend?.displayName||'amigo'} da sua lista de amigos?`)) {
        store.removeFriend(el.dataset.removeFriend);
        toast('Amigo removido', 'info');
        render();
      }
    };
  });

  const createGroup = () => {
    openModal('Criar Grupo', `<div class="input-group"><label class="input-label">Nome do grupo</label><input class="input" id="group-name" placeholder="A Toca dos Amigos"/></div>
      <div class="input-group"><label class="input-label">Descrição</label><textarea class="textarea" id="group-desc" placeholder="Sobre o grupo..."></textarea></div>`,
      `<button class="btn btn-ghost" id="modal-cancel">Cancelar</button><button class="btn btn-primary" id="modal-confirm-group">Criar</button>`);
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-confirm-group').onclick = async () => {
      const name=document.getElementById('group-name').value.trim();
      if(!name){toast('Nome obrigatório','error');return;}
      const btn = document.getElementById('modal-confirm-group');
      btn.disabled = true; btn.textContent = 'Criando...';
      try {
        const group = await store.createGroup({ name, description:document.getElementById('group-desc').value.trim() });
        toast('Grupo criado e salvo na sua conta!', 'success'); closeModal(); render();
        // Abrir diretamente o canal geral recém-criado.
        const conv = Object.values(store.getState().conversations).find(c => c.groupId === group.id);
        if (conv) {
          activeConvId = conv.id;
          try { sessionStorage.setItem('batpapo:pending-conversation', conv.id); } catch (_) {}
          navigate('messages');
        }
      } catch (err) {
        toast(err.message || 'Não foi possível criar o grupo.', 'error');
        btn.disabled = false; btn.textContent = 'Criar';
      }
    };
  };
  document.getElementById('btn-create-group')?.addEventListener('click', createGroup);
  document.getElementById('btn-create-group-messages')?.addEventListener('click', createGroup);
  document.getElementById('btn-create-group-empty')?.addEventListener('click', createGroup);
  document.querySelectorAll('[data-open-group],[data-group]').forEach(el => {
    el.onclick = () => {
      const groupId = el.dataset.openGroup||el.dataset.group;
      const me = store.getCurrentUser();
      const group = store.getState().groups[groupId];
      if (!group || !group.members.includes(me.id)) {
        toast('Você não faz parte deste grupo', 'error');
        return;
      }
      const convId = Object.values(store.getState().conversations).find(c =>
        c.type === 'group' && c.groupId === groupId && c.participants.includes(me.id)
      )?.id;
      if (convId) {
        activeConvId = convId;
        try { sessionStorage.setItem('batpapo:pending-conversation', convId); } catch (_) {}
        navigate('messages');
      }
    };
  });

  // Profile lab — draft only, save on button
  const labDisplay = document.getElementById('lab-display');
  const labBio = document.getElementById('lab-bio');
  const labStatus = document.getElementById('lab-status');
  if (labDisplay) {
    const syncDraftFromInputs = () => {
      const d = getProfileDraft();
      if (!d) return;
      d.displayName = labDisplay.value;
      d.bio = labBio?.value || '';
      d.customStatus = labStatus?.value || '';
    };
    // Live preview for text without full page thrash: update preview DOM only
    const updatePreviewText = () => {
      syncDraftFromInputs();
      const nameEl = document.querySelector('.preview-name');
      const bioEl = document.querySelector('.preview-bio');
      const statusEl = document.querySelector('.preview-status');
      const dirtyEl = document.querySelector('.lab-dirty');
      const saveBtn = document.getElementById('lab-save');
      const resetBtn = document.getElementById('lab-reset');
      if (nameEl) nameEl.textContent = labDisplay.value || 'Seu nome';
      if (bioEl) {
        bioEl.textContent = labBio?.value || 'Nenhuma bio ainda';
        bioEl.classList.toggle('muted', !(labBio?.value));
      }
      if (statusEl) statusEl.textContent = labStatus?.value || '';
      if (saveBtn) saveBtn.disabled = false;
      if (resetBtn) resetBtn.disabled = false;
      if (!document.querySelector('.lab-dirty') && document.querySelector('.lab-header-actions')) {
        const span = document.createElement('span');
        span.className = 'lab-dirty';
        span.textContent = 'Alterações não salvas';
        document.querySelector('.lab-header-actions')?.prepend(span);
      }
    };
    labDisplay.addEventListener('input', updatePreviewText);
    labBio?.addEventListener('input', updatePreviewText);
    labStatus?.addEventListener('input', updatePreviewText);

    const markDirty = () => {
      const saveBtn = document.getElementById('lab-save');
      const resetBtn = document.getElementById('lab-reset');
      if (saveBtn) saveBtn.disabled = false;
      if (resetBtn) resetBtn.disabled = false;
      if (!document.querySelector('.lab-dirty') && document.querySelector('.lab-header-actions')) {
        const span = document.createElement('span');
        span.className = 'lab-dirty';
        span.textContent = 'Alterações não salvas';
        document.querySelector('.lab-header-actions')?.prepend(span);
      }
    };

    const patchFrame = (frameId) => {
      document.querySelectorAll('.frame-option[data-frame]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.frame === frameId);
      });
      const wrap = document.querySelector('.preview-avatar-btn');
      if (!wrap) return;
      const user = store.getCurrentUser();
      const d = getProfileDraft();
      const previewUser = { ...user, ...d, frame: frameId };
      const overlay = wrap.querySelector('.avatar-hover-overlay')?.outerHTML || '';
      wrap.innerHTML = renderAvatar(previewUser, 'xxl', false) + overlay;
    };

    const patchNameColor = (color) => {
      document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === color);
      });
      const nameEl = document.querySelector('.preview-name');
      if (nameEl) nameEl.style.color = color;
    };

    const patchBanner = () => {
      const d = getProfileDraft();
      document.querySelectorAll('.color-swatch[data-banner-color]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.bannerColor === d.bannerColor);
      });
      const banner = document.querySelector('.preview-banner');
      if (!banner) return;
      if (d.banner) {
        let img = banner.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          banner.insertBefore(img, banner.firstChild);
        }
        img.src = d.banner;
        banner.style.background = 'transparent';
      } else {
        const img = banner.querySelector('img');
        if (img) img.remove();
        banner.style.background = d.bannerColor || '';
      }
    };

    document.querySelectorAll('.frame-option[data-frame]').forEach(el => {
      el.onclick = (e) => {
        e.preventDefault();
        const d = getProfileDraft();
        d.frame = el.dataset.frame;
        patchFrame(d.frame);
        markDirty();
      };
    });
    document.querySelectorAll('.color-swatch[data-color]').forEach(el => {
      el.onclick = (e) => {
        e.preventDefault();
        const d = getProfileDraft();
        d.nameColor = el.dataset.color;
        patchNameColor(d.nameColor);
        markDirty();
      };
    });
    document.querySelectorAll('.color-swatch[data-banner-color]').forEach(el => {
      el.onclick = (e) => {
        e.preventDefault();
        const d = getProfileDraft();
        d.bannerColor = el.dataset.bannerColor;
        d.banner = null; // cor sólida só no preview até salvar
        patchBanner();
        markDirty();
      };
    });

    document.getElementById('lab-avatar-btn')?.addEventListener('click', () => {
      document.getElementById('lab-avatar')?.click();
    });
    document.getElementById('lab-avatar')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx. 5 MB)', 'warning'); return; }
      const dataUrl = await fileToDataUrl(file);
            const applyAvatar = (src) => {
        const d = getProfileDraft();
        d.avatar = src;
        patchFrame(d.frame);
        markDirty();
        toast('Preview da foto atualizado — clique em Salvar', 'info');
      };
      if (isAnimatedImage(file)) {
        applyAvatar(dataUrl);
      } else {
        openCropper({
          imageSrc: dataUrl, aspectRatio: 'circle',
          title: 'Recortar foto',
          onComplete: applyAvatar,
        });
      }
    });

    document.getElementById('lab-banner-btn')?.addEventListener('click', (e) => {
      if (e.target.closest('input')) return;
      document.getElementById('lab-banner')?.click();
    });
    document.getElementById('lab-banner')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx. 5 MB)', 'warning'); return; }
      const dataUrl = await fileToDataUrl(file);
      const applyBanner = (src) => {
        const d = getProfileDraft();
        d.banner = src;
        patchBanner();
        markDirty();
        toast('Preview do banner atualizado — clique em Salvar', 'info');
      };
      // Canvas/cropper transforma GIF em imagem estática. Preservar o arquivo original animado.
      if (isAnimatedImage(file)) {
        applyBanner(dataUrl);
      } else {
        openCropper({
          imageSrc: dataUrl, aspectRatio: 'banner',
          title: 'Recortar banner',
          onComplete: applyBanner,
        });
      }
    });

    document.getElementById('lab-save')?.addEventListener('click', async () => {
      const d = getProfileDraft();
      if (!d) return;
      syncDraftFromInputs();
      const saveBtn = document.getElementById('lab-save');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
      try {
        await store.updateProfile({
          displayName: (d.displayName || '').trim() || store.getCurrentUser().displayName,
          bio: d.bio || '',
          customStatus: d.customStatus || '',
          frame: d.frame || 'none',
          nameColor: d.nameColor,
          bannerColor: d.bannerColor,
          avatar: d.avatar,
          banner: d.banner,
        });
        profileDraft = null;
        getProfileDraft();
        toast('Perfil salvo com sucesso!', 'success');
        document.querySelector('.lab-dirty')?.remove();
        const resetBtn = document.getElementById('lab-reset');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Salvar perfil'; }
        if (resetBtn) resetBtn.disabled = true;
        render();
      } catch (error) {
        console.error('[BATPAPO] Erro ao salvar perfil:', error);
        toast(error.message || 'Não foi possível salvar o perfil.', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = 'Salvar perfil'; }
      }
    });

    document.getElementById('lab-reset')?.addEventListener('click', () => {
      profileDraft = null;
      toast('Alterações descartadas', 'info');
      render();
    });
  }

  document.getElementById('copy-batid')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(store.getCurrentUser().batId); toast('BAT-ID copiado','success');
  });

  document.querySelectorAll('[data-notif]').forEach(el => { el.onclick = () => { store.markNotificationRead(el.dataset.notif); render(); }; });
  document.getElementById('clear-notifs')?.addEventListener('click', () => { store.clearNotifications(store.getCurrentUser().id); toast('Notificações limpas','info'); render(); });

  document.querySelectorAll('[data-settings-tab]').forEach(el => { el.onclick = () => { settingsTab=el.dataset.settingsTab; render(); }; });
  document.querySelectorAll('.theme-option[data-theme]').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const theme = el.dataset.theme;
      if (!theme) return;
      store.setTheme(theme);
      document.querySelectorAll('.theme-option[data-theme]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.theme === theme);
      });
      toast(`Tema ${theme} aplicado`, 'success');
    };
  });
  document.getElementById('btn-reset-demo')?.addEventListener('click', () => {
    if(confirm('Isso apaga todos os dados locais e recarrega o demo. Continuar?')){ localStorage.clear(); location.reload(); }
  });

  // ─── Sticker Studio ─────────────────────────────────
  const openStudioCrop = (file) => {
    const name = prompt('Nome do sticker (opcional):', 'Sticker') || 'Sticker';
    fileToDataUrl(file).then(dataUrl => {
      openCropper({
        imageSrc: dataUrl, aspectRatio: 'sticker', maxWidth: 320,
        title: 'Cortar figurinha',
        onComplete: (cropped) => {
          store.addSticker({ name, image: cropped });
          toast('Figurinha criada', 'success');
          render();
        },
      });
    });
  };

  const openStudioEdit = (sticker) => {
    openCropper({
      imageSrc: sticker.image, aspectRatio: 'sticker', maxWidth: 320,
      title: 'Editar figurinha',
      onComplete: (cropped) => {
        store.updateSticker(sticker.id, { image: cropped });
        toast('Sticker atualizado!', 'success');
        render();
      },
    });
  };

  const studioUploadBtn = document.getElementById('studio-upload-btn');
  const studioInput = document.getElementById('studio-input');
  const uploadDrop = document.getElementById('upload-drop');
  const triggerUpload = () => studioInput?.click();
  studioUploadBtn?.addEventListener('click', triggerUpload);
  document.getElementById('studio-empty-btn')?.addEventListener('click', triggerUpload);
  uploadDrop?.addEventListener('click', triggerUpload);

  if (studioInput) {
    studioInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx. 5 MB)', 'warning'); return; }
      openStudioCrop(file);
    });
  }

  if (uploadDrop) {
    uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); uploadDrop.classList.add('dragover'); });
    uploadDrop.addEventListener('dragleave', () => uploadDrop.classList.remove('dragover'));
    uploadDrop.addEventListener('drop', (e) => {
      e.preventDefault(); uploadDrop.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) openStudioCrop(file);
    });
  }

  document.querySelectorAll('[data-del-sticker]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      if (confirm('Excluir este sticker?')) {
        store.deleteSticker(el.dataset.delSticker);
        toast('Figurinha excluída', 'info'); render();
      }
    };
  });
  document.querySelectorAll('[data-edit-sticker]').forEach(el => {
    el.onclick = () => {
      const user = store.getCurrentUser();
      const sticker = store.getUserStickers(user.id).find(s => s.id === el.dataset.editSticker);
      if (sticker) openStudioEdit(sticker);
    };
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.getState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'batpapo-data.json'; a.click();
    toast('Dados exportados!', 'success');
  });
}

function hideBoot() {
  const el = document.getElementById('boot-screen');
  if (el) {
    el.classList.add('hide');
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
  }
}

async function boot() {
  try {
    await store.initStore();
    const user = store.getCurrentUser();
    if (user && user.theme) {
      store.applyTheme(user.theme);
    }
  } catch (err) {
    console.error('[BATPAPO] initStore failed:', err);
    toast(`Falha ao conectar ao Supabase: ${err.message || err}`, 'error');
  }

  // multi-page: sem hash
  window.addEventListener('beforeunload', (e) => {
    if (isProfileDraftDirty()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // Hide boot ASAP after modules loaded, then render
  const start = () => {
    hideBoot();
    try {
      handleRoute();
    } catch (err) {
      console.error('[BATPAPO] render failed:', err);
      document.getElementById('app').innerHTML =
        '<div style="padding:48px;text-align:center;color:#E0AAFF;font-family:Outfit,sans-serif">' +
        '<h1>BATPAPO</h1><p>Erro ao carregar. Abra o console (F12) para detalhes.</p>' +
        '<p style="color:#6B6780;font-size:0.9rem;margin-top:12px">' + (err && err.message ? err.message : String(err)) + '</p>' +
        '<button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#9B5DE5;color:#fff;border:none;border-radius:8px;cursor:pointer">Recarregar</button></div>';
    }
  };

  // Small delay so the boot animation is visible, but don't block forever
  start();
}

boot();
