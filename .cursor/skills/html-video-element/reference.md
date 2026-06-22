# `<video>` reference (MDN summary)

Source: [HTML `<video>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)

## Attributes

Supports global attributes plus:

| Attribute | Type | Notes |
|-----------|------|-------|
| `src` | URL | Optional if `<source>` children used |
| `width` / `height` | integer (CSS px) | Absolute only |
| `controls` | boolean | Native controls |
| `controlslist` | enum list | `nodownload`, `nofullscreen`, `noremoteplayback` (with `controls`) |
| `autoplay` | boolean | Blocked for unmuted audio in modern browsers |
| `loop` | boolean | Seek to start at end |
| `muted` | boolean | Default mute; helps autoplay |
| `playsinline` | boolean | Inline, not forced fullscreen |
| `poster` | URL | Shown until first frame |
| `preload` | `none` \| `metadata` \| `auto` | Hint; `""` = `auto` |
| `loading` | `eager` \| `lazy` | Viewport-near loading |
| `crossorigin` | `anonymous` \| `use-credentials` | CORS for canvas reuse |
| `disablepictureinpicture` | boolean | No PiP |
| `disableremoteplayback` | boolean | No remote playback APIs |

## Content model

- With `src`: zero+ `<source>`, then fallback content (no nested `<audio>`/`<video>`).
- Without `src`: `<source>` and/or `<track>`, then fallback.

## Media events (`HTMLMediaElement`)

| Event | Fired when |
|-------|------------|
| `abort` | Fetch aborted |
| `canplay` | Can play; may still buffer |
| `canplaythrough` | Can play through without stopping |
| `durationchange` | `duration` updated |
| `emptied` | Media empty (e.g. after `load()`) |
| `ended` | Playback ended |
| `error` | Fetch/format failure |
| `loadeddata` | First frame loaded |
| `loadedmetadata` | Metadata loaded |
| `loadstart` | Load started |
| `pause` | Paused |
| `play` | Started |
| `playing` | Playing after pause/buffer |
| `progress` | Download progress |
| `ratechange` | `playbackRate` changed |
| `seeked` / `seeking` | Seek completed / started |
| `stalled` | Data expected but not arriving |
| `suspend` | Loading suspended |
| `timeupdate` | `currentTime` updated |
| `volumechange` | Volume/mute changed |
| `waiting` | Paused for buffering |

## Key properties / methods

- `currentTime`, `duration`, `paused`, `ended`, `readyState`, `networkState`
- `playbackRate`, `defaultPlaybackRate`, `volume`, `muted`
- `play()`, `pause()`, `load()`, `fastSeek()` (where supported)
- `videoWidth`, `videoHeight` (intrinsic dimensions)

## `HTMLVideoElement`-specific

- `videoWidth`, `videoHeight`
- `poster` IDL reflects attribute
- `getVideoPlaybackQuality()` where supported

## Format notes

- Browsers differ on codecs; provide WebM + MP4 fallbacks when possible.
- `type` on `<source>` may include `codecs=` parameter.
- Apache example: `AddType video/webm .webm`

## Accessibility (MDN)

- Captions for hearing loss; transcripts for review at own pace.
- Transcripts should include non-speech cues `[music]`, tone, SFX.
- Position captions with WebVTT `align` so they do not cover subject.
