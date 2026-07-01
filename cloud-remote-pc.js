'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const LanAddresses = require('./lan-addresses');

const HEARTBEAT_MS = 25_000;

let relayBaseUrl = '';
let pcId = '';
let roomInfo = null;
let pcWs = null;
let heartbeatTimer = null;
let onJoinRequestFn = null;
let onNavigateFn = null;

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function isLocalRelayBase(url) {
  try {
    const host = new URL(normalizeBaseUrl(url)).hostname;
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch (_) {
    return false;
  }
}

function buildCloudJoinUrls(relayUrl, joinUrl) {
  if (!joinUrl) return [];
  if (!isLocalRelayBase(relayUrl)) return [joinUrl];
  let parsed;
  try {
    parsed = new URL(joinUrl);
  } catch (_) {
    return [joinUrl];
  }
  const relayPort = (() => {
    try { return new URL(normalizeBaseUrl(relayUrl)).port; } catch (_) { return ''; }
  })();
  const port = parsed.port || relayPort || '8766';
  const suffix = `${parsed.pathname}${parsed.search}`;
  const urls = LanAddresses.buildLocalHttpUrls(port, suffix).filter((u) => !/127\.0\.0\.1|localhost/i.test(u));
  if (!urls.length) urls.push(joinUrl);
  return urls;
}

function preferredJoinUrl(urls) {
  return urls.find((u) => !/127\.0\.0\.1|localhost/i.test(u)) || urls[0] || '';
}

function hasReachableLanIp() {
  return LanAddresses.getLanIpv4Addresses().length > 0;
}

function wsBaseUrl(httpUrl) {
  const u = normalizeBaseUrl(httpUrl);
  if (u.startsWith('https://')) return `wss://${u.slice(8)}`;
  if (u.startsWith('http://')) return `ws://${u.slice(7)}`;
  return `ws://${u}`;
}

function loadOrCreatePcId(userDataDir) {
  const filePath = path.join(userDataDir, 'remote-pc-id.json');
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed?.pcId) return String(parsed.pcId);
    }
  } catch (_) { /* ignore */ }
  const pcIdValue = `pc_${crypto.randomBytes(12).toString('hex')}`;
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ pcId: pcIdValue }, null, 2), 'utf8');
  } catch (err) {
    console.error('remote pcId save failed:', err);
  }
  return pcIdValue;
}

async function httpJson(method, apiPath, body) {
  const url = `${relayBaseUrl}${apiPath}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function connectPcSocket() {
  if (!roomInfo?.pcToken) return;
  if (pcWs) {
    try { pcWs.close(); } catch (_) { /* ignore */ }
    pcWs = null;
  }
  const wsUrl = `${wsBaseUrl(relayBaseUrl)}/ws?role=pc&token=${encodeURIComponent(roomInfo.pcToken)}`;
  pcWs = new WebSocket(wsUrl);
  pcWs.on('open', () => {
    if (roomInfo?.lastState) broadcastState(roomInfo.lastState);
  });
  pcWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (_) { return; }
    if (msg?.type === 'join-request' && typeof onJoinRequestFn === 'function') {
      onJoinRequestFn({
        deviceId: msg.deviceId,
        label: msg.label || 'Phone',
        joinedAt: msg.joinedAt || Date.now(),
      });
    }
    if (msg?.type === 'navigate' && typeof onNavigateFn === 'function') {
      onNavigateFn(msg.direction);
    }
  });
  pcWs.on('close', () => {
    if (!roomInfo) return;
    setTimeout(() => {
      if (roomInfo) connectPcSocket();
    }, 2000);
  });
  pcWs.on('error', (err) => console.error('cloud remote pc ws error:', err));
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!roomInfo?.pcToken) return;
    try {
      await httpJson('POST', '/api/heartbeat', { pcToken: roomInfo.pcToken });
    } catch (err) {
      console.error('cloud remote heartbeat failed:', err);
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function initCloudRemotePc(options = {}) {
  relayBaseUrl = normalizeBaseUrl(options.relayUrl);
  if (!relayBaseUrl) throw new Error('relayUrl required');

  const userDataDir = options.userDataDir;
  if (!userDataDir) throw new Error('userDataDir required');

  onJoinRequestFn = options.onJoinRequest || null;
  onNavigateFn = options.onNavigate || null;

  pcId = loadOrCreatePcId(userDataDir);
  roomInfo = await httpJson('POST', '/api/rooms', { pcId });
  roomInfo.lastState = null;
  const urls = buildCloudJoinUrls(relayBaseUrl, roomInfo.joinUrl);
  roomInfo.joinUrls = urls;
  roomInfo.joinUrl = preferredJoinUrl(urls) || roomInfo.joinUrl;
  if (isLocalRelayBase(relayBaseUrl) && !hasReachableLanIp()) {
    console.warn('cloud remote: no usable LAN IP — check iPhone hotspot DHCP (expect 172.20.10.x on Mac)');
  } else if (isLocalRelayBase(relayBaseUrl)) {
    console.log('cloud remote LAN URLs:', urls.join(' '));
  }
  connectPcSocket();
  startHeartbeat();

  return {
    pcId,
    joinUrl: roomInfo.joinUrl,
    code: roomInfo.code,
    roomId: roomInfo.roomId,
    urls,
    lanIpMissing: isLocalRelayBase(relayBaseUrl) && !hasReachableLanIp(),
  };
}

function broadcastState(payload) {
  if (!roomInfo) return;
  roomInfo.lastState = payload;
  if (pcWs?.readyState === WebSocket.OPEN) {
    pcWs.send(JSON.stringify({ type: 'state', payload }));
  }
}

function approveDevice(deviceId) {
  if (!pcWs || pcWs.readyState !== WebSocket.OPEN) return;
  pcWs.send(JSON.stringify({ type: 'approve', deviceId }));
}

function denyDevice(deviceId) {
  if (!pcWs || pcWs.readyState !== WebSocket.OPEN) return;
  pcWs.send(JSON.stringify({ type: 'deny', deviceId }));
}

function getCloudRemoteInfo() {
  if (!roomInfo) return { ok: false, urls: [] };
  const urls = roomInfo.joinUrls?.length
    ? roomInfo.joinUrls
    : buildCloudJoinUrls(relayBaseUrl, roomInfo.joinUrl);
  const joinUrl = preferredJoinUrl(urls) || roomInfo.joinUrl;
  return {
    ok: true,
    mode: 'cloud',
    joinUrl,
    code: roomInfo.code,
    roomId: roomInfo.roomId,
    urls,
    lanIpMissing: isLocalRelayBase(relayBaseUrl) && !hasReachableLanIp(),
  };
}

async function shutdownCloudRemotePc() {
  stopHeartbeat();
  const token = roomInfo?.pcToken;
  roomInfo = null;
  if (pcWs) {
    try { pcWs.close(); } catch (_) { /* ignore */ }
    pcWs = null;
  }
  if (token && relayBaseUrl) {
    try {
      await httpJson('DELETE', '/api/rooms', { pcToken: token });
    } catch (err) {
      console.error('cloud remote room delete failed:', err);
    }
  }
}

module.exports = {
  initCloudRemotePc,
  shutdownCloudRemotePc,
  broadcastState,
  approveDevice,
  denyDevice,
  getCloudRemoteInfo,
};
