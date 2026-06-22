const AppSettings = require('./app-settings');
const SlideEngine = require('./slide-engine');

function measureViewportSize(viewport) {
  if (!viewport) return { cw: 0, ch: 0 };
  let node = viewport;
  for (let i = 0; i < 8 && node; i++) {
    const cw = node.clientWidth;
    const ch = node.clientHeight;
    if (cw > 0 && ch > 0) return { cw, ch };
    const rect = node.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { cw: rect.width, ch: rect.height };
    }
    node = node.parentElement;
  }
  return { cw: 0, ch: 0 };
}

function layoutScaledStageIn(viewport, stageEl, appSettings) {
  const dims = SlideEngine.getStageDimensions(appSettings);
  const { cw, ch } = measureViewportSize(viewport);
  if (!cw || !ch) return 0;
  const scale = SlideEngine.computeViewportFitScale(
    cw, ch, dims.width, dims.height, { autoFit: true, userScalePct: 100 },
  );
  const scaledW = dims.width * scale;
  const scaledH = dims.height * scale;
  stageEl.style.width = `${dims.width}px`;
  stageEl.style.height = `${dims.height}px`;
  stageEl.style.position = 'absolute';
  stageEl.style.left = `${(cw - scaledW) / 2}px`;
  stageEl.style.top = `${(ch - scaledH) / 2}px`;
  stageEl.style.transform = `scale(${scale})`;
  stageEl.style.transformOrigin = 'top left';
  viewport._layout = {
    scale,
    offsetX: (cw - scaledW) / 2,
    offsetY: (ch - scaledH) / 2,
    scaledW,
    scaledH,
  };
  return scale;
}

function getSlideRenderOptions(appSettings, extra = {}) {
  const dims = SlideEngine.getStageDimensions(appSettings);
  return {
    fontUnit: 'px',
    refHeight: dims.height,
    scale: 1,
    ...extra,
  };
}

function renderScaledStage(hostEl, slide, appSettings, options = {}) {
  if (!hostEl) return null;
  hostEl.innerHTML = '';
  if (!slide) {
    hostEl.style.background = options.emptyBg || '#111';
    return null;
  }
  const viewport = document.createElement('div');
  viewport.className = options.viewportClass || 'scaled-stage-viewport';
  const stage = document.createElement('div');
  stage.className = options.stageClass || 'scaled-stage';
  viewport.appendChild(stage);
  hostEl.appendChild(viewport);
  hostEl.style.position = hostEl.style.position || 'relative';
  hostEl.style.overflow = 'hidden';
  const dims = SlideEngine.getStageDimensions(appSettings);
  viewport.classList.add('is-scale-pending');
  SlideEngine.renderSlide(slide, stage, getSlideRenderOptions(appSettings, {
    clear: true,
    scale: 1,
    refHeight: dims.height,
    interactive: options.interactive,
    selectedLayerId: options.selectedLayerId,
    textMode: options.textMode,
    ...options.render,
  }));
  const reveal = () => {
    viewport.classList.remove('is-scale-pending');
  };
  const relayout = (attempt = 0) => {
    const ok = layoutScaledStageIn(viewport, stage, appSettings);
    if (!ok && attempt < 12) {
      requestAnimationFrame(() => relayout(attempt + 1));
      return;
    }
    if (ok) {
      reveal();
      if (options.onLayout) options.onLayout(stage, viewport);
    }
  };
  if (!layoutScaledStageIn(viewport, stage, appSettings)) {
    requestAnimationFrame(() => relayout(0));
  } else {
    reveal();
    if (options.onLayout) options.onLayout(stage, viewport);
  }
  return { viewport, stage, relayout: () => relayout(0) };
}

function getCanvasStageLayout(hostEl) {
  const viewport = hostEl?.querySelector('.scaled-stage-viewport');
  const layout = viewport?._layout;
  const vRect = viewport?.getBoundingClientRect() || hostEl?.getBoundingClientRect();
  if (layout && viewport) {
    return {
      rect: vRect,
      ...layout,
      viewport,
      stage: hostEl.querySelector('.scaled-stage'),
    };
  }
  const rect = hostEl?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
  return {
    rect,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    scaledW: rect.width,
    scaledH: rect.height,
    viewport: hostEl,
    stage: hostEl,
  };
}

function getCanvasHitRect(hostEl) {
  const L = getCanvasStageLayout(hostEl);
  return {
    left: L.rect.left + (L.offsetX || 0),
    top: L.rect.top + (L.offsetY || 0),
    width: L.scaledW,
    height: L.scaledH,
  };
}

function clientToCanvasPct(hostEl, clientX, clientY) {
  const L = getCanvasStageLayout(hostEl);
  const localX = clientX - L.rect.left - (L.offsetX || 0);
  const localY = clientY - L.rect.top - (L.offsetY || 0);
  if (!L.scaledW || !L.scaledH) return null;
  return {
    xPct: (localX / L.scaledW) * 100,
    yPct: (localY / L.scaledH) * 100,
  };
}

function syncLayerElementBounds(layerEl, layer) {
  if (!layerEl || !layer) return;
  layerEl.style.left = `${layer.x}%`;
  layerEl.style.top = `${layer.y}%`;
  layerEl.style.width = `${layer.w}%`;
  layerEl.style.height = `${layer.h}%`;
}

const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function attachLayerResizeHandles(layerEl, layer, onResizeStart) {
  layerEl.querySelectorAll('.layer-resize-handle').forEach((h) => h.remove());
  RESIZE_HANDLES.forEach((dir) => {
    const handle = document.createElement('div');
    handle.className = `layer-resize-handle ${dir}`;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onResizeStart(e, dir);
    });
    layerEl.appendChild(handle);
  });
}

module.exports = {
  RESIZE_HANDLES,
  measureViewportSize,
  layoutScaledStageIn,
  getSlideRenderOptions,
  renderScaledStage,
  getCanvasStageLayout,
  getCanvasHitRect,
  clientToCanvasPct,
  syncLayerElementBounds,
  attachLayerResizeHandles,
};
