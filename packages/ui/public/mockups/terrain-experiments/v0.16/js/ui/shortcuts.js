/* ══════════════════════════════════════════════════════════════
   Editor Shortcuts — keyboard shortcut help overlay
══════════════════════════════════════════════════════════════ */

Editor.Shortcuts = {
  visible: false,
  el: null,

  init() {
    const div = document.createElement('div');
    div.id = 'shortcutsPanel';
    div.className = 'shortcuts-panel';
    div.style.display = 'none';
    div.innerHTML = `
      <h3>Keyboard Shortcuts <span class="shortcuts-close" onclick="Editor.Shortcuts.toggle()">✕</span></h3>
      <div class="sc-grid">
        <div class="sc-section">
          <h4>Selection</h4>
          <div class="sc-row"><kbd>Click</kbd> Select sprite</div>
          <div class="sc-row"><kbd>⇧ Click</kbd> Add/remove from selection</div>
          <div class="sc-row"><kbd>Drag</kbd> Drag-select multiple</div>
          <div class="sc-row"><kbd>Esc</kbd> Deselect all</div>
          <div class="sc-row"><kbd>⌘/Ctrl C</kbd> Copy</div>
          <div class="sc-row"><kbd>⌘/Ctrl V</kbd> Paste</div>
          <div class="sc-row"><kbd>⌘/Ctrl Z</kbd> Undo</div>
          <div class="sc-row"><kbd>Del / ⌫</kbd> Delete</div>
        </div>
        <div class="sc-section">
          <h4>Transform</h4>
          <div class="sc-row"><kbd>R</kbd> Rotate 15°</div>
          <div class="sc-row"><kbd>⇧ R</kbd> Rotate 45°</div>
          <div class="sc-row"><kbd>F</kbd> Flip horizontal</div>
          <div class="sc-row"><kbd>⇧ F</kbd> Flip vertical</div>
          <div class="sc-row"><kbd>D</kbd> Duplicate</div>
          <div class="sc-row"><kbd>⌘/Ctrl G</kbd> Group / Ungroup</div>
          <div class="sc-row"><kbd>C</kbd> Crop sprite</div>
          <div class="sc-row"><kbd>Enter</kbd> Confirm crop</div>
          <div class="sc-row"><kbd>Arrow keys</kbd> Move 1px</div>
          <div class="sc-row"><kbd>⇧ Arrows</kbd> Move 10px</div>
          <div class="sc-row"><kbd>+ / −</kbd> Z-order up/down</div>
        </div>
        <div class="sc-section">
          <h4>Resize</h4>
          <div class="sc-row"><kbd>Corner handle</kbd> Free resize</div>
          <div class="sc-row"><kbd>Edge handle</kbd> Stretch 1D</div>
          <div class="sc-row"><kbd>⇧ + resize</kbd> Lock aspect ratio</div>
        </div>
        <div class="sc-section">
          <h4>View</h4>
          <div class="sc-row"><kbd>Scroll wheel</kbd> Zoom in/out</div>
          <div class="sc-row"><kbd>Space + drag</kbd> Pan</div>
          <div class="sc-row"><kbd>Middle drag</kbd> Pan</div>
          <div class="sc-row"><kbd>0</kbd> Reset zoom</div>
          <div class="sc-row"><kbd>L</kbd> Toggle light centers</div>
          <div class="sc-row"><kbd>?</kbd> This help</div>
        </div>
        <div class="sc-section">
          <h4>Import</h4>
          <div class="sc-row"><kbd>Drop files</kbd> Drag images onto canvas</div>
          <div class="sc-row"><kbd>Multi-drop</kbd> Drop several files at once</div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    this.el = div;
  },

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }
};
