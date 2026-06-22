/**
 * ProPresenter 6/7 default keyboard shortcuts (Mac + Windows).
 * Sources: Renewed Vision key mapping PDF, Pro 7 user guide, operator guides.
 * Multiple combos per action are comma-separated (platform alternates).
 */

/** @typedef {Record<string, string>} ShortcutMap */

const DEFAULT_SHORTCUTS = {
  // — Presentation (live) — Mac-first (Meta = ⌘) —
  liveNext: 'Space,ArrowRight',
  livePrev: 'ArrowLeft,Backspace',
  liveDeleteSelection: 'Delete,Backspace',
  liveDeselect: 'Escape',
  liveNextBackground: 'Meta+ArrowRight,Control+ArrowRight',
  livePrevBackground: 'Meta+ArrowLeft,Control+ArrowLeft',
  liveClearAll: 'F1,Meta+Shift+KeyX',
  liveClearText: 'F2,Meta+Shift+KeyT',
  liveClearMedia: 'F3,Meta+Shift+KeyB',
  liveClearProps: 'F4,Meta+Shift+KeyP',
  liveClearAudio: 'F5,Meta+F5',
  liveClearAnnouncements: 'F7,Meta+F7',
  liveLogo: 'F6,Meta+F6',
  liveBlackout: 'Meta+Backquote,Backquote,Slash',
  inlineTextCommit: 'Meta+Enter,Control+Enter',
  liveTrigger: 'Meta+Enter,Control+Enter',
  liveToggleOutput: 'Meta+Digit1,Control+F12',
  liveToggleStage: 'Meta+Digit2',
  toggleMediaPanel: 'Meta+KeyI',
  quickSearch: 'Meta+KeyF,Control+KeyF',
  focusBible: 'Meta+KeyB',
  focusLibrary: 'Meta+KeyL',
  focusPlaylist: 'Meta+KeyP',

  // — Navigation (workspace modes) —
  navSlides: 'Escape',
  navSlideEdit: 'Meta+KeyE,Control+KeyE',
  navReflow: 'Control+KeyR,Meta+KeyR,Alt+KeyR',

  // — File / app —
  openPreferences: 'Meta+Comma,Control+Comma',
  librarySearch: 'Meta+KeyF,Control+KeyF',
  openEditor: 'Meta+KeyE,Control+KeyE',

  // — Editor document —
  editorSave: 'Meta+KeyS,Control+KeyS',
  editorUndo: 'Meta+KeyZ,Control+KeyZ',
  editorRedo: 'Meta+Shift+KeyZ,Control+Shift+KeyZ,Control+KeyY',
  editorCut: 'Meta+KeyX,Control+KeyX',
  editorCopyLayer: 'Meta+KeyC,Control+KeyC',
  editorPasteLayer: 'Meta+KeyV,Control+KeyV',
  editorDeleteLayer: 'Delete,Backspace',
  editorDeselect: 'Meta+KeyU,Control+KeyU',
  editorSelectAll: 'Meta+KeyA,Control+KeyA',

  // — Slides (editor) —
  editorNextSlide: 'Space,ArrowRight',
  editorPrevSlide: 'ArrowLeft',
  editorAddSlide: 'Meta+KeyN,Control+KeyN',
  editorDuplicateSlide: 'Meta+KeyD,Control+KeyD',
  editorDeleteSlide: 'Delete,Backspace',

  // — Reflow editor —
  editorOpenReflow: 'Control+KeyR,Meta+KeyR,Alt+KeyR',
  editorReflowSplit: 'Alt+Enter,Control+Enter',
  editorReflowSendNext: 'Alt+Shift+Enter,Control+Shift+Enter',
  editorReflowNextSlide: 'ArrowDown',
  editorReflowPrevSlide: 'ArrowUp',

  // — Visual editor (items / text) —
  editorBold: 'Meta+Shift+KeyB,Control+Shift+KeyB',
  editorItalic: 'Meta+Shift+KeyI,Control+Shift+KeyI',
  editorUnderline: 'Meta+KeyU,Control+KeyU',
  editorMakeBigger: 'Meta+Equal,Control+Equal',
  editorMakeSmaller: 'Meta+Minus,Control+Minus',
  editorBringForward: 'Meta+Alt+KeyF,Control+Alt+KeyF',
  editorBringToFront: 'Meta+Shift+KeyF,Control+Shift+KeyF',
  editorSendBackward: 'Meta+Alt+KeyB,Control+Alt+KeyB',
  editorSendToBack: 'Meta+Shift+KeyB,Control+Shift+KeyB',
  editorFitCanvas: 'Meta+Digit0,Control+Digit0',
  editorToggleGrid: 'Meta+KeyG,Control+KeyG',
  editorNudge: 'ArrowUp,ArrowDown,ArrowLeft,ArrowRight',
  editorNudgeLarge: 'Shift+ArrowUp,Shift+ArrowDown,Shift+ArrowLeft,Shift+ArrowRight',

  editorNextLayer: 'Meta+BracketRight,Control+BracketRight',
  editorPrevLayer: 'Meta+BracketLeft,Control+BracketLeft',
  editorDuplicateLayer: 'Meta+Shift+KeyL,Control+Shift+KeyL',
};

