/** Cliente Supabase do BATPAPO. A publishable key pode ser usada no navegador; nunca coloque service_role aqui. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://avmafweloxgiydvnysdd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cNu97XPTzJdVtnY7Fut4jQ_7NNnK4kl';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export function profileToUser(profile, email = '') {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    email,
    batId: profile.bat_id,
    avatar: resolvePublicImage(profile.avatar_path),
    banner: resolvePublicImage(profile.banner_path),
    bannerColor: profile.banner_color || '#5A189A',
    frame: profile.profile_frame || 'none',
    nameColor: profile.name_color || '#ECECEF',
    bio: profile.bio || '',
    pronouns: profile.pronouns || '',
    status: 'online',
    customStatus: profile.custom_status || '',
    createdAt: profile.created_at ? new Date(profile.created_at).getTime() : Date.now(),
    theme: 'dark'
  };
}

/** Resolve a public Storage path saved in profiles to its display URL. */
export function resolvePublicImage(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Upload profile pictures/banners to the public avatars bucket. */
export async function uploadProfileImage(dataUrl, userId, kind) {
  if (!dataUrl || !String(dataUrl).startsWith('data:')) return dataUrl;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mime = blob.type || 'image/png';
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime] || 'png';
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: mime, upsert: true, cacheControl: '3600'
  });
  if (error) throw new Error(`Não foi possível enviar ${kind === 'avatar' ? 'a foto de perfil' : 'o banner'}: ${error.message}`);
  return path;
}


/** Envia a imagem de um grupo para o Storage, dentro da pasta do proprietário. */
export async function uploadGroupImage(dataUrl, userId, groupId) {
  if (!dataUrl || !String(dataUrl).startsWith('data:')) return dataUrl;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mime = blob.type || 'image/png';
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime] || 'png';
  const path = `${userId}/group-${groupId}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: mime, upsert: true, cacheControl: '3600'
  });
  if (error) throw new Error(`Não foi possível enviar a imagem do grupo: ${error.message}`);
  return path;
}
