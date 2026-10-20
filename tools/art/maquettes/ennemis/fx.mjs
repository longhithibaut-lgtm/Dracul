// Floor telegraphs (emissive decals) shared by the cards and the game screen.
// A telegraph is in its owner's local frame (x left, y forward); P = {x, y, yaw} places it in the world.
export const place = (P, p) => { const c = Math.cos(P.yaw), s = Math.sin(P.yaw); return [P.x + c * p[0] - s * p[1], P.y + s * p[0] + c * p[1], p[2] ?? 0]; };
const COL = { red: [1.0, 0.07, 0.03], holy: [1.3, 0.86, 0.28], heal: [0.8, 0.9, 0.82], fire: [1.5, 0.55, 0.12] };
const hatch = (x, y, k = 5) => (((x + y) % k) + k) % k < 1.1;

export function floorFx(x, y, fx) {
  let r = 0, g = 0, b = 0;
  for (const f of fx) {
    const P = f.P, c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    const dx = x - P.x, dy = y - P.y; const lx = c * dx + s * dy, ly = -s * dx + c * dy; // to local
    const col = COL[f.col] || COL.red; let e = 0; const I = f.I ?? 1;
    if (f.k === 'ring') { const d = Math.abs(Math.hypot(lx - f.c[0], ly - f.c[1]) - f.r); if (d < f.w / 2) e = 0.5 * I; else if (d < f.w) e = 0.12 * I; }
    else if (f.k === 'zone' || f.k === 'drop' || f.k === 'disc') {
      const qx = lx - f.c[0], qy = ly - f.c[1], d = Math.hypot(qx, qy);
      if (f.k === 'disc') { if (d < f.r) e = 0.025 + (hatch(x, y, 6) ? 0.045 : 0); }
      else if (Math.abs(d - f.r) < 0.9) e = 0.6;
      else if (d < f.r) {
        if (f.k === 'zone') { const a = Math.atan2(qy, qx); const ray = Math.abs(Math.sin(a * 6)) < 0.08 + 1.2 / Math.max(d, 1); e = Math.abs(d - f.r * 0.62) < 0.6 ? 0.38 : ray && d > 3 ? 0.22 : 0.06 + (hatch(x, y, 4) ? 0.06 : 0); }
        else { e = Math.abs(d - f.r * 0.5) < 0.6 ? 0.35 : 0.1 * (1 - d / f.r) + (hatch(x, y, 4) ? 0.07 : 0); }
      }
    } else if (f.k === 'cone' || f.k === 'arc') {
      const qx = lx - f.c[0], qy = ly - f.c[1], d = Math.hypot(qx, qy); let a = Math.atan2(qy, qx) - f.a; a = Math.atan2(Math.sin(a), Math.cos(a));
      if (d > f.r0 - 1 && d < f.r1 + 1 && Math.abs(a) < f.half + 0.03) {
        const edgeA = (f.half - Math.abs(a)) * d, edgeR = Math.min(f.r1 - d, d - f.r0);
        if (Math.abs(f.r1 - d) < 0.9 || (f.k === 'cone' && edgeA < 0.9)) e = 0.55;
        else if (f.k === 'arc' && edgeA < 0.9) e = 0.3;
        else if (edgeR > 0) e = f.k === 'arc' ? (Math.abs(d - f.r1 * 0.7) < 0.6 ? 0.25 : 0.03) : 0.035 + (hatch(x, y, 6) ? 0.06 : 0);
      }
    } else if (f.k === 'rect') {
      const ax = f.a[0], ay = f.a[1], bx = f.b[0], by = f.b[1], L2 = Math.hypot(bx - ax, by - ay); const ux = (bx - ax) / L2, uy = (by - ay) / L2;
      const u = (lx - ax) * ux + (ly - ay) * uy, v = -(lx - ax) * uy + (ly - ay) * ux;
      if (u > -0.5 && u < L2 + 0.5 && Math.abs(v) < f.w + 0.5) {
        if (Math.abs(Math.abs(v) - f.w) < 0.9 || Math.abs(u - L2) < 0.9) e = 0.55;
        else if (Math.abs(v) < f.w) { e = f.fill ? 0.03 + (hatch(x, y, 6) ? 0.05 : 0) : 0; if (!f.fill && Math.abs(v) < 0.7 && (u % 6) < 3) e = 0.45; } // dashed axis = lunge path
        // chevrons pointing along the path
        const cu = ((u - Math.abs(v) * 0.9) % 12 + 12) % 12; if (Math.abs(v) < f.w - 1 && cu < 1.0 && u > 6 && u < L2 - 4) e = Math.max(e, 0.35);
      }
    } else if (f.k === 'tether') {
      for (const t of f.to) { const L2 = Math.hypot(t[0] - f.c[0], t[1] - f.c[1]); const ux = (t[0] - f.c[0]) / L2, uy = (t[1] - f.c[1]) / L2; const u = (lx - f.c[0]) * ux + (ly - f.c[1]) * uy, v = -(lx - f.c[0]) * uy + (ly - f.c[1]) * ux; if (u > 8 && u < L2 && Math.abs(v + Math.sin(u * 0.3) * 1.2) < 0.6 && (u % 5) < 3) e = Math.max(e, 0.35); }
    }
    r += col[0] * e; g += col[1] * e; b += col[2] * e;
  }
  return [r, g, b];
}
