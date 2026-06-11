const fs = require('fs');
const path = require('path');
const AtomicWrite = require('./atomic-write');
const { normalizeShortcuts } = require('./shortcuts');

const SETTINGS_PATH = path.join(__dirname, 'settings.json');

/** Quick preset menu in settings (standard broadcast sizes). */
const OUTPUT_QUICK_PRESETS = [
  { id: '1920x1080', label: '1920×1080 (1080p 16:9)', width: 1920, height: 1080 },
  { id: '1280x720', label: '1280×720 (720p 16:9)', width: 1280, height: 720 },
  { id: '3840x2160', label: '3840×2160 (4K UHD)', width: 3840, height: 2160 },
];

const OUTPUT_RESOLUTION_PRESETS = [
  ...OUTPUT_QUICK_PRESETS,
  { id: 'custom', label: 'custom', width: 0, height: 0 },
];

const DEFAULTS = {
  language: 'ko',
  outputWidth: 1920,
  outputHeight: 1080,
  /** Electron display.id for program output target (empty = auto secondary). */
  outputDisplayId: '',
  outputDisplayScale: 100,
  outputAutoFit: true,
  layerFadeMs: 650,
  lyricsFadeMs: 550,
  backgroundFadeMs: 650,
  defaultTextFontSize: 5.2,
  defaultSlideGroup: '',
  confirmBeforeDelete: true,
  showSlideCaptions: true,
  showGroupLabels: true,
  keyboardShortcuts: true,
  loopBackgroundVideo: true,
  keepMediaOnSlideChange: true,
  mediaHoverPreview: true,
  showOutputSettingsButton: false,
  hardwareAcceleration: false,
  autoOpenOutputOnStart: true,
  slideAdvanceWrap: false,
  playlistAdvanceToNextSong: true,
  showEditorGrid: true,
  /** Slide editor canvas zoom % (16:9 locked, ProPresenter-style) */
  editorCanvasZoom: 100,
  /** Slides filmstrip thumbnail size % (16:9 locked per card) */
  slidesFilmstripZoom: 100,
  /** Bible search result preview card size % (16:9 locked per card) */
  biblePreviewZoom: 80,
  /** Media library item id for Logo quick-send overlay */
  logoMediaId: '',
  /** Theme id applied to Bible workspace slides (empty = default black) */
  bibleThemeId: '',
  /** Prefix each verse with its number in bible slide body text */
  bibleShowVerseNumbers: false,
  shortcuts: null,
  panelSizes: null,
};

const PANEL_SIZE_DEFAULTS = {
  sidebar: 220,
  operator: 228,
  media: 110,
  playlistTree: 140,
  editRail: 128,
  inspector: 280,
  reflowSlides: 380,
  bibleSearch: 280,
};

const PANEL_SIZE_LIMITS = {
  sidebar: { min: 160, max: 420 },
  operator: { min: 180, max: 400 },
  media: { min: 64, max: 360 },
  playlistTree: { min: 48, max: 480 },
  editRail: { min: 96, max: 220 },
  inspector: { min: 200, max: 480 },
  reflowSlides: { min: 220, max: 720 },
  bibleSearch: { min: 220, max: 420 },
};

