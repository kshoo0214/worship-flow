/** @typedef {{ type:'color', color:string } | { type:'image', file:string } | { type:'image', src:string }} SlideBackground */

const STAGE_REF_WIDTH = 1920;
const STAGE_REF_HEIGHT = 1080;
const STAGE_ASPECT_W = 16;
const STAGE_ASPECT_H = 9;
const STAGE_ASPECT_RATIO = STAGE_ASPECT_W / STAGE_ASPECT_H;

function normalizeStageDimensions(width, height) {
  let w = clampNum(Math.round(Number(width) || STAGE_REF_WIDTH), 320, 7680);
  let h = clampNum(Math.round(w * STAGE_ASPECT_H / STAGE_ASPECT_W), 180, 4320);
  w = clampNum(Math.round(h * STAGE_ASPECT_W / STAGE_ASPECT_H), 320, 7680);
  return { width: w, height: h };
}

/** @param {{ outputWidth?: number, outputHeight?: number } | null | undefined} settings */
function getStageDimensions(settings) {
  if (!settings || typeof settings !== 'object') {
    return { width: STAGE_REF_WIDTH, height: STAGE_REF_HEIGHT };
  }
  return normalizeStageDimensions(settings.outputWidth, settings.outputHeight);
}

function getStageAspectRatio(settings) {
  const { width, height } = getStageDimensions(settings);
  return width / height;
}

function computeViewportFitScale(viewportW, viewportH, stageW, stageH, options = {}) {
  const autoFit = options.autoFit !== false;
  const userScale = (Number(options.userScalePct) || 100) / 100;
  let fitScale = 1;
  if (autoFit && viewportW > 0 && viewportH > 0 && stageW > 0 && stageH > 0) {
    fitScale = Math.min(viewportW / stageW, viewportH / stageH);
  }
  const scale = fitScale * userScale;
  return Math.round(scale * 1e6) / 1e6;
}

/** ProPresenter-style group labels for live slide context menu. */
const LIVE_GROUP_PRESETS = [
  'Intro', 'Verse', 'Verse 1', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro', 'Tag', 'Blank',
];

const GROUP_OPTIONS = [
  '',
  'Intro',
  'Verse',
  'Verse 1',
  'Verse 2',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Outro',
  'Tag',
  'Ending',
];

const GROUP_TAG_COLORS = {
  intro: '#6e6e80',
  verse: '#3d7ee8',
  'pre-chorus': '#e8a838',
  chorus: '#e85d5d',
  bridge: '#9b59b6',
  outro: '#6e6e80',
  tag: '#3dd68c',
  ending: '#6e6e80',
  default: '#4a4a58',
};

/** ProPresenter-style group jump keys (letter → group name patterns) */
const GROUP_HOTKEYS = [
  { key: 'KeyI', label: 'I', patterns: ['intro'] },
  { key: 'KeyC', label: 'C', patterns: ['chorus'] },
  { key: 'KeyB', label: 'B', patterns: ['bridge'] },
  { key: 'KeyP', label: 'P', patterns: ['pre-chorus', 'prechorus', 'pre chorus'] },
  { key: 'KeyO', label: 'O', patterns: ['outro', 'ending'] },
  { key: 'KeyE', label: 'E', patterns: ['ending', 'outro'] },
  { key: 'KeyT', label: 'T', patterns: ['tag'] },
  { key: 'KeyA', label: 'A', patterns: ['verse 1', 'verse1', 'verse'] },
  { key: 'KeyS', label: 'S', patterns: ['verse 2', 'verse2'] },
  { key: 'KeyD', label: 'D', patterns: ['verse 3', 'verse3', 'verse 4', 'verse4'] },
  { key: 'KeyV', label: 'V', patterns: ['verse'] },
];

function groupMatchesPatterns(group, patterns) {
  const g = normalizeGroup(group).toLowerCase();
  if (!g) return false;
  return patterns.some((p) => {
    const pl = p.toLowerCase();
    return g === pl || g.startsWith(`${pl} `) || g.includes(pl);
  });
}

function findSlideIndexByGroupKey(slides, keyCode) {
  if (!Array.isArray(slides) || !keyCode) return -1;
  const entry = GROUP_HOTKEYS.find((h) => h.key === keyCode);
  if (!entry) return -1;
  for (let i = 0; i < slides.length; i++) {
    if (groupMatchesPatterns(slides[i].group, entry.patterns)) return i;
  }
  return -1;
}

function getGroupHotkeyForSlide(slide) {
  const g = normalizeGroup(slide?.group).toLowerCase();
  if (!g) return '';
  for (const h of GROUP_HOTKEYS) {
    if (groupMatchesPatterns(slide.group, h.patterns)) return h.label;
  }
  return '';
}

function listGroupHotkeys() {
  return GROUP_HOTKEYS.map((h) => ({ ...h }));
}

function uid() {
  return `ly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const TEXT_ROLES = ['body', 'reference'];

const THEME_STYLE_KEYS = [
  'fontFamily', 'fontSize', 'color', 'textAlign', 'verticalAlign',
  'fontWeight', 'lineHeight', 'fontStyle', 'textDecoration', 'letterSpacing', 'opacity',
  'strokeWidth', 'strokeColor', 'shadowX', 'shadowY', 'shadowBlur', 'shadowColor',
  'boxFillEnabled', 'boxFillColor', 'boxFillOpacity', 'boxRadius',
];

function normalizeTextRole(role) {
  return TEXT_ROLES.includes(role) ? role : '';
}

function colorWithAlpha(color, alpha) {
  const a = clampNum(Number(alpha ?? 1), 0, 1);
  const raw = String(color || '#000000').trim();
  if (raw.startsWith('rgba')) return raw;
  if (raw.startsWith('rgb(')) {
    const nums = raw.match(/[\d.]+/g);
    if (nums?.length >= 3) return `rgba(${nums[0]},${nums[1]},${nums[2]},${a})`;
  }
  const hex = raw.replace('#', '');
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(0,0,0,${a})`;
}

function defaultTextStyle() {
  return {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    fontSize: 5.2,
    color: '#ffffff',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontWeight: '700',
    lineHeight: 1,
    fontStyle: 'normal',
    textDecoration: 'none',
    letterSpacing: 1,
    opacity: 1,
    strokeWidth: 2,
    strokeColor: '#000000',
    strokeEnabled: true,
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 14,
    shadowColor: 'rgba(0,0,0,0.85)',
    shadowEnabled: true,
    boxFillEnabled: false,
    boxFillColor: '#000000',
    boxFillOpacity: 0.45,
    boxRadius: 0,
  };
}