const ACTION_LABEL_KEYS = {
  liveNext: 'scLiveNext',
  livePrev: 'scLivePrev',
  liveNextBackground: 'scLiveNextBg',
  livePrevBackground: 'scLivePrevBg',
  liveDeselect: 'scLiveDeselect',
  liveDeleteSelection: 'scLiveDeleteSelection',
  liveClearAll: 'scLiveClearAll',
  liveClearText: 'scLiveClearText',
  liveClearMedia: 'scLiveClearMedia',
  liveClearProps: 'scLiveClearProps',
  liveClearAudio: 'scLiveClearAudio',
  liveClearAnnouncements: 'scLiveClearAnnouncements',
  liveLogo: 'scLiveLogo',
  liveBlackout: 'scLiveBlackout',
  inlineTextCommit: 'scInlineTextCommit',
  liveTrigger: 'scLiveTrigger',
  liveToggleOutput: 'scLiveToggleOutput',
  liveToggleStage: 'scLiveToggleStage',
  toggleMediaPanel: 'scToggleMediaPanel',
  quickSearch: 'scQuickSearch',
  focusBible: 'scFocusBible',
  focusLibrary: 'scFocusLibrary',
  focusPlaylist: 'scFocusPlaylist',
  navSlides: 'scNavSlides',
  navSlideEdit: 'scNavSlideEdit',
  navReflow: 'scNavReflow',
  openPreferences: 'scOpenPreferences',
  librarySearch: 'scLibrarySearch',
  openEditor: 'scOpenEditor',
  editorSave: 'scEditorSave',
  editorUndo: 'scEditorUndo',
  editorRedo: 'scEditorRedo',
  editorCut: 'scEditorCut',
  editorCopyLayer: 'scEditorCopy',
  editorPasteLayer: 'scEditorPaste',
  editorDeleteLayer: 'scEditorDeleteLayer',
  editorDeselect: 'scEditorDeselect',
  editorSelectAll: 'scEditorSelectAll',
  editorNextSlide: 'scEditorNextSlide',
  editorPrevSlide: 'scEditorPrevSlide',
  editorAddSlide: 'scEditorAddSlide',
  editorDuplicateSlide: 'scEditorDuplicateSlide',
  editorDeleteSlide: 'scEditorDeleteSlide',
  editorOpenReflow: 'scEditorOpenReflow',
  editorReflowSplit: 'scEditorReflowSplit',
  editorReflowSendNext: 'scEditorReflowSendNext',
  editorReflowNextSlide: 'scEditorReflowNextSlide',
  editorReflowPrevSlide: 'scEditorReflowPrevSlide',
  editorBold: 'scEditorBold',
  editorItalic: 'scEditorItalic',
  editorUnderline: 'scEditorUnderline',
  editorMakeBigger: 'scEditorMakeBigger',
  editorMakeSmaller: 'scEditorMakeSmaller',
  editorBringForward: 'scEditorBringForward',
  editorBringToFront: 'scEditorBringToFront',
  editorSendBackward: 'scEditorSendBackward',
  editorSendToBack: 'scEditorSendToBack',
  editorFitCanvas: 'scEditorFitCanvas',
  editorToggleGrid: 'scEditorToggleGrid',
  editorNudge: 'scEditorNudge',
  editorNudgeLarge: 'scEditorNudgeLarge',
  editorNextLayer: 'scEditorNextLayer',
  editorPrevLayer: 'scEditorPrevLayer',
  editorDuplicateLayer: 'scEditorDuplicateLayer',
};

/** Shortcuts that stay active while focus is in input/textarea/contenteditable (Mac operator keys). */
const GLOBAL_ALWAYS_ACTIONS = new Set([
  'quickSearch', 'librarySearch', 'focusBible', 'focusLibrary', 'focusPlaylist',
  'toggleMediaPanel', 'liveToggleOutput', 'liveToggleStage',
  'openPreferences', 'navSlideEdit', 'openEditor', 'navReflow',
]);

