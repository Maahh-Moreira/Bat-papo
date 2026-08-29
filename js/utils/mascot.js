/**
 * Compat layer — ícones/mascote vêm de assets.js (vazios por padrão).
 * Para trocar no sistema todo: edite ASSETS em js/utils/assets.js
 */
import { logoHtml, mascotHtml, ASSETS, assetSlot } from './assets.js';

export { logoHtml, mascotHtml, ASSETS, assetSlot };

/** @deprecated use logoHtml(size) */
export function batLogo(size = 32) {
  return logoHtml(size);
}

/** @deprecated use mascotHtml(size) — expression ignorada de propósito */
export function batSvg(_expression, size = 64) {
  return mascotHtml(size);
}
