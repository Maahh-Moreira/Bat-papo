/**
 * Assets centrais — troque os caminhos para mudar o sistema todo.
 *
 * Coloque os arquivos em /assets/ e use caminho RELATIVO (sem / no início):
 *   logo: 'assets/bat.png'
 *   mascot: 'assets/batt.jpg'
 *
 * null = não mostra imagem naquele ponto.
 */
export const ASSETS = {
  logo: 'assets/bat.png',
  mascot: 'assets/bat-mascot.png',
  favicon: 'assets/bat.png',
};

export function assetSlot({ src = null, size = 48, label = '', className = '' } = {}) {
  const s = typeof size === 'number' ? `${size}px` : size;
  if (src) {
    return `<img class="asset-img ${className}" src="${src}" alt="${label || ''}" style="width:${s};height:auto;max-height:${s};object-fit:contain;display:block;background:transparent;border:none" />`;
  }
  return `<span class="asset-slot ${className}" style="width:${s};height:${s}" aria-hidden="true"></span>`;
}

export function logoHtml(size = 32) {
  return assetSlot({ src: ASSETS.logo, size, label: 'BATPAPO', className: 'asset-logo' });
}

export function mascotHtml(size = 64) {
  return assetSlot({ src: ASSETS.mascot, size, label: 'Mascote', className: 'asset-mascot' });
}