/** Presentation keys blocked while typing in editable fields. */
const PRESENTATION_ACTIONS = new Set([
  'liveNext', 'livePrev', 'liveDeselect', 'liveDeleteSelection',
  'liveNextBackground', 'livePrevBackground', 'liveTrigger',
  'liveBlackout', 'liveClearAll', 'liveClearText', 'liveClearMedia',
  'liveClearProps', 'liveClearAudio', 'liveClearAnnouncements', 'liveLogo',
  'editorSelectAll', 'editorAddSlide', 'editorDuplicateSlide', 'editorDeleteSlide',
]);

/** ProPresenter-style grouping in settings UI */
const SHORTCUT_SECTIONS = [
  {
    id: 'presentation',
    labelKey: 'scSecPresentation',
    actions: [
      'liveNext', 'livePrev', 'liveDeselect', 'liveDeleteSelection',
      'liveNextBackground', 'livePrevBackground',
      'liveTrigger', 'liveBlackout', 'liveToggleOutput', 'liveToggleStage',
    ],
  },
  {
    id: 'clear',
    labelKey: 'scSecClear',
    actions: [
      'liveClearAll', 'liveClearText', 'liveClearMedia', 'liveClearProps',
      'liveClearAudio', 'liveClearAnnouncements', 'liveLogo',
    ],
  },
  {
    id: 'navigation',
    labelKey: 'scSecNavigation',
    actions: [
      'navSlides', 'navSlideEdit', 'navReflow',
      'quickSearch', 'focusBible', 'focusLibrary', 'focusPlaylist', 'toggleMediaPanel',
    ],
  },
  {
    id: 'app',
    labelKey: 'scSecApp',
    actions: ['openPreferences', 'librarySearch', 'openEditor', 'editorSave', 'editorUndo', 'editorRedo'],
  },
  {
    id: 'slides',
    labelKey: 'scSecSlides',
    actions: [
      'editorNextSlide', 'editorPrevSlide', 'editorAddSlide',
      'editorDuplicateSlide', 'editorDeleteSlide',
    ],
  },
  {
    id: 'reflow',
    labelKey: 'scSecReflow',
    actions: [
      'editorOpenReflow', 'editorReflowSplit', 'editorReflowSendNext',
      'editorReflowNextSlide', 'editorReflowPrevSlide',
    ],
  },
  {
    id: 'editor',
    labelKey: 'scSecEditor',
    actions: [
      'editorCut', 'editorCopyLayer', 'editorPasteLayer', 'editorDeleteLayer',
      'editorDeselect', 'editorSelectAll',
      'editorBold', 'editorItalic', 'editorUnderline',
      'editorMakeBigger', 'editorMakeSmaller',
      'editorBringForward', 'editorBringToFront', 'editorSendBackward', 'editorSendToBack',
      'editorFitCanvas', 'editorToggleGrid', 'editorNudge', 'editorNudgeLarge',
      'editorNextLayer', 'editorPrevLayer', 'editorDuplicateLayer',
    ],
  },
];

function normalizeShortcuts(raw) {
  const out = { ...DEFAULT_SHORTCUTS };
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(DEFAULT_SHORTCUTS).forEach((key) => {
    if (typeof raw[key] === 'string') out[key] = raw[key].trim();
  });
  return out;
}