function normalizeThemeStyle(style) {
  const base = defaultTextStyle();
  const s = style && typeof style === 'object' ? style : {};
  const out = { ...base };
  THEME_STYLE_KEYS.forEach((key) => {
    if (s[key] !== undefined && s[key] !== null) out[key] = s[key];
  });
  out.fontSize = num(s.fontSize, base.fontSize);
  out.strokeWidth = num(s.strokeWidth, base.strokeWidth);
  out.shadowX = num(s.shadowX, base.shadowX);
  out.shadowY = num(s.shadowY, base.shadowY);
  out.shadowBlur = num(s.shadowBlur, base.shadowBlur);
  out.lineHeight = num(s.lineHeight, base.lineHeight);
  out.letterSpacing = num(s.letterSpacing, base.letterSpacing);
  out.opacity = clampNum(Number(s.opacity ?? base.opacity), 0, 1);
  out.boxFillOpacity = clampNum(Number(s.boxFillOpacity ?? base.boxFillOpacity), 0, 1);
  out.boxRadius = clampNum(Number(s.boxRadius ?? base.boxRadius), 0, 48);
  if (s.boxFillEnabled !== undefined) out.boxFillEnabled = Boolean(s.boxFillEnabled);
  if (s.boxFillColor !== undefined) out.boxFillColor = String(s.boxFillColor);
  if (s.strokeEnabled !== undefined) out.strokeEnabled = Boolean(s.strokeEnabled);
  else out.strokeEnabled = out.strokeWidth > 0;
  if (s.shadowEnabled !== undefined) out.shadowEnabled = Boolean(s.shadowEnabled);
  else out.shadowEnabled = out.shadowBlur > 0 || out.shadowX !== 0 || out.shadowY !== 0;
  return out;
}

function extractTextStyleFromLayer(layer) {
  if (!layer || layer.type !== 'text') return normalizeThemeStyle(null);
  return normalizeThemeStyle(layer.style);
}

function extractTextStyleFromSlide(slide) {
  const layer = getPrimaryTextLayer(slide);
  if (layer) return extractTextStyleFromLayer(layer);
  return normalizeThemeStyle(null);
}

function defaultThemeTextLayer() {
  return {
    x: 5,
    y: 62,
    w: 90,
    h: 32,
    style: defaultTextStyle(),
  };
}

/** 슬라이드 편집기와 동일: 위치(x,y,w,h) + 텍스트 스타일 */
function normalizeThemeTextLayer(raw) {
  const base = defaultThemeTextLayer();
  const tl = raw && typeof raw === 'object' ? raw : {};
  const legacyStyle = !tl.style && raw?.fontFamily !== undefined ? raw : null;
  const styleSrc = tl.style || legacyStyle || raw?.style;
  return {
    x: num(tl.x, base.x),
    y: num(tl.y, base.y),
    w: num(tl.w, base.w),
    h: num(tl.h, base.h),
    role: normalizeTextRole(tl.role),
    style: normalizeThemeStyle(styleSrc),
  };
}

function normalizeThemeExtraTextLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return layers.map(normalizeThemeTextLayer).filter(Boolean);
}

function normalizeTheme(theme) {
  const out = {
    textLayer: { ...defaultThemeTextLayer(), role: 'body' },
    referenceTextLayer: null,
    shapeLayers: [],
    extraTextLayers: [],
  };
  if (!theme || typeof theme !== 'object') return out;

  if (theme.textLayer) {
    out.textLayer = { ...normalizeThemeTextLayer(theme.textLayer), role: 'body' };
  } else if (theme.style) {
    out.textLayer = { ...defaultThemeTextLayer(), style: normalizeThemeStyle(theme.style), role: 'body' };
  } else if (theme.fontFamily !== undefined || theme.fontSize !== undefined) {
    out.textLayer = { ...normalizeThemeTextLayer(theme), role: 'body' };
  }

  if (theme.referenceTextLayer) {
    out.referenceTextLayer = { ...normalizeThemeTextLayer(theme.referenceTextLayer), role: 'reference' };
  } else if (Array.isArray(theme.extraTextLayers)) {
    const refTpl = theme.extraTextLayers.find((l) => l?.role === 'reference');
    if (refTpl) out.referenceTextLayer = { ...normalizeThemeTextLayer(refTpl), role: 'reference' };
  }

  if (theme.background !== undefined) {
    out.background = normalizeBackground(theme.background);
  }
  if (theme.shapeLayers !== undefined) {
    out.shapeLayers = normalizeThemeShapeLayers(theme.shapeLayers);
  }
  if (theme.extraTextLayers !== undefined) {
    out.extraTextLayers = normalizeThemeExtraTextLayers(
      theme.extraTextLayers.filter((l) => l?.role !== 'reference'),
    );
  }

  return out;
}

function extractThemeFromTextLayer(layer) {
  if (!layer || layer.type !== 'text') return defaultThemeTextLayer();
  return {
    x: num(layer.x, 5),
    y: num(layer.y, 62),
    w: num(layer.w, 90),
    h: num(layer.h, 32),
    style: extractTextStyleFromLayer(layer),
  };
}

function extractThemeShapeLayer(layer) {
  if (!layer || layer.type !== 'rect') return null;
  return {
    x: num(layer.x, 10),
    y: num(layer.y, 10),
    w: num(layer.w, 20),
    h: num(layer.h, 20),
    content: String(layer.content || ''),
    style: normalizeShapeStyle(layer.style),
    labelStyle: normalizeShapeLabelStyle(layer.labelStyle),
  };
}

function normalizeThemeShapeLayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return extractThemeShapeLayer({
    type: 'rect',
    x: raw.x,
    y: raw.y,
    w: raw.w,
    h: raw.h,
    content: raw.content,
    style: raw.style,
    labelStyle: raw.labelStyle,
  });
}

function normalizeThemeShapeLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return layers.map(normalizeThemeShapeLayer).filter(Boolean);
}

function createShapeLayerFromTemplate(tpl) {
  const norm = normalizeThemeShapeLayer(tpl);
  if (!norm) return createRectLayer();
  return createShapeLayer(norm.style?.shape || 'rect', {
    x: norm.x,
    y: norm.y,
    w: norm.w,
    h: norm.h,
    content: norm.content,
    style: JSON.parse(JSON.stringify(norm.style)),
    labelStyle: JSON.parse(JSON.stringify(norm.labelStyle)),
  });
}

/** 슬라이드에서 마스터 테마 스냅샷 추출 (텍스트·도형 레이어 + 배경). */
function extractThemeFromSlide(slide) {
  const normalized = normalizeSlide(slide);
  const textLayers = normalized.layers.filter((l) => l.type === 'text');
  const bodyLayer = textLayers.find((l) => l.textRole === 'body') || textLayers[0] || getPrimaryTextLayer(normalized);
  const refLayer = textLayers.find((l) => l.textRole === 'reference')
    || textLayers.find((l) => l !== bodyLayer);
  const extras = textLayers.filter((l) => l !== bodyLayer && l !== refLayer);
  const shapeLayers = normalized.layers
    .filter((l) => l.type === 'rect')
    .map(extractThemeShapeLayer)
    .filter(Boolean);
  const out = {
    textLayer: { ...extractThemeFromTextLayer(bodyLayer), role: 'body' },
    extraTextLayers: extras.map((l) => ({
      ...extractThemeFromTextLayer(l),
      role: normalizeTextRole(l.textRole),
    })),
    background: normalizeBackground(normalized.background),
    shapeLayers,
  };
  if (refLayer && refLayer !== bodyLayer) {
    out.referenceTextLayer = { ...extractThemeFromTextLayer(refLayer), role: 'reference' };
  }
  return out;
}

