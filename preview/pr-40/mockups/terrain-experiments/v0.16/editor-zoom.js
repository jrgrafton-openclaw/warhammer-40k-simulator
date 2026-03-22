/* ══════════════════════════════════════════════════════════════
   Editor Zoom & Pan — scroll wheel zoom, space+drag / middle-drag pan
══════════════════════════════════════════════════════════════ */

Editor.Zoom = {
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  spaceDown: false,
  MIN_ZOOM: 0.25,
  MAX_ZOOM: 4,
  BASE_W: 720,
  BASE_H: 528,

  init() {
    const svg = Editor.Core.svg;
    const wrap = document.getElementById('mapWrap');

    // Scroll wheel zoom (centered on cursor)
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      // Cursor position as fraction of visible area
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;

      const oldZoom = this.zoom;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * factor));

      // Adjust pan so the point under the cursor stays fixed
      const vw = this.BASE_W / this.zoom, vh = this.BASE_H / this.zoom;
      const oldVw = this.BASE_W / oldZoom, oldVh = this.BASE_H / oldZoom;
      this.panX += (oldVw - vw) * mx;
      this.panY += (oldVh - vh) * my;

      this.applyViewBox();
    }, { passive: false });

    // Space key tracking for pan mode
    document.addEventListener('keydown', e => {
      if (e.key === ' ' && !e.repeat && !this.isPanning) {
        e.preventDefault();
        this.spaceDown = true;
        svg.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', e => {
      if (e.key === ' ') {
        this.spaceDown = false;
        if (!this.isPanning) svg.style.cursor = '';
      }
    });

    // Pan via space+drag or middle-click drag
    svg.addEventListener('mousedown', e => {
      if (this.spaceDown || e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        this.startPan(e);
      }
    }, true); // capture phase so it fires before selection
  },

  startPan(e) {
    this.isPanning = true;
    const svg = Editor.Core.svg;
    svg.style.cursor = 'grabbing';
    const startX = e.clientX, startY = e.clientY;
    const startPanX = this.panX, startPanY = this.panY;
    const rect = svg.getBoundingClientRect();
    // How many SVG units per screen pixel
    const scale = (this.BASE_W / this.zoom) / rect.width;

    const mv = e2 => {
      this.panX = startPanX - (e2.clientX - startX) * scale;
      this.panY = startPanY - (e2.clientY - startY) * scale;
      this.applyViewBox();
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      this.isPanning = false;
      svg.style.cursor = this.spaceDown ? 'grab' : '';
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  applyViewBox() {
    const vw = this.BASE_W / this.zoom;
    const vh = this.BASE_H / this.zoom;
    Editor.Core.svg.setAttribute('viewBox', `${this.panX} ${this.panY} ${vw} ${vh}`);
  },

  reset() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyViewBox();
  }
};
