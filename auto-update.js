'use strict';

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

let pendingUpdate = null;

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
    return { checkForUpdates: () => Promise.resolve(null) };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    sendToController(getControllerWindowFn, 'app:update-status', { phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    pendingUpdate = info;
    sendToController(getControllerWindowFn, 'app:update-available', {
      version: info?.version || '',
      releaseNotes: info?.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    pendingUpdate = null;
    sendToController(getControllerWindowFn, 'app:update-status', { phase: 'idle' });
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
  };
}

module.exports = { initAutoUpdater };
