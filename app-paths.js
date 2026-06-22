'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PRODUCT_NAME = 'Worship FLOW';

const USER_FILES = [
  'settings.json',
  'songs.json',
  'playlists.json',
  'themes.json',
  'macros.json',
  'media-library.json',
];

let electronApp = null;

function getElectronApp() {
  if (electronApp !== null) return electronApp;
  try {
    const { app } = require('electron');
    electronApp = app || null;
  } catch {
    electronApp = null;
  }
  return electronApp;
}

function isPackaged() {
  const app = getElectronApp();
  if (app) return app.isPackaged;
  if (typeof process.resourcesPath === 'string') {
    const asarPath = path.join(process.resourcesPath, 'app.asar');
    if (fs.existsSync(asarPath)) return true;
  }
  const execPath = String(process.execPath || '');
  if (execPath && !execPath.endsWith('/Electron') && !execPath.endsWith('\\Electron.exe')) {
    return true;
  }
  return false;
}

function getAppRoot() {
  return __dirname;
}

function getUserDataRoot() {
  if (!isPackaged()) return getAppRoot();
  const app = getElectronApp();
  if (app) return app.getPath('userData');
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', PRODUCT_NAME);
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), PRODUCT_NAME);
  }
  return path.join(os.homedir(), '.config', PRODUCT_NAME);
}

function ensureUserDataLayout() {
  const userRoot = getUserDataRoot();
  fs.mkdirSync(path.join(userRoot, 'media', 'assets'), { recursive: true });
  if (!isPackaged()) return;

  for (const name of USER_FILES) {
    const dest = path.join(userRoot, name);
    if (fs.existsSync(dest)) continue;
    const seed = path.join(getAppRoot(), 'resources', 'defaults', name);
    if (fs.existsSync(seed)) {
      fs.copyFileSync(seed, dest);
    }
  }
}

function resolveUserFile(filename) {
  ensureUserDataLayout();
  return path.join(getUserDataRoot(), filename);
}

function getMediaAssetsDir() {
  const dir = path.join(getUserDataRoot(), 'media', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  PRODUCT_NAME,
  isPackaged,
  getAppRoot,
  getUserDataRoot,
  ensureUserDataLayout,
  resolveUserFile,
  getMediaAssetsDir,
};
