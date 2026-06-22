# ipcMain API reference

Source: [Electron ipcMain](https://www.electronjs.org/docs/latest/api/ipc-main)

## Sending from main

Main → renderer uses **`webContents.send(channel, ...args)`**, not `ipcMain`.

## Listener event objects

| API | Event type | Notes |
|-----|------------|-------|
| `on` / `once` / `off` | `IpcMainEvent` | `event.reply(...)`, `event.returnValue` (sync), `event.sender` |
| `handle` / `handleOnce` | `IpcMainInvokeEvent` | Return value or Promise becomes invoke result |

## Methods

### `ipcMain.on(channel, listener)`

`listener(event, ...args)` — called on every `ipcRenderer.send(channel, ...)`.

### `ipcMain.once(channel, listener)`

Same as `on`, removed after first message.

### `ipcMain.off(channel, listener)` / `removeListener`

Removes one listener. Aliases: `addListener` = `on`.

### `ipcMain.removeAllListeners([channel])`

Removes all listeners for `channel`, or all channels if omitted.

### `ipcMain.handle(channel, listener)`

`listener(event, ...args)` for `ipcRenderer.invoke`. Async via returned Promise.

### `ipcMain.handleOnce(channel, listener)`

Single invoke, then removed.

### `ipcMain.removeHandler(channel)`

Removes the handler registered with `handle`.

## Reply patterns

```js
// async reply to sender
ipcMain.on('get-data', (event, id) => {
  event.reply('data-result', { id, items: [] });
});

// sync (discouraged)
ipcMain.on('get-sync', (event) => {
  event.returnValue = { ok: true };
});
```

## Related renderer APIs

| Renderer | Pairs with |
|----------|------------|
| `ipcRenderer.send` | `ipcMain.on` |
| `ipcRenderer.invoke` | `ipcMain.handle` |
| `ipcRenderer.sendSync` | `ipcMain.on` + `returnValue` |
| `ipcRenderer.on` | `webContents.send` or `event.reply` |

## IPC tutorial

End-to-end examples: [Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
