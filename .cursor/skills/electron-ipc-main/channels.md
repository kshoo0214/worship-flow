# subtitle-broadcast IPC channel map

All handlers live in `main.js`. Unless noted, renderer calls `ipcRenderer.send` and main may `event.reply` or `webContents.send`.

## Renderer → main (`ipcMain.on`)

| Channel | Purpose |
|---------|---------|
| `request-library` | Reply `update-library` to sender |
| `request-playlists` | Reply `playlists:sync` |
| `playlists:save` | Persist playlists, `broadcastPlaylists` |
| `request-themes` | Reply `themes:sync` |
| `theme:open-manager` | Open theme manager window |
| `theme:save` | Upsert theme, `broadcastThemes` |
| `theme:delete` | Delete theme, `broadcastThemes` |
| `theme:apply-song` | Apply theme to song file + `theme:applied` to controller |
| `settings:get` | Reply `settings:sync` |
| `settings:save` | Merge settings, `broadcastSettings` |
| `settings:reset` | Reset settings, `broadcastSettings` |
| `request-media-library` | `broadcastMediaLibrary` |
| `import-media` | Copy file into `media/assets/` |
| `import-slide-background` | Reply `slide-background-imported` |
| `pick-media-files` | Native open dialog, import files |
| `pick-slide-background` | Dialog + reply `slide-background-imported` |
| `background-set` | Program background via `pushBackgroundSet` |
| `background-clear` | `pushBackgroundClear` |
| `macro-clear-text` / `macro-clear-media` / `macro-clear-all` | `pushMacroClear` |
| `save-song` / `delete-song` | Atomic `songs.json`, `broadcastLibrary` |
| `send-slide` | Normalize slide → `pushSlideUpdate` |
| `send-subtitle` | Text → slide → `pushSlideUpdate` |
| `set-blackout` | Blackout / unblackout + restore `lastSlide` |

## Main → controller (`controllerWindow.webContents.send`)

| Channel | Purpose |
|---------|---------|
| `update-library` | Song library snapshot |
| `playlists:sync` | Playlists state |
| `themes:sync` | Theme list |
| `theme:applied` | Song after theme apply |
| `settings:sync` | App settings |
| `update-media-library` | Media bar items |
| `background-state` | Current background id |
| `slide-background-imported` | Slide bg filename (also via `event.reply`) |

## Main → output (`sendToOutput` → `outputWindow`)

| Channel | Purpose |
|---------|---------|
| `subtitle:slide` | Live slide + seq |
| `subtitle:update` | (legacy text path if used) |
| `subtitle:blackout` / `subtitle:unblackout` | Black layer |
| `subtitle:clear` | Clear foreground |
| `background:set` / `background:clear` | Program background |
| `output:clear-text` / `output:clear-media` / `output:clear-all` | Layer macros |

## Main → multiple windows

`broadcastSettings` → `settings:sync` on controller, output, and theme manager.

`broadcastThemes` → controller + theme manager.
