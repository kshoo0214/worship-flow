const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const SlideEngine = require('./slide-engine');
const AppSettings = require('./app-settings');
const ThemeStore = require('./theme-store');
const Themes = require('./themes');
const Playlists = require('./playlists');
const AtomicWrite = require('./atomic-write');
const BibleEngine = require('./bible-engine');

const appSettings = AppSettings.loadSettings();
if (!appSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

let controllerWindow = null;
let outputWindow = null;
let themeManagerWindow = null;
let outputReady = false;
/** User-intended program output visibility (hide/show, not destroy). */
let outputWindowVisible = true;
let subtitleSeq = 0;
let lastSubtitleText = '';
let lastSlide = null;
let isBlackout = false;
let currentBackgroundId = null;
/** Resolved filesystem path of the background currently on program output. */
let currentBackgroundPath = null;
/** False when operator macro hides the media/background layer. */
let mediaLayerVisible = true;
/** Dedupes program background IPC — avoids re-mounting video on every slide change. */
let lastProgramBackgroundKey = '';
let logoVisible = false;

const DATA_PATH = path.join(__dirname, 'songs.json');
const PLAYLISTS_PATH = path.join(__dirname, 'playlists.json');
const MEDIA_META_PATH = path.join(__dirname, 'media-library.json');
const BIBLE_PATH = path.join(__dirname, 'bible_ko.json');
const MEDIA_DIR = path.join(__dirname, 'media', 'assets');

let bibleCache = null;

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function ensureMediaDir() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

function ensureBibleFile() {
  if (fs.existsSync(BIBLE_PATH)) return null;
  const sample = BibleEngine.sampleBibleData();
  fs.writeFileSync(BIBLE_PATH, JSON.stringify(sample, null, 2), 'utf-8');
  return sample;
}

function loadBible() {
  ensureBibleFile();
  try {
    if (fs.existsSync(BIBLE_PATH)) {
      return JSON.parse(fs.readFileSync(BIBLE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('성경 데이터 읽기 오류:', err);
  }
  return BibleEngine.sampleBibleData();
}

function getBibleData() {
  if (!bibleCache) bibleCache = loadBible();
  return bibleCache;
}

function reloadBibleCache() {
  bibleCache = loadBible();
  return bibleCache;
}

function broadcastBible(data) {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('bible:sync', data || getBibleData());
  }
}

function mediaFilePath(filename) {
  return path.join(MEDIA_DIR, path.basename(filename));
}

function resolveMediaFileUrl(filename) {
  const fp = mediaFilePath(filename);
  if (!filename || !fs.existsSync(fp)) return null;
  return pathToFileURL(fp).href;
}

function isDataUrl(src) {
  return typeof src === 'string' && src.startsWith('data:');
}

function importImageToAssets(source, hintBase) {
  ensureMediaDir();
  let ext = '.png';
  let buffer = null;

  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string' && isDataUrl(source)) {
    const match = source.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!match) return null;
    const rawExt = match[1].toLowerCase().replace('jpeg', 'jpg');
    ext = rawExt === 'svg+xml' ? '.svg' : `.${rawExt}`;
    buffer = Buffer.from(match[2], 'base64');
  } else if (typeof source === 'string' && fs.existsSync(source)) {
    ext = path.extname(source).toLowerCase() || '.png';
    if (!IMAGE_EXT.has(ext)) return null;
    buffer = fs.readFileSync(source);
  } else {
    return null;
  }

  const id = hintBase || `bg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const filename = `${id}${ext}`;
  const dest = mediaFilePath(filename);
  fs.writeFileSync(dest, buffer);
  return filename;
}

function migrateSlideBackground(slide) {
  const normalized = SlideEngine.normalizeSlide(slide);
  const bg = normalized.background;
  if (bg.type === 'image' && !bg.file && bg.src && isDataUrl(bg.src)) {
    const file = importImageToAssets(bg.src, `slide_${normalized.id}`);
    if (file) normalized.background = { type: 'image', file };
  }
  return normalized;
}

function sanitizeBibleSongSlides(song) {
  if (!song?.slides?.length) return song;
  song.slides = song.slides.map((slide) => {
    const norm = SlideEngine.normalizeSlide(slide);
    norm.layers.forEach((layer) => {
      if (layer.type === 'text' && layer.content) {
        layer.content = BibleEngine.sanitizeVerseText(layer.content);
      }
    });
    return norm;
  });
  song.lyrics = SlideEngine.slidesToLyrics(song.slides);
  return song;
}

function migrateSongData(entry, title = '') {
  const song = SlideEngine.migrateSongEntry(entry);
  song.slides = song.slides.map(migrateSlideBackground);
  if (String(title).startsWith('성경:') || SlideEngine.isBibleSongEntry(entry)) sanitizeBibleSongSlides(song);
  return song;
}

function loadSongs() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('파일 읽기 오류:', err);
  }
  return {};
}

async function saveSongs(songs) {
  try {
    const out = {};
    for (const [title, entry] of Object.entries(songs || {})) {
      out[title] = migrateSongData(entry, title);
    }
    await AtomicWrite.atomicWriteJson(DATA_PATH, out);
  } catch (err) {
    console.error('파일 저장 오류:', err);
  }
}

function buildSongDataFromPayload(payload) {
  if (payload?.data?.slides) {
    return migrateSongData({
      version: 2,
      lyrics: String(payload.data.lyrics || ''),
      slides: payload.data.slides,
    });
  }
  if (Array.isArray(payload?.slides)) {
    return migrateSongData({
      lyrics: SlideEngine.slidesToLyrics(payload.slides),
      slides: payload.slides,
    });
  }
  return migrateSongData(String(payload?.lyrics || '').trim());
}

/** save-song IPC와 동일한 원자적 영구 저장 경로 */
async function persistSongEntry(title, originalTitle, songData) {
  const trimmed = String(title || '').trim();
  if (!trimmed || !songData) return null;
  if (!songData.slides?.length && !songData.lyrics?.trim()) return null;

  const songs = loadSongs();
  const prev = String(originalTitle || '').trim();
  if (prev && prev !== trimmed && Object.prototype.hasOwnProperty.call(songs, prev)) {
    delete songs[prev];
  }
  songs[trimmed] = songData;
  await saveSongs(songs);
  broadcastLibrary(songs);
  return songs[trimmed];
}

function programBackgroundKey(payload) {
  if (!payload) return '';
  if (payload.type === 'color') {
    return `color:${payload.id || ''}:${payload.color || '#000000'}:${payload.opacity ?? 1}`;
  }
  return `${payload.id || ''}:${payload.type}:${payload.src || ''}`;
}

function pushBackgroundToOutput(payload, { force = false } = {}) {
  if (!payload) return false;
  const key = programBackgroundKey(payload);
  if (!force && key === lastProgramBackgroundKey) return false;
  lastProgramBackgroundKey = key;
  sendToOutput('background:set', payload);
  return true;
}

function slideBackgroundToOutputPayload(background) {
  const bg = SlideEngine.normalizeBackground(background);
  if (bg.type === 'color') {
    return {
      id: `slide_bg_color_${bg.color}_${bg.opacity ?? 1}`,
      type: 'color',
      color: bg.color,
      opacity: bg.opacity ?? 1,
      src: '',
    };
  }
  if (bg.type === 'image' && bg.file) {
    const src = resolveMediaFileUrl(bg.file);
    if (!src) return null;
    return { id: `slide_bg_${bg.file}`, type: 'image', src };
  }
  if (bg.type === 'video' && bg.file) {
    const src = resolveMediaFileUrl(bg.file);
    if (!src) return null;
    return { id: `slide_bg_${bg.file}`, type: 'video', src };
  }
  if (bg.type === 'image' && bg.src) {
    return { id: `slide_bg_src_${bg.src.slice(0, 48)}`, type: 'image', src: bg.src };
  }
  return null;
}

function loadMediaLibrary() {
  try {
    if (fs.existsSync(MEDIA_META_PATH)) {
      const data = JSON.parse(fs.readFileSync(MEDIA_META_PATH, 'utf-8'));
      return Array.isArray(data.items) ? data.items : [];
    }
  } catch (err) {
    console.error('미디어 라이브러리 읽기 오류:', err);
  }
  return [];
}

async function saveMediaLibrary(items) {
  try {
    ensureMediaDir();
    await AtomicWrite.atomicWriteJson(MEDIA_META_PATH, { items });
  } catch (err) {
    console.error('미디어 라이브러리 저장 오류:', err);
  }
}

function mediaItemToPayload(item) {
  if (!item?.path || !fs.existsSync(item.path)) return null;
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    src: pathToFileURL(item.path).href,
  };
}

function normalizeLibrary(raw) {
  const out = {};
  for (const [title, entry] of Object.entries(raw || {})) {
    out[title] = migrateSongData(entry, title);
  }
  return out;
}

function nextSeq() {
  subtitleSeq += 1;
  return subtitleSeq;
}

let pendingFgQueue = [];
let pendingBg = null;
let transferCounter = 0;
let pendingTransfer = null;
let transferRetryTimer = null;
const TRANSFER_ACK_MS = 750;
const TRANSFER_MAX_RETRIES = 5;

function newTransferId() {
  transferCounter += 1;
  return `tf_${Date.now()}_${transferCounter}`;
}

function sendToOutput(channel, payload) {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  if (!outputReady) {
    const isBg = channel.startsWith('background:') || channel === 'output:clear-media';
    if (isBg) pendingBg = { channel, payload };
    else pendingFgQueue.push({ channel, payload });
    return;
  }
  outputWindow.webContents.send(channel, payload);
}

function flushPendingOutput() {
  if (pendingBg) {
    const { channel, payload } = pendingBg;
    pendingBg = null;
    sendToOutput(channel, payload);
  }
  while (pendingFgQueue.length) {
    const { channel, payload } = pendingFgQueue.shift();
    sendToOutput(channel, payload);
  }
}

function clearTransferRetry() {
  if (transferRetryTimer) {
    clearTimeout(transferRetryTimer);
    transferRetryTimer = null;
  }
}

function scheduleTransferRetry() {
  clearTransferRetry();
  transferRetryTimer = setTimeout(() => {
    if (!pendingTransfer) return;
    if (pendingTransfer.retries >= TRANSFER_MAX_RETRIES) {
      pendingTransfer = null;
      return;
    }
    pendingTransfer.retries += 1;
    sendToOutput('subtitle:slide', pendingTransfer.payload);
    scheduleTransferRetry();
  }, TRANSFER_ACK_MS);
}

/** Sync per-slide background only when no global media library item is active. */
function syncSlideBackgroundForOutput(slide) {
  if (isBlackout || !mediaLayerVisible || currentBackgroundId) return;
  const bgPayload = slideBackgroundToOutputPayload(slide?.background);
  if (bgPayload) pushBackgroundToOutput(bgPayload);
}

/** Full-state slide broadcast with ACK handshake (retries until output confirms). */
function pushSlideUpdate(slide, meta = {}) {
  const resyncBackground = meta.resyncBackground !== false;
  if (typeof meta.mediaLayerVisible === 'boolean') {
    mediaLayerVisible = meta.mediaLayerVisible;
  }
  const migrated = slide ? migrateSlideBackground(slide) : null;
  lastSlide = migrated && SlideEngine.hasSlideRenderableContent(migrated)
    ? SlideEngine.prepareSlideForBroadcast(migrated)
    : null;
  lastSubtitleText = lastSlide ? SlideEngine.getPrimaryText(lastSlide) : '';
  if (isBlackout) return;
  if (!lastSlide) {
    clearTransferRetry();
    pendingTransfer = null;
    pushForegroundClear();
    return;
  }
  const transferId = newTransferId();
  const payload = {
    type: 'full-state',
    slide: lastSlide,
    slideId: lastSlide.id,
    text: lastSubtitleText,
    slideIndex: Number.isFinite(meta.slideIndex) ? meta.slideIndex : null,
    songTitle: meta.songTitle ? String(meta.songTitle) : null,
    source: meta.source ? String(meta.source) : 'main',
    seq: nextSeq(),
    transferId,
    forceRender: true,
    timestamp: Date.now(),
  };
  pendingTransfer = { transferId, payload, retries: 0 };
  if (resyncBackground) syncSlideBackgroundForOutput(lastSlide);
  sendToOutput('subtitle:slide', payload);
  scheduleTransferRetry();
}

function notifyBackgroundState() {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('background-state', { id: currentBackgroundId });
  }
}

function pushBackgroundSet(item) {
  const payload = mediaItemToPayload(item);
  if (!payload) {
    console.warn('미디어 송출 실패 — 파일 없음:', item?.path || item?.id);
    return;
  }
  const resolvedPath = item.path ? path.resolve(item.path) : '';
  mediaLayerVisible = true;
  currentBackgroundId = item.id;
  currentBackgroundPath = resolvedPath || null;
  pushBackgroundToOutput(payload, { force: true });
  notifyBackgroundState();
}

function pushBackgroundClear() {
  currentBackgroundId = null;
  currentBackgroundPath = null;
  lastProgramBackgroundKey = '';
  sendToOutput('background:clear', { seq: nextSeq() });
  notifyBackgroundState();
}

function pushMacroClear(type) {
  if (type === 'media' || type === 'all') {
    mediaLayerVisible = false;
  }
  const channel = {
    text: 'output:clear-text',
    media: 'output:clear-media',
    all: 'output:clear-all',
  }[type];
  if (!channel) return;
  sendToOutput(channel, { seq: nextSeq() });
}

function mediaTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return null;
}

async function importMediaFiles(paths, options = {}) {
  const list = Array.isArray(paths) ? paths : [paths];
  const items = loadMediaLibrary();
  ensureMediaDir();
  const stamp = Date.now();

  const added = (await Promise.all(list.map(async (rawPath, index) => {
    const filePath = String(rawPath || '').trim();
    if (!filePath || !fs.existsSync(filePath)) return null;
    const type = mediaTypeFromPath(filePath);
    if (!type) return null;

    const id = `m_${stamp}_${index}_${Math.random().toString(36).slice(2, 6)}`;
    const dest = path.join(MEDIA_DIR, id + path.extname(filePath).toLowerCase());
    try {
      await fs.promises.copyFile(filePath, dest);
    } catch (err) {
      console.error('미디어 복사 오류:', err);
      return null;
    }

    return {
      id,
      name: path.basename(filePath),
      type,
      path: dest,
      addedAt: stamp + index,
    };
  }))).filter(Boolean);

  if (!added.length) return [];

  items.push(...added);
  const autoApplyId = options.autoApply === false ? null : added[added.length - 1].id;
  broadcastMediaLibrary({ autoApplyId, items });
  void saveMediaLibrary(items);
  return added;
}

async function deleteMediaItem(id) {
  const mediaId = String(id || '').trim();
  if (!mediaId) return false;

  const items = loadMediaLibrary();
  const idx = items.findIndex((item) => item.id === mediaId);
  if (idx < 0) return false;

  const [removed] = items.splice(idx, 1);
  await saveMediaLibrary(items);

  if (removed?.path && fs.existsSync(removed.path)) {
    try {
      fs.unlinkSync(removed.path);
    } catch (err) {
      console.error('미디어 파일 삭제 오류:', err);
    }
  }

  if (currentBackgroundId === mediaId) {
    currentBackgroundId = null;
    currentBackgroundPath = null;
    lastProgramBackgroundKey = '';
    if (mediaLayerVisible) {
      sendToOutput('background:clear', { seq: nextSeq() });
    }
    notifyBackgroundState();
  }

  broadcastMediaLibrary();
  return true;
}

function pushBlackout() {
  sendToOutput('subtitle:blackout', { seq: nextSeq() });
}

function pushUnblackout() {
  sendToOutput('subtitle:unblackout', { seq: nextSeq() });
}

function pushForegroundClear() {
  if (isBlackout) return;
  sendToOutput('subtitle:clear', { seq: nextSeq() });
}

function broadcastMediaLibrary(meta = {}) {
  const source = Array.isArray(meta.items) ? meta.items : loadMediaLibrary();
  const items = source
    .filter((item) => item?.path && fs.existsSync(item.path))
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      src: pathToFileURL(item.path).href,
    }));
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    const payload = { items, autoApplyId: meta.autoApplyId || null };
    controllerWindow.webContents.send('update-media-library', payload);
  }
}

function broadcastLibrary(songs) {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('update-library', normalizeLibrary(songs));
  }
}

function loadPlaylists() {
  try {
    if (fs.existsSync(PLAYLISTS_PATH)) {
      return Playlists.normalizePlaylists(JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf-8')));
    }
  } catch (err) {
    console.error('플레이리스트 읽기 오류:', err);
  }
  return Playlists.normalizePlaylists({});
}

async function savePlaylists(state) {
  try {
    const normalized = Playlists.normalizePlaylists(state);
    await AtomicWrite.atomicWriteJson(PLAYLISTS_PATH, normalized);
    return normalized;
  } catch (err) {
    console.error('플레이리스트 저장 오류:', err);
    return Playlists.normalizePlaylists(state);
  }
}

function broadcastPlaylists() {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('playlists:sync', loadPlaylists());
  }
}

function broadcastThemes() {
  const list = ThemeStore.listThemes();
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('themes:sync', list);
  }
  if (themeManagerWindow && !themeManagerWindow.isDestroyed()) {
    themeManagerWindow.webContents.send('themes:sync', list);
  }
}

function openThemeManagerWindow() {
  if (themeManagerWindow && !themeManagerWindow.isDestroyed()) {
    themeManagerWindow.focus();
    broadcastThemes();
    return;
  }
  themeManagerWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'Master Themes — Subtitle Broadcast',
    backgroundColor: '#14141a',
    parent: controllerWindow && !controllerWindow.isDestroyed() ? controllerWindow : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  themeManagerWindow.loadFile('themes.html');
  themeManagerWindow.on('closed', () => {
    themeManagerWindow = null;
  });
  themeManagerWindow.webContents.once('did-finish-load', () => {
    broadcastThemes();
  });
}

function broadcastSettings() {
  const settings = AppSettings.loadSettings();
  const targets = [controllerWindow, outputWindow, themeManagerWindow];
  targets.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:sync', settings);
    }
  });
}

function getConfiguredOutputResolution() {
  return AppSettings.getOutputResolution(AppSettings.loadSettings());
}

function serializeDisplay(display, index, primaryId) {
  return {
    id: String(display.id),
    index,
    label: display.label || `Display ${index + 1}`,
    isPrimary: display.id === primaryId,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    size: { ...display.size },
    scaleFactor: display.scaleFactor,
  };
}

function computeVirtualDesktopBounds(displays) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  displays.forEach((d) => {
    const b = d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function buildDisplaysPayload() {
  const all = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const displays = all.map((d, index) => serializeDisplay(d, index, primaryId));
  return {
    displays,
    virtualBounds: computeVirtualDesktopBounds(all),
    primaryId: String(primaryId),
  };
}

/** Resolve program output monitor: saved ID → secondary (non-primary) → primary. */
function resolveTargetDisplay(settings = AppSettings.loadSettings()) {
  const displays = screen.getAllDisplays();
  if (!displays.length) return screen.getPrimaryDisplay();

  const targetId = String(settings?.outputDisplayId || '').trim();
  if (targetId) {
    const found = displays.find((d) => String(d.id) === targetId);
    if (found) return found;
  }

  if (displays.length >= 2) {
    const primary = screen.getPrimaryDisplay();
    return displays.find((d) => d.id !== primary.id) || displays[1];
  }

  return screen.getPrimaryDisplay();
}

function computeOutputWindowBounds(display = resolveTargetDisplay()) {
  const { width: resW, height: resH } = getConfiguredOutputResolution();
  const area = display.workArea;
  const margin = 0.92;
  const aspect = resW / resH;
  let w = Math.floor(area.width * margin);
  let h = Math.floor(w / aspect);
  if (h > area.height * margin) {
    h = Math.floor(area.height * margin);
    w = Math.floor(h * aspect);
  }
  w = Math.max(320, w);
  h = Math.max(180, h);
  return {
    width: w,
    height: h,
    x: area.x + Math.floor((area.width - w) / 2),
    y: area.y + Math.floor((area.height - h) / 2),
  };
}

function applyOutputDisplayTarget() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  const display = resolveTargetDisplay();
  if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
  outputWindow.setBounds(display.bounds);
  if (isOutputWindowShown()) enterOutputFullscreen();
  else if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
}

function applyOutputWindowResolution() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
}

function fitOutputWindowToScreen() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
  const display = resolveTargetDisplay();
  const bounds = computeOutputWindowBounds(display);
  outputWindow.setBounds(bounds);
  if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
}

function notifyOutputWindowState() {
  if (!controllerWindow || controllerWindow.isDestroyed()) return;
  controllerWindow.webContents.send('output:state-changed', { visible: outputWindowVisible });
}

function isOutputWindowShown() {
  return Boolean(outputWindowVisible && outputWindow && !outputWindow.isDestroyed() && outputWindow.isVisible());
}

function refitOutputViewport() {
  if (!outputWindow || outputWindow.isDestroyed() || !outputReady) return;
  outputWindow.webContents.send('output:force-fit');
}

function enterOutputFullscreen() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  const display = resolveTargetDisplay();
  if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
  outputWindow.setBounds(display.bounds);
  outputWindow.setMenuBarVisibility(false);
  outputWindow.setFullScreen(true);
  if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
    setTimeout(refitOutputViewport, 80);
  }
}

function showOutputWindow() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputWindowVisible = true;
  outputWindow.show();
  enterOutputFullscreen();
  outputWindow.once('enter-full-screen', () => setTimeout(refitOutputViewport, 60));
  setTimeout(refitOutputViewport, 220);
  notifyOutputWindowState();
}

function hideOutputWindow() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputWindowVisible = false;

  let finished = false;
  const finishHide = () => {
    if (finished || !outputWindow || outputWindow.isDestroyed()) return;
    finished = true;
    try {
      if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
    } catch (_) { /* ignore */ }
    outputWindow.hide();
    notifyOutputWindowState();
  };

  if (outputWindow.isFullScreen()) {
    outputWindow.once('leave-full-screen', finishHide);
    outputWindow.setFullScreen(false);
    setTimeout(finishHide, 650);
  } else {
    finishHide();
  }
}

function toggleOutputWindow() {
  if (outputWindowVisible) hideOutputWindow();
  else showOutputWindow();
}

function attachOutputWindowHandlers() {
  if (!outputWindow || outputWindow.isDestroyed()) return;

  outputWindow.on('resize', () => {
    if (outputWindow && !outputWindow.isDestroyed() && outputReady) {
      outputWindow.webContents.send('output:viewport-changed');
    }
  });

  outputWindow.on('close', (e) => {
    e.preventDefault();
    hideOutputWindow();
  });

  outputReady = false;
  outputWindow.webContents.once('did-finish-load', () => {
    outputReady = true;
    flushPendingOutput();
    broadcastSettings();
    if (currentBackgroundId) {
      const item = loadMediaLibrary().find((i) => i.id === currentBackgroundId);
      if (item) pushBackgroundSet(item);
    }
    if (lastSlide && !isBlackout) pushSlideUpdate(lastSlide);

    const settings = AppSettings.loadSettings();
    if (settings.autoOpenOutputOnStart !== false) {
      showOutputWindow();
    } else {
      outputWindow.hide();
      outputWindowVisible = false;
      notifyOutputWindowState();
    }
  });
}

function createOutputWindow() {
  const display = resolveTargetDisplay();
  const outputBounds = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  };
  outputWindow = new BrowserWindow({
    ...outputBounds,
    frame: false,
    show: false,
    minWidth: 480,
    minHeight: 270,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'Subtitle Broadcast — Program',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  outputWindow.loadFile('output.html');
  attachOutputWindowHandlers();
}

function createWindows() {
  ensureMediaDir();

  controllerWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Subtitle Broadcast — Control',
    backgroundColor: '#14141a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  controllerWindow.loadFile('index.html');

  outputWindowVisible = AppSettings.loadSettings().autoOpenOutputOnStart !== false;
  createOutputWindow();

  controllerWindow.webContents.once('did-finish-load', () => {
    broadcastMediaLibrary();
    broadcastSettings();
    broadcastThemes();
    broadcastPlaylists();
    notifyBackgroundState();
  });

  controllerWindow.on('closed', () => {
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.destroy();
    app.quit();
  });
}

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('request-library', (event) => {
  event.reply('update-library', normalizeLibrary(loadSongs()));
});

ipcMain.on('request-bible', (event) => {
  event.reply('bible:sync', reloadBibleCache());
});

ipcMain.handle('bible:get', () => getBibleData());

ipcMain.on('request-playlists', (event) => {
  event.reply('playlists:sync', loadPlaylists());
});

ipcMain.on('playlists:save', async (_event, payload) => {
  await savePlaylists(payload);
  broadcastPlaylists();
});

ipcMain.on('request-themes', (event) => {
  event.reply('themes:sync', ThemeStore.listThemes());
});

ipcMain.on('theme:open-manager', () => {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.focus();
    controllerWindow.webContents.send('theme:enter-workspace');
    return;
  }
  openThemeManagerWindow();
});

ipcMain.on('theme:save', (_event, payload) => {
  const upsertPayload = Themes.buildThemeUpsertPayload(payload);
  if (!upsertPayload) return;
  const saved = ThemeStore.upsertTheme(upsertPayload);
  broadcastThemes();
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('theme:saved', {
      id: saved?.id || upsertPayload.id,
      name: saved?.name || upsertPayload.name,
    });
  }
});

ipcMain.on('theme:delete', (_event, payload) => {
  const id = payload?.id || payload?.name;
  if (!id) return;
  ThemeStore.deleteTheme(id);
  broadcastThemes();
});

ipcMain.on('theme:apply-song', async (_event, payload) => {
  const title = String(payload?.title || '').trim();
  const theme = ThemeStore.getTheme(payload?.themeId || payload?.themeName || payload?.name);
  if (!title || !theme) return;

  const songs = loadSongs();
  if (!Object.prototype.hasOwnProperty.call(songs, title)) return;

  const themePayload = Themes.normalizeThemePayload(theme);
  const updated = SlideEngine.applyThemeToSongEntry(songs[title], themePayload);
  const migrated = migrateSongData(updated);

  await persistSongEntry(title, title, migrated);

  const liveSlideIndex = Number.isFinite(payload?.liveSlideIndex) ? payload.liveSlideIndex : -1;

  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('theme:applied', {
      title,
      themeId: theme.id,
      themeName: theme.name,
      song: migrated,
      liveSlideIndex,
    });
  }
});

ipcMain.on('settings:get', (event) => {
  event.reply('settings:sync', AppSettings.loadSettings());
});

ipcMain.on('settings:save', (_event, partial) => {
  AppSettings.saveSettings(partial);
  broadcastSettings();
  if (partial && 'outputDisplayId' in partial) {
    applyOutputDisplayTarget();
  }
  if (partial && ('outputWidth' in partial || 'outputHeight' in partial)) {
    applyOutputWindowResolution();
  }
});

ipcMain.handle('get-displays', () => buildDisplaysPayload());

ipcMain.on('settings:reset', () => {
  AppSettings.resetSettings();
  broadcastSettings();
});

ipcMain.on('output:fit-window', () => {
  fitOutputWindowToScreen();
});

ipcMain.on('output:toggle', () => {
  toggleOutputWindow();
});

ipcMain.on('output:show', () => {
  showOutputWindow();
});

ipcMain.on('output:hide', () => {
  hideOutputWindow();
});

ipcMain.on('output:get-state', (event) => {
  event.reply('output:state-changed', { visible: outputWindowVisible });
});

ipcMain.on('request-media-library', () => {
  broadcastMediaLibrary();
});

ipcMain.on('import-media', (_event, payload) => {
  const paths = Array.isArray(payload) ? payload : [payload];
  void importMediaFiles(paths, { autoApply: true });
});

ipcMain.on('import-media-batch', (_event, paths) => {
  void importMediaFiles(paths, { autoApply: true });
});

ipcMain.on('import-slide-background', (event, payload) => {
  const filePath = payload?.filePath || payload;
  const slideId = payload?.slideId || 'slide';
  const filename = importImageToAssets(filePath, `slide_${slideId}`);
  if (filename) {
    event.reply('slide-background-imported', { file: filename, slideId });
  } else {
    event.reply('slide-background-imported', { error: 'import_failed' });
  }
});

ipcMain.on('pick-media-files', async () => {
  if (!controllerWindow || controllerWindow.isDestroyed()) return;
  const result = await dialog.showOpenDialog(controllerWindow, {
    title: '백그라운드 미디어 불러오기',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '영상·이미지',
        extensions: ['mp4', 'mov', 'webm', 'm4v', 'avi', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
      },
    ],
  });
  if (result.canceled || !result.filePaths?.length) return;
  void importMediaFiles(result.filePaths, { autoApply: true });
});

ipcMain.on('pick-slide-background', async (event, payload) => {
  if (!controllerWindow || controllerWindow.isDestroyed()) return;
  const result = await dialog.showOpenDialog(controllerWindow, {
    title: '슬라이드 배경 이미지',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return;
  const filename = importImageToAssets(result.filePaths[0], `slide_${payload?.slideId || 'bg'}`);
  if (filename) {
    event.reply('slide-background-imported', { file: filename, slideId: payload?.slideId });
  }
});

ipcMain.on('background-set', (_event, payload) => {
  const id = typeof payload === 'string' ? payload : payload?.id;
  const item = loadMediaLibrary().find((i) => i.id === id);
  if (item) pushBackgroundSet(item);
});

ipcMain.on('delete-media-item', async (_event, payload) => {
  const id = typeof payload === 'string' ? payload : payload?.id;
  await deleteMediaItem(id);
});

ipcMain.on('background-clear', () => {
  pushBackgroundClear();
});

ipcMain.on('macro-clear-text', () => pushMacroClear('text'));
ipcMain.on('macro-clear-media', () => pushMacroClear('media'));
ipcMain.on('macro-clear-all', () => pushMacroClear('all'));

function findLogoMediaItem() {
  const items = loadMediaLibrary();
  const settings = AppSettings.loadSettings();
  const preferredId = String(settings.logoMediaId || '').trim();
  if (preferredId) {
    const found = items.find((i) => i.id === preferredId);
    if (found) return found;
  }
  const image = items.find((i) => i.type === 'image');
  return image || items[0] || null;
}

function pushLogoState(visible) {
  logoVisible = Boolean(visible);
  const item = logoVisible ? findLogoMediaItem() : null;
  sendToOutput('output:logo', {
    visible: logoVisible,
    fullscreen: true,
    media: item ? mediaItemToPayload(item) : null,
    seq: nextSeq(),
  });
}

ipcMain.on('logo:toggle', (_event, visible) => {
  pushLogoState(visible);
});

ipcMain.on('save-song', async (_event, payload) => {
  const title = String(payload?.title || '').trim();
  const originalTitle = String(payload?.originalTitle || '').trim();
  if (!title) return;
  const songData = buildSongDataFromPayload(payload);
  await persistSongEntry(title, originalTitle, songData);
});

ipcMain.on('delete-song', async (_event, payload) => {
  const title = String(payload?.title || '').trim();
  if (!title) return;
  const songs = loadSongs();
  if (Object.prototype.hasOwnProperty.call(songs, title)) {
    delete songs[title];
    await saveSongs(songs);
  }
  broadcastLibrary(songs);
});

function parseSendSlidePayload(payload) {
  if (!payload) return { slide: null, meta: {} };
  if (payload.slide != null && typeof payload === 'object') {
    return {
      slide: payload.slide,
      meta: {
        slideIndex: payload.slideIndex,
        songTitle: payload.songTitle,
        source: payload.source,
        mediaLayerVisible: payload.mediaLayerVisible,
      },
    };
  }
  return { slide: payload, meta: {} };
}

ipcMain.on('send-slide', (_event, payload) => {
  const { slide, meta } = parseSendSlidePayload(payload);
  if (!slide) {
    lastSlide = null;
    lastSubtitleText = '';
    pushForegroundClear();
    return;
  }
  pushSlideUpdate(migrateSlideBackground(slide), meta);
});

ipcMain.on('output:slide-ack', (_event, data) => {
  if (!pendingTransfer || data?.transferId !== pendingTransfer.transferId) return;
  clearTransferRetry();
  pendingTransfer = null;
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('broadcast:ack', {
      transferId: data.transferId,
      slideId: data.slideId,
      seq: data.seq,
      ok: data.ok !== false,
      timestamp: data.timestamp || Date.now(),
    });
  }
});

ipcMain.on('send-subtitle', (_event, text) => {
  const value = typeof text === 'string' ? text : '';
  if (!value.trim()) {
    pushForegroundClear();
    return;
  }
  pushSlideUpdate(SlideEngine.createSlideFromText(value));
});

ipcMain.on('set-blackout', (_event, active) => {
  isBlackout = Boolean(active);
  if (isBlackout) {
    pushBlackout();
    return;
  }
  pushUnblackout();
  if (lastSlide) {
    pushSlideUpdate(lastSlide);
  } else {
    pushForegroundClear();
  }
});
