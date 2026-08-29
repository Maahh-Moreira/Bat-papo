/**
 * Cropper: quadro fixo no centro, imagem move/zoom por baixo.
 * Stage em pixels explícitos (evita círculo achatado e imagem esticada).
 */

export function openCropper(opts) {
  const {
    imageSrc,
    src,
    aspectRatio = 'square',
    title = 'Cortar imagem',
    onComplete,
    onConfirm,
    onCancel,
  } = opts;

  const source = imageSrc || src;
  const done = onComplete || onConfirm;
  const ratio = resolveRatio(aspectRatio);
  const isCircle = aspectRatio === 'circle';
  const isSticker = aspectRatio === 'sticker';

  closeCropper();

  const overlay = document.createElement('div');
  overlay.id = 'cropper-overlay';
  overlay.className = 'cropper-overlay';
  overlay.innerHTML = `
    <div class="cropper-modal" role="dialog" aria-modal="true">
      <div class="cropper-header">
        <h3 class="cropper-title">${title}</h3>
        <button type="button" class="cropper-close" id="cropper-x" aria-label="Fechar">✕</button>
      </div>
      <div class="cropper-stage-outer" id="cropper-outer">
        <div class="cropper-stage" id="cropper-stage">
          <img id="cropper-img" alt="" draggable="false" />
          <div class="cropper-frame ${isCircle ? 'circle' : ''} ${isSticker ? 'sticker-shape' : ''}"></div>
        </div>
      </div>
      <div class="cropper-controls">
        <div class="cropper-zoom">
          <label>Zoom</label>
          <input type="range" id="cropper-zoom" min="1" max="4" step="0.01" value="1" />
          <span id="cropper-zoom-val">100%</span>
        </div>
        <div class="cropper-actions">
          <button type="button" class="cropper-btn cropper-btn--ghost" id="cropper-cancel">Cancelar</button>
          <button type="button" class="cropper-btn cropper-btn--primary" id="cropper-ok">Cortar</button>
        </div>
      </div>
      <p class="cropper-hint">Arraste a imagem. O quadro fica fixo no centro.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const outer = overlay.querySelector('#cropper-outer');
  const stage = overlay.querySelector('#cropper-stage');
  const img = overlay.querySelector('#cropper-img');
  const zoomEl = overlay.querySelector('#cropper-zoom');
  const zoomVal = overlay.querySelector('#cropper-zoom-val');

  let natural = { w: 0, h: 0 };
  let stageSize = { w: 0, h: 0 };
  let minScale = 1;
  let scale = 1;
  let pos = { x: 0, y: 0 };
  let drag = null;

  function resolveRatio(r) {
    if (r === 'square' || r === 'circle' || r === 'sticker') return 1;
    if (r === 'banner') return 16 / 5;
    if (r === 'free' || r == null) return 1;
    return typeof r === 'number' ? r : 1;
  }

  /** Define largura/altura em px — garante círculo redondo e banner proporcional */
  function layoutStage() {
    const maxW = Math.min(Math.floor(outer.clientWidth) || 400, 420);
    let sw;
    let sh;
    if (ratio >= 1) {
      sw = maxW;
      sh = Math.round(sw / ratio);
    } else {
      sh = Math.min(maxW, 360);
      sw = Math.round(sh * ratio);
    }
    // Forçar número par ajuda anti-alias do círculo
    if (ratio === 1) {
      const side = Math.min(sw, sh);
      sw = side;
      sh = side;
    }
    stageSize = { w: sw, h: sh };
    stage.style.width = sw + 'px';
    stage.style.height = sh + 'px';
    stage.style.aspectRatio = 'unset';
  }

  function fit() {
    layoutStage();
    if (!natural.w || !stageSize.w) return;
    // cover: escala mínima para cobrir o quadro sem esticar
    minScale = Math.max(stageSize.w / natural.w, stageSize.h / natural.h);
    scale = minScale;
    pos = { x: 0, y: 0 };
    zoomEl.value = '1';
    apply();
  }

  function liveScale() {
    return minScale * (Number(zoomEl.value) || 1);
  }

  function clamp() {
    const { w: sw, h: sh } = stageSize;
    const dw = natural.w * scale;
    const dh = natural.h * scale;
    const maxX = Math.max(0, (dw - sw) / 2);
    const maxY = Math.max(0, (dh - sh) / 2);
    pos.x = Math.min(maxX, Math.max(-maxX, pos.x));
    pos.y = Math.min(maxY, Math.max(-maxY, pos.y));
  }

  function apply() {
    scale = liveScale();
    clamp();
    // proporção natural: width e height no mesmo fator
    const dw = natural.w * scale;
    const dh = natural.h * scale;
    img.style.width = dw + 'px';
    img.style.height = dh + 'px';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.objectFit = 'fill';
    img.style.transform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`;
    zoomVal.textContent = Math.round((Number(zoomEl.value) || 1) * 100) + '%';
  }

  img.onload = () => {
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    // espera layout do modal
    requestAnimationFrame(() => fit());
  };
  img.src = source;

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    drag = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pos.x = drag.x + (e.clientX - drag.px);
    pos.y = drag.y + (e.clientY - drag.py);
    apply();
  });
  const endDrag = () => {
    drag = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  zoomEl.addEventListener('input', apply);

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const cur = Number(zoomEl.value) || 1;
      zoomEl.value = String(Math.min(4, Math.max(1, cur + (e.deltaY < 0 ? 0.08 : -0.08))));
      apply();
    },
    { passive: false },
  );

  function exportCrop() {
    const { w: sw, h: sh } = stageSize;
    const outW = ratio >= 1.4 ? 960 : 512;
    const outH = Math.round(outW / ratio);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const dw = natural.w * scale;
    const dh = natural.h * scale;
    const left = (sw - dw) / 2 + pos.x;
    const top = (sh - dh) / 2 + pos.y;
    const sx = ((0 - left) / dw) * natural.w;
    const sy = ((0 - top) / dh) * natural.h;
    const sW = (sw / dw) * natural.w;
    const sH = (sh / dh) * natural.h;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, outW, outH);

    if (isCircle) {
      ctx.beginPath();
      ctx.arc(outW / 2, outH / 2, outW / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    } else if (isSticker) {
      const r = Math.round(outW * 0.12);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(outW, 0, outW, outH, r);
      ctx.arcTo(outW, outH, 0, outH, r);
      ctx.arcTo(0, outH, 0, 0, r);
      ctx.arcTo(0, 0, outW, 0, r);
      ctx.closePath();
      ctx.clip();
    }

    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH);
    return canvas.toDataURL('image/png');
  }

  function finish(ok) {
    const result = ok ? exportCrop() : null;
    closeCropper();
    if (ok && result && typeof done === 'function') done(result);
    if (!ok && typeof onCancel === 'function') onCancel();
  }

  overlay.querySelector('#cropper-ok').onclick = () => finish(true);
  overlay.querySelector('#cropper-cancel').onclick = () => finish(false);
  overlay.querySelector('#cropper-x').onclick = () => finish(false);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish(false);
  });

  const onResize = () => {
    if (natural.w) fit();
  };
  window.addEventListener('resize', onResize);
  overlay._onResize = onResize;
}

export function closeCropper() {
  const el = document.getElementById('cropper-overlay');
  if (el) {
    if (el._onResize) window.removeEventListener('resize', el._onResize);
    el.remove();
  }
}

if (typeof window !== 'undefined') {
  window.openCropper = openCropper;
  window.closeCropper = closeCropper;
}
