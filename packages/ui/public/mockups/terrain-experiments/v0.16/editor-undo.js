/* ══════════════════════════════════════════════════════════════
   Editor Undo — Command-pattern undo/redo manager.
   Phase 4: granular undo via reversible commands.

   API:
     Editor.Undo.record(cmd)  — push an already-applied command
     Editor.Undo.undo()       — reverse last command (Ctrl+Z)
     Editor.Undo.redo()       — re-apply last undone (Ctrl+Shift+Z / Ctrl+Y)
     Editor.Undo.canUndo()
     Editor.Undo.canRedo()
     Editor.Undo.clear()
══════════════════════════════════════════════════════════════ */

Editor.Undo = {
  undoStack: [],
  redoStack: [],
  MAX: 50,

  /** Record an already-applied command onto the undo stack. */
  record: function(cmd) {
    if (!cmd) return;
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.MAX) this.undoStack.shift();
    this.redoStack = [];
  },

  /** Undo the last command. */
  undo: function() {
    if (!this.undoStack.length) return;
    if (Editor.Crop && Editor.Crop.active) Editor.Crop.cancel();
    var cmd = this.undoStack.pop();
    cmd.reverse();
    this.redoStack.push(cmd);
    this._postUndoRedo();
  },

  /** Redo the last undone command. */
  redo: function() {
    if (!this.redoStack.length) return;
    if (Editor.Crop && Editor.Crop.active) Editor.Crop.cancel();
    var cmd = this.redoStack.pop();
    cmd.apply();
    this.undoStack.push(cmd);
    this._postUndoRedo();
  },

  /** Common cleanup after undo/redo. */
  _postUndoRedo: function() {
    var C = Editor.Core;
    C.selected = null;
    C.multiSel = [];
    C.selUI.style.display = 'none';
    C.selUI.innerHTML = '';
    // Ensure selUI/dragRect stay last
    var svg = document.getElementById('battlefield');
    var selUI = document.getElementById('selUI');
    var dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
    if (Editor.Effects && Editor.Effects._ready) Editor.Effects.rebuildAll();
    Editor.Layers.rebuild();
    C.updateDebug();
    Editor.State.dispatch({ type: 'UNDO' });
  },

  canUndo: function() { return this.undoStack.length > 0; },
  canRedo: function() { return this.redoStack.length > 0; },
  clear: function() { this.undoStack = []; this.redoStack = []; },

  /** @deprecated — backward compat shim. Modules should create commands. */
  push: function() { /* no-op */ },
  /** @deprecated — use undo() instead */
  pop: function() { this.undo(); }
};