/** 가사(content)는 유지, 테마 스타일 전체를 강제 덮어쓰기 (deep replace). */
function applyThemeStyleToTextLayer(layer, themeStyle) {
  if (!layer || layer.type !== 'text') return layer;
  layer.style = normalizeThemeStyle(themeStyle);
  return layer;
}

function applyThemeTextLayerToTextLayer(layer, template) {
  if (!layer || layer.type !== 'text') return layer;
  const tpl = normalizeThemeTextLayer(template);
  const preserved = layer.content ?? '';
  layer.x = tpl.x;
  layer.y = tpl.y;
  layer.w = tpl.w;
  layer.h = tpl.h;
  applyThemeStyleToTextLayer(layer, tpl.style);
  layer.content = preserved;
  return layer;
}

function getPrimaryTextContent(slide) {
  const layer = getPrimaryTextLayer(normalizeSlide(slide));
  return String(layer?.content ?? '').trim();
}

function getPrimaryTextRaw(slide) {
  const layer = getPrimaryTextLayer(normalizeSlide(slide));
  return String(layer?.content ?? '');
}

function applyThemeToSlide(slide, theme) {
  const normalized = normalizeSlide(JSON.parse(JSON.stringify(slide)));
  const themeNorm = normalizeTheme(theme);
  const tpl = themeNorm.textLayer;
  const hideLayout = isMacroLayoutHiddenSlide(normalized);
  const themeShapes = normalizeThemeShapeLayers(themeNorm.shapeLayers || []);

  const primaryLayer = getPrimaryTextLayer(normalized);
  const primaryId = primaryLayer?.id;

  const layers = normalized.layers
    .filter((layer) => layer.type !== 'rect')
    .map((layer) => {
      if (layer.type === 'text' && layer.id === primaryId) {
        const updated = JSON.parse(JSON.stringify(layer));
        updated.x = tpl.x;
        updated.y = tpl.y;
        updated.w = tpl.w;
        updated.h = tpl.h;
        updated.style = normalizeThemeStyle(JSON.parse(JSON.stringify(tpl.style)));
        if (hideLayout) {
          updated.layoutHidden = true;
          updated.style.opacity = 0;
        } else {
          delete updated.layoutHidden;
        }
        return normalizeLayer(updated);
      }
      return normalizeLayer(layer);
    });

  const primaryIndex = layers.findIndex((l) => l.type === 'text' && l.id === primaryId);
  const insertAt = primaryIndex >= 0 ? primaryIndex : layers.length;
  themeShapes.forEach((shapeTpl, i) => {
    layers.splice(insertAt + i, 0, normalizeLayer(createShapeLayerFromTemplate(shapeTpl)));
  });

  if (!primaryId || !layers.some((l) => l.type === 'text' && l.id === primaryId)) {
    const textLayer = createTextLayer(getPrimaryTextRaw(normalized), {
      x: tpl.x,
      y: tpl.y,
      w: tpl.w,
      h: tpl.h,
      style: JSON.parse(JSON.stringify(tpl.style)),
      preserveEmpty: true,
    });
    if (hideLayout) {
      textLayer.layoutHidden = true;
      textLayer.style.opacity = 0;
    }
    layers.push(normalizeLayer(textLayer));
  }

  normalized.layers = layers;

  if (themeNorm.background !== undefined) {
    normalized.background = JSON.parse(JSON.stringify(themeNorm.background));
  }

  return normalizeSlide(normalized);
}

function applyThemeToSongEntry(entry, theme) {
  const song = migrateSongEntry(entry);
  if (!Array.isArray(song.slides)) song.slides = [];
  song.slides = song.slides.map((slide) => applyThemeToSlide(slide, theme));
  return song;
}

/** 성경 슬라이드 — 본문/출처 배치 유지, 테마 배경·도형·글꼴 적용 */
function applyBibleThemeToSlide(slide, theme) {
  if (!theme) return normalizeSlide(slide);
  const normalized = normalizeSlide(JSON.parse(JSON.stringify(slide)));
  const themeNorm = normalizeTheme(theme);
  const tplStyle = themeNorm.textLayer?.style;
  const themeShapes = normalizeThemeShapeLayers(themeNorm.shapeLayers || []);
  const textLayers = normalized.layers.filter((l) => l.type === 'text');
  const body = textLayers.find((l) => l.textRole === 'body') || textLayers[0];
  const ref = textLayers.find((l) => l.textRole === 'reference') || textLayers[1];
  const bodyTpl = themeNorm.textLayer;

  if (body && bodyTpl) {
    const content = body.content;
    applyThemeTextLayerToTextLayer(body, bodyTpl);
    body.content = content;
    body.textRole = 'body';
  } else if (body && tplStyle) {
    const box = { x: body.x, y: body.y, w: body.w, h: body.h, content: body.content };
    body.style = normalizeThemeStyle({
      ...tplStyle,
      textAlign: 'center',
      verticalAlign: 'middle',
    });
    Object.assign(body, box);
  }
  const refTpl = themeNorm.referenceTextLayer || themeNorm.extraTextLayers?.find((l) => l.role === 'reference');
  if (ref && refTpl) {
    const content = ref.content;
    applyThemeTextLayerToTextLayer(ref, refTpl);
    ref.content = content;
    ref.textRole = 'reference';
  } else if (ref && tplStyle) {
    const box = { x: ref.x, y: ref.y, w: ref.w, h: ref.h, content: ref.content };
    ref.style = normalizeThemeStyle({
      ...tplStyle,
      fontSize: Math.max(1.8, (tplStyle.fontSize || 4.2) * 0.52),
      textAlign: 'right',
      verticalAlign: 'bottom',
      fontWeight: '600',
    });
    Object.assign(ref, box);
  }

  const textOnly = normalized.layers.filter((l) => l.type !== 'rect');
  const layers = [
    ...themeShapes.map((s) => normalizeLayer(createShapeLayerFromTemplate(s))),
    ...textOnly,
  ];
  normalized.layers = layers;
  if (themeNorm.background !== undefined) {
    normalized.background = JSON.parse(JSON.stringify(themeNorm.background));
  }
  return normalizeSlide(normalized);
}

const SHAPE_KINDS = ['rect', 'ellipse', 'star'];
const STAR_CLIP_PATH = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';

function defaultShapeStyle() {
  return {
    shape: 'rect',
    fillType: 'solid',
    fill: 'rgba(91, 141, 239, 0.25)',
    fillGradientEnd: '#3d6ec9',
    gradientAngle: 135,
    stroke: '#5b8def',
    strokeWidth: 2,
    strokeEnabled: true,
    opacity: 1,
    borderRadius: 4,
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 12,
    shadowColor: 'rgba(0,0,0,0.45)',
    shadowEnabled: true,
  };
}

function defaultRectStyle() {
  return defaultShapeStyle();
}

