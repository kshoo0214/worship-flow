'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const AtomicWrite = require('./atomic-write');
const BibleEngine = require('./bible-engine');

/** Google Drive file id for bundled-offline 개역개정 JSON (copyright-compliant download). */
const BIBLE_REVISED_GOOGLE_DRIVE_ID = '1ezb_f_miJ3oqYFjZYfwbV0hXdhKLa08U';
const BIBLE_REVISED_DOWNLOAD_URL = `https://docs.google.com/uc?export=download&id=${BIBLE_REVISED_GOOGLE_DRIVE_ID}`;

const VERSIONS = {
  old: {
    id: 'old',
    fileName: 'bible_ko_old.json',
    labelKey: 'bibleTranslationOld',
  },
  revised: {
    id: 'revised',
    fileName: 'bible_ko_revised.json',
    labelKey: 'bibleTranslationRevised',
  },
};

let activeVersionId = 'old';

function getApp() {
  try {
    return require('electron').app;
  } catch {
    return null;
  }
}

function isPackaged() {
  const app = getApp();
  return Boolean(app && app.isPackaged);
}

function getBundledBibleDir(rootDir) {
  return path.join(rootDir || __dirname, 'resources', 'bible');
}

function getUserBibleDir() {
  const app = getApp();
  const base = app ? app.getPath('userData') : path.join(__dirname, 'user-data');
  const dir = path.join(base, 'bible');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureBundledOld(rootDir) {
  const filePath = path.join(getBundledBibleDir(rootDir), VERSIONS.old.fileName);
  if (fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  AtomicWrite.atomicWriteJsonSync(filePath, BibleEngine.sampleBibleData());
  return filePath;
}

function resolveRevisedPath(rootDir) {
  const fileName = VERSIONS.revised.fileName;
  const bundled = path.join(getBundledBibleDir(rootDir), fileName);
  const user = path.join(getUserBibleDir(), fileName);
  if (fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(user)) return user;
  return isPackaged() ? user : bundled;
}

function getRevisedWritePath(rootDir) {
  if (isPackaged()) {
    return path.join(getUserBibleDir(), VERSIONS.revised.fileName);
  }
  const bundled = path.join(getBundledBibleDir(rootDir), VERSIONS.revised.fileName);
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  return bundled;
}

function getBiblePathForVersion(versionId, rootDir) {
  const version = VERSIONS[versionId] || VERSIONS.old;
  if (version.id === 'old') return ensureBundledOld(rootDir);
  return resolveRevisedPath(rootDir);
}

function isRevisedAvailable(rootDir) {
  const filePath = resolveRevisedPath(rootDir);
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 2048;
  } catch {
    return false;
  }
}

function needsRevisedDownload(rootDir) {
  return !isRevisedAvailable(rootDir);
}

function validateBibleJson(data) {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0);
}

function extractBalancedJson(text) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  throw new Error('성경 JSON 구조가 올바르지 않습니다.');
}

function parseRtfBibleText(rtf) {
  let body = String(rtf);
  body = body.replace(/\\u(\d+)/g, (_, code) => String.fromCharCode(Number(code)));
  body = body.replace(/\\uc0\s*/g, '');
  body = body.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  body = body.replace(/\\\r?\n/g, '\n');
  body = body.replace(/\\([{}"])/g, '$1');
  body = body.replace(/\\[a-z]+-?\d* ?/gi, '');
  const start = body.search(/\{\s*"/);
  if (start < 0) throw new Error('RTF 내부 JSON을 찾을 수 없습니다.');
  body = body.slice(start);
  body = extractBalancedJson(body);
  return JSON.parse(body);
}

function normalizeBibleBookKeys(data) {
  return BibleEngine.normalizeBibleData(data).data;
}

function isWritableBibleFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.accessSync(filePath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize book keys + canonical order; persist when the file is writable.
 * @returns {{ changed: boolean, renamed: Array, path: string, bookCount: number } | null}
 */
function migrateBibleFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!validateBibleJson(raw)) return null;
    const { data, renamed, changed } = BibleEngine.normalizeBibleData(raw);
    if (changed && isWritableBibleFile(filePath)) {
      AtomicWrite.atomicWriteJsonSync(filePath, data);
    }
    return {
      changed,
      renamed,
      path: filePath,
      bookCount: Object.keys(data).length,
      saved: changed && isWritableBibleFile(filePath),
    };
  } catch (err) {
    console.error('성경 데이터 마이그레이션 오류:', filePath, err);
    return null;
  }
}

/** Migrate every local bible JSON the app can write (userData revised, dev resources). */
function migrateAllUserBibles(rootDir) {
  const results = [];
  const candidates = new Set();

  const revisedUser = path.join(getUserBibleDir(), VERSIONS.revised.fileName);
  const revisedBundled = path.join(getBundledBibleDir(rootDir), VERSIONS.revised.fileName);
  const oldBundled = path.join(getBundledBibleDir(rootDir), VERSIONS.old.fileName);

  [revisedUser, revisedBundled, oldBundled].forEach((p) => {
    if (p) candidates.add(p);
  });

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const result = migrateBibleFile(filePath);
    if (result?.changed) {
      console.log(
        `[bible-migrate] ${path.basename(filePath)}: ${result.renamed.length}권 이름 정리`
        + `${result.saved ? ' (저장됨)' : ' (읽기 전용)'}`,
      );
    }
    if (result) results.push(result);
  }
  return results;
}

function readBibleFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!validateBibleJson(raw)) return null;
  const { data, changed } = BibleEngine.normalizeBibleData(raw);
  if (changed && isWritableBibleFile(filePath)) {
    AtomicWrite.atomicWriteJsonSync(filePath, data);
  }
  return data;
}

