/**
 * fog-gen.js — Generate tileable fog textures at startup using SVG feTurbulence.
 *
 * Creates an offscreen SVG with feTurbulence + feGaussianBlur + feColorMatrix,
 * renders it to a canvas, exports as blob URL, then applies as background-image
 * on the fog layer divs.
 *
 * The SVG filter runs ONCE (not per-frame). After generation, it's a static image.
 */

(function generateFogTextures() {
  var TEX_SIZE = 1024;

  // Generate a fog texture with given feTurbulence params
  function generateTexture(seed, baseFreq, octaves, blurAmount, opacity, callback) {
    var NS = 'http://www.w3.org/2000/svg';

    // Create offscreen SVG
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('width', TEX_SIZE);
    svg.setAttribute('height', TEX_SIZE);
    svg.setAttribute('viewBox', '0 0 ' + TEX_SIZE + ' ' + TEX_SIZE);

    // Define filter
    var defs = document.createElementNS(NS, 'defs');
    var filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'fog');
    filter.setAttribute('x', '0%');
    filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');

    // feTurbulence — the cloud pattern
    var turb = document.createElementNS(NS, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise');
    turb.setAttribute('baseFrequency', baseFreq);
    turb.setAttribute('numOctaves', octaves);
    turb.setAttribute('seed', seed);
    turb.setAttribute('stitchTiles', 'stitch');
    turb.setAttribute('result', 'noise');
    filter.appendChild(turb);

    // feGaussianBlur — soften noise into cloud shapes
    var blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('in', 'noise');
    blur.setAttribute('stdDeviation', blurAmount);
    blur.setAttribute('result', 'blurred');
    filter.appendChild(blur);

    // feColorMatrix — map to warm white with alpha from luminance
    // Input is RGBA noise centered around 0.5. We want:
    //   R,G,B → warm white (multiply up, slight warm bias)
    //   A → derived from luminance (bright = opaque cloud, dark = transparent gap)
    var colorMatrix = document.createElementNS(NS, 'feColorMatrix');
    colorMatrix.setAttribute('in', 'blurred');
    colorMatrix.setAttribute('type', 'matrix');
    // Map: R = 0.95, G = 0.93, B = 0.90 (warm white)
    // Alpha = 0.3*R + 0.59*G + 0.11*B (luminance), boosted and shifted
    colorMatrix.setAttribute('values',
      '0 0 0 0 0.93 ' +   // R output: constant warm white
      '0 0 0 0 0.91 ' +   // G output
      '0 0 0 0 0.88 ' +   // B output
      '1.5 1.5 1.5 0 -1.2'  // A output: luminance * 1.5 - 1.2 (contrast boost)
    );
    colorMatrix.setAttribute('result', 'colored');
    filter.appendChild(colorMatrix);

    defs.appendChild(filter);
    svg.appendChild(defs);

    // Rect that fills the SVG, with the filter applied
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', TEX_SIZE);
    rect.setAttribute('height', TEX_SIZE);
    rect.setAttribute('fill', 'white');
    rect.setAttribute('filter', 'url(#fog)');
    rect.setAttribute('opacity', opacity);
    svg.appendChild(rect);

    // Serialize SVG → blob → Image → Canvas → blob URL
    var svgData = new XMLSerializer().serializeToString(svg);
    var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);

    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = TEX_SIZE;
      canvas.height = TEX_SIZE;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(function(blob) {
        var texUrl = URL.createObjectURL(blob);
        callback(texUrl);
      }, 'image/png');
    };
    img.src = url;
  }

  // Generate 3 fog textures with different characteristics
  var textures = {};
  var pending = 3;

  function onTextureReady() {
    pending--;
    if (pending > 0) return;

    // Apply textures to fog layer divs
    applyTextures(textures);
  }

  // Layer 1: Dense base clouds
  generateTexture(1, '0.004', '4', '3', '1', function(url) {
    textures.layer1 = url;
    onTextureReady();
  });

  // Layer 2: Medium wisps
  generateTexture(42, '0.006', '3', '5', '0.8', function(url) {
    textures.layer2 = url;
    onTextureReady();
  });

  // Layer 3: Fine detail
  generateTexture(137, '0.009', '5', '2', '0.6', function(url) {
    textures.layer3 = url;
    onTextureReady();
  });

  function applyTextures(tex) {
    var layers = [
      { id: 'foglayer_01', url: tex.layer1 },
      { id: 'foglayer_02', url: tex.layer2 },
      { id: 'foglayer_03', url: tex.layer3 }
    ];

    layers.forEach(function(layer) {
      var el1 = document.querySelector('#' + layer.id + ' .image01');
      var el2 = document.querySelector('#' + layer.id + ' .image02');
      if (el1) el1.style.backgroundImage = 'url(' + layer.url + ')';
      if (el2) el2.style.backgroundImage = 'url(' + layer.url + ')';
    });
  }
})();
