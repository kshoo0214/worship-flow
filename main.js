const { app, BrowserWindow, ipcMain, dialog, screen, session, shell } = require('electron');
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
const BibleParser = require('./bible-parser');
const AppPaths = require('./app-paths');
const MacrosStore = require('./macros-store');
const StageConfig = require('./stage-config');
const { initAutoUpdater } = require('./auto-update');
const { getMacDmgDownloadUrl, macUsesManualReleaseDownload } = require('./release-url');
const RemoteServer = require('./remote-server');
const CloudRemote = require('./cloud-remote-pc');

let autoUpdateApi = null;
let useCloudRemote = false;
let cloudRemoteShutdownDone = false;

const APP_NAME = 'Worship FLOW';
const APP_ICON = path.join(__dirname, 'build', 'icon.png');

function resolveAppIcon() {
  try {
    return fs.existsSync(APP_ICON) ? APP_ICON : undefined;
  } catch {
    return undefined;
  }
}
const WINDOW_TITLES = {
  control: `${APP_NAME} — Control`,
  program: `${APP_NAME} — Program`,
  relay: `${APP_NAME} — Relay`,
  stage: `${APP_NAME} — Stage`,
};

const appSettings = (() => {
  app.setName(APP_NAME);
  if (typeof process.title === 'string') process.title = APP_NAME;
  AppPaths.ensureUserDataLayout();
  return AppSettings.loadSettings();
})();
if (!appSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

/** Program output stays edge-locked; macOS native fullscreen exits when controller takes focus. */
let outputFullscreenLocked = true;
let outputFullscreenGuardTimer = null;

function bindWindowTitle(win, title) {
  if (!win || win.isDestroyed()) return;
  const fixed = String(title || APP_NAME).trim() || APP_NAME;
  win.setTitle(fixed);
  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    if (!win.isDestroyed()) win.setTitle(fixed);
  });
}

let controllerWindow = null;
let outputWindow = null;
let relayWindow = null;
let stageWindow = null;
let themeManagerWindow = null;
let propsEditorWindow = null;
let stageEditorWindow = null;
let macrosEditorWindow = null;
let outputReady = false;
let relayReady = false;
/** User-intended program output visibility (hide/show, not destroy). */
let outputWindowVisible = true;
let subtitleSeq = 0;
let lastSubtitleText = '';
let lastSlide = null;
/** Song slide as stored (no per-display theme override). */
let lastSlideBase = null;
/** Text-only payload split from base slide for stage metadata. */
let lastSlideContent = null;
let isBlackout = false;
let currentBackgroundId = null;
/** Resolved filesystem path of the background currently on program output. */
let currentBackgroundPath = null;
/** False when operator macro hides the media/background layer. */
let mediaLayerVisible = true;
/** Dedupes program background IPC — avoids re-mounting video on every slide change. */
let lastProgramBackgroundKey = '';
let logoVisible = false;
/** User-intended stage display visibility. */
let stageWindowVisible = false;
let relayWindowVisible = false;
let stageReady = false;
let lastStageMeta = null;
let propOverlayVisible = false;
let lastPropPayload = null;
let announcementsVisible = false;
let audioLayerVisible = true;

const APP_ROOT = AppPaths.getAppRoot();
const DATA_PATH = AppPaths.resolveUserFile('songs.json');
const PLAYLISTS_PATH = AppPaths.resolveUserFile('playlists.json');
const MEDIA_META_PATH = AppPaths.resolveUserFile('media-library.json');
const MEDIA_DIR = AppPaths.getMediaAssetsDir();

let bibleCache = null;

BibleParser.migrateAllUserBibles(APP_ROOT);

function initBibleVersionFromSettings() {
  const preferred = appSettings.bibleVersion === 'revised' ? 'revised' : 'old';
  if (preferred === 'revised' && BibleParser.isRevisedAvailable(APP_ROOT)) {
    BibleParser.setActiveVersion('revised', APP_ROOT);
  } else {
    BibleParser.setActiveVersion('old', APP_ROOT);
  }
}

initBibleVersionFromSettings();

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function ensureMediaDir() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

function loadBible() {
  return BibleParser.reloadBible(APP_ROOT);
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
    controllerWindow.webContents.send('bible:sync', data || getBibleData(), BibleParser.getStatus(APP_ROOT));
  }
}

