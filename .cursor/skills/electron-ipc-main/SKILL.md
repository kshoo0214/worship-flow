---
name: electron-ipc-main
description: Guides Electron main-process IPC using ipcMain (on, handle, reply) and webContents.send. Use when editing main.js, adding IPC channels, debugging renderer↔main messaging, or when the user references ipc-main, ipcRenderer, or Electron IPC.
---

# Electron ipcMain

Official API: [ipcMain](https://www.electronjs.org/docs/latest/api/ipc-main)

## Mental model

- **Renderer → main**: `ipcRenderer.send` / `invoke` → `ipcMain` listeners in the main process.
- **Main → renderer**: `webContents.send(channel, ...args)` on a specific `BrowserWindow` (not `ipcMain`).
- **Channel** = arbitrary string event name; payload is any serializable args (structured clone rules apply).

`ipcMain` is an **EventEmitter** in the main process only.

## Choosing a pattern

| Need | Main | Renderer |
|------|------|----------|
| Fire-and-forget, optional one-off reply | `ipcMain.on(channel, (event, ...args) => {})` | `ipcRenderer.send(channel, ...args)` |
| Reply to sender | `event.reply(replyChannel, ...args)` | `ipcRenderer.on(replyChannel, ...)` |
| Sync reply (avoid; blocks renderer) | set `event.returnValue = value` | `ipcRenderer.sendSync` |
| Request/response with Promise | `ipcMain.handle(channel, async (event, ...args) => value)` | `await ipcRenderer.invoke(channel, ...args)` |
| One-shot listener | `ipcMain.once` / `handleOnce` | same send/invoke |
| Cleanup | `ipcMain.off` / `removeHandler(channel)` | remove matching renderer listeners |

**Prefer `handle` + `invoke`** when the renderer must await a result or catch errors. **Prefer `on` + `send`** for commands and broadcasts.

### handle caveats

- Thrown errors are serialized; only `error.message` reaches the renderer ([#24427](https://github.com/electron/electron/issues/24427)).
- Return a Promise for async work; the resolved value becomes the invoke result.

```js
ipcMain.handle('read-config', async () => AppSettings.loadSettings());

// renderer
const settings = await ipcRenderer.invoke('read-config');
```

## Main → renderer

Use `win.webContents.send(channel, payload)` after checking `win && !win.isDestroyed()`.

For replies to the **same** sender that called `send`, use `event.reply(channel, ...args)` (handles non-main frames; prefer over `event.sender.send` when replying).

## subtitle-broadcast rules

1. **Single bridge**: All cross-window state flows through `main.js`. Renderers never talk to each other directly.
2. **Inbound**: Register handlers with `ipcMain.on` in `main.js` (this project uses `on`, not `handle`).
3. **Outbound**: Use helpers — `sendToOutput`, `broadcastLibrary`, `broadcastSettings`, `pushSlideUpdate`, etc. — instead of ad-hoc `webContents.send` scattered in HTML.
4. **Channel naming**: `domain:action` (`settings:save`, `subtitle:slide`, `background:set`).
5. **Window targets**:
   - Controller: library/themes/playlists/settings UI sync.
   - Output: program (`subtitle:*`, `background:*`, `output:clear-*`).
6. **Blackout**: `pushSlideUpdate` updates `lastSlide` but skips `sendToOutput` while `isBlackout`; controller still moves focus; output stays black until unblackout.
7. **Guards**: Validate payloads; skip no-op work (e.g. duplicate background path). Wrap file I/O in try/catch; use `AtomicWrite` for JSON.

## Adding a new channel (checklist)

1. Add `ipcMain.on('domain:action', ...)` in `main.js` — validate args, mutate state or files, then call existing `broadcast*` / `push*` helpers.
2. Controller/output: `ipcRenderer.send('domain:action', payload)` or `ipcRenderer.on('domain:sync', ...)`.
3. If multiple windows need the same data, add or extend a `broadcast*` function; do not send from one renderer to another.
4. If output must wait for load, route through `sendToOutput` (queues `pendingBg` / `pendingFg` until `outputReady`).

## Listener hygiene

- Remove handlers on app quit if channels are re-registered (hot reload / tests): `ipcMain.removeHandler(channel)` or `ipcMain.off(channel, listener)`.
- Keep listener references if you need to `off` the same function later.

## Anti-patterns

- `ipcRenderer.sendSync` / `event.returnValue` in UI hot paths.
- Duplicating business logic in `index.html` / `output.html` that belongs in main helpers.
- Broadcasting sensitive paths without going through main validation.
- New channels that bypass blackout / `outputReady` semantics for program output.

## Additional resources

- API method table: [reference.md](reference.md)
- Project IPC map: [channels.md](channels.md)