function parseDownloadedBibleBuffer(buf) {
  const text = buf.toString('utf-8').trim();
  let data;
  if (text.startsWith('{\\rtf')) {
    data = parseRtfBibleText(text);
  } else {
    data = JSON.parse(text);
  }
  data = normalizeBibleBookKeys(data);
  if (!validateBibleJson(data)) {
    throw new Error('성경 데이터 형식이 올바르지 않습니다.');
  }
  return data;
}

function loadBibleForVersion(versionId, rootDir) {
  const id = VERSIONS[versionId] ? versionId : 'old';
  if (id === 'revised' && !isRevisedAvailable(rootDir)) {
    return loadBibleForVersion('old', rootDir);
  }
  const filePath = getBiblePathForVersion(id, rootDir);
  try {
    if (fs.existsSync(filePath)) {
      const data = readBibleFile(filePath);
      if (data) return data;
    }
  } catch (err) {
    console.error(`성경 로드 오류 (${id}):`, err);
  }
  return BibleEngine.sampleBibleData();
}

function setActiveVersion(versionId, rootDir) {
  activeVersionId = VERSIONS[versionId] ? versionId : 'old';
  if (activeVersionId === 'revised' && !isRevisedAvailable(rootDir)) {
    activeVersionId = 'old';
  }
  return reloadBible(rootDir);
}

function reloadBible(rootDir) {
  return loadBibleForVersion(activeVersionId, rootDir);
}

function getActiveVersion() {
  return activeVersionId;
}

function getOpenBibleFolderPath(rootDir) {
  if (isPackaged()) return getUserBibleDir();
  const bundled = getBundledBibleDir(rootDir);
  fs.mkdirSync(bundled, { recursive: true });
  return bundled;
}

function getStatus(rootDir) {
  return {
    activeVersion: activeVersionId,
    needsDownload: needsRevisedDownload(rootDir),
    revisedAvailable: isRevisedAvailable(rootDir),
    versions: Object.values(VERSIONS).map((version) => ({
      id: version.id,
      available: version.id === 'old' || isRevisedAvailable(rootDir),
      fileName: version.fileName,
    })),
    bibleFolder: getOpenBibleFolderPath(rootDir),
  };
}

function fetchGoogleDriveFile(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 12) {
      reject(new Error('다운로드 리다이렉트가 너무 많습니다.'));
      return;
    }
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: { 'User-Agent': 'Worship-FLOW/1.0' },
    };
    https.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${parsed.hostname}${res.headers.location}`;
        fetchGoogleDriveFile(next, redirects + 1).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        if (
          res.statusCode !== 200
          || text.includes('Google Drive - Virus scan warning')
          || (text.includes('confirm=') && text.includes('download_warning'))
        ) {
          const confirm = text.match(/confirm=([^&"'\s]+)/)?.[1];
          const id = parsed.searchParams.get('id') || BIBLE_REVISED_GOOGLE_DRIVE_ID;
          if (confirm) {
            const retry = `https://docs.google.com/uc?export=download&confirm=${confirm}&id=${id}`;
            fetchGoogleDriveFile(retry, redirects + 1).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`다운로드 실패 (HTTP ${res.statusCode})`));
            return;
          }
        }
        if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
          reject(new Error('다운로드 응답이 HTML 페이지입니다. Google Drive 링크를 확인하세요.'));
          return;
        }
        resolve(buf);
      });
    }).on('error', reject);
  });
}

async function downloadRevisedBible(rootDir) {
  const destPath = getRevisedWritePath(rootDir);
  const buf = await fetchGoogleDriveFile(BIBLE_REVISED_DOWNLOAD_URL);
  const data = parseDownloadedBibleBuffer(buf);
  await AtomicWrite.atomicWriteJson(destPath, data);
  return {
    path: destPath,
    bookCount: Object.keys(data).length,
  };
}

module.exports = {
  BIBLE_REVISED_GOOGLE_DRIVE_ID,
  BIBLE_REVISED_DOWNLOAD_URL,
  VERSIONS,
  needsRevisedDownload,
  isRevisedAvailable,
  loadBibleForVersion,
  setActiveVersion,
  reloadBible,
  getActiveVersion,
  getStatus,
  getOpenBibleFolderPath,
  downloadRevisedBible,
  validateBibleJson,
  parseDownloadedBibleBuffer,
  getBiblePathForVersion,
  migrateBibleFile,
  migrateAllUserBibles,
};