function notifyBibleDownloadRequired() {
  if (controllerWindow && !controllerWindow.isDestroyed() && BibleParser.needsRevisedDownload(APP_ROOT)) {
    controllerWindow.webContents.send('bible:download-required');
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

function pushBackgroundToDisplays(payload, { force = false } = {}) {
  if (!payload) return false;
  const key = programBackgroundKey(payload);
  const keyChanged = force || key !== lastProgramBackgroundKey;
  if (keyChanged) lastProgramBackgroundKey = key;

  if (mediaLayerVisible) {
    if (keyChanged) {
      sendToOutput('background:set', payload);
      sendToRelay('background:set', payload);
    }
  } else {
    sendToOutput('background:clear', { seq: nextSeq() });
    sendToRelay('background:clear', { seq: nextSeq() });
  }
  return mediaLayerVisible;
}

function pushBackgroundToOutput(payload, { force = false } = {}) {
  return pushBackgroundToDisplays(payload, { force });
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
let pendingRelayQueue = [];
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

function sendToRelay(channel, payload) {
  if (!relayWindow || relayWindow.isDestroyed()) return;
  if (!relayReady) {
    pendingRelayQueue.push({ channel, payload });
    return;
  }
  relayWindow.webContents.send(channel, payload);
}

function flushPendingRelay() {
  if (!relayWindow || relayWindow.isDestroyed() || !relayReady) return;
  while (pendingRelayQueue.length) {
    const { channel, payload } = pendingRelayQueue.shift();
    relayWindow.webContents.send(channel, payload);
  }
}

function sendToProgramOutputs(channel, payload) {
  sendToOutput(channel, payload);
  sendToRelay(channel, payload);
}

function rerenderLiveSlide(meta = {}) {
  if (isBlackout) {
    pushStageUpdate(meta);
    return;
  }
  if (lastSlideBase) {
    pushSlideUpdate(lastSlideBase, {
      ...meta,
      songTitle: meta.songTitle ?? lastStageMeta?.songTitle,
      slideIndex: meta.slideIndex ?? lastStageMeta?.slideIndex,
      totalSlides: meta.totalSlides ?? lastStageMeta?.totalSlides,
      current: meta.current,
      next: meta.next,
    });
    return;
  }
  if (lastSlide) pushSlideUpdate(lastSlide, meta);
}

function replayOverlayLayersFromState() {
  if (isBlackout) return;
  if (propOverlayVisible && lastPropPayload) {
    sendToProgramOutputs('output:prop-show', lastPropPayload);
  }
  if (!audioLayerVisible) {
    sendToProgramOutputs('output:clear-audio', { seq: nextSeq() });
  } else {
    sendToProgramOutputs('output:audio-restore', { seq: nextSeq() });
  }
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
    sendToProgramOutputs('subtitle:slide', pendingTransfer.payload);
    scheduleTransferRetry();
  }, TRANSFER_ACK_MS);
}

/** Sync per-slide background to program and relay outputs. */
function syncSlideBackgroundForDisplays(slide) {
  if (isBlackout || currentBackgroundId || !mediaLayerVisible) return;
  const bgPayload = slideBackgroundToOutputPayload(slide?.background);
  if (!bgPayload) return;
  sendToOutput('background:set', bgPayload);
  sendToRelay('background:set', bgPayload);
}

function syncSlideBackgroundForOutput(slide) {
  syncSlideBackgroundForDisplays(slide);
}

function extractCurrentFromMeta(meta = {}) {
  if (meta.current && typeof meta.current === 'object') {
    return {
      body: meta.current.body != null ? String(meta.current.body) : '',
      reference: meta.current.reference != null ? String(meta.current.reference) : '',
      group: meta.current.group ? String(meta.current.group) : '',
    };
  }
  const hasFlat = meta.currentText != null || meta.currentReference != null || meta.currentGroup;
  if (hasFlat) {
    return {
      body: meta.currentText != null ? String(meta.currentText) : '',
      reference: meta.currentReference != null ? String(meta.currentReference) : '',
      group: meta.currentGroup ? String(meta.currentGroup) : '',
    };
  }
  return null;
}

function extractNextFromMeta(meta = {}) {
  if (meta.next && typeof meta.next === 'object') {
    return {
      body: meta.next.body != null ? String(meta.next.body) : '',
      reference: meta.next.reference != null ? String(meta.next.reference) : '',
      group: meta.next.group ? String(meta.next.group) : '',
    };
  }
  const hasFlat = meta.nextText != null || meta.nextReference != null || meta.nextGroup;
  if (hasFlat) {
    return {
      body: meta.nextText != null ? String(meta.nextText) : '',
      reference: meta.nextReference != null ? String(meta.nextReference) : '',
      group: meta.nextGroup ? String(meta.nextGroup) : '',
    };
  }
  return lastStageMeta?.next || { body: '', reference: '', group: '' };
}

function rebuildLastStageMeta(meta = {}) {
  const fromMeta = extractCurrentFromMeta(meta);
  let current = fromMeta;
  if (!current && lastSlideContent && lastSlideBase) {
    const merged = SlideEngine.mergeContentIntoSlide(lastSlideBase, lastSlideContent);
    current = SlideEngine.getStageTextFromSlide(merged);
  }
  if (!current && lastSlideBase) {
    current = SlideEngine.getStageTextFromSlide(lastSlideBase);
  }
  if (!current) current = { body: '', reference: '', group: '' };

  const next = extractNextFromMeta(meta);
  const settings = AppSettings.loadSettings();
  return {
    songTitle: meta.songTitle != null ? String(meta.songTitle)
      : (lastStageMeta?.songTitle != null ? lastStageMeta.songTitle : null),
    slideIndex: Number.isFinite(meta.slideIndex) ? meta.slideIndex
      : (Number.isFinite(lastStageMeta?.slideIndex) ? lastStageMeta.slideIndex : null),
    totalSlides: Number.isFinite(meta.totalSlides) ? meta.totalSlides
      : (Number.isFinite(lastStageMeta?.totalSlides) ? lastStageMeta.totalSlides : null),
    current,
    next,
    isBlackout,
    ...StageConfig.buildUpdatePayload(settings),
    timestamp: Date.now(),
  };
}

function getRemotePayload() {
  const meta = lastStageMeta || rebuildLastStageMeta({});
  const settings = AppSettings.loadSettings();
  const slideIndex = Number.isFinite(meta.slideIndex) ? meta.slideIndex : -1;
  const totalSlides = Number.isFinite(meta.totalSlides) ? meta.totalSlides : 0;
  const wrap = settings.slideAdvanceWrap === true;
  return {
    songTitle: meta.songTitle || '',
    slideIndex: slideIndex >= 0 ? slideIndex : null,
    totalSlides: totalSlides > 0 ? totalSlides : null,
    currentText: meta.current?.body || lastSubtitleText || '',
    currentReference: meta.current?.reference || '',
    currentGroup: meta.current?.group || '',
    current: meta.current || { body: '', reference: '', group: '' },
    nextText: meta.next?.body || '',
    nextReference: meta.next?.reference || '',
    nextGroup: meta.next?.group || '',
    next: meta.next || { body: '', reference: '', group: '' },
    isBlackout,
    canPrev: slideIndex > 0 || (wrap && totalSlides > 0),
    canNext: totalSlides > 0,
    timestamp: Date.now(),
  };
}

function syncRemoteClients() {
  const payload = getRemotePayload();
  try {
    if (useCloudRemote) CloudRemote.broadcastState(payload);
    else RemoteServer.broadcastRemoteState(payload);
  } catch (err) {
    console.error('remote broadcast failed:', err);
  }
}

function resolveRelayUrl() {
  const settings = AppSettings.loadSettings();
  if (settings.remoteUseCloud === false) return '';
  const envUrl = String(process.env.WORSHIP_FLOW_RELAY_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/$/, '');
  return String(settings.remoteCloudUrl || '').trim().replace(/\/$/, '');
}

function notifyRemoteJoinRequest(request) {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('remote:join-request', request);
  }
}

async function initRemoteServices() {
  const relayUrl = resolveRelayUrl();
  if (relayUrl) {
    useCloudRemote = true;
    const info = await CloudRemote.initCloudRemotePc({
      relayUrl,
      userDataDir: app.getPath('userData'),
      onJoinRequest: notifyRemoteJoinRequest,
      onNavigate: (direction) => {
        if (controllerWindow && !controllerWindow.isDestroyed()) {
          controllerWindow.webContents.send('remote:navigate', { direction });
        }
      },
    });
    console.log('Worship FLOW cloud remote:', info.joinUrl, 'code:', info.code);
    return info;
  }
  useCloudRemote = false;
  return RemoteServer.initRemoteServer({
    appRoot: APP_ROOT,
    port: RemoteServer.DEFAULT_PORT,
    getState: getRemotePayload,
    onNavigate: (direction) => {
      if (controllerWindow && !controllerWindow.isDestroyed()) {
        controllerWindow.webContents.send('remote:navigate', { direction });
      }
    },
  });
}

function pushStageUpdate(meta = {}) {
  lastStageMeta = rebuildLastStageMeta(meta);
  syncRemoteClients();
  if (!stageWindow || stageWindow.isDestroyed() || !stageReady) return;
  stageWindow.webContents.send('stage:update', lastStageMeta);
  if (stageEditorWindow && !stageEditorWindow.isDestroyed()) {
    stageEditorWindow.webContents.send('stage:update', lastStageMeta);
  }
}

