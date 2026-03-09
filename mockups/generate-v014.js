const fs = require('fs');
let html = fs.readFileSync('v0.14.html', 'utf-8');
html = html.replace('initAllTooltips();', 'initAllTooltips();\\nrenderTokens();');

// Also inject the fix into index.js to add v0.14 directly
let idx = fs.readFileSync('index.html', 'utf-8');
if (!idx.includes('v0.14')) {
    const card = `
    <!-- v0.14 LATEST -->
    <div class="section-title">v0.14 — Interactive Model Formations</div>
    <div class="section-desc">
      Integrated Prototype A into the full mock environment. Token representations are completely replaced by Spline-wrapped convex hulls surrounding individual model bases. Drag hull = move unit. Drag base = move model. Shift+Drag hull = rotate unit.
    </div>
    <div class="card-grid featured">
      <a class="card v08a" href="v0.14.html" style="border-color: #00d4ff;">
        <span class="card-badge badge-new" style="background:#00d4ff; color:#000;">v0.14 LATEST</span>
        <div class="card-version" style="color:#00d4ff;">v0.14</div>
        <div class="card-codename" style="color:rgba(0,212,255,0.7);">MODEL TRACKING</div>
        <div class="card-title" style="color:#eee;">Spline wrappers & Cohersion</div>
        <ul class="card-features">
          <li>Tokens replaced by SVG groups of individual bases</li>
          <li>Unit formation perfectly enclosed by smooth spline</li>
          <li>Individual model adjustments vs Group moves</li>
          <li>Unit Coherency validation (turns dashed red when broken)</li>
          <li>Shift+Drag a unit to rotate the entire formation</li>
        </ul>
        <span class="card-link" style="color:#00d4ff; border-color:#00d4ff;">Open →</span>
      </a>
    </div>
    `;
    idx = idx.replace('<!-- v0.13 INTERACTION PROTOTYPES -->', card + '\\n    <!-- v0.13 INTERACTION PROTOTYPES -->');
    idx = idx.replace('v0.12 LATEST', 'v0.12 ARCHIVE');
    fs.writeFileSync('index.html', idx);
}
fs.writeFileSync('v0.14.html', html);
