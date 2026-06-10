/**
 * ProPresenter-style master theme template helpers.
 * Shared by controller (index.html), main process, and theme-store.
 */
const SlideEngine = require('./slide-engine');

const PREVIEW_TEXT = {
  ko: '가사 미리보기\nSubtitle preview',
  en: 'Lyrics preview\nSubtitle preview',
};

const MACRO_LAYOUT_HIDDEN_PATTERNS = [
  ['intro'],
  ['outro', 'ending'],
];

function isBlankSlide(slide) {
  return !SlideEngine.getPrimaryText(slide).trim();
}

function isMacroLayoutHiddenSlide(slide) {
  const normalized = SlideEngine.normalizeSlide(slide);
  if (isBlankSlide(normalized)) return true;
  const g = SlideEngine.normalizeGroup(normalized.group).toLowerCase();
  if (!g) return isBlankSlide(normalized);
  return MACRO_LAYOUT_HIDDEN_PATTERNS.some((patterns) =>
    patterns.some((p) => g === p || g.startsWith(`${p} `) || g.includes(p))
  );
}

function createDraftSlideFromTheme(theme, lang = 'ko') {
  const tpl = SlideEngine.normalizeThemeTextLayer(theme?.textLayer || null);
  const text = PREVIEW_TEXT[lang] || PREVIEW_TEXT.ko;
  const layer = SlideEngine.createTextLayer(text, {
    x: tpl.x,
    y: tpl.y,
    w: tpl.w,
    h: tpl.h,
    style: JSON.parse(JSON.stringify(tpl.style)),
  });
  const layers = [];
  SlideEngine.normalizeThemeShapeLayers(theme?.shapeLayers || []).forEach((tpl) => {
    layers.push(SlideEngine.createShapeLayerFromTemplate(tpl));
  });
  layers.push(layer);
  const slide = SlideEngine.normalizeSlide({
    background: theme?.background !== undefined
      ? SlideEngine.normalizeBackground(theme.background)
      : { type: 'color', color: '#000000' },
    layers,
  });
  return slide;
}

function recordFromSlide(slide) {
  return SlideEngine.extractThemeFromSlide(slide);
}

function normalizeThemePayload(raw) {
  const source = raw || {};
  const shapeLayers = Object.prototype.hasOwnProperty.call(source, 'shapeLayers')
    ? source.shapeLayers
    : [];
  const norm = SlideEngine.normalizeTheme({
    ...source,
    shapeLayers,
  });
  const out = {
    textLayer: norm.textLayer,
    shapeLayers: norm.shapeLayers || [],
  };
  if (norm.background !== undefined) out.background = norm.background;
  return out;
}

function buildThemeUpsertPayload({ id, name, slide, textLayer, background, shapeLayers }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  let snap;
  if (slide) {
    snap = recordFromSlide(SlideEngine.normalizeSlide(slide));
  } else {
    snap = {
      textLayer: SlideEngine.normalizeThemeTextLayer(textLayer || null),
      background: background !== undefined ? SlideEngine.normalizeBackground(background) : undefined,
      shapeLayers: SlideEngine.normalizeThemeShapeLayers(shapeLayers || []),
    };
  }
  const out = { id, name: trimmed, textLayer: snap.textLayer };
  if (snap.background !== undefined) out.background = snap.background;
  if (slide || shapeLayers !== undefined) out.shapeLayers = snap.shapeLayers || [];
  return out;
}

module.exports = {
  PREVIEW_TEXT,
  MACRO_LAYOUT_HIDDEN_PATTERNS,
  isBlankSlide,
  isMacroLayoutHiddenSlide,
  createDraftSlideFromTheme,
  recordFromSlide,
  normalizeThemePayload,
  buildThemeUpsertPayload,
};