function defaultShapeLabelStyle() {
  return {
    color: '#ffffff',
    fontSize: 3.5,
    fontWeight: '700',
    textAlign: 'center',
    strokeWidth: 2,
    strokeColor: '#000000',
    strokeEnabled: false,
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 14,
    shadowColor: 'rgba(0,0,0,0.85)',
    shadowEnabled: false,
  };
}

function normalizeShapeLabelStyle(raw) {
  const base = defaultShapeLabelStyle();
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.color = String(s.color || '#ffffff');
  s.fontSize = clampNum(Number(s.fontSize) || 3.5, 1, 12);
  s.fontWeight = String(s.fontWeight || '700');
  s.textAlign = ['left', 'center', 'right'].includes(s.textAlign) ? s.textAlign : 'center';
  s.strokeWidth = clampNum(Number(s.strokeWidth) || 0, 0, 8);
  s.strokeColor = String(s.strokeColor || '#000000');
  if (raw?.strokeEnabled !== undefined) s.strokeEnabled = Boolean(raw.strokeEnabled);
  else s.strokeEnabled = s.strokeWidth > 0;
  s.shadowX = clampNum(Number(s.shadowX) || 0, -80, 80);
  s.shadowY = clampNum(Number(s.shadowY) || 0, -80, 80);
  s.shadowBlur = clampNum(Number(s.shadowBlur) || 0, 0, 80);
  s.shadowColor = String(s.shadowColor || 'rgba(0,0,0,0.85)');
  if (raw?.shadowEnabled !== undefined) s.shadowEnabled = Boolean(raw.shadowEnabled);
  else s.shadowEnabled = s.shadowBlur > 0 || s.shadowX !== 0 || s.shadowY !== 0;
  return s;
}

function normalizeShapeStyle(raw) {
  const s = { ...defaultShapeStyle(), ...(raw && typeof raw === 'object' ? raw : {}) };
  s.shape = SHAPE_KINDS.includes(s.shape) ? s.shape : 'rect';
  s.fillType = s.fillType === 'gradient' ? 'gradient' : 'solid';
  s.fill = String(s.fill || defaultShapeStyle().fill);
  s.fillGradientEnd = String(s.fillGradientEnd || defaultShapeStyle().fillGradientEnd);
  s.gradientAngle = clampNum(Number(s.gradientAngle) || 135, 0, 360);
  s.stroke = String(s.stroke || '#5b8def');
  s.strokeWidth = clampNum(Number(s.strokeWidth) || 0, 0, 24);
  s.opacity = clampNum(Number(s.opacity ?? 1), 0, 1);
  s.borderRadius = clampNum(Number(s.borderRadius) || 0, 0, 50);
  s.shadowX = clampNum(Number(s.shadowX) || 0, -80, 80);
  s.shadowY = clampNum(Number(s.shadowY) || 0, -80, 80);
  s.shadowBlur = clampNum(Number(s.shadowBlur) || 0, 0, 80);
  s.shadowColor = String(s.shadowColor || 'rgba(0,0,0,0.45)');
  if (raw?.strokeEnabled !== undefined) s.strokeEnabled = Boolean(raw.strokeEnabled);
  else s.strokeEnabled = s.strokeWidth > 0;
  if (raw?.shadowEnabled !== undefined) s.shadowEnabled = Boolean(raw.shadowEnabled);
  else s.shadowEnabled = s.shadowBlur > 0 || s.shadowX !== 0 || s.shadowY !== 0;
  return s;
}

function buildShapeBackground(st) {
  if (st.fillType === 'gradient') {
    const ang = Number(st.gradientAngle) || 135;
    return `linear-gradient(${ang}deg, ${st.fill}, ${st.fillGradientEnd})`;
  }
  return st.fill || 'transparent';
}

function buildShapeBoxShadow(st, scale = 1) {
  const x = (st.shadowX ?? 0) * scale;
  const y = (st.shadowY ?? 0) * scale;
  const blur = (st.shadowBlur ?? 0) * scale;
  const color = st.shadowColor || 'rgba(0,0,0,0.45)';
  if (!blur && !x && !y) return 'none';
  return `${x}px ${y}px ${blur}px ${color}`;
}

function applyShapeAppearance(box, st, scale = 1) {
  const style = normalizeShapeStyle(st);
  box.style.background = buildShapeBackground(style);
  if (style.strokeEnabled === false || style.strokeWidth <= 0) {
    box.style.border = 'none';
  } else {
    box.style.border = `${style.strokeWidth * scale}px solid ${style.stroke}`;
  }
  box.style.opacity = String(style.opacity);
  box.style.boxShadow = style.shadowEnabled === false ? 'none' : buildShapeBoxShadow(style, scale);
  const shape = style.shape;
  if (shape === 'ellipse') {
    box.style.borderRadius = '50%';
    box.style.clipPath = 'none';
  } else if (shape === 'star') {
    box.style.borderRadius = '0';
    box.style.clipPath = STAR_CLIP_PATH;
  } else {
    box.style.borderRadius = `${style.borderRadius}px`;
    box.style.clipPath = 'none';
  }
}

function isDesignLayer(layer) {
  return layer?.type === 'rect';
}

function normalizeGroup(group) {
  if (group == null) return '';
  return String(group).trim();
}

function getGroupTagStyle(group) {
  const label = normalizeGroup(group);
  if (!label) return { label: '', color: GROUP_TAG_COLORS.default };
  const key = label.toLowerCase();
  if (key.includes('chorus')) return { label, color: GROUP_TAG_COLORS.chorus };
  if (key.includes('bridge')) return { label, color: GROUP_TAG_COLORS.bridge };
  if (key.includes('pre-chorus') || key.includes('prechorus')) return { label, color: GROUP_TAG_COLORS['pre-chorus'] };
  if (key.includes('verse')) return { label, color: GROUP_TAG_COLORS.verse };
  if (key.includes('intro')) return { label, color: GROUP_TAG_COLORS.intro };
  if (key.includes('outro') || key.includes('ending')) return { label, color: GROUP_TAG_COLORS.outro };
  if (key.includes('tag')) return { label, color: GROUP_TAG_COLORS.tag };
  return { label, color: GROUP_TAG_COLORS.default };
}

function createTextLayer(content, opts = {}) {
  const text = opts.preserveEmpty ? (content ?? '') : (content || '새 텍스트');
  const layer = {
    id: uid(),
    type: 'text',
    x: opts.x ?? 5,
    y: opts.y ?? 62,
    w: opts.w ?? 90,
    h: opts.h ?? 32,
    content: text,
    style: { ...defaultTextStyle(), ...(opts.style || {}) },
  };
  const role = normalizeTextRole(opts.textRole);
  if (role) layer.textRole = role;
  return layer;
}

function createShapeLayer(shape = 'rect', opts = {}) {
  const kind = SHAPE_KINDS.includes(shape) ? shape : 'rect';
  const layer = {
    id: uid(),
    type: 'rect',
    x: opts.x ?? 30,
    y: opts.y ?? 40,
    w: opts.w ?? 40,
    h: opts.h ?? 20,
    style: normalizeShapeStyle({ shape: kind, ...(opts.style || {}) }),
  };
  if (opts.content != null) layer.content = String(opts.content);
  if (opts.labelStyle) layer.labelStyle = normalizeShapeLabelStyle(opts.labelStyle);
  return layer;
}

