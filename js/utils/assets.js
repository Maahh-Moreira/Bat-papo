/**
 * Assets centrais — troque os caminhos abaixo para mudar o sistema todo.
 * Deixe null / string vazia para placeholder vazio (sem desenho gerado).
 *
 * Coloque seus arquivos em /assets/ e aponte os caminhos aqui.
 */
export const ASSETS = {
  /** Logo pequeno (sidebar, auth) — ex: '/assets/logo.png' */
  logo: null,
  /** Mascote grande (landing, empty states) — ex: '/assets/mascot.png' */
  mascot: null,
  /** Favicon já em /assets/icons/favicon.svg */
  favicon: '/assets/icons/favicon.svg',
};

/** Placeholder vazio: só um bloco neutro, sem círculo decorativo */
export function assetSlot({ src = null, size = 48, label = '', className = '' } = {}) {
  const s = typeof size === 'number' ? `${size}px` : size;
  if (src) {
    return `<img class="asset-img ${className}" src="${src}" alt="${label || ''}" style="width:${s};height:${s};object-fit:contain;display:block;background:transparent" />`;
  }
  return `<span class="asset-slot ${className}" style="width:${s};height:${s}" aria-hidden="true"></span>`;
}

export function logoHtml(size = 32) {
  return assetSlot({ src: ASSETS.logo, size, label: 'BATPAPO', className: 'asset-logo' });
}

export function mascotHtml(size = 64) {
  return assetSlot({ src: ASSETS.mascot, size, label: 'Mascote', className: 'asset-mascot' });
}
