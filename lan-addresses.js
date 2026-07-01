'use strict';

const os = require('os');

function parseIpv4(ip) {
  const parts = String(ip).split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

/** Exclude loopback, link-local, IANA 192.0.0.0/24, and multicast — not reachable from phones. */
function isUsableLanIpv4(ip) {
  const p = parseIpv4(ip);
  if (!p) return false;
  if (p[0] === 127) return false;
  if (p[0] === 0) return false;
  if (p[0] === 192 && p[1] === 0) return false;
  if (p[0] === 169 && p[1] === 254) return false;
  if (p[0] >= 224) return false;
  return true;
}

/** Prefer iPhone/iPad Personal Hotspot (172.20.10.x), then typical LAN ranges. */
function lanIpv4Priority(ip) {
  const p = parseIpv4(ip);
  if (!p) return 0;
  if (p[0] === 172 && p[1] === 20 && p[2] === 10) return 100;
  if (p[0] === 192 && p[1] === 168) return 90;
  if (p[0] === 10) return 80;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return 70;
  return 20;
}

function isIpv4Family(family) {
  return family === 'IPv4' || family === 4;
}

function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = new Set();
  Object.values(nets).forEach((ifaces) => {
    if (!ifaces) return;
    ifaces.forEach((iface) => {
      if (!isIpv4Family(iface.family)) return;
      if (iface.internal) return;
      const addr = String(iface.address || '').trim();
      if (isUsableLanIpv4(addr)) ips.add(addr);
    });
  });
  return [...ips].sort((a, b) => lanIpv4Priority(b) - lanIpv4Priority(a) || a.localeCompare(b));
}

function preferredLanIpv4(ips) {
  const list = Array.isArray(ips) ? ips : getLanIpv4Addresses();
  return list[0] || '';
}

function buildLocalHttpUrls(port, suffixPath = '/') {
  const suffix = suffixPath.startsWith('/') ? suffixPath : `/${suffixPath}`;
  const urls = getLanIpv4Addresses().map((ip) => `http://${ip}:${port}${suffix}`);
  urls.push(`http://127.0.0.1:${port}${suffix}`);
  return urls;
}

module.exports = {
  getLanIpv4Addresses,
  preferredLanIpv4,
  isUsableLanIpv4,
  lanIpv4Priority,
  buildLocalHttpUrls,
};
