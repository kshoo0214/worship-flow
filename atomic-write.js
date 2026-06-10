'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Write text atomically: temp file → rename (prevents half-written JSON on crash).
 * @param {string} filePath
 * @param {string} text
 * @param {string} [encoding='utf8']
 */
async function atomicWriteText(filePath, text, encoding = 'utf8') {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(tmp, text, encoding);
  await fs.promises.rename(tmp, filePath);
}

/**
 * @param {string} filePath
 * @param {unknown} data
 */
async function atomicWriteJson(filePath, data) {
  await atomicWriteText(filePath, JSON.stringify(data, null, 2));
}

/**
 * Sync variant (same rename semantics) for callers that cannot await.
 * @param {string} filePath
 * @param {unknown} data
 */
function atomicWriteJsonSync(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const body = JSON.stringify(data, null, 2);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, filePath);
}

module.exports = {
  atomicWriteText,
  atomicWriteJson,
  atomicWriteJsonSync,
};
