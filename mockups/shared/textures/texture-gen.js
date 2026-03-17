/**
 * texture-gen.js — Runtime procedural texture generator (runs in browser)
 * Generates seamless tileable textures as data URIs via <canvas>.
 * Import and call generateTextures() to get { ruins, metal, deckPlate, stone } URLs.
 */

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function addNoise(ctx, w, h, alpha, seed) {
  const rng = seededRandom(seed);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rng() - 0.5) * 2 * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + v));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + v));
  }
  ctx.putImageData(imgData, 0, 0);
}

function genRuinsTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size || 256;
  const s = c.width;
  const ctx = c.getContext('2d');
  const rng = seededRandom(42);
  
  // Dark concrete base with slight warm tint
  ctx.fillStyle = '#2a3038';
  ctx.fillRect(0, 0, s, s);
  
  // Add noise
  addNoise(ctx, s, s, 25, 42);
  
  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = rng() * s, y = rng() * s;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rng() - 0.5) * 50;
      y += (rng() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  
  // Lighter concrete blocks
  ctx.strokeStyle = 'rgba(80,90,100,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.strokeRect(rng()*s, rng()*s, 20+rng()*50, 15+rng()*40);
  }
  
  // Rubble spots (darker patches)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(20,24,30,${0.15 + rng()*0.15})`;
    ctx.beginPath();
    ctx.arc(rng()*s, rng()*s, 8+rng()*20, 0, Math.PI*2);
    ctx.fill();
  }
  
  return c.toDataURL('image/png');
}

function genMetalTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size || 256;
  const s = c.width;
  const ctx = c.getContext('2d');
  const rng = seededRandom(99);
  
  // Dark rusty metal
  ctx.fillStyle = '#1e2830';
  ctx.fillRect(0, 0, s, s);
  
  addNoise(ctx, s, s, 15, 99);
  
  // Plate seams
  ctx.strokeStyle = 'rgba(50,60,70,0.35)';
  ctx.lineWidth = 1;
  for (let y = 0; y < s; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
  }
  for (let x = 0; x < s; x += 56) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
  }
  
  // Rust patches
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(60,35,20,${0.1 + rng()*0.1})`;
    ctx.beginPath();
    ctx.arc(rng()*s, rng()*s, 10+rng()*25, 0, Math.PI*2);
    ctx.fill();
  }
  
  // Rivets along seams
  ctx.fillStyle = 'rgba(70,80,90,0.25)';
  for (let y = 0; y < s; y += 40) {
    for (let x = 14; x < s; x += 56) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  
  return c.toDataURL('image/png');
}

function genDeckPlateTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size || 256;
  const s = c.width;
  const ctx = c.getContext('2d');
  
  // Very dark base
  ctx.fillStyle = '#090d12';
  ctx.fillRect(0, 0, s, s);
  
  addNoise(ctx, s, s, 6, 77);
  
  // Faint plate grid
  ctx.strokeStyle = 'rgba(30,40,50,0.18)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < s; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
  }
  for (let y = 0; y < s; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
  }
  
  // Subtle wear marks
  const rng = seededRandom(77);
  ctx.strokeStyle = 'rgba(20,28,36,0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(rng()*s, rng()*s);
    ctx.lineTo(rng()*s, rng()*s);
    ctx.stroke();
  }
  
  return c.toDataURL('image/png');
}

function genGothicStoneTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size || 256;
  const s = c.width;
  const ctx = c.getContext('2d');
  
  // Dark stone base
  ctx.fillStyle = '#282428';
  ctx.fillRect(0, 0, s, s);
  
  addNoise(ctx, s, s, 20, 55);
  
  // Stone block pattern (brick-like)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  const bh = 32;
  for (let row = 0; row < s/bh + 1; row++) {
    const y = row * bh;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    const offset = (row % 2) * 32;
    for (let x = offset; x < s; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y+bh); ctx.stroke();
    }
  }
  
  // Weathering / erosion
  const rng = seededRandom(55);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(15,12,15,${0.12 + rng()*0.1})`;
    ctx.beginPath();
    ctx.arc(rng()*s, rng()*s, 15+rng()*30, 0, Math.PI*2);
    ctx.fill();
  }
  
  return c.toDataURL('image/png');
}

export function generateTextures(size) {
  return {
    ruins: genRuinsTexture(size),
    metal: genMetalTexture(size),
    deckPlate: genDeckPlateTexture(size),
    gothicStone: genGothicStoneTexture(size)
  };
}