function splitCombos(binding) {
  return String(binding || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function eventToCombo(e) {
  const parts = [];
  if (e.metaKey) parts.push('Meta');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const code = e.code || e.key;
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(code)) parts.push(code);
  return parts.join('+');
}

function comboMatchesEvent(combo, e) {
  const pressed = eventToCombo(e);
  if (pressed !== combo) return false;
  if (combo.includes('Shift+') && !e.shiftKey) return false;
  if (combo.includes('Meta+') && !e.metaKey) return false;
  if (combo.includes('Control+') && !e.ctrlKey) return false;
  if (combo.includes('Alt+') && !e.altKey) return false;
  return true;
}

function matchAction(e, shortcuts, actionId) {
  const binding = shortcuts[actionId];
  if (!binding || !String(binding).trim()) return false;
  return splitCombos(binding).some((combo) => comboMatchesEvent(combo, e));
}

/** Match only if combo hits and typing guard allows this action category. */
function tryMatchAction(e, shortcuts, actionId, opts = {}) {
  if (!matchAction(e, shortcuts, actionId)) return false;
  if (GLOBAL_ALWAYS_ACTIONS.has(actionId)) return true;
  if (opts.forceAllow) return true;
  if (PRESENTATION_ACTIONS.has(actionId) && shouldBlockGlobalShortcut(e, opts)) return false;
  if (shouldBlockGlobalShortcut(e, opts)) return false;
  return true;
}

function isPresentationAction(actionId) {
  return PRESENTATION_ACTIONS.has(actionId);
}

function isGlobalAlwaysAction(actionId) {
  return GLOBAL_ALWAYS_ACTIONS.has(actionId);
}

function formatComboForDisplay(combo, lang = 'ko') {
  const isMac = typeof process !== 'undefined' && process.platform === 'darwin';
  const macStyle = lang === 'ko' || isMac;
  let s = combo;
  if (macStyle) {
    s = s
      .replace(/Meta\+/g, '⌘')
      .replace(/Control\+/g, '⌃')
      .replace(/Alt\+/g, '⌥')
      .replace(/Shift\+/g, '⇧');
  } else {
    s = s
      .replace(/Meta\+/g, 'Win+')
      .replace(/Control\+/g, 'Ctrl+')
      .replace(/Alt\+/g, 'Alt+')
      .replace(/Shift\+/g, 'Shift+');
  }
  return s
    .replace(/Key([A-Z])/g, '$1')
    .replace(/Digit(\d)/g, '$1')
    .replace(/Comma/g, ',')
    .replace(/BracketLeft/g, '[')
    .replace(/BracketRight/g, ']')
    .replace(/Equal/g, '+')
    .replace(/Minus/g, '-')
    .replace(/ArrowUp/g, '↑')
    .replace(/ArrowDown/g, '↓')
    .replace(/ArrowLeft/g, '←')
    .replace(/ArrowRight/g, '→')
    .replace(/Space/g, 'Space')
    .replace(/Backspace/g, '⌫')
    .replace(/Delete/g, 'Del')
    .replace(/Enter/g, '↵')
    .replace(/Tab/g, 'Tab');
}

function formatBindingForDisplay(binding, lang = 'ko') {
  const combos = splitCombos(binding);
  if (!combos.length) return '—';
  return combos.map((c) => formatComboForDisplay(c, lang)).join(' / ');
}

function captureComboFromEvent(e) {
  e.preventDefault();
  e.stopPropagation();
  const ignore = ['Meta', 'Control', 'Alt', 'Shift'];
  if (ignore.includes(e.key) || ignore.includes(e.code)) return null;
  return eventToCombo(e);
}

const NON_TYPING_INPUT_TYPES = new Set([
  'button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'hidden',
]);

/**
 * True when focus is in a field that should receive normal typing/editing (block global hotkeys).
 */
function isEditableTarget(el, opts = {}) {
  if (!el || el === document.body || el === document.documentElement) return false;
  const root = opts.root || (typeof document !== 'undefined' ? document : null);
  if (root?.querySelector?.('.inline-text-editor:focus-within')) return true;
  if (root?.querySelector?.('.inline-text-editor')) {
    const activeInline = root.querySelector('.inline-text-editor');
    if (activeInline && (el === activeInline || activeInline.contains(el))) return true;
  }
  if (el.closest?.('.shortcut-capture-input')) return true;
  if (el.closest?.('.inline-text-editor')) return true;
  if (el.closest?.('[data-hotkey-block="true"]')) return true;
  if (el.closest?.('.quick-search-modal:not(.is-hidden)')) return true;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    if (NON_TYPING_INPUT_TYPES.has(type)) return false;
    return true;
  }
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Block global presentation shortcuts while typing; allow Escape in modals separately.
 */
function shouldBlockGlobalShortcut(e, opts = {}) {
  if (opts.forceAllow) return false;
  if (opts.actionId && GLOBAL_ALWAYS_ACTIONS.has(opts.actionId)) return false;
  const active = (typeof document !== 'undefined' ? document.activeElement : null);
  if (isEditableTarget(active, opts)) return true;
  if (e?.target && e.target !== active && isEditableTarget(e.target, opts)) return true;
  return false;
}

/** Mac presentation mode — prefer Meta bindings and ⌘ display. */
function isMacPlatform() {
  return typeof process !== 'undefined' && process.platform === 'darwin';
}

module.exports = {
  DEFAULT_SHORTCUTS,
  ACTION_LABEL_KEYS,
  SHORTCUT_SECTIONS,
  GLOBAL_ALWAYS_ACTIONS,
  PRESENTATION_ACTIONS,
  normalizeShortcuts,
  splitCombos,
  eventToCombo,
  matchAction,
  tryMatchAction,
  isPresentationAction,
  isGlobalAlwaysAction,
  formatBindingForDisplay,
  formatComboForDisplay,
  captureComboFromEvent,
  isEditableTarget,
  shouldBlockGlobalShortcut,
  isMacPlatform,
  NON_TYPING_INPUT_TYPES,
};
