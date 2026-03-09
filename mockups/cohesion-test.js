const svgNS = 'http://www.w3.org/2000/svg';

// Spline calculation for a beautiful blob outline
function getCatmullRomPath(points, alpha = 0.5, closed = true) {
    if (points.length < 3) return '';
    let p = [...points];
    if (closed) {
        p.unshift(points[points.length - 1]);
        p.push(points[0]);
        p.push(points[1]);
    }
    
    let path = `M \${p[1].x} \${p[1].y}`;
    for (let i = 1; i < p.length - 2; i++) {
        const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
        const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const d3 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
        
        let t1 = Math.pow(d1, alpha);
        let t2 = Math.pow(d2, alpha);
        let t3 = Math.pow(d3, alpha);
        
        t1 = Math.max(t1, 1e-4);
        t2 = Math.max(t2, 1e-4);
        t3 = Math.max(t3, 1e-4);

        const cp1x = p1.x + (p2.x - p0.x) * t2 / (3 * (t1 + t2));
        const cp1y = p1.y + (p2.y - p0.y) * t2 / (3 * (t1 + t2));
        const cp2x = p2.x - (p3.x - p1.x) * t2 / (3 * (t2 + t3));
        const cp2y = p2.y - (p3.y - p1.y) * t2 / (3 * (t2 + t3));
        
        path += ` C \${cp1x} \${cp1y}, \${cp2x} \${cp2y}, \${p2.x} \${p2.y}`;
    }
    if (closed) path += ' Z';
    return path;
}

// Graph connection logic (40px base-to-base means 2" in scale = 24px) 
function checkCohesion(models) {
    if (models.length <= 1) return true;
    const connected = new Set();
    const thresholdSq = (24 + models[0].base * 2) * (24 + models[0].base * 2); 
    
    connected.add(models[0].id);
    let added = true;
    while(added) {
        added = false;
        for (const m of models) {
            if (connected.has(m.id)) continue;
            for (const c of connected) {
                const cm = models.find(x => x.id === c);
                const dsq = (m.x-cm.x)**2 + (m.y-cm.y)**2;
                if (dsq <= thresholdSq) {
                    connected.add(m.id);
                    added = true;
                    break;
                }
            }
        }
    }
    return connected.size === models.length;
}
