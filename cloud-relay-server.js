'use strict';

/**
 * Worship FLOW cloud relay — room per PC, join code (B), operator approval (C).
 * Deploy separately: PORT=8766 node cloud-relay-server.js
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8766;
const APP_ROOT = process.env.WORSHIP_FLOW_APP_ROOT || __dirname;
const HEARTBEAT_MS = 30_000;
const ROOM_TTL_MS = 90_000;

/** @type {Map<string, object>} */
const rooms = new Map();
/** @type {Map<string, string>} */
const pcIndex = new Map();

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomCode() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function publicBaseUrl(req) {
  const env = process.env.WORSHIP_FLOW_PUBLIC_URL;
  if (env) return env.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(String(host));
  const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}

function findRoomByPcToken(pcToken) {
  for (const room of rooms.values()) {
    if (room.pcToken === pcToken) return room;
  }
  return null;
}

function findRoomByJoinToken(joinToken) {
  for (const room of rooms.values()) {
    if (room.joinToken === joinToken) return room;
  }
  return null;
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  pcIndex.delete(room.pcId);
  room.pending.forEach((p) => {
    try { p.ws?.close(); } catch (_) { /* ignore */ }
  });
  room.approved.forEach((p) => {
    try { p.ws?.close(); } catch (_) { /* ignore */ }
  });
  try { room.pcWs?.close(); } catch (_) { /* ignore */ }
  rooms.delete(roomId);
}

function purgeExpiredRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (now - room.lastHeartbeat > ROOM_TTL_MS) deleteRoom(roomId);
  }
}

setInterval(purgeExpiredRooms, HEARTBEAT_MS);

function createRoom(pcId) {
  const id = String(pcId || '').trim();
  if (!id) throw new Error('pcId required');

  const existing = pcIndex.get(id);
  if (existing) deleteRoom(existing);

  const roomId = `rm_${randomId(8)}`;
  const room = {
    roomId,
    pcId: id,
    joinToken: randomId(10),
    code: randomCode(),
    pcToken: randomId(16),
    createdAt: Date.now(),
    lastHeartbeat: Date.now(),
    state: null,
    pending: new Map(),
    approved: new Map(),
    pcWs: null,
  };
  rooms.set(roomId, room);
  pcIndex.set(id, roomId);
  return room;
}

function roomPublicView(room, baseUrl) {
  const joinUrl = `${baseUrl}/?t=${encodeURIComponent(room.joinToken)}&c=${encodeURIComponent(room.code)}`;
  return {
    roomId: room.roomId,
    joinToken: room.joinToken,
    code: room.code,
    pcToken: room.pcToken,
    joinUrl,
    expiresAt: room.lastHeartbeat + ROOM_TTL_MS,
  };
}

function notifyPc(room, message) {
  if (room.pcWs && room.pcWs.readyState === 1) {
    room.pcWs.send(JSON.stringify(message));
  }
}

function broadcastState(room) {
  if (!room.state) return;
  const msg = JSON.stringify({ type: 'state', payload: room.state });
  room.approved.forEach((dev) => {
    if (dev.ws?.readyState === 1) dev.ws.send(msg);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveRemoteHtml(res) {
  const remotePath = path.join(APP_ROOT, 'remote.html');
  fs.readFile(remotePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('remote.html not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const baseUrl = publicBaseUrl(req);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/remote.html')) {
      serveRemoteHtml(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, rooms: rooms.size });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readJsonBody(req);
      const room = createRoom(body.pcId);
      room.lastHeartbeat = Date.now();
      sendJson(res, 200, roomPublicView(room, baseUrl));
      return;
    }

    if (req.method === 'DELETE' && url.pathname === '/api/rooms') {
      const body = await readJsonBody(req);
      const room = findRoomByPcToken(body.pcToken);
      if (!room) {
        sendJson(res, 404, { ok: false, error: 'room not found' });
        return;
      }
      deleteRoom(room.roomId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/heartbeat') {
      const body = await readJsonBody(req);
      const room = findRoomByPcToken(body.pcToken);
      if (!room) {
        sendJson(res, 404, { ok: false, error: 'room not found' });
        return;
      }
      room.lastHeartbeat = Date.now();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/room/info') {
      const pcToken = url.searchParams.get('pcToken');
      const room = findRoomByPcToken(pcToken);
      if (!room) {
        sendJson(res, 404, { ok: false });
        return;
      }
      sendJson(res, 200, { ok: true, ...roomPublicView(room, baseUrl) });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('relay HTTP error:', err);
    sendJson(res, 500, { ok: false, error: err.message || 'server error' });
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const role = url.searchParams.get('role');

  if (role === 'pc') {
    const pcToken = url.searchParams.get('token') || '';
    const room = findRoomByPcToken(pcToken);
    if (!room) {
      ws.close(4001, 'invalid pc token');
      return;
    }
    room.pcWs = ws;
    room.lastHeartbeat = Date.now();
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch (_) { return; }
      if (msg?.type === 'state') {
        room.state = msg.payload ?? null;
        broadcastState(room);
      }
      if (msg?.type === 'approve' && msg.deviceId) {
        const pending = room.pending.get(msg.deviceId);
        if (!pending) return;
        room.pending.delete(msg.deviceId);
        room.approved.set(msg.deviceId, pending);
        if (pending.ws?.readyState === 1) {
          pending.ws.send(JSON.stringify({ type: 'approved' }));
        }
      }
      if (msg?.type === 'deny' && msg.deviceId) {
        const pending = room.pending.get(msg.deviceId);
        if (!pending) return;
        room.pending.delete(msg.deviceId);
        if (pending.ws?.readyState === 1) {
          pending.ws.send(JSON.stringify({ type: 'denied' }));
          pending.ws.close();
        }
      }
    });
    ws.on('close', () => {
      if (room.pcWs === ws) room.pcWs = null;
    });
    return;
  }

  if (role === 'phone') {
    const joinToken = url.searchParams.get('token') || '';
    const room = findRoomByJoinToken(joinToken);
    if (!room) {
      ws.close(4002, 'invalid join token');
      return;
    }

    let deviceId = null;
    let registered = false;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch (_) { return; }

      if (msg?.type === 'register') {
        const code = String(msg.code || '').trim();
        if (code !== room.code) {
          ws.send(JSON.stringify({ type: 'error', message: 'invalid_code' }));
          return;
        }
        deviceId = randomId(6);
        const device = {
          deviceId,
          label: String(msg.label || 'Phone').slice(0, 64),
          ws,
          joinedAt: Date.now(),
        };
        room.pending.set(deviceId, device);
        registered = true;
        ws.send(JSON.stringify({ type: 'pending', deviceId }));
        notifyPc(room, {
          type: 'join-request',
          deviceId,
          label: device.label,
          joinedAt: device.joinedAt,
        });
        return;
      }

      if (!registered || !deviceId || !room.approved.has(deviceId)) return;
      if (msg?.type === 'prev' || msg?.type === 'next') {
        notifyPc(room, { type: 'navigate', direction: msg.type });
      }
    });

    ws.on('close', () => {
      if (!deviceId) return;
      room.pending.delete(deviceId);
      room.approved.delete(deviceId);
    });
    return;
  }

  ws.close(4000, 'role required');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Worship FLOW cloud relay listening on 0.0.0.0:${PORT}`);
  console.log(`Serving remote UI from ${APP_ROOT}`);
});