/** Full-state slide broadcast with ACK handshake (retries until output confirms). */
function pushSlideUpdate(slide, meta = {}) {
  const resyncBackground = meta.resyncBackground !== false;
  if (typeof meta.mediaLayerVisible === 'boolean') {
    mediaLayerVisible = meta.mediaLayerVisible;
  }
  const migrated = slide ? migrateSlideBackground(slide) : null;
  const extracted = migrated ? SlideEngine.extractSlideContent(migrated) : null;
  lastSlideBase = extracted?.baseSlide || null;
  lastSlideContent = extracted?.payload || null;
  lastSlide = lastSlideBase && SlideEngine.hasSlideRenderableContent(lastSlideBase)
    ? SlideEngine.prepareSlideForBroadcast(lastSlideBase)
    : null;
  lastSubtitleText = lastSlideContent?.body
    ? String(lastSlideContent.body).trim()
    : (lastSlide ? SlideEngine.getPrimaryText(lastSlide) : '');

  const stagePatch = {
    songTitle: meta.songTitle,
    slideIndex: meta.slideIndex,
    totalSlides: meta.totalSlides,
    currentText: meta.currentText,
    currentReference: meta.currentReference,
    currentGroup: meta.currentGroup,
    current: meta.current,
    nextText: meta.nextText,
    nextReference: meta.nextReference,
    nextGroup: meta.nextGroup,
    next: meta.next,
  };

  if (isBlackout) {
    pushStageUpdate(stagePatch);
    return;
  }

  if (!lastSlideBase || !lastSlideContent) {
    clearTransferRetry();
    pendingTransfer = null;
    pushForegroundClear();
    pushStageUpdate(stagePatch);
    return;
  }

  const slidePayload = {
    content: lastSlideContent,
    baseSlide: lastSlideBase,
    slideId: lastSlideBase.id,
    text: lastSubtitleText,
    slideIndex: Number.isFinite(meta.slideIndex) ? meta.slideIndex : null,
    songTitle: meta.songTitle ? String(meta.songTitle) : null,
    source: meta.source ? String(meta.source) : 'main',
    seq: nextSeq(),
    timestamp: Date.now(),
  };

  if (meta.layerRestore === true) {
    clearTransferRetry();
    pendingTransfer = null;
    sendToProgramOutputs('subtitle:slide', {
      ...slidePayload,
      type: 'layer-restore',
      layerRestore: true,
    });
    pushStageUpdate(stagePatch);
    return;
  }

  const transferId = newTransferId();
  const payload = {
    ...slidePayload,
    type: 'full-state',
    transferId,
    forceRender: true,
  };
  pendingTransfer = { transferId, payload, retries: 0 };
  if (resyncBackground) syncSlideBackgroundForOutput(lastSlideBase);
  sendToProgramOutputs('subtitle:slide', payload);
  scheduleTransferRetry();
  pushStageUpdate(stagePatch);
}

function sendToStage(channel, payload) {
  if (!stageWindow || stageWindow.isDestroyed() || !stageReady) return;
  stageWindow.webContents.send(channel, payload);
}

function notifyPropState() {
  const payload = {
    activePropId: lastPropPayload?.propId || '',
    visible: propOverlayVisible,
  };
  [controllerWindow, propsEditorWindow].forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send('prop:state-changed', payload);
  });
}

function pushPropShow(prop) {
  if (!prop?.text) return;
  propOverlayVisible = true;
  lastPropPayload = {
    propId: String(prop.id || '').trim(),
    text: String(prop.text),
    name: String(prop.name || ''),
    position: prop.position || 'bottom',
    fontSize: Number(prop.fontSize) || 5,
    color: prop.color || '#ffffff',
    bgColor: prop.bgColor || '#000000',
    bgOpacity: Number.isFinite(Number(prop.bgOpacity)) ? Number(prop.bgOpacity) : 0.55,
    boxX: prop.boxX,
    boxY: prop.boxY,
    boxW: prop.boxW,
    boxH: prop.boxH,
    seq: nextSeq(),
  };
  if (!isBlackout) sendToProgramOutputs('output:prop-show', lastPropPayload);
  notifyPropState();
}

function pushPropClear() {
  propOverlayVisible = false;
  lastPropPayload = null;
  sendToProgramOutputs('output:prop-clear', { seq: nextSeq() });
  notifyPropState();
}

function pushAnnounceShow(text) {
  announcementsVisible = true;
  if (!isBlackout) {
    sendToProgramOutputs('output:announce-show', { text: String(text || ''), seq: nextSeq() });
  }
}

function pushAnnounceClear() {
  announcementsVisible = false;
  sendToProgramOutputs('output:announce-clear', { seq: nextSeq() });
}

function pushAudioLayerRestore() {
  audioLayerVisible = true;
  sendToProgramOutputs('output:audio-restore', { seq: nextSeq() });
}

function broadcastMacros() {
  const data = MacrosStore.loadMacrosFile();
  [controllerWindow, propsEditorWindow].forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send('macros:sync', data);
  });
}

function notifyBackgroundState() {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('background-state', { id: currentBackgroundId });
  }
}

function pushBackgroundSet(item, { force = false } = {}) {
  const payload = mediaItemToPayload(item);
  if (!payload) {
    console.warn('미디어 송출 실패 — 파일 없음:', item?.path || item?.id);
    return;
  }
  const resolvedPath = item.path ? path.resolve(item.path) : '';
  if (!force && item.id === currentBackgroundId && resolvedPath && resolvedPath === currentBackgroundPath) return;
  mediaLayerVisible = true;
  currentBackgroundId = item.id;
  currentBackgroundPath = resolvedPath || null;
  if (!isBlackout) pushBackgroundToOutput(payload, { force });
  notifyBackgroundState();
}

function pushMacroRestoreMedia() {
  mediaLayerVisible = true;
  sendToProgramOutputs('output:restore-media', { seq: nextSeq() });
  if (isBlackout) return;
  if (currentBackgroundId) {
    const item = loadMediaLibrary().find((i) => i.id === currentBackgroundId);
    if (item) {
      const bgPayload = mediaItemToPayload(item);
      if (bgPayload) pushBackgroundToDisplays(bgPayload, { force: true });
    }
  } else if (lastSlideBase) {
    syncSlideBackgroundForDisplays(lastSlideBase);
  } else if (lastSlide) {
    syncSlideBackgroundForDisplays(lastSlide);
  }
}

function pushBackgroundClear() {
  currentBackgroundId = null;
  currentBackgroundPath = null;
  lastProgramBackgroundKey = '';
  sendToOutput('background:clear', { seq: nextSeq() });
  sendToRelay('background:clear', { seq: nextSeq() });
  notifyBackgroundState();
}

