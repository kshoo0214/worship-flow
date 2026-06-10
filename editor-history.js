/**
 * Undo/redo stack for editor workspace (slide-edit & reflow).
 */

const MAX_HISTORY = 60;

function cloneEditorState(src) {
  if (!src) return null;
  return JSON.parse(JSON.stringify(src));
}

class EditorHistory {
  constructor() {
    this.stack = [];
    this.pointer = -1;
  }

  reset(state) {
    this.stack = state ? [cloneEditorState(state)] : [];
    this.pointer = this.stack.length ? 0 : -1;
  }

  push(state) {
    if (!state) return;
    const snap = cloneEditorState(state);
    if (this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }
    const last = this.stack[this.pointer];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    this.stack.push(snap);
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    }
    this.pointer = this.stack.length - 1;
  }

  canUndo() {
    return this.pointer > 0;
  }

  canRedo() {
    return this.pointer >= 0 && this.pointer < this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    this.pointer -= 1;
    return cloneEditorState(this.stack[this.pointer]);
  }

  redo() {
    if (!this.canRedo()) return null;
    this.pointer += 1;
    return cloneEditorState(this.stack[this.pointer]);
  }
}

module.exports = { EditorHistory, cloneEditorState };
