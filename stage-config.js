const STAGE_LAYOUTS = new Set(['stacked', 'side']);
const STAGE_ALIGNS = new Set(['left', 'center', 'right']);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeStageSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return {
    showClock: s.stageShowClock !== false,
    showCounter: s.stageShowCounter !== false,
    showSongTitle: s.stageShowSongTitle !== false,
    showGroup: s.stageShowGroup !== false,
    showReference: s.stageShowReference !== false,
    showNext: s.stageShowNext !== false,
    showProgress: s.stageShowProgress !== false,
    fontScale: clamp(Number(s.stageFontScale) || 100, 70, 150) / 100,
    nextFontScale: clamp(Number(s.stageNextFontScale) || 85, 50, 120) / 100,
    layout: STAGE_LAYOUTS.has(s.stageLayout) ? s.stageLayout : 'stacked',
    textAlign: STAGE_ALIGNS.has(s.stageTextAlign) ? s.stageTextAlign : 'center',
    bgColor: String(s.stageBgColor || '#0a0a0f').trim(),
    currentColor: String(s.stageCurrentTextColor || '#eef0f4').trim(),
    nextColor: String(s.stageNextTextColor || '#cbd5e1').trim(),
    songTitleColor: String(s.stageSongTitleColor || '#93c5fd').trim(),
    groupColor: String(s.stageGroupColor || '#a78bfa').trim(),
    refColor: String(s.stageRefTextColor || '#94a3b8').trim(),
    safeMargin: clamp(Number(s.stageSafeMargin) || 20, 8, 48),
  };
}

/** Fields merged into stage:update payloads from settings. */
function buildUpdatePayload(settings) {
  const c = normalizeStageSettings(settings);
  return {
    showClock: c.showClock,
    showCounter: c.showCounter,
    showSongTitle: c.showSongTitle,
    showGroup: c.showGroup,
    showReference: c.showReference,
    showNext: c.showNext,
    showProgress: c.showProgress,
    fontScale: Math.round(c.fontScale * 100),
    nextFontScale: Math.round(c.nextFontScale * 100),
    layout: c.layout,
    textAlign: c.textAlign,
    bgColor: c.bgColor,
    currentColor: c.currentColor,
    nextColor: c.nextColor,
    songTitleColor: c.songTitleColor,
    groupColor: c.groupColor,
    refColor: c.refColor,
    safeMargin: c.safeMargin,
  };
}

function resolveDisplayRoot(scope, rootEl) {
  if (rootEl?.classList?.contains('stage-display-root')) return rootEl;
  return scope.querySelector('.stage-display-root') || rootEl || scope;
}

function applyStageConfig(doc, config, opts = {}) {
  const root = doc.documentElement;
  const target = opts.rootEl || doc.body;
  if (!root || !target) return;

  const c = config && typeof config === 'object' ? config : {};
  const scope = opts.rootEl || target;
  const displayRoot = resolveDisplayRoot(scope, opts.rootEl);
  const varScope = displayRoot || scope;
  varScope.style.setProperty('--stage-font-scale', String((Number(c.fontScale) || 100) / 100));
  varScope.style.setProperty('--stage-next-font-scale', String((Number(c.nextFontScale) || 85) / 100));
  varScope.style.setProperty('--stage-bg', c.bgColor || '#0a0a0f');
  varScope.style.setProperty('--stage-current-color', c.currentColor || '#eef0f4');
  varScope.style.setProperty('--stage-next-color', c.nextColor || '#cbd5e1');
  varScope.style.setProperty('--stage-song-color', c.songTitleColor || '#93c5fd');
  varScope.style.setProperty('--stage-group-color', c.groupColor || '#a78bfa');
  varScope.style.setProperty('--stage-ref-color', c.refColor || '#94a3b8');
  varScope.style.setProperty('--stage-safe-margin', `${Number(c.safeMargin) || 20}px`);
  varScope.style.setProperty('--stage-text-align', c.textAlign || 'center');

  displayRoot.classList.toggle('layout-side', c.layout === 'side');
  displayRoot.classList.toggle('layout-stacked', c.layout !== 'side');
  if (displayRoot) {
    displayRoot.style.background = c.bgColor || '#0a0a0f';
  }

  const toggles = [
    ['stageClock', c.showClock !== false],
    ['stageCounter', c.showCounter !== false],
    ['stageSong', c.showSongTitle !== false],
    ['stageProgressWrap', c.showProgress !== false],
    ['stageNextSection', c.showNext !== false],
  ];
  if (opts.elementIds && typeof opts.elementIds === 'object') {
    Object.entries(opts.elementIds).forEach(([from, to]) => {
      const idx = toggles.findIndex(([id]) => id === from);
      if (idx >= 0) toggles[idx][0] = to;
    });
  }
  toggles.forEach(([id, visible]) => {
    const el = doc.getElementById(id);
    if (el) el.hidden = !visible;
  });

  const queryScope = displayRoot || scope;
  queryScope.querySelectorAll('.stage-body-text, .stage-ref-text').forEach((el) => {
    el.style.textAlign = c.textAlign || 'center';
  });

  queryScope.querySelectorAll('.stage-group').forEach((el) => {
    el.hidden = c.showGroup === false;
  });
  queryScope.querySelectorAll('.stage-ref-text').forEach((el) => {
    el.hidden = c.showReference === false;
  });

  const mainArea = queryScope.querySelector('.stage-main-area');
  if (mainArea) mainArea.classList.toggle('is-next-hidden', c.showNext === false);
}

module.exports = {
  STAGE_LAYOUTS,
  STAGE_ALIGNS,
  normalizeStageSettings,
  buildUpdatePayload,
  applyStageConfig,
};