function createRectLayer(opts = {}) {
  return createShapeLayer('rect', opts);
}

function createEllipseLayer(opts = {}) {
  return createShapeLayer('ellipse', opts);
}

function createStarLayer(opts = {}) {
  return createShapeLayer('star', opts);
}

/** 성경 슬라이드 — 중앙 본문 / 우측 하단 장절 출처 고정 배치 */
function createBibleSlide(bodyText, reference, opts = {}) {
  const bodyStyle = {
    fontSize: opts.bodyFontSize ?? 4.2,
    textAlign: 'center',
    verticalAlign: 'middle',
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: 1.35,
    strokeWidth: 2,
    shadowBlur: 14,
    shadowY: 4,
  };
  const refStyle = {
    fontSize: opts.refFontSize ?? 2.2,
    textAlign: 'right',
    verticalAlign: 'bottom',
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
    lineHeight: 1.2,
  };
  return {
    id: uid(),
    group: normalizeGroup(opts.group || 'bible'),
    background: { type: 'color', color: '#000000' },
    layers: [
      createTextLayer(bodyText, { x: 5, y: 12, w: 90, h: 72, style: bodyStyle, textRole: 'body' }),
      createTextLayer(reference, { x: 58, y: 86, w: 37, h: 10, style: refStyle, preserveEmpty: true, textRole: 'reference' }),
    ],
  };
}

function createSlideFromText(text, opts = {}) {
  const layerOpts = {};
  if (opts.fontSize != null) layerOpts.style = { fontSize: opts.fontSize };
  if (!String(text ?? '').trim()) layerOpts.preserveEmpty = true;
  return {
    id: uid(),
    group: normalizeGroup(opts.group),
    background: { type: 'color', color: '#000000' },
    layers: [createTextLayer(text, layerOpts)],
  };
}

function getPrimaryText(slide) {
  if (!slide?.layers?.length) return '';
  const textLayer = slide.layers.find((l) => l.type === 'text');
  if (!textLayer) return '';
  if (textLayer.layoutHidden || isMacroLayoutHiddenSlide(slide)) return '';
  return textLayer.content?.trim() || '';
}

function getPrimaryTextLayer(slide) {
  if (!slide?.layers?.length) return null;
  return slide.layers.find((l) => l.type === 'text') || null;
}

/** 송출용 가사 스타일 — Visual 편집기 텍스트 레이어 % 기준 (1080p 스테이지) */
function getLyricsDisplay(slide, refHeight = STAGE_REF_HEIGHT) {
  const layer = getPrimaryTextLayer(slide);
  if (layer?.layoutHidden || isMacroLayoutHiddenSlide(slide)) {
    return {
      text: '',
      fontSize: 0,
      color: '#ffffff',
      textAlign: 'center',
      verticalAlign: 'middle',
      fontFamily: defaultTextStyle().fontFamily,
      fontWeight: '700',
      lineHeight: 1,
      fontStyle: 'normal',
      textDecoration: 'none',
      strokeWidth: 0,
      strokeColor: '#000000',
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 0,
      shadowColor: 'rgba(0,0,0,0)',
    };
  }
  const text = layer?.content?.trim() || '';
  const st = layer?.style || defaultTextStyle();
  const pctSize = st.fontSize || 5.2;
  const fontSize = Math.max(28, Math.round((pctSize / 100) * refHeight));
  return {
    text,
    fontSize,
    color: st.color || '#ffffff',
    textAlign: st.textAlign || 'center',
    verticalAlign: st.verticalAlign || 'middle',
    fontFamily: st.fontFamily || defaultTextStyle().fontFamily,
    fontWeight: st.fontWeight || '700',
    lineHeight: st.lineHeight || 1,
    fontStyle: st.fontStyle || 'normal',
    textDecoration: st.textDecoration || 'none',
    strokeWidth: st.strokeWidth ?? 2,
    strokeColor: st.strokeColor || '#000000',
    shadowX: st.shadowX ?? 0,
    shadowY: st.shadowY ?? 4,
    shadowBlur: st.shadowBlur ?? 14,
    shadowColor: st.shadowColor || 'rgba(0,0,0,0.85)',
  };
}

function slidesToLyrics(slides) {
  return slides.map(getPrimaryTextContent).filter(Boolean).join('\n\n');
}

