/**
 * ProPresenter 6/7 default keyboard shortcuts (Mac + Windows).
 * Sources: Renewed Vision key mapping PDF, Pro 7 user guide, operator guides.
 * Multiple combos per action are comma-separated (platform alternates).
 */

/** @typedef {Record<string, string>} ShortcutMap */

const DEFAULT_SHORTCUTS = {
  // — Presentation (live) —
  liveNext: 'Space,ArrowRight',
  livePrev: 'ArrowLeft',
  liveNextBackground: 'Meta+ArrowRight,Control+ArrowRight',
  livePrevBackground: 'Meta+ArrowLeft,Control+ArrowLeft',
  liveClearText: 'F1,Meta+F1',
  liveClearMedia: 'F2,Meta+F2',
  liveClearAll: 'F3,Meta+F3',
  liveClearProps: 'F4,Meta+F4',
  liveClearAudio: 'F5,Meta+F5',
  liveClearAnnouncements: 'F7,Meta+F7',
  liveLogo: 'F6,Meta+F6',
  liveBlackout: 'Backquote,Slash',
  liveTrigger: 'Meta+Enter,Control+Enter',
  liveToggleOutput: 'Control+F12,Meta+F12',

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
  editorRedo: 'Meta+Shift+KeyZ,Control+KeyY',
  editorCut: 'Meta+KeyX,Control+KeyX',
  editorCopyLayer: 'Meta+KeyC,Control+KeyC',
  editorPasteLayer: 'Meta+KeyV,Control+KeyV',
  editorDeleteLayer: 'Delete,Backspace',
  editorDeselect: 'Meta+KeyD,Control+KeyU',
  editorSelectAll: 'Meta+KeyA,Control+KeyA',

  // — Slides (editor) —
  editorNextSlide: 'Space,ArrowRight',
  editorPrevSlide: 'ArrowLeft',
  editorAddSlide: 'Meta+KeyN,Control+KeyN',
  editorDuplicateSlide: 'Meta+Shift+KeyD,Control+Shift+KeyD',
  editorDeleteSlide: 'Delete,Backspace',

  // — Reflow editor —
  editorOpenReflow: 'Control+KeyR,Meta+KeyR,Alt+KeyR',
  editorReflowSplit: 'Alt+Enter,Control+Enter',
  editorReflowSendNext: 'Alt+Shift+Enter,Control+Shift+Enter',
  editorReflowNextSlide: 'ArrowDown',
  editorReflowPrevSlide: 'ArrowUp',

  // — Visual editor (items / text) —
  editorBold: 'Meta+KeyB,Control+KeyB',
  editorItalic: 'Meta+KeyI,Control+KeyI',
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
  liveClearAll: 'scLiveClearAll',
  liveClearText: 'scLiveClearText',
  liveClearMedia: 'scLiveClearMedia',
  liveClearProps: 'scLiveClearProps',
  liveClearAudio: 'scLiveClearAudio',
  liveClearAnnouncements: 'scLiveClearAnnouncements',
  liveLogo: 'scLiveLogo',
  liveBlackout: 'scLiveBlackout',
  liveTrigger: 'scLiveTrigger',
  liveToggleOutput: 'scLiveToggleOutput',
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

/** ProPresenter-style grouping in settings UI */
const SHORTCUT_SECTIONS = [
  {
    id: 'presentation',
    labelKey: 'scSecPresentation',
    actions: [
      'liveNext', 'livePrev', 'liveNextBackground', 'livePrevBackground',
      'liveTrigger', 'liveBlackout', 'liveToggleOutput',
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
    actions: ['navSlides', 'navSlideEdit', 'navReflow'],
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

module.exports = {
  DEFAULT_SHORTCUTS,
  ACTION_LABEL_KEYS,
  SHORTCUT_SECTIONS,
  normalizeShortcuts,
  splitCombos,
  eventToCombo,
  matchAction,
  formatBindingForDisplay,
  formatComboForDisplay,
  captureComboFromEvent,
};