function normalizePanelSizes(raw) {
  const out = { ...PANEL_SIZE_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(PANEL_SIZE_DEFAULTS)) {
    const lim = PANEL_SIZE_LIMITS[key];
    const n = Math.round(Number(raw[key]));
    if (Number.isFinite(n)) out[key] = clamp(n, lim.min, lim.max);
  }
  return out;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeOutputResolution(width, height) {
  let w = clamp(Math.round(Number(width) || 1920), 320, 7680);
  let h = clamp(Math.round(w * 9 / 16), 180, 4320);
  w = clamp(Math.round(h * 16 / 9), 320, 7680);
  return { width: w, height: h };
}

function getOutputResolution(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return normalizeOutputResolution(s.outputWidth, s.outputHeight);
}

function findResolutionPresetId(width, height) {
  const match = OUTPUT_RESOLUTION_PRESETS.find(
    (p) => p.id !== 'custom' && p.width === width && p.height === height,
  );
  return match ? match.id : 'custom';
}

function normalize(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = s.language === 'en' ? 'en' : 'ko';
  s.autoLoadLastPlaylist = s.autoLoadLastPlaylist !== false;
  s.masterVolume = clamp(Math.round(Number(s.masterVolume) || 100), 0, 100);
  s.muteMediaOnBlackout = s.muteMediaOnBlackout !== false;
  const res = normalizeOutputResolution(s.outputWidth, s.outputHeight);
  s.outputWidth = res.width;
  s.outputHeight = res.height;
  s.outputDisplayId = String(s.outputDisplayId || '').trim();
  s.outputDisplayScale = clamp(Math.round(Number(s.outputDisplayScale) || 100), 25, 200);
  s.outputAutoFit = s.outputAutoFit !== false;
  s.layerFadeMs = clamp(Math.round(Number(s.layerFadeMs) || 650), 100, 2000);
  s.lyricsFadeMs = clamp(Math.round(Number(s.lyricsFadeMs) || 550), 100, 2000);
  s.backgroundFadeMs = clamp(Math.round(Number(s.backgroundFadeMs) || 650), 100, 2000);
  s.defaultTextFontSize = clamp(Number(s.defaultTextFontSize) || 5.2, 2, 12);
  s.defaultSlideGroup = String(s.defaultSlideGroup || '').trim();
  s.confirmBeforeDelete = Boolean(s.confirmBeforeDelete);
  s.showSlideCaptions = s.showSlideCaptions !== false;
  s.showGroupLabels = s.showGroupLabels !== false;
  s.keyboardShortcuts = s.keyboardShortcuts !== false;
  s.loopBackgroundVideo = s.loopBackgroundVideo !== false;
  s.keepMediaOnSlideChange = s.keepMediaOnSlideChange !== false;
  s.mediaHoverPreview = s.mediaHoverPreview !== false;
  s.showOutputSettingsButton = Boolean(s.showOutputSettingsButton);
  s.hardwareAcceleration = Boolean(s.hardwareAcceleration);
  s.autoOpenOutputOnStart = s.autoOpenOutputOnStart !== false;
  s.slideAdvanceWrap = Boolean(s.slideAdvanceWrap);
  s.playlistAdvanceToNextSong = s.playlistAdvanceToNextSong !== false;
  s.showEditorGrid = s.showEditorGrid !== false;
  s.editorCanvasZoom = clamp(Math.round(Number(s.editorCanvasZoom) || 100), 40, 200);
  s.slidesFilmstripZoom = clamp(Math.round(Number(s.slidesFilmstripZoom ?? s.slidesCanvasZoom) || 100), 50, 200);
  s.biblePreviewZoom = clamp(Math.round(Number(s.biblePreviewZoom) || 80), 50, 200);
  s.logoMediaId = String(s.logoMediaId || '').trim();
  s.bibleThemeId = String(s.bibleThemeId || '').trim();
  s.bibleShowVerseNumbers = Boolean(s.bibleShowVerseNumbers);
  s.shortcuts = normalizeShortcuts(s.shortcuts);
  s.panelSizes = normalizePanelSizes(s.panelSizes);
  return s;
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return normalize(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')));
    }
  } catch (err) {
    console.error('설정 읽기 오류:', err);
  }
  return normalize({});
}

function saveSettings(partial) {
  const next = normalize({ ...loadSettings(), ...(partial || {}) });
  try {
    AtomicWrite.atomicWriteJsonSync(SETTINGS_PATH, next);
  } catch (err) {
    console.error('설정 저장 오류:', err);
  }
  return next;
}

function resetSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
  } catch (_) { /* ignore */ }
  return normalize({});
}

module.exports = {
  DEFAULTS,
  OUTPUT_QUICK_PRESETS,
  OUTPUT_RESOLUTION_PRESETS,
  PANEL_SIZE_DEFAULTS,
  PANEL_SIZE_LIMITS,
  SETTINGS_PATH,
  loadSettings,
  saveSettings,
  resetSettings,
  normalize,
  normalizeOutputResolution,
  getOutputResolution,
  findResolutionPresetId,
  normalizePanelSizes,
};