function lyricsToTextChunks(lyrics) {
  if (!lyrics || !String(lyrics).trim()) return [];
  return String(lyrics)
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MACRO_LAYOUT_HIDDEN_PATTERNS = [
  ['intro'],
  ['outro', 'ending'],
];

function isBibleSlide(slide) {
  const normalized = normalizeSlide(slide);
  if (normalizeGroup(normalized.group) === 'bible') return true;
  return (normalized.layers || []).some(
    (l) => l.type === 'text' && (l.textRole === 'body' || l.textRole === 'reference'),
  );
}

function isBibleSongEntry(entry) {
  const song = migrateSongEntry(entry);
  return Array.isArray(song.slides) && song.slides.some(isBibleSlide);
}

function isBlankSlide(slide) {
  if (!slide?.layers?.length) return true;
  const textLayer = slide.layers.find((l) => l.type === 'text');
  return !(textLayer?.content ?? '').trim();
}

function isMacroLayoutHiddenSlide(slide) {
  const normalized = normalizeSlide(slide);
  if (isBlankSlide(normalized)) return true;
  const g = normalizeGroup(normalized.group).toLowerCase();
  if (!g) return isBlankSlide(normalized);
  if (g === 'blank') return true;
  return MACRO_LAYOUT_HIDDEN_PATTERNS.some((patterns) =>
    patterns.some((p) => g === p || g.startsWith(`${p} `) || g.includes(p))
  );
}

function normalizeBackground(background) {
  if (!background || background.type === 'color') {
    return {
      type: 'color',
      color: background?.color || '#000000',
      opacity: num(background?.opacity, 1),
    };
  }
  if (background.type === 'video' && background.file) {
    return { type: 'video', file: String(background.file) };
  }
  if (background.type === 'image') {
    if (background.file) {
      return { type: 'image', file: String(background.file) };
    }
    if (background.src && String(background.src).startsWith('http')) {
      return { type: 'image', src: String(background.src) };
    }
    if (background.src && String(background.src).startsWith('data:')) {
      return { type: 'image', src: String(background.src) };
    }
  }
  return { type: 'color', color: '#000000' };
}

function resolveBackgroundForRender(background, resolveFileUrl) {
  const bg = normalizeBackground(background);
  if ((bg.type === 'image' || bg.type === 'video') && bg.file && typeof resolveFileUrl === 'function') {
    const src = resolveFileUrl(bg.file);
    if (src) return { type: bg.type, file: bg.file, src };
  }
  if (bg.type === 'image' && bg.src) return bg;
  return bg;
}

function migrateSongEntry(entry) {
  if (entry && typeof entry === 'object' && Array.isArray(entry.slides)) {
    return {
      version: 2,
      lyrics: entry.lyrics || slidesToLyrics(entry.slides),
      slides: entry.slides.map(normalizeSlide),
    };
  }
  const lyrics = typeof entry === 'string' ? entry : '';
  const chunks = lyricsToTextChunks(lyrics);
  return {
    version: 2,
    lyrics,
    slides: chunks.length ? chunks.map((t) => createSlideFromText(t)) : [],
  };
}

function normalizeSlide(slide) {
  const s = {
    id: slide.id || uid(),
    group: normalizeGroup(slide.group),
    background: normalizeBackground(slide.background),
    layers: Array.isArray(slide.layers) ? slide.layers.map(normalizeLayer) : [],
  };
  if (!s.layers.length && slide.text) {
    s.layers.push(createTextLayer(slide.text));
  }
  return s;
}

function normalizeLayer(layer) {
  const base = {
    id: layer.id || uid(),
    type: layer.type,
    x: num(layer.x, 0),
    y: num(layer.y, 0),
    w: num(layer.w, 20),
    h: num(layer.h, 20),
  };
  if (layer.type === 'text') {
    const out = {
      ...base,
      type: 'text',
      content: layer.content ?? '',
      style: normalizeThemeStyle(layer.style || {}),
    };
    const role = normalizeTextRole(layer.textRole);
    if (role) out.textRole = role;
    if (layer.layoutHidden) out.layoutHidden = true;
    return out;
  }
  if (layer.type === 'rect') {
    const out = {
      ...base,
      type: 'rect',
      style: normalizeShapeStyle(layer.style || {}),
    };
    if (layer.content != null) out.content = String(layer.content);
    if (layer.labelStyle) out.labelStyle = normalizeShapeLabelStyle(layer.labelStyle);
    return out;
  }
  return base;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function applyBackground(el, background, resolveFileUrl) {
  el.style.opacity = '1';
  let bgLayer = el.querySelector(':scope > .slide-bg-layer');
  if (!bgLayer) {
    bgLayer = document.createElement('div');
    bgLayer.className = 'slide-bg-layer';
    bgLayer.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
    el.insertBefore(bgLayer, el.firstChild);
  }
  const oldVid = bgLayer.querySelector('.slide-bg-video');
  if (oldVid) {
    oldVid.pause();
    oldVid.removeAttribute('src');
    oldVid.remove();
  }
  bgLayer.style.backgroundImage = 'none';
  bgLayer.style.backgroundColor = '#000000';

  const bg = resolveBackgroundForRender(background, resolveFileUrl);
  const bgOpacity = bg?.opacity ?? 1;
  bgLayer.style.opacity = String(bgOpacity);
  if (!bg || bg.type === 'color') {
    bgLayer.style.backgroundColor = bg?.color || '#000000';
    return;
  }
  if (bg.type === 'image' && bg.src) {
    bgLayer.style.backgroundColor = '#000';
    bgLayer.style.backgroundImage = `url("${String(bg.src).replace(/"/g, '\\"')}")`;
    bgLayer.style.backgroundSize = 'cover';
    bgLayer.style.backgroundPosition = 'center';
    return;
  }
  if (bg.type === 'video' && bg.src) {
    bgLayer.style.backgroundColor = '#000';
    const vid = document.createElement('video');
    vid.className = 'slide-bg-video';
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;';
    vid.src = bg.src;
    vid.load();
    vid.play().catch(() => {});
    bgLayer.appendChild(vid);
  }
}

function buildTextShadow(style, scale = 1) {
  const parts = [];
  if (style.strokeEnabled !== false && style.strokeWidth > 0) {
    const c = style.strokeColor || '#000';
    const w = (style.strokeWidth || 0) * scale;
    parts.push(
      `${-w}px ${-w}px 0 ${c}`,
      `${w}px ${-w}px 0 ${c}`,
      `${-w}px ${w}px 0 ${c}`,
      `${w}px ${w}px 0 ${c}`
    );
  }
  if (style.shadowEnabled !== false) {
    parts.push(
      `${(style.shadowX || 0) * scale}px ${(style.shadowY || 0) * scale}px ${(style.shadowBlur || 0) * scale}px ${style.shadowColor || 'rgba(0,0,0,0.8)'}`
    );
  }
  return parts.length ? parts.join(', ') : 'none';
}

function filterLayersForRender(layers, textMode) {
  const list = layers || [];
  if (textMode === 'none') return list.filter((l) => l.type !== 'text');
  if (textMode === 'primary') {
    const primary = getPrimaryTextLayer({ layers: list });
    if (!primary) return list.filter((l) => l.type !== 'text');
    return list.filter((l) => l.type !== 'text' || l.id === primary.id);
  }
  return list;
}

function renderLayer(layer, scale = 1, fontUnit = 'cqh', refHeight = 1080, layerOpts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'slide-layer';
  wrap.dataset.layerId = layer.id;
  wrap.style.position = 'absolute';
  wrap.style.left = `${layer.x}%`;
  wrap.style.top = `${layer.y}%`;
  wrap.style.width = `${layer.w}%`;
  wrap.style.height = `${layer.h}%`;
  wrap.style.boxSizing = 'border-box';
  if (layer.layoutHidden) {
    wrap.style.visibility = 'hidden';
    wrap.style.pointerEvents = 'none';
  }

  if (layer.type === 'rect') {
    const box = document.createElement('div');
    box.className = 'slide-layer-shape';
    box.style.width = '100%';
    box.style.height = '100%';
    box.style.boxSizing = 'border-box';
    box.style.pointerEvents = 'none';
    applyShapeAppearance(box, layer.style || {}, scale);
    wrap.appendChild(box);
    const labelText = String(layer.content || '').trim();
    if (labelText) {
      const ls = normalizeShapeLabelStyle(layer.labelStyle);
      const label = document.createElement('div');
      label.className = 'slide-layer-shape-label';
      label.textContent = layer.content || '';
      label.style.position = 'absolute';
      label.style.inset = '0';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.justifyContent =
        ls.textAlign === 'left' ? 'flex-start' : ls.textAlign === 'right' ? 'flex-end' : 'center';
      label.style.padding = '4%';
      label.style.textAlign = ls.textAlign;
      label.style.color = ls.color;
      label.style.fontWeight = ls.fontWeight;
      label.style.whiteSpace = 'pre-wrap';
      label.style.wordBreak = 'keep-all';
      label.style.pointerEvents = 'none';
      label.style.lineHeight = '1.3';
      if (fontUnit === 'px') {
        const px = Math.max(7, Math.round(((ls.fontSize || 3.5) / 100) * refHeight * scale));
        label.style.fontSize = `${px}px`;
      } else {
        label.style.fontSize = `${(ls.fontSize || 3.5) * scale}${fontUnit}`;
      }
      label.style.textShadow = buildTextShadow(ls, scale);
      wrap.appendChild(label);
    }
    return wrap;
  }

  if (layer.type === 'text') {
    const st = layer.style || defaultTextStyle();
    if (st.boxFillEnabled) {
      wrap.style.backgroundColor = colorWithAlpha(st.boxFillColor, st.boxFillOpacity ?? 0.45);
      wrap.style.borderRadius = `${st.boxRadius || 0}%`;
      wrap.style.overflow = 'hidden';
    }
    const inner = document.createElement('div');
    inner.className = 'slide-layer-text';
    inner.textContent = layer.content || '';
    inner.style.width = '100%';
    inner.style.height = '100%';
    inner.style.display = 'flex';
    const vAlign = st.verticalAlign || 'middle';
    inner.style.alignItems =
      vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
    inner.style.justifyContent =
      st.textAlign === 'left' ? 'flex-start' : st.textAlign === 'right' ? 'flex-end' : 'center';
    inner.style.textAlign = st.textAlign || 'center';
    inner.style.fontFamily = st.fontFamily;
    inner.style.fontWeight = st.fontWeight || '700';
    inner.style.fontStyle = st.fontStyle || 'normal';
    inner.style.textDecoration = st.textDecoration || 'none';
    inner.style.color = st.color || '#fff';
    inner.style.lineHeight = String(st.lineHeight ?? 1);
    inner.style.opacity = String(st.opacity ?? 1);
    inner.style.whiteSpace = 'pre-wrap';
    inner.style.wordBreak = 'break-word';
    inner.style.overflow = layerOpts.clipText === false ? 'visible' : 'hidden';
    inner.style.boxSizing = 'border-box';
    inner.style.pointerEvents = 'none';
    if (fontUnit === 'px') {
      const px = Math.max(7, Math.round(((st.fontSize || 5) / 100) * refHeight * scale));
      inner.style.fontSize = `${px}px`;
      inner.style.letterSpacing = `${Math.round((st.letterSpacing ?? 1) * scale)}px`;
      inner.style.textShadow = buildTextShadow(st, scale);
    } else {
      const sizePct = (st.fontSize || 5) * scale;
      inner.style.fontSize = `${sizePct}${fontUnit}`;
      inner.style.letterSpacing = `${(st.letterSpacing ?? 1) * scale * 0.15}${fontUnit}`;
      inner.style.textShadow = buildTextShadow(st, scale * (sizePct / 5));
    }
    wrap.appendChild(inner);
    return wrap;
  }

  return wrap;
}

/** 송출·미리보기용 슬라이드 정규화 (테마 레이어·배경 포함). */
function prepareSlideForBroadcast(slide) {
  if (!slide) return null;
  return normalizeSlide(JSON.parse(JSON.stringify(slide)));
}

/** 송출 가능한 콘텐츠(레이어·배경)가 있는지 검증 */
function hasSlideRenderableContent(slide) {
  const s = prepareSlideForBroadcast(slide);
  if (!s) return false;
  if ((s.layers || []).length > 0) return true;
  const bg = normalizeBackground(s.background);
  if (bg.type === 'color') return true;
  if (bg.type === 'image' && (bg.file || bg.src)) return true;
  if (bg.type === 'video' && (bg.file || bg.src)) return true;
  return false;
}

function renderSlide(slide, container, options = {}) {
  const {
    scale = 1,
    fontUnit = 'cqh',
    clear = true,
    interactive = false,
    selectedLayerId = null,
    resolveFileUrl = null,
    textMode = 'all',
    refHeight = 1080,
  } = options;
  if (clear) container.innerHTML = '';
  const containerPos = container.style.position;
  if (!containerPos || containerPos === 'static') {
    container.style.position = 'relative';
  }
  container.style.overflow = 'hidden';
  container.style.width = container.style.width || '100%';
  container.style.height = container.style.height || '100%';
  container.style.containerType = fontUnit === 'cqh' ? 'size' : 'normal';

  if (options.foregroundOnly) {
    container.style.background = 'transparent';
    container.style.backgroundImage = 'none';
  } else {
    applyBackground(container, slide.background, resolveFileUrl);
  }

  const layers = filterLayersForRender(slide.layers, textMode);
  const h = refHeight || container.clientHeight || 1080;

  layers.forEach((layer, index) => {
    const el = renderLayer(layer, scale, fontUnit, h, { clipText: options.clipText });
    el.style.zIndex = String(index + 1);
    if (interactive) {
      el.classList.add('interactive-layer');
      el.dataset.layerType = layer.type;
      const isSelected = layer.id === selectedLayerId;
      if (isSelected) el.classList.add('selected');
      const hasSelection = selectedLayerId != null && selectedLayerId !== '';
      if (hasSelection && !isSelected) {
        el.style.pointerEvents = 'none';
        el.style.cursor = 'default';
      } else {
        el.style.pointerEvents = 'auto';
        el.style.cursor = isSelected ? 'grab' : 'pointer';
      }
    }
    container.appendChild(el);
  });
}

function getLayerIndex(slide, layerId) {
  return (slide?.layers || []).findIndex((l) => l.id === layerId);
}

/** Layer at canvas % coordinates — prefers the smallest hit box (shape over full-slide text). */
function hitTestLayerAtPoint(slide, xPct, yPct) {
  const layers = slide?.layers || [];
  let best = null;
  let bestArea = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.layoutHidden) continue;
    if (xPct >= l.x && xPct <= l.x + l.w && yPct >= l.y && yPct <= l.y + l.h) {
      const area = l.w * l.h;
      if (area < bestArea || (area === bestArea && i > bestIndex)) {
        bestArea = area;
        bestIndex = i;
        best = l;
      }
    }
  }
  return best;
}

