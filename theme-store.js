const fs = require('fs');
const path = require('path');
const AtomicWrite = require('./atomic-write');
const SlideEngine = require('./slide-engine');

const THEMES_PATH = path.join(__dirname, 'themes.json');

let themesCache = null;

function invalidateThemesCache() {
  themesCache = null;
}

function normalizeThemeRecord(raw) {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const textLayer = SlideEngine.normalizeThemeTextLayer(
    raw.textLayer || (raw.style ? { style: raw.style } : null)
  );
  const record = {
    id: String(raw.id || `theme_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    name,
    textLayer,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  if (raw.background !== undefined) {
    record.background = SlideEngine.normalizeBackground(raw.background);
  }
  if (Array.isArray(raw.shapeLayers)) {
    record.shapeLayers = SlideEngine.normalizeThemeShapeLayers(raw.shapeLayers);
  }
  return record;
}

function loadThemesFile() {
  if (themesCache) return themesCache;
  try {
    if (fs.existsSync(THEMES_PATH)) {
      const data = JSON.parse(fs.readFileSync(THEMES_PATH, 'utf-8'));
      const themes = Array.isArray(data?.themes) ? data.themes : [];
      themesCache = {
        version: 1,
        themes: themes.map(normalizeThemeRecord).filter(Boolean),
      };
      return themesCache;
    }
  } catch (err) {
    console.error('themes.json 읽기 오류:', err);
  }
  themesCache = { version: 1, themes: [] };
  return themesCache;
}

function saveThemesFile(data) {
  const out = {
    version: 1,
    themes: (data?.themes || []).map(normalizeThemeRecord).filter(Boolean),
  };
  try {
    AtomicWrite.atomicWriteJsonSync(THEMES_PATH, out);
    themesCache = out;
  } catch (err) {
    console.error('themes.json 저장 오류:', err);
    invalidateThemesCache();
  }
  return out;
}

function listThemes() {
  return loadThemesFile().themes.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function getTheme(idOrName) {
  if (!idOrName) return null;
  const key = String(idOrName);
  return listThemes().find((t) => t.id === key || t.name === key) || null;
}

function upsertTheme({ id, name, style, textLayer, background, shapeLayers }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const data = loadThemesFile();
  const normLayer = SlideEngine.normalizeThemeTextLayer(
    textLayer || (style ? { style } : null)
  );
  let idx = -1;
  if (id) idx = data.themes.findIndex((t) => t.id === id);
  if (idx < 0) idx = data.themes.findIndex((t) => t.name === trimmed);
  const record = {
    id: id || (idx >= 0 ? data.themes[idx].id : `theme_${Date.now()}`),
    name: trimmed,
    textLayer: normLayer,
    updatedAt: new Date().toISOString(),
  };
  if (background !== undefined) {
    record.background = SlideEngine.normalizeBackground(background);
  }
  if (shapeLayers !== undefined) {
    record.shapeLayers = SlideEngine.normalizeThemeShapeLayers(shapeLayers || []);
  }
  if (idx >= 0) data.themes[idx] = record;
  else data.themes.push(record);
  saveThemesFile(data);
  return record;
}

function deleteTheme(idOrName) {
  const data = loadThemesFile();
  const key = String(idOrName || '');
  data.themes = data.themes.filter((t) => t.id !== key && t.name !== key);
  saveThemesFile(data);
  return listThemes();
}

function reloadThemes() {
  invalidateThemesCache();
  return listThemes();
}

module.exports = {
  THEMES_PATH,
  loadThemesFile,
  saveThemesFile,
  listThemes,
  getTheme,
  upsertTheme,
  deleteTheme,
  reloadThemes,
  invalidateThemesCache,
};
