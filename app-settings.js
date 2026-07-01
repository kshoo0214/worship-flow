const fs = require('fs');
const path = require('path');
const AtomicWrite = require('./atomic-write');
const { normalizeShortcuts } = require('./shortcuts');
const AppPaths = require('./app-paths');

function settingsPath() {
  return AppPaths.resolveUserFile('settings.json');
}

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
  outputLockAspect: false,
  /** Stage display logical resolution (independent from program output). */
  stageWidth: 1920,
  stageHeight: 1080,
  stageLockAspect: false,
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
  /** Cloud relay base URL (e.g. https://relay.example.com or http://127.0.0.1:8766) */
  remoteCloudUrl: 'http://127.0.0.1:8766',
  /** Use cloud relay for phone remote (room code + PC approval) */
  remoteUseCloud: true,
  /** Theme id applied to Bible workspace slides (empty = default black) */
  bibleThemeId: '',
  /** Active Bible translation: old (개역한글) | revised (개역개정) */
  bibleVersion: 'old',
  /** Active ProPresenter-style Look preset id (multi-display matrix). */
  /** Relay overlay logical resolution (transparent capture for OBS etc.). */
  relayWidth: 1920,
  relayHeight: 1080,
  relayLockAspect: false,
  /** Electron display.id for relay overlay (empty = auto). */
  relayDisplayId: '',
  autoOpenRelayOnStart: false,
  /** @deprecated use autoOpenRelayOnStart */
  relayOutputEnabled: false,
  /** Song/folder section header colors in slide grid { title: '#hex' } */
  slideSectionColors: {},
  /** Editor guide overlays */
  showGuideCrosshair: true,
  showGuideSafeArea: true,
  showGuideTitleSafe: true,
  /** Bottom media bin panel visible in live mode */
  mediaPanelVisible: true,
  /** Electron display.id for stage display (empty = auto tertiary / same as output) */
  stageDisplayId: '',
  autoOpenStageOnStart: false,
  stageShowClock: true,
  stageShowCounter: true,
  stageShowSongTitle: true,
  stageShowGroup: true,
  stageShowReference: true,
  stageShowNext: true,
  stageShowProgress: true,
  stageFontScale: 100,
  stageNextFontScale: 85,
  stageLayout: 'stacked',
  stageTextAlign: 'center',
  stageBgColor: '#0a0a0f',
  stageCurrentTextColor: '#eef0f4',
  stageNextTextColor: '#cbd5e1',
  stageSongTitleColor: '#93c5fd',
  stageGroupColor: '#a78bfa',
  stageRefTextColor: '#94a3b8',
  stageSafeMargin: 20,
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

function normalizeResolution(width, height, lockAspect = false) {
  let w = clamp(Math.round(Number(width) || 1920), 320, 7680);
  let h = clamp(Math.round(Number(height) || 1080), 180, 4320);
  if (lockAspect) {
    h = clamp(Math.round(w * 9 / 16), 180, 4320);
    w = clamp(Math.round(h * 16 / 9), 320, 7680);
  }
  return { width: w, height: h };
}

/** @deprecated alias — use normalizeResolution */
function normalizeOutputResolution(width, height, lockAspect) {
  return normalizeResolution(width, height, lockAspect);
}

function getOutputResolution(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return normalizeResolution(s.outputWidth, s.outputHeight, s.outputLockAspect === true);
}

function getStageResolution(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return normalizeResolution(
    s.stageWidth ?? s.outputWidth,
    s.stageHeight ?? s.outputHeight,
    s.stageLockAspect === true,
  );
}