function pushMacroClear(type) {
  if (type === 'media' || type === 'all') {
    mediaLayerVisible = false;
  }
  if (type === 'props' || type === 'all') {
    propOverlayVisible = false;
    lastPropPayload = null;
    notifyPropState();
  }
  if (type === 'audio' || type === 'all') {
    audioLayerVisible = false;
  }
  if (type === 'announcements' || type === 'all') {
    announcementsVisible = false;
  }
  const channel = {
    text: 'output:clear-text',
    media: 'output:clear-media',
    design: 'output:clear-design',
    props: 'output:clear-props',
    audio: 'output:clear-audio',
    announcements: 'output:clear-announcements',
    all: 'output:clear-all',
  }[type];
  if (!channel) return;
  sendToProgramOutputs(channel, { seq: nextSeq() });
  if (type === 'props' || type === 'all') {
    sendToProgramOutputs('output:prop-clear', { seq: nextSeq() });
  }
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
  sendToProgramOutputs('subtitle:blackout', { seq: nextSeq() });
}

function pushUnblackout() {
  sendToProgramOutputs('subtitle:unblackout', { seq: nextSeq() });
}

function pushForegroundClear() {
  if (isBlackout) return;
  sendToProgramOutputs('subtitle:clear', { seq: nextSeq() });
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
  const targets = [controllerWindow, themeManagerWindow, macrosEditorWindow];
  targets.forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send('themes:sync', list);
  });
}

function applyStageDisplayTarget() {
  if (!stageWindow || stageWindow.isDestroyed()) return;
  const display = resolveStageDisplay();
  const bounds = {
    x: display.bounds.x + 40,
    y: display.bounds.y + 40,
    width: Math.min(1280, Math.max(640, display.bounds.width - 80)),
    height: Math.min(720, Math.max(360, display.bounds.height - 80)),
  };
  stageWindow.setBounds(bounds);
}

function applyRelayDisplayTarget() {
  if (!relayWindow || relayWindow.isDestroyed()) return;
  relayWindow.setBounds(computeRelayWindowBounds(resolveRelayDisplay()));
  if (relayReady) {
    relayWindow.webContents.send('output:viewport-changed');
  }
}

function fitRelayWindowToScreen() {
  applyRelayDisplayTarget();
}

function openPropsEditorWindow(focusPropId = '') {
  const focusId = String(focusPropId || '').trim();
  if (propsEditorWindow && !propsEditorWindow.isDestroyed()) {
    propsEditorWindow.focus();
    broadcastMacros();
    notifyPropState();
    if (focusId) propsEditorWindow.webContents.send('props-editor:focus', { propId: focusId });
    return;
  }
  propsEditorWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    title: `Props Editor — ${APP_NAME}`,
    backgroundColor: '#14141a',
    parent: controllerWindow && !controllerWindow.isDestroyed() ? controllerWindow : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  propsEditorWindow.loadFile('props-editor.html');
  propsEditorWindow.on('closed', () => {
    propsEditorWindow = null;
  });
  propsEditorWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
    broadcastMacros();
    notifyPropState();
    if (focusId) propsEditorWindow.webContents.send('props-editor:focus', { propId: focusId });
  });
}

function openMacrosEditorWindow() {
  if (macrosEditorWindow && !macrosEditorWindow.isDestroyed()) {
    macrosEditorWindow.focus();
    broadcastMacros();
    broadcastThemes();
    return;
  }
  macrosEditorWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    title: `Macro Editor — ${APP_NAME}`,
    backgroundColor: '#14141a',
    parent: controllerWindow && !controllerWindow.isDestroyed() ? controllerWindow : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  macrosEditorWindow.loadFile('macro-editor.html');
  macrosEditorWindow.on('closed', () => {
    macrosEditorWindow = null;
  });
  macrosEditorWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
    broadcastMacros();
    broadcastThemes();
  });
}

function openStageEditorWindow() {
  if (stageEditorWindow && !stageEditorWindow.isDestroyed()) {
    stageEditorWindow.focus();
    broadcastSettings();
    if (lastStageMeta) stageEditorWindow.webContents.send('stage:update', lastStageMeta);
    return;
  }
  stageEditorWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: `Stage Display Editor — ${APP_NAME}`,
    backgroundColor: '#14141a',
    parent: controllerWindow && !controllerWindow.isDestroyed() ? controllerWindow : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  stageEditorWindow.loadFile('stage-editor.html');
  stageEditorWindow.on('closed', () => {
    stageEditorWindow = null;
  });
  stageEditorWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
    if (lastStageMeta) stageEditorWindow.webContents.send('stage:update', lastStageMeta);
    else if (lastSlide) pushStageUpdate({});
  });
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
    title: `Master Themes — ${APP_NAME}`,
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
  const targets = [
    controllerWindow, outputWindow, relayWindow, themeManagerWindow,
    stageWindow, propsEditorWindow, stageEditorWindow, macrosEditorWindow,
  ];
  targets.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:sync', settings);
    }
  });
  if (stageWindow && !stageWindow.isDestroyed() && stageReady) {
    pushStageUpdate({});
  } else if (lastStageMeta) {
    lastStageMeta = rebuildLastStageMeta({});
  }
  if (stageEditorWindow && !stageEditorWindow.isDestroyed() && lastStageMeta) {
    stageEditorWindow.webContents.send('stage:update', lastStageMeta);
  }
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

/** Stage display monitor: saved ID → tertiary display → secondary → primary. */
function resolveStageDisplay(settings = AppSettings.loadSettings()) {
  const displays = screen.getAllDisplays();
  if (!displays.length) return screen.getPrimaryDisplay();

  const targetId = String(settings?.stageDisplayId || '').trim();
  if (targetId) {
    const found = displays.find((d) => String(d.id) === targetId);
    if (found) return found;
  }

  const primary = screen.getPrimaryDisplay();
  const outputDisplay = resolveTargetDisplay(settings);
  const others = displays.filter((d) => d.id !== primary.id && d.id !== outputDisplay.id);
  if (others.length) return others[0];
  if (displays.length >= 2 && outputDisplay.id === primary.id) {
    return displays.find((d) => d.id !== primary.id) || displays[1];
  }
  return outputDisplay;
}

/** Relay overlay monitor: saved ID → unused display → secondary → primary. */
function resolveRelayDisplay(settings = AppSettings.loadSettings()) {
  const displays = screen.getAllDisplays();
  if (!displays.length) return screen.getPrimaryDisplay();

  const targetId = String(settings?.relayDisplayId || '').trim();
  if (targetId) {
    const found = displays.find((d) => String(d.id) === targetId);
    if (found) return found;
  }

  const outputDisplay = resolveTargetDisplay(settings);
  const stageDisplay = resolveStageDisplay(settings);
  const used = new Set([String(outputDisplay.id), String(stageDisplay.id)]);
  const others = displays.filter((d) => !used.has(String(d.id)));
  if (others.length) return others[0];
  if (displays.length >= 2) {
    return displays.find((d) => !d.isPrimary) || displays[1];
  }
  return outputDisplay;
}

