'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 8765;

let httpServer = null;
let wss = null;
let getStateFn = null;
let onNavigateFn = null;
let activePort = DEFAULT_PORT;

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.values(nets).forEach((ifaces) => {
    if (!ifaces) return;
    ifaces.forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    });
  });
  return ips;
}

function buildRemoteUrls(port) {
  const urls = [`http://127.0.0.1:${port}/`];
  getLanAddresses().forEach((ip) => urls.push(`http://${ip}:${port}/`));
  return urls;
}

function broadcastRemoteState(payload) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'state', payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function initRemoteServer(options = {}) {
  const appRoot = options.appRoot;
  const port = Number(options.port) || DEFAULT_PORT;
  getStateFn = options.getState;
  onNavigateFn = options.onNavigate;

  if (httpServer) {
    try { httpServer.close(); } catch (_) { /* ignore */ }
    httpServer = null;
    wss = null;
  }

  const remoteHtmlPath = path.join(appRoot, 'remote.html');
  httpServer = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/' || url === '/remote.html') {
      fs.readFile(remoteHtmlPath, (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('remote.html not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    if (typeof getStateFn === 'function') {
      ws.send(JSON.stringify({ type: 'state', payload: getStateFn() }));
    }
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch (_) { return; }
      if (msg?.type === 'prev' || msg?.type === 'next') {
        if (typeof onNavigateFn === 'function') onNavigateFn(msg.type);
      }
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', () => {
      activePort = port;
      httpServer.removeListener('error', reject);
      resolve({ port: activePort, urls: buildRemoteUrls(activePort) });
    });
  });
}

function stopRemoteServer() {
  if (wss) {
    wss.clients.forEach((c) => { try { c.close(); } catch (_) { /* ignore */ } });
    wss.close();
    wss = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

function getRemoteServerInfo() {
  return { port: activePort, urls: buildRemoteUrls(activePort) };
}

module.exports = {
  DEFAULT_PORT,
  initRemoteServer,
  stopRemoteServer,
  broadcastRemoteState,
  getRemoteServerInfo,
  buildRemoteUrls,
};
