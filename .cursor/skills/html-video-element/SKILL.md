---
name: html-video-element
description: Guides HTML video embeds using the video element, HTMLMediaElement API, sources, preload, autoplay policy, and playback events. Use when adding or debugging video tags, background video playback, canplay/play/pause, muted loop playsinline, WebVTT tracks, or when the user references MDN video element docs.
---

# HTML `<video>` element

Official reference: [MDN — `<video>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)  
DOM API: `HTMLVideoElement` extends `HTMLMediaElement`.

## When to use

- **Video + optional timed text (WebVTT)** → `<video>` (or `<video>` for audio-only when captions need a video region).
- **Audio-only UX** → prefer `<audio>` unless captions/WebVTT require `<video>`.

## Markup patterns

**Single source** (simplest):

```html
<video controls width="1920" height="1080" src="clip.mp4" poster="thumb.jpg"></video>
```

**Multiple formats** (browser picks first playable `<source>`; failures try next; `error` on `<video>` only after all fail):

```html
<video controls width="1920" height="1080">
  <source src="clip.webm" type="video/webm" />
  <source src="clip.mp4" type="video/mp4" />
  <p>Fallback: <a href="clip.mp4">download</a></p>
</video>
```

Optional codec hint: `type="video/webm; codecs=&quot;vp9, opus&quot;"`.

## Boolean attributes (critical)

Presence alone enables the feature; `autoplay="false"` **does not** disable autoplay — remove the attribute.

| Attribute | Effect |
|-----------|--------|
| `autoplay` | Start when ready; **blocked** if unmuted audio (browser autoplay policy) |
| `controls` | Native UI (volume, seek, pause) |
| `loop` | Restart at end |
| `muted` | Start muted; often required for autoplay |
| `playsinline` | Inline playback (iOS / embedded; not fullscreen-only) |
| `disablepictureinpicture` | No PiP |
| `disableremoteplayback` | No AirPlay / Cast / HDMI remote playback |

Safari fallback for remote playback: `x-webkit-airplay="deny"`.

## Loading and performance

| Attribute | Values / notes |
|-----------|----------------|
| `preload` | `none` \| `metadata` \| `auto` (hint only; spec default is browser-specific) |
| `loading` | `eager` (default) \| `lazy` — defers download until near viewport; defers `autoplay` / `poster` / `preload` until then |
| `poster` | Image URL until first frame |
| `width` / `height` | CSS pixels, **absolute only** (no %) — set explicitly to avoid layout shift, especially with `loading="lazy"` |

`autoplay` overrides `preload`. With `loading="lazy"`, unloaded video has 0×0 size until loaded — can break intersection-based loading without dimensions.

## Programmatic control (no `controls`)

Use `HTMLMediaElement` methods and events:

```js
const video = document.querySelector('video');

video.src = url;           // or <source> children
video.load();              // reset after src change / removeAttribute('src')
video.play();              // returns Promise; catch NotAllowedError (autoplay policy)
video.pause();
video.currentTime = 0;
```

**Reliable start after src change**: wait for `canplay` (or `loadeddata`), then `play().catch(() => {})`:

```js
const onReady = () => {
  video.removeEventListener('canplay', onReady);
  video.play().catch(() => {});
};
video.addEventListener('canplay', onReady);
video.src = url;
video.load();
```

**Teardown / swap**:

```js
video.pause();
video.removeAttribute('src');
video.load();
```

**Duplicate src guard** (avoid restart on re-cue):

```js
if (video.src !== newSrc) {
  video.src = newSrc;
  video.load();
  // attach canplay → play
} else if (video.paused) {
  video.play().catch(() => {});
}
```

## Events (playback pipeline)

Listen on the `<video>` element unless noted.

| Event | Use |
|-------|-----|
| `loadstart` | Fetch began |
| `loadedmetadata` | Duration/dimensions known |
| `loadeddata` | First frame |
| `canplay` | Can start (may buffer later) |
| `canplaythrough` | Can play to end without stopping |
| `play` / `pause` | Playback state |
| `playing` | After delay / buffer stall |
| `waiting` | Buffering mid-playback |
| `ended` | Reached end (`loop` seeks back) |
| `timeupdate` | `currentTime` changed |
| `error` | All sources failed or unsupported format |
| `emptied` | e.g. after `load()` reset |

Text/audio/video **track lists** fire `addtrack` / `removetrack` on `video.audioTracks`, `video.videoTracks`, `video.textTracks` — not on `<video>` directly.

## Styling

Replaced element (default `display: inline`). Common pattern:

```css
video { display: block; max-width: 100%; object-fit: cover; object-position: center; }
```

Toggle visibility with classes (e.g. `.is-on { display: block; }`) instead of fighting default inline layout.

## Captions / WebVTT

```html
<video controls src="video.webm">
  <track default kind="captions" src="captions.vtt" srclang="ko" label="Korean" />
</video>
```

Provide captions **and** transcripts for accessibility; review auto-generated captions.

## Server / MIME

Wrong `Content-Type` → broken playback or gray X. Serve correct types (e.g. `video/webm`, `video/mp4`).

## Autoplay policy (summary)

- Unmuted autoplay is commonly blocked.
- Use `muted` + `playsinline` for background loops in apps/kiosks.
- User gesture may be required before first `play()` in some contexts.

## subtitle-broadcast patterns

- Background video in `output.html`: `loop muted playsinline webkit-playsinline preload="auto"`, no native `controls`.
- Crossfade: dual panes; compare `video.src` before `load()` to prevent duplicate-click reset (project rule).
- Fade timing: align opacity/CSS transitions with `settings.json` fade ms — do not hard-cut unless clearing.
- Prefer `media/assets/` file paths in IPC payloads, not Base64 in JSON.

## Anti-patterns

- Setting `autoplay="false"` instead of removing `autoplay`.
- Calling `play()` immediately after `src =` without `load()` + readiness event.
- Re-assigning same `src` and calling `load()` on every cue (restarts playback).
- Relying on `preload` as a hard guarantee (hint only).
- Omitting `width`/`height` with `loading="lazy"`.
- Expecting per-`<source>` `error` events (only `<video>` fires after all sources fail).

## Additional resources

- Attribute tables and full event list: [reference.md](reference.md)
- MDN guides linked from the element page: media formats, cross-browser player, canvas video, server Ogg/WebM config
