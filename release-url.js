'use strict';

const GITHUB_OWNER = 'kshoo0214';
const GITHUB_REPO = 'worship-flow';
const PRODUCT_FILE_PREFIX = 'Worship-FLOW';

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

function releaseTag(version) {
  const v = normalizeVersion(version);
  return v ? `v${v}` : 'latest';
}

function getMacDmgDownloadUrl(version) {
  const v = normalizeVersion(version);
  if (!v) {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  }
  const fileName = `${PRODUCT_FILE_PREFIX}-${v}-arm64.dmg`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${releaseTag(v)}/${encodeURIComponent(fileName)}`;
}

function getReleasePageUrl(version) {
  const v = normalizeVersion(version);
  if (!v) {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  }
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${releaseTag(v)}`;
}

function macUsesManualReleaseDownload() {
  return process.platform === 'darwin';
}

module.exports = {
  getMacDmgDownloadUrl,
  getReleasePageUrl,
  macUsesManualReleaseDownload,
};