function getConfiguredRelayResolution(settings = AppSettings.loadSettings()) {
  return AppSettings.getRelayResolution(settings);
}

function computeRelayWindowBounds(display = resolveRelayDisplay()) {
  const { width: resW, height: resH } = getConfiguredRelayResolution();
  const area = display.workArea || display.bounds;
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
  if (isOutputWindowShown()) ensureOutputFullscreen({ forceRefit: true });
  else if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
}

function applyOutputWindowResolution() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
  if (isOutputWindowShown()) scheduleOutputFullscreenGuard();
}

function fitOutputWindowToScreen() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputFullscreenLocked = false;
  if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
  if (process.platform === 'darwin' && outputWindow.isSimpleFullScreen()) {
    outputWindow.setSimpleFullScreen(false);
  }
  const display = resolveTargetDisplay();
  const bounds = computeOutputWindowBounds(display);
  outputWindow.setResizable(true);
  outputWindow.setMaximizable(true);
  outputWindow.setBounds(bounds);
  if (outputReady) {
    outputWindow.webContents.send('output:viewport-changed');
  }
}

function outputBoundsMatch(win, bounds) {
  if (!win || win.isDestroyed() || !bounds) return false;
  const cur = win.getBounds();
  return cur.x === bounds.x
    && cur.y === bounds.y
    && cur.width === bounds.width
    && cur.height === bounds.height;
}

function scheduleOutputFullscreenGuard() {
  if (!outputFullscreenLocked || !outputWindowVisible) return;
  clearTimeout(outputFullscreenGuardTimer);
  outputFullscreenGuardTimer = setTimeout(() => {
    ensureOutputFullscreen({ refit: false });
  }, 200);
}

/** Borderless monitor lock — avoids macOS simpleFullScreen (hides dock + steals desktop space). */
function ensureOutputFullscreen(opts = {}) {
  if (!outputWindow || outputWindow.isDestroyed() || !outputWindowVisible) return;
  const display = resolveTargetDisplay();
  const target = display.bounds;
  const boundsChanged = !outputBoundsMatch(outputWindow, target);
  const refit = opts.refit !== false && (boundsChanged || opts.forceRefit);

  outputWindow.setMenuBarVisibility(false);

  if (process.platform === 'darwin') {
    if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
    if (outputWindow.isSimpleFullScreen()) outputWindow.setSimpleFullScreen(false);
    if (boundsChanged) outputWindow.setBounds(target);
    outputWindow.setResizable(false);
    outputWindow.setMaximizable(false);
    outputWindow.setFullScreenable(false);
  } else {
    if (typeof outputWindow.setAlwaysOnTop === 'function') outputWindow.setAlwaysOnTop(false);
    if (boundsChanged) outputWindow.setBounds(target);
    if (!outputWindow.isFullScreen()) outputWindow.setFullScreen(true);
  }

  if (outputReady && refit) {
    outputWindow.webContents.send('output:viewport-changed');
    setTimeout(refitOutputViewport, 120);
  }
}

function attachOutputFullscreenGuards() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputWindow.removeAllListeners('leave-full-screen');

  outputWindow.on('leave-full-screen', () => {
    if (outputFullscreenLocked && outputWindowVisible) scheduleOutputFullscreenGuard();
  });
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
  outputFullscreenLocked = true;
  ensureOutputFullscreen();
}

function showOutputWindow() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputWindowVisible = true;
  outputFullscreenLocked = true;
  outputWindow.show();
  ensureOutputFullscreen({ forceRefit: true });
  setTimeout(refitOutputViewport, 220);
  notifyOutputWindowState();
}

function hideOutputWindow() {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputWindowVisible = false;
  outputFullscreenLocked = false;
  clearTimeout(outputFullscreenGuardTimer);

  try {
    if (outputWindow.isFullScreen()) outputWindow.setFullScreen(false);
    if (process.platform === 'darwin' && outputWindow.isSimpleFullScreen()) {
      outputWindow.setSimpleFullScreen(false);
    }
  } catch (_) { /* ignore */ }
  outputWindow.setResizable(true);
  outputWindow.setMaximizable(true);
  outputWindow.setFullScreenable(true);
  outputWindow.hide();
  notifyOutputWindowState();
}

function toggleOutputWindow() {
  if (outputWindowVisible) hideOutputWindow();
  else showOutputWindow();
}

function replayOutputState() {
  if (isBlackout) {
    pushBlackout();
  } else if (lastSlideBase) {
    pushSlideUpdate(lastSlideBase, {});
  }
  if (propOverlayVisible && lastPropPayload && !isBlackout) {
    sendToProgramOutputs('output:prop-show', lastPropPayload);
  }
  if (logoVisible && !isBlackout) {
    const item = findLogoMediaItem();
    if (item) {
      sendToProgramOutputs('output:logo', {
        visible: true,
        fullscreen: true,
        media: mediaItemToPayload(item),
        seq: nextSeq(),
      });
    }
  }
  if (!audioLayerVisible) {
    sendToProgramOutputs('output:clear-audio', { seq: nextSeq() });
  }
}

function attachOutputWindowHandlers() {
  if (!outputWindow || outputWindow.isDestroyed()) return;

  attachOutputFullscreenGuards();

  outputWindow.on('close', (e) => {
    e.preventDefault();
    hideOutputWindow();
  });

  outputWindow.webContents.on('did-finish-load', () => {
    outputReady = true;
    flushPendingOutput();
    broadcastSettings();
    if (currentBackgroundId && mediaLayerVisible && !isBlackout) {
      const item = loadMediaLibrary().find((i) => i.id === currentBackgroundId);
      if (item) pushBackgroundSet(item);
    }
    replayOutputState();

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
  outputReady = false;
  outputWindow = new BrowserWindow({
    ...outputBounds,
    frame: false,
    show: false,
    minWidth: 480,
    minHeight: 270,
    resizable: process.platform !== 'darwin',
    maximizable: process.platform !== 'darwin',
    fullscreenable: process.platform !== 'darwin',
    title: WINDOW_TITLES.program,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  if (typeof outputWindow.setContentProtection === 'function') {
    outputWindow.setContentProtection(false);
  }
  outputWindow.loadFile('output.html');
  bindWindowTitle(outputWindow, WINDOW_TITLES.program);
  attachOutputWindowHandlers();
}

function configureAppSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const requestingUrl = String(details?.requestingUrl || '');
    const isLocal = requestingUrl.startsWith('file://');
    if (!isLocal) {
      callback(false);
      return;
    }
    if (permission === 'media' || permission === 'fullscreen') {
      callback(true);
      return;
    }
    // Block screen/desktop capture prompts from renderer (OBS uses external capture).
    callback(false);
  });
  ses.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    const requestingUrl = String(details?.requestingUrl || '');
    if (!requestingUrl.startsWith('file://')) return false;
    return permission === 'media' || permission === 'fullscreen';
  });
}

