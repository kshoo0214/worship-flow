'use strict';

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

let pendingUpdate = null;
let updateDownloaded = false;

function getUpdateState() {
  return {
    pendingVersion: pendingUpdate?.version || null,
    updateDownloaded,
    releaseNotes: pendingUpdate?.releaseNotes || '',
  };
}

function getControllerWindow(getWin) {
  const win = getWin();
  return win && !win.isDestroyed() ? win : null;
}

function sendToController(getWin, channel, payload) {
  const win = getControllerWindow(getWin);
  if (win) win.webContents.send(channel, payload);
}

function initAutoUpdater(getControllerWindowFn) {
  if (!app.isPackaged) {
    return {
      checkForUpdates: () => Promise.resolve(null),
      getUpdateState: () => ({ pendingVersion: null, updateDownloaded: false, releaseNotes: '' }),
    };
  }

  autoUpdater.autoDownload = false;
  // macOS Squirrel install requires code signing; unsigned builds use manual DMG download.
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin';
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    sendToController(getControllerWindowFn, 'app:update-status', { phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    pendingUpdate = info;
    updateDownloaded = false;
    sendToController(getControllerWindowFn, 'app:update-available', {
      version: info?.version || '',
      releaseNotes: info?.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    pendingUpdate = null;
    updateDownloaded = false;
    sendToController(getControllerWindowFn, 'app:update-status', {
      phase: 'up-to-date',
      version: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error:', err);
    sendToController(getControllerWindowFn, 'app:update-error', {
      message: err?.message || String(err),
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToController(getControllerWindowFn, 'app:update-progress', {
      percent: progress?.percent ?? 0,
      transferred: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    pendingUpdate = info;
    updateDownloaded = true;
    sendToController(getControllerWindowFn, 'app:update-downloaded', {
      version: info?.version || pendingUpdate?.version || '',
    });
  });

  return {
    checkForUpdates: () => autoUpdater.checkForUpdates().catch((err) => {
      console.error('checkForUpdates failed:', err);
      return null;
    }),
    downloadUpdate: () => autoUpdater.downloadUpdate(),
    quitAndInstall: () => {
      autoUpdater.quitAndInstall(false, true);
    },
    getPendingUpdate: () => pendingUpdate,
    getUpdateState,
  };
}

module.exports = { initAutoUpdater, getUpdateState };
