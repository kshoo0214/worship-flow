const fs = require('fs');
const path = require('path');
const AtomicWrite = require('./atomic-write');
const AppPaths = require('./app-paths');

function macrosPath() {
  return AppPaths.resolveUserFile('macros.json');
}

const ACTION_TYPES = new Set([
  'clearText', 'clearMedia', 'clearDesign', 'clearProps', 'clearAudio',
  'clearAnnouncements', 'clearAll', 'blackout', 'unblackout', 'logo', 'prop',
  'hideText', 'showText', 'restoreMedia', 'restoreDesign', 'restoreAll',
  'delay', 'nextSlide', 'prevSlide', 'firstSlide', 'lastSlide', 'goLive',
  'theme', 'announce', 'openStage', 'closeStage',
]);

const PROP_POSITIONS = new Set(['top', 'center', 'bottom']);

let macrosCache = null;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function macroId() {
  return `macro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function propId() {
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').trim();
  if (!ACTION_TYPES.has(type)) return null;
  const out = { type };
  if (type === 'prop' && raw.propId) out.propId = String(raw.propId).trim();
  if (type === 'theme') out.themeId = String(raw.themeId || '').trim();
  if (type === 'announce') out.text = String(raw.text || '').trim();
  if (type === 'delay') out.ms = clamp(Number(raw.ms) || 500, 0, 120000);
  return out;
}

function normalizeMacro(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  if (!name) return null;
  const actions = Array.isArray(raw.actions)
    ? raw.actions.map(normalizeAction).filter(Boolean)
    : [];
  return {
    id: String(raw.id || macroId()).trim(),
    name,
    actions,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeProp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const text = String(raw.text || raw.content || '').trim();
  if (!name || !text) return null;
  const position = PROP_POSITIONS.has(raw.position) ? raw.position : 'bottom';
  const out = {
    id: String(raw.id || propId()).trim(),
    name,
    text,
    position,
    fontSize: clamp(Number(raw.fontSize) || 5, 2, 12),
    color: String(raw.color || '#ffffff').trim(),
    bgColor: String(raw.bgColor || '#000000').trim(),
    bgOpacity: clamp(Number(raw.bgOpacity ?? 0.55), 0, 1),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  ['boxX', 'boxY', 'boxW', 'boxH'].forEach((key) => {
    const n = Number(raw[key]);
    if (Number.isFinite(n)) out[key] = clamp(Math.round(n * 10) / 10, 0, 100);
  });
  const align = String(raw.textAlign || 'center').trim().toLowerCase();
  if (['left', 'center', 'right'].includes(align)) out.textAlign = align;
  const fw = Number(raw.fontWeight);
  if (Number.isFinite(fw)) out.fontWeight = clamp(Math.round(fw), 100, 900);
  const pad = Number(raw.padding);
  if (Number.isFinite(pad)) out.padding = clamp(Math.round(pad * 10) / 10, 0, 48);
  const br = Number(raw.borderRadius);
  if (Number.isFinite(br)) out.borderRadius = clamp(Math.round(br * 10) / 10, 0, 48);
  return out;
}

function defaultCatalog() {
  return {
    version: 1,
    macros: [
      {
        id: 'macro_pre_service',
        name: '예배 전',
        actions: [{ type: 'clearAll' }, { type: 'unblackout' }],
      },
      {
        id: 'macro_worship',
        name: '찬양 시작',
        actions: [{ type: 'clearText' }, { type: 'clearProps' }],
      },
    ],
    props: [
      {
        id: 'prop_offering',
        name: '헌금',
        text: '헌금 시간입니다',
        position: 'bottom',
        fontSize: 5,
        color: '#ffffff',
        bgColor: '#000000',
        bgOpacity: 0.6,
      },
      {
        id: 'prop_stand',
        name: '일어남',
        text: '일어나 주세요',
        position: 'center',
        fontSize: 5.5,
        color: '#ffffff',
        bgColor: '#1e3a5f',
        bgOpacity: 0.7,
      },
      {
        id: 'prop_sit',
        name: '착석',
        text: '착석해 주세요',
        position: 'bottom',
        fontSize: 5,
        color: '#fde68a',
        bgColor: '#000000',
        bgOpacity: 0.55,
      },
    ],
  };
}

function loadMacrosFile() {
  if (macrosCache) return macrosCache;
  try {
    if (fs.existsSync(macrosPath())) {
      const data = JSON.parse(fs.readFileSync(macrosPath(), 'utf-8'));
      macrosCache = {
        version: 1,
        macros: (Array.isArray(data?.macros) ? data.macros : []).map(normalizeMacro).filter(Boolean),
        props: (Array.isArray(data?.props) ? data.props : []).map(normalizeProp).filter(Boolean),
      };
      if (!macrosCache.macros.length && !macrosCache.props.length) {
        macrosCache = defaultCatalog();
        saveMacrosFile(macrosCache);
      }
      return macrosCache;
    }
  } catch (err) {
    console.error('macros.json 읽기 오류:', err);
  }
  macrosCache = defaultCatalog();
  saveMacrosFile(macrosCache);
  return macrosCache;
}

function saveMacrosFile(data) {
  const out = {
    version: 1,
    macros: (data?.macros || []).map(normalizeMacro).filter(Boolean),
    props: (data?.props || []).map(normalizeProp).filter(Boolean),
  };
  try {
    AtomicWrite.atomicWriteJsonSync(macrosPath(), out);
    macrosCache = out;
  } catch (err) {
    console.error('macros.json 저장 오류:', err);
    macrosCache = null;
  }
  return out;
}

function listMacros() {
  return loadMacrosFile().macros.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function listProps() {
  return loadMacrosFile().props.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function getMacro(id) {
  const mid = String(id || '').trim();
  if (!mid) return null;
  return listMacros().find((m) => m.id === mid) || null;
}

function getProp(id) {
  const pid = String(id || '').trim();
  if (!pid) return null;
  return listProps().find((p) => p.id === pid) || null;
}

function upsertMacro(raw) {
  const norm = normalizeMacro(raw);
  if (!norm) return null;
  const data = loadMacrosFile();
  const idx = data.macros.findIndex((m) => m.id === norm.id);
  norm.updatedAt = new Date().toISOString();
  if (idx >= 0) data.macros[idx] = norm;
  else data.macros.push(norm);
  saveMacrosFile(data);
  return norm;
}

function upsertProp(raw) {
  const norm = normalizeProp(raw);
  if (!norm) return null;
  const data = loadMacrosFile();
  const idx = data.props.findIndex((p) => p.id === norm.id);
  norm.updatedAt = new Date().toISOString();
  if (idx >= 0) data.props[idx] = norm;
  else data.props.push(norm);
  saveMacrosFile(data);
  return norm;
}

function deleteMacro(id) {
  const mid = String(id || '').trim();
  if (!mid) return false;
  const data = loadMacrosFile();
  const next = data.macros.filter((m) => m.id !== mid);
  if (next.length === data.macros.length) return false;
  saveMacrosFile({ ...data, macros: next });
  return true;
}

function deleteProp(id) {
  const pid = String(id || '').trim();
  if (!pid) return false;
  const data = loadMacrosFile();
  const next = data.props.filter((p) => p.id !== pid);
  if (next.length === data.props.length) return false;
  saveMacrosFile({ ...data, props: next });
  return true;
}

module.exports = {
  ACTION_TYPES,
  PROP_POSITIONS,
  macroId,
  propId,
  normalizeProp,
  listMacros,
  listProps,
  getMacro,
  getProp,
  upsertMacro,
  upsertProp,
  deleteMacro,
  deleteProp,
  loadMacrosFile,
  saveMacrosFile,
};