function configureRelayWindowForCapture(win) {
  if (!win || win.isDestroyed()) return;
  if (typeof win.setContentProtection === 'function') win.setContentProtection(false);
  win.setFocusable(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  if (typeof win.setHasShadow === 'function') win.setHasShadow(false);
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (typeof win.setWindowButtonVisibility === 'function') win.setWindowButtonVisibility(false);
  }
  win.setAlwaysOnTop(true, 'floating');
  win.setTitle(WINDOW_TITLES.relay);
}

function showRelayWindowForCapture() {
  if (!relayWindow || relayWindow.isDestroyed()) return;
  relayWindow.setTitle(WINDOW_TITLES.relay);
  relayWindow.show();
  configureRelayWindowForCapture(relayWindow);
}

let relayResizeTimer = null;
function scheduleRelayViewportRefit() {
  if (!relayWindow || relayWindow.isDestroyed() || !relayReady) return;
  clearTimeout(relayResizeTimer);
  relayResizeTimer = setTimeout(() => {
    if (relayWindow && !relayWindow.isDestroyed() && relayReady) {
      relayWindow.webContents.send('output:viewport-changed');
    }
  }, 120);
}

function attachRelayWindowHandlers() {
  if (!relayWindow || relayWindow.isDestroyed()) return;
  relayWindow.removeAllListeners('resize');
  relayWindow.removeAllListeners('close');
  relayWindow.webContents.removeAllListeners('did-finish-load');
  relayWindow.on('resize', () => scheduleRelayViewportRefit());
  relayWindow.on('close', (e) => {
    e.preventDefault();
    hideRelayWindow();
  });
  relayWindow.webContents.on('did-finish-load', () => {
    relayReady = true;
    broadcastSettings();
    replayOutputState();
    flushPendingRelay();
    configureRelayWindowForCapture(relayWindow);
    if (relayWindowVisible) showRelayWindowForCapture();
    else relayWindow.hide();
    notifyRelayWindowState();
  });
}

function createRelayWindow() {
  if (relayWindow && !relayWindow.isDestroyed()) return;
  relayReady = false;
  pendingRelayQueue = [];
  const bounds = computeRelayWindowBounds(resolveRelayDisplay());
  const relayOptions = {
    ...bounds,
    show: false,
    transparent: true,
    minWidth: 320,
    minHeight: 180,
    resizable: true,
    hasShadow: false,
    focusable: true,
    acceptFirstMouse: true,
    backgroundColor: '#00000000',
    title: WINDOW_TITLES.relay,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  };
  if (process.platform === 'darwin') {
    relayOptions.frame = true;
    relayOptions.titleBarStyle = 'hiddenInset';
    relayOptions.fullscreenable = false;
  } else {
    relayOptions.frame = false;
  }
  relayWindow = new BrowserWindow(relayOptions);
  relayWindow.loadFile('output.html', { query: { role: 'relay' } });
  bindWindowTitle(relayWindow, WINDOW_TITLES.relay);
  attachRelayWindowHandlers();
}

function showRelayWindow() {
  if (!relayWindow || relayWindow.isDestroyed()) createRelayWindow();
  relayWindowVisible = true;
  if (relayReady) {
    applyRelayDisplayTarget();
    showRelayWindowForCapture();
    replayOutputState();
    flushPendingRelay();
  }
  notifyRelayWindowState();
}

function hideRelayWindow() {
  if (!relayWindow || relayWindow.isDestroyed()) {
    relayWindowVisible = false;
    notifyRelayWindowState();
    return;
  }
  relayWindowVisible = false;
  relayWindow.hide();
  notifyRelayWindowState();
}

function toggleRelayWindow() {
  if (relayWindowVisible && relayWindow && !relayWindow.isDestroyed() && relayWindow.isVisible()) {
    hideRelayWindow();
  } else {
    showRelayWindow();
  }
}

function notifyRelayWindowState() {
  if (!controllerWindow || controllerWindow.isDestroyed()) return;
  controllerWindow.webContents.send('relay:state-changed', {
    visible: relayWindowVisible && relayWindow && !relayWindow.isDestroyed() && relayWindow.isVisible(),
  });
}

function attachStageWindowHandlers() {
  if (!stageWindow || stageWindow.isDestroyed()) return;

  stageWindow.on('close', (e) => {
    e.preventDefault();
    stageWindow.hide();
    stageWindowVisible = false;
    notifyStageWindowState();
  });

  stageReady = false;
  stageWindow.webContents.once('did-finish-load', () => {
    stageReady = true;
    broadcastSettings();
    pushStageUpdate({});
    if (stageWindowVisible) stageWindow.show();
    else stageWindow.hide();
  });
}