function getRelayResolution(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return normalizeResolution(
    s.relayWidth ?? s.outputWidth,
    s.relayHeight ?? s.outputHeight,
    s.relayLockAspect === true,
  );
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
  if (s.outputLockAspect === true) {
    const ow = Math.round(Number(s.outputWidth) || 1920);
    const oh = Math.round(Number(s.outputHeight) || 1080);
    if (Math.abs(oh - Math.round(ow * 9 / 16)) > 2) s.outputLockAspect = false;
  }
  if (s.stageLockAspect === true) {
    const sw = Math.round(Number(s.stageWidth ?? s.outputWidth) || 1920);
    const sh = Math.round(Number(s.stageHeight ?? s.outputHeight) || 1080);
    if (Math.abs(sh - Math.round(sw * 9 / 16)) > 2) s.stageLockAspect = false;
  }
  if (s.relayLockAspect === true) {
    const rw = Math.round(Number(s.relayWidth ?? s.outputWidth) || 1920);
    const rh = Math.round(Number(s.relayHeight ?? s.outputHeight) || 1080);
    if (Math.abs(rh - Math.round(rw * 9 / 16)) > 2) s.relayLockAspect = false;
  }
  const res = getOutputResolution(s);
  s.outputWidth = res.width;
  s.outputHeight = res.height;
  s.outputLockAspect = s.outputLockAspect === true;
  const stageRes = getStageResolution(s);
  s.stageWidth = stageRes.width;
  s.stageHeight = stageRes.height;
  s.stageLockAspect = s.stageLockAspect === true;
  const relayRes = getRelayResolution(s);
  s.relayWidth = relayRes.width;
  s.relayHeight = relayRes.height;
  s.relayLockAspect = s.relayLockAspect === true;
  s.relayDisplayId = String(s.relayDisplayId || '').trim();
  s.autoOpenRelayOnStart = Boolean(s.autoOpenRelayOnStart ?? s.relayOutputEnabled);
  s.relayOutputEnabled = s.autoOpenRelayOnStart;
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
  s.remoteCloudUrl = String(s.remoteCloudUrl || 'http://127.0.0.1:8766').trim().replace(/\/$/, '');
  s.remoteUseCloud = s.remoteUseCloud !== false;
  s.bibleThemeId = String(s.bibleThemeId || '').trim();
  let bibleVersion = String(s.bibleVersion || '').trim();
  if (!bibleVersion && s.bibleTranslation === 'ko') bibleVersion = 'revised';
  if (!['old', 'revised'].includes(bibleVersion)) bibleVersion = 'old';
  s.bibleVersion = bibleVersion;
  s.bibleShowVerseNumbers = Boolean(s.bibleShowVerseNumbers);
  s.slideSectionColors = (s.slideSectionColors && typeof s.slideSectionColors === 'object')
    ? s.slideSectionColors : {};
  s.showGuideCrosshair = s.showGuideCrosshair !== false;
  s.showGuideSafeArea = s.showGuideSafeArea !== false;
  s.showGuideTitleSafe = s.showGuideTitleSafe !== false;
  s.stageDisplayId = String(s.stageDisplayId || '').trim();
  s.autoOpenStageOnStart = Boolean(s.autoOpenStageOnStart);
  s.stageShowClock = s.stageShowClock !== false;
  s.stageShowCounter = s.stageShowCounter !== false;
  s.stageShowSongTitle = s.stageShowSongTitle !== false;
  s.stageShowGroup = s.stageShowGroup !== false;
  s.stageShowReference = s.stageShowReference !== false;
  s.stageShowNext = s.stageShowNext !== false;
  s.stageShowProgress = s.stageShowProgress !== false;
  s.stageFontScale = clamp(Math.round(Number(s.stageFontScale) || 100), 70, 150);
  s.stageNextFontScale = clamp(Math.round(Number(s.stageNextFontScale) || 85), 50, 120);
  s.stageLayout = s.stageLayout === 'side' ? 'side' : 'stacked';
  s.stageTextAlign = ['left', 'center', 'right'].includes(s.stageTextAlign) ? s.stageTextAlign : 'center';
  s.stageBgColor = String(s.stageBgColor || '#0a0a0f').trim();
  s.stageCurrentTextColor = String(s.stageCurrentTextColor || '#eef0f4').trim();
  s.stageNextTextColor = String(s.stageNextTextColor || '#cbd5e1').trim();
  s.stageSongTitleColor = String(s.stageSongTitleColor || '#93c5fd').trim();
  s.stageGroupColor = String(s.stageGroupColor || '#a78bfa').trim();
  s.stageRefTextColor = String(s.stageRefTextColor || '#94a3b8').trim();
  s.stageSafeMargin = clamp(Math.round(Number(s.stageSafeMargin) || 20), 8, 48);
  s.mediaPanelVisible = s.mediaPanelVisible !== false;
  s.shortcuts = normalizeShortcuts(s.shortcuts);
  s.panelSizes = normalizePanelSizes(s.panelSizes);
  return s;
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath())) {
      return normalize(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')));
    }
  } catch (err) {
    console.error('설정 읽기 오류:', err);
  }
  return normalize({});
}

function saveSettings(partial) {
  const next = normalize({ ...loadSettings(), ...(partial || {}) });
  try {
    AtomicWrite.atomicWriteJsonSync(settingsPath(), next);
  } catch (err) {
    console.error('설정 저장 오류:', err);
  }
  return next;
}

function resetSettings() {
  try {
    if (fs.existsSync(settingsPath())) fs.unlinkSync(settingsPath());
  } catch (_) { /* ignore */ }
  return normalize({});
}

module.exports = {
  DEFAULTS,
  OUTPUT_QUICK_PRESETS,
  OUTPUT_RESOLUTION_PRESETS,
  PANEL_SIZE_DEFAULTS,
  PANEL_SIZE_LIMITS,
  settingsPath,
  loadSettings,
  saveSettings,
  resetSettings,
  normalize,
  normalizeOutputResolution,
  normalizeResolution,
  getOutputResolution,
  getStageResolution,
  getRelayResolution,
  findResolutionPresetId,
  normalizePanelSizes,
};