function duplicateLayer(slide, layerId) {
  const i = getLayerIndex(slide, layerId);
  if (i < 0) return null;
  const copy = normalizeLayer(JSON.parse(JSON.stringify(slide.layers[i])));
  copy.id = uid();
  copy.x = Math.min(copy.x + 2, 95);
  copy.y = Math.min(copy.y + 2, 95);
  slide.layers.splice(i + 1, 0, copy);
  return copy.id;
}

function removeLayer(slide, layerId) {
  const before = slide.layers.length;
  slide.layers = slide.layers.filter((l) => l.id !== layerId);
  return slide.layers.length < before;
}

function reorderLayer(slide, layerId, delta) {
  const i = getLayerIndex(slide, layerId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= slide.layers.length) return false;
  const [item] = slide.layers.splice(i, 1);
  slide.layers.splice(j, 0, item);
  return true;
}

function bringLayerToFront(slide, layerId) {
  const i = getLayerIndex(slide, layerId);
  if (i < 0 || i >= slide.layers.length - 1) return false;
  const [item] = slide.layers.splice(i, 1);
  slide.layers.push(item);
  return true;
}

function sendLayerToBack(slide, layerId) {
  const i = getLayerIndex(slide, layerId);
  if (i <= 0) return false;
  const [item] = slide.layers.splice(i, 1);
  slide.layers.unshift(item);
  return true;
}