function createStageWindow() {
  const display = resolveStageDisplay();
  const bounds = {
    x: display.bounds.x + 40,
    y: display.bounds.y + 40,
    width: Math.min(1280, display.bounds.width - 80),
    height: Math.min(720, display.bounds.height - 80),
  };
  stageWindow = new BrowserWindow({
    ...bounds,
    show: false,
    minWidth: 640,
    minHeight: 360,
    resizable: true,
    title: WINDOW_TITLES.stage,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  stageWindow.loadFile('stage.html');
  bindWindowTitle(stageWindow, WINDOW_TITLES.stage);
  attachStageWindowHandlers();
}

function showStageWindow() {
  if (!stageWindow || stageWindow.isDestroyed()) createStageWindow();
  stageWindowVisible = true;
  stageWindow.show();
  stageWindow.focus();
  notifyStageWindowState();
}

function hideStageWindow() {
  if (!stageWindow || stageWindow.isDestroyed()) return;
  stageWindowVisible = false;
  stageWindow.hide();
  notifyStageWindowState();
}

function toggleStageWindow() {
  if (stageWindowVisible && stageWindow && !stageWindow.isDestroyed() && stageWindow.isVisible()) {
    hideStageWindow();
  } else {
    showStageWindow();
  }
}

function notifyStageWindowState() {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send('stage:state-changed', {
      visible: stageWindowVisible && stageWindow && !stageWindow.isDestroyed() && stageWindow.isVisible(),
    });
  }
}

function createWindows() {
  configureAppSession();
  // ProPresenter-style hotkeys: handled in controller (index.html) via shortcuts.js
  // with typing guards; main process only toggles output/stage windows via IPC.
  ensureMediaDir();

  controllerWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: WINDOW_TITLES.control,
    backgroundColor: '#14141a',
    icon: resolveAppIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  controllerWindow.loadFile('index.html');
  bindWindowTitle(controllerWindow, WINDOW_TITLES.control);

  outputWindowVisible = AppSettings.loadSettings().autoOpenOutputOnStart !== false;
  createOutputWindow();
  if (AppSettings.loadSettings().autoOpenRelayOnStart) {
    relayWindowVisible = true;
    createRelayWindow();
  }
  if (AppSettings.loadSettings().autoOpenStageOnStart) {
    createStageWindow();
    stageWindowVisible = true;
    notifyStageWindowState();
  }

  controllerWindow.webContents.once('did-finish-load', () => {
    broadcastMediaLibrary();
    broadcastSettings();
    broadcastThemes();
    broadcastPlaylists();
    broadcastMacros();
    broadcastBible();
    notifyBackgroundState();
    notifyOutputWindowState();
    notifyRelayWindowState();
    notifyStageWindowState();
    notifyBibleDownloadRequired();
  });

  controllerWindow.on('closed', () => {
    [propsEditorWindow, stageEditorWindow, macrosEditorWindow, themeManagerWindow, stageWindow, outputWindow, relayWindow].forEach((win) => {
      if (win && !win.isDestroyed()) win.destroy();
    });
    app.quit();
  });
}

app.whenReady().then(async () => {
  const appIcon = resolveAppIcon();
  if (appIcon && process.platform === 'darwin' && app.dock?.setIcon) {
    app.dock.setIcon(appIcon);
  }
  autoUpdateApi = initAutoUpdater(() => controllerWindow);
  createWindows();
  try {
    const remoteInfo = await initRemoteServices();
    const urls = remoteInfo?.urls || remoteInfo?.joinUrl ? [remoteInfo.joinUrl] : [];
    console.log('Worship FLOW remote:', Array.isArray(remoteInfo?.urls) ? remoteInfo.urls.join(' ') : urls.join(' '));
  } catch (err) {
    console.error('Remote server failed to start:', err);
  }
  if (autoUpdateApi?.checkForUpdates) {
    setTimeout(() => {
      autoUpdateApi.checkForUpdates();
    }, 8000);
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});

app.on('window-all-closed', () => {
  if (!useCloudRemote) RemoteServer.stopRemoteServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (!useCloudRemote || cloudRemoteShutdownDone) return;
  event.preventDefault();
  CloudRemote.shutdownCloudRemotePc()
    .catch((err) => console.error('cloud remote shutdown failed:', err))
    .finally(() => {
      cloudRemoteShutdownDone = true;
      useCloudRemote = false;
      app.quit();
    });
});

ipcMain.on('remote:get-info', (event) => {
  const info = useCloudRemote
    ? CloudRemote.getCloudRemoteInfo()
    : RemoteServer.getRemoteServerInfo();
  event.reply('remote:info', info);
});

ipcMain.on('remote:approve', (_event, payload) => {
  if (!useCloudRemote) return;
  const deviceId = payload?.deviceId;
  if (deviceId) CloudRemote.approveDevice(deviceId);
});

ipcMain.on('remote:deny', (_event, payload) => {
  if (!useCloudRemote) return;
  const deviceId = payload?.deviceId;
  if (deviceId) CloudRemote.denyDevice(deviceId);
});

ipcMain.on('request-library', (event) => {
  event.reply('update-library', normalizeLibrary(loadSongs()));
});

ipcMain.on('request-bible', (event) => {
  event.reply('bible:sync', reloadBibleCache(), BibleParser.getStatus(APP_ROOT));
});

ipcMain.handle('bible:get', () => getBibleData());

ipcMain.handle('bible:status', () => BibleParser.getStatus(APP_ROOT));

ipcMain.handle('bible:download-revised', async () => {
  try {
    const result = await BibleParser.downloadRevisedBible(APP_ROOT);
    reloadBibleCache();
    BibleParser.setActiveVersion('revised', APP_ROOT);
    appSettings.bibleVersion = 'revised';
    AppSettings.saveSettings({ bibleVersion: 'revised' });
    broadcastBible();
    broadcastSettings();
    return { ok: true, ...result };
  } catch (err) {
    console.error('개역개정 성경 다운로드 실패:', err);
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.on('bible:set-version', (_event, payload) => {
  const version = String(payload?.version || payload || '').trim();
  if (version === 'revised' && !BibleParser.isRevisedAvailable(APP_ROOT)) return;
  if (!['old', 'revised'].includes(version)) return;
  BibleParser.setActiveVersion(version, APP_ROOT);
  appSettings.bibleVersion = version;
  try {
    AppSettings.saveSettings({ bibleVersion: version });
  } catch (err) {
    console.error('성경 역본 설정 저장 오류:', err);
  }
  reloadBibleCache();
  broadcastBible();
});

ipcMain.handle('bible:open-folder', async () => {
  const folder = BibleParser.getOpenBibleFolderPath(APP_ROOT);
  await shell.openPath(folder);
  return folder;
});

ipcMain.handle('bible:repair', () => {
  const results = BibleParser.migrateAllUserBibles(APP_ROOT);
  reloadBibleCache();
  broadcastBible();
  const repaired = results.filter((r) => r.changed);
  return {
    ok: true,
    repairedCount: repaired.length,
    renamedTotal: repaired.reduce((sum, r) => sum + (r.renamed?.length || 0), 0),
    details: repaired,
  };
});

ipcMain.handle('app:update-download', async (_event, payload) => {
  if (macUsesManualReleaseDownload()) {
    const state = autoUpdateApi?.getUpdateState?.() || {};
    const version = payload?.version || state.pendingVersion || null;
    const url = getMacDmgDownloadUrl(version);
    await shell.openExternal(url);
    return { ok: true, mode: 'mac-manual', url };
  }
  if (!autoUpdateApi?.downloadUpdate) throw new Error('Auto-update unavailable');
  return autoUpdateApi.downloadUpdate();
});

ipcMain.handle('app:update-install', () => {
  if (macUsesManualReleaseDownload()) {
    throw new Error('Mac updates must be installed from the downloaded DMG.');
  }
  if (!autoUpdateApi?.quitAndInstall) throw new Error('Auto-update unavailable');
  autoUpdateApi.quitAndInstall();
  return true;
});

ipcMain.handle('app:update-check', async () => {
  if (!app.isPackaged || !autoUpdateApi?.checkForUpdates) {
    return {
      ok: false,
      isPackaged: app.isPackaged,
      currentVersion: app.getVersion(),
      reason: 'unavailable',
    };
  }
  const result = await autoUpdateApi.checkForUpdates();
  const state = autoUpdateApi.getUpdateState?.() || {};
  const macManualDownload = macUsesManualReleaseDownload();
  return {
    ok: true,
    isPackaged: true,
    currentVersion: app.getVersion(),
    updateInfo: result?.updateInfo || null,
    pendingVersion: state.pendingVersion || null,
    updateDownloaded: macManualDownload ? false : state.updateDownloaded === true,
  };
});

ipcMain.handle('app:get-version-info', () => {
  const state = autoUpdateApi?.getUpdateState?.() || {};
  const macManualDownload = macUsesManualReleaseDownload();
  return {
    productName: app.getName(),
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    macManualDownload,
    pendingVersion: state.pendingVersion || null,
    updateDownloaded: macManualDownload ? false : state.updateDownloaded === true,
    releaseNotes: state.releaseNotes || '',
    homepage: 'https://github.com/kshoo0214/worship-flow',
  };
});

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
  if (partial && ('stageWidth' in partial || 'stageHeight' in partial || 'stageLockAspect' in partial)) {
    if (stageWindow && !stageWindow.isDestroyed() && stageReady) {
      stageWindow.webContents.send('stage:viewport-changed');
    }
  }
  if (partial && 'stageDisplayId' in partial) {
    applyStageDisplayTarget();
  }
  if (partial && 'relayDisplayId' in partial) {
    applyRelayDisplayTarget();
  }
  if (partial && ('relayWidth' in partial || 'relayHeight' in partial || 'relayLockAspect' in partial)) {
    applyRelayDisplayTarget();
  }
});

ipcMain.handle('get-displays', () => buildDisplaysPayload());

ipcMain.on('settings:reset', () => {
  AppSettings.resetSettings();
  broadcastSettings();
});

ipcMain.on('output:fit-window', () => {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputFullscreenLocked = true;
  if (!outputWindowVisible) showOutputWindow();
  else ensureOutputFullscreen();
});

ipcMain.on('output:enter-fullscreen', () => {
  if (!outputWindow || outputWindow.isDestroyed()) return;
  outputFullscreenLocked = true;
  if (!outputWindowVisible) showOutputWindow();
  else ensureOutputFullscreen();
});

ipcMain.on('output:toggle', () => {
  toggleOutputWindow();
});

ipcMain.on('relay:toggle', () => {
  toggleRelayWindow();
});

ipcMain.on('relay:show', () => {
  showRelayWindow();
});

ipcMain.on('relay:hide', () => {
  hideRelayWindow();
});

ipcMain.on('relay:fit-window', () => {
  fitRelayWindowToScreen();
});

ipcMain.on('relay:get-state', (event) => {
  event.reply('relay:state-changed', {
    visible: relayWindowVisible && relayWindow && !relayWindow.isDestroyed() && relayWindow.isVisible(),
  });
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
  const force = typeof payload === 'object' && payload?.force === true;
  const item = loadMediaLibrary().find((i) => i.id === id);
  if (item) pushBackgroundSet(item, { force });
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
ipcMain.on('macro-restore-media', () => pushMacroRestoreMedia());
ipcMain.on('macro-clear-design', () => pushMacroClear('design'));
ipcMain.on('macro-restore-design', () => {
  sendToProgramOutputs('output:restore-design', { seq: nextSeq() });
});
ipcMain.on('macro-clear-props', () => pushMacroClear('props'));
ipcMain.on('macro-clear-audio', () => pushMacroClear('audio'));
ipcMain.on('macro-clear-announcements', () => pushMacroClear('announcements'));
ipcMain.on('macro-clear-all', () => pushMacroClear('all'));

ipcMain.on('prop:show', (_event, payload) => {
  const propId = String(payload?.propId || payload?.id || '').trim();
  const prop = propId ? MacrosStore.getProp(propId) : null;
  if (prop) pushPropShow(prop);
  else if (payload?.text) pushPropShow({ text: payload.text, name: payload.name });
});

ipcMain.on('prop:clear', () => pushPropClear());

ipcMain.on('announce:show', (_event, payload) => {
  pushAnnounceShow(payload?.text || '');
});

ipcMain.on('announce:clear', () => pushAnnounceClear());

ipcMain.on('audio:restore', () => pushAudioLayerRestore());

ipcMain.on('stage:toggle', () => toggleStageWindow());
ipcMain.on('stage:show', () => showStageWindow());
ipcMain.on('stage:hide', () => hideStageWindow());
ipcMain.on('props-editor:open', (_event, payload) => {
  openPropsEditorWindow(payload?.propId || payload?.id || '');
});
ipcMain.on('stage-editor:open', () => openStageEditorWindow());
ipcMain.on('macros-editor:open', () => openMacrosEditorWindow());

ipcMain.on('request-macros', (event) => {
  event.reply('macros:sync', MacrosStore.loadMacrosFile());
});

ipcMain.on('macros:save', (_event, payload) => {
  if (payload?.macro) MacrosStore.upsertMacro(payload.macro);
  if (payload?.prop) MacrosStore.upsertProp(payload.prop);
  broadcastMacros();
});

ipcMain.on('macros:delete', (_event, payload) => {
  const id = String(payload?.id || '').trim();
  const kind = String(payload?.kind || 'macro').trim();
  if (!id) return;
  if (kind === 'prop') MacrosStore.deleteProp(id);
  else MacrosStore.deleteMacro(id);
  broadcastMacros();
});

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
  sendToProgramOutputs('output:logo', {
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
        totalSlides: payload.totalSlides,
        nextText: payload.nextText,
        nextReference: payload.nextReference,
        nextGroup: payload.nextGroup,
        currentText: payload.currentText,
        currentReference: payload.currentReference,
        currentGroup: payload.currentGroup,
        current: payload.current,
        next: payload.next,
        resyncBackground: payload.resyncBackground,
        layerRestore: payload.layerRestore,
      },
    };
  }
  return { slide: payload, meta: {} };
}

ipcMain.on('send-slide', (_event, payload) => {
  const { slide, meta } = parseSendSlidePayload(payload);
  if (!slide) {
    lastSlide = null;
    lastSlideBase = null;
    lastSlideContent = null;
    lastSubtitleText = '';
    pushForegroundClear();
    pushStageUpdate(meta);
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
    pushStageUpdate({});
    return;
  }
  pushUnblackout();
  if (lastSlideBase) {
    pushSlideUpdate(lastSlideBase, {});
  } else if (lastSlide) {
    pushSlideUpdate(lastSlide, {});
  } else {
    pushForegroundClear();
    pushStageUpdate({});
  }
  if (propOverlayVisible && lastPropPayload) {
    sendToProgramOutputs('output:prop-show', lastPropPayload);
  }
  if (logoVisible) {
    const item = findLogoMediaItem();
    if (item) {
      sendToProgramOutputs('output:logo', {
        visible: true,
        fullscreen: true,
        media: mediaItemToPayload(item),
        seq: nextSeq(),
      });
    }
  }
  if (!audioLayerVisible) {
    sendToProgramOutputs('output:clear-audio', { seq: nextSeq() });
  } else {
    sendToProgramOutputs('output:audio-restore', { seq: nextSeq() });
  }
});