function duplicateSlide(slide) {
  const copy = normalizeSlide(JSON.parse(JSON.stringify(slide)));
  copy.id = uid();
  copy.layers = copy.layers.map((l) => ({ ...l, id: uid() }));
  return copy;
}

function nudgeLayer(layer, dx, dy) {
  if (!layer) return;
  layer.x = Math.max(0, Math.min(100 - layer.w, layer.x + dx));
  layer.y = Math.max(0, Math.min(100 - layer.h, layer.y + dy));
}

function clampNum(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const EDITOR_SNAP_THRESHOLD = 1.25;
const EDITOR_CENTER_GUIDES = [50];

function snapPercentValue(value, guides = EDITOR_CENTER_GUIDES, threshold = EDITOR_SNAP_THRESHOLD) {
  let snapped = value;
  let guide = null;
  for (const g of guides) {
    if (Math.abs(value - g) <= threshold) {
      snapped = g;
      guide = g;
      break;
    }
  }
  return { value: snapped, guide };
}

/** Snap layer box by aligning its center to canvas center guides (50%). */
function snapLayerMoveBox(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const sx = snapPercentValue(cx);
  const sy = snapPercentValue(cy);
  let nx = x;
  let ny = y;
  const guides = { vertical: null, horizontal: null };
  if (sx.guide != null) {
    nx = sx.value - w / 2;
    guides.vertical = sx.guide;
  }
  if (sy.guide != null) {
    ny = sy.value - h / 2;
    guides.horizontal = sy.guide;
  }
  return { x: nx, y: ny, guides };
}

function applyLayerResize(layer, handle, dx, dy, orig, opts = {}) {
  const lockAspect = Boolean(opts.lockAspect);
  const minW = 5;
  const minH = 4;
  let { x, y, w, h } = { ...orig };
  const ratio = orig.w / Math.max(orig.h, 0.01);

  if (lockAspect) {
    let dw = 0;
    let dh = 0;
    if (handle.includes('e')) dw = dx;
    if (handle.includes('w')) dw = -dx;
    if (handle.includes('s')) dh = dy;
    if (handle.includes('n')) dh = -dy;
    const useWidth = Math.abs(dw) * ratio >= Math.abs(dh);
    if (useWidth) {
      if (handle.includes('e')) w = clampNum(orig.w + dx, minW, 100 - orig.x);
      if (handle.includes('w')) {
        w = clampNum(orig.w - dx, minW, orig.w + orig.x);
        x = orig.x + (orig.w - w);
      }
      h = clampNum(w / ratio, minH, 100 - y);
    } else {
      if (handle.includes('s')) h = clampNum(orig.h + dy, minH, 100 - orig.y);
      if (handle.includes('n')) {
        h = clampNum(orig.h - dy, minH, orig.h + orig.y);
        y = orig.y + (orig.h - h);
      }
      w = clampNum(h * ratio, minW, 100 - x);
    }
    layer.x = clampNum(x, 0, 100 - w);
    layer.y = clampNum(y, 0, 100 - h);
    layer.w = w;
    layer.h = h;
    return;
  }

  if (handle.includes('e')) w = clampNum(orig.w + dx, minW, 100 - orig.x);
  if (handle.includes('w')) {
    const nw = clampNum(orig.w - dx, minW, orig.w + orig.x);
    x = orig.x + (orig.w - nw);
    w = nw;
  }
  if (handle.includes('s')) h = clampNum(orig.h + dy, minH, 100 - orig.y);
  if (handle.includes('n')) {
    const nh = clampNum(orig.h - dy, minH, orig.h + orig.y);
    y = orig.y + (orig.h - nh);
    h = nh;
  }
  layer.x = clampNum(x, 0, 100 - w);
  layer.y = clampNum(y, 0, 100 - h);
  layer.w = w;
  layer.h = h;
}

function syncSlidesFromReflow(editorData, reflowText) {
  const texts = lyricsToTextChunks(reflowText);
  const slides = texts.map((content, i) => {
    if (editorData.slides[i]) {
      const slide = JSON.parse(JSON.stringify(editorData.slides[i]));
      const tl = slide.layers.find((l) => l.type === 'text');
      if (tl) tl.content = content;
      else slide.layers.unshift(createTextLayer(content));
      return normalizeSlide(slide);
    }
    return createSlideFromText(content);
  });
  return { lyrics: reflowText, slides };
}

module.exports = {
  STAGE_REF_WIDTH,
  STAGE_REF_HEIGHT,
  STAGE_ASPECT_W,
  STAGE_ASPECT_H,
  STAGE_ASPECT_RATIO,
  normalizeStageDimensions,
  getStageDimensions,
  getStageAspectRatio,
  computeViewportFitScale,
  LIVE_GROUP_PRESETS,
  GROUP_OPTIONS,
  THEME_STYLE_KEYS,
  uid,
  defaultTextStyle,
  defaultRectStyle,
  defaultShapeStyle,
  normalizeShapeStyle,
  normalizeShapeLabelStyle,
  defaultShapeLabelStyle,
  SHAPE_KINDS,
  isDesignLayer,
  createShapeLayer,
  createEllipseLayer,
  createStarLayer,
  normalizeThemeStyle,
  defaultThemeTextLayer,
  normalizeThemeTextLayer,
  normalizeThemeExtraTextLayers,
  normalizeTheme,
  normalizeTextRole,
  TEXT_ROLES,
  extractThemeFromTextLayer,
  extractThemeFromSlide,
  extractThemeShapeLayer,
  normalizeThemeShapeLayers,
  createShapeLayerFromTemplate,
  extractTextStyleFromLayer,
  extractTextStyleFromSlide,
  applyThemeStyleToTextLayer,
  applyThemeTextLayerToTextLayer,
  applyThemeToSlide,
  applyThemeToSongEntry,
  applyBibleThemeToSlide,
  isBibleSlide,
  isBibleSongEntry,
  isBlankSlide,
  isMacroLayoutHiddenSlide,
  normalizeGroup,
  getGroupTagStyle,
  GROUP_HOTKEYS,
  findSlideIndexByGroupKey,
  getGroupHotkeyForSlide,
  listGroupHotkeys,
  createTextLayer,
  createRectLayer,
  createBibleSlide,
  createSlideFromText,
  getPrimaryText,
  getPrimaryTextContent,
  getPrimaryTextLayer,
  getLyricsDisplay,
  slidesToLyrics,
  lyricsToTextChunks,
  normalizeBackground,
  resolveBackgroundForRender,
  migrateSongEntry,
  normalizeSlide,
  prepareSlideForBroadcast,
  hasSlideRenderableContent,
  renderSlide,
  filterLayersForRender,
  syncSlidesFromReflow,
  buildTextShadow,
  getLayerIndex,
  hitTestLayerAtPoint,
  duplicateLayer,
  removeLayer,
  reorderLayer,
  bringLayerToFront,
  sendLayerToBack,
  duplicateSlide,
  nudgeLayer,
  EDITOR_SNAP_THRESHOLD,
  snapPercentValue,
  snapLayerMoveBox,
  applyLayerResize,
  applyShapeAppearance,
};
