// --- painting helpers for sprites (drawn at 2x, downsampled) ---
function catmull(pts, n, closed) {
  const Q = []; for (let i = 0; i < pts.length; i += 2) Q.push([pts[i], pts[i + 1]]);
  const L = Q.length, out = [], get = k => closed ? Q[(k + L) % L] : Q[Math.max(0, Math.min(L - 1, k))];
  const segs = closed ? L : L - 1;
  for (let i = 0; i < segs; i++) { const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3); out.push([f(0), f(1)]); } }
  if (!closed) out.push(Q[L - 1]); return out;
}
function blob(ctx, pts, fill) { const c = catmull(pts, 10, true); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const p of c) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function ribbon(ctx, pts, w0, w1, fill, jag = 0) {
  const c = catmull(pts, 10, false), Lp = [], Rp = [];
  for (let k = 0; k < c.length; k++) { const a = c[Math.max(0, k - 1)], b = c[Math.min(c.length - 1, k + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = k / (c.length - 1), w = mix(w0, w1, t) / 2 * (1 + jag * (hash(k, 3) - 0.5)); Lp.push([c[k][0] - ty * w, c[k][1] + tx * w]); Rp.push([c[k][0] + ty * w, c[k][1] - tx * w]); }
  ctx.beginPath(); ctx.moveTo(Lp[0][0], Lp[0][1]); for (const p of Lp) ctx.lineTo(p[0], p[1]); for (let k = Rp.length - 1; k >= 0; k--) ctx.lineTo(Rp[k][0], Rp[k][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function brush(ctx, n, x0, y0, x1, y1, cols, len, ang, w, angJ = 0.4) { // painted strokes, only over what is already painted
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) { const x = mix(x0, x1, rnd()), y = mix(y0, y1, rnd()), a = ang + (rnd() - 0.5) * angJ, l = len * (0.5 + rnd());
    ctx.strokeStyle = cols[(rnd() * cols.length) | 0]; ctx.lineWidth = w * (0.6 + rnd() * 0.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  ctx.restore();
}
function sprite(w, h, ax, ay, hw, draw) {
  const big = mk(w * 2, h * 2), bigE = mk(w * 2, h * 2), c = big.getContext('2d'), e = bigE.getContext('2d');
  c.scale(2, 2); e.scale(2, 2); draw(c, e);
  const cv = mk(w, h), em = mk(w, h); cv.getContext('2d').drawImage(big, 0, 0, w, h); em.getContext('2d').drawImage(bigE, 0, 0, w, h);
  return { cv, em, ax, ay, hw };
}

// --- hero: the Houseless, gaunt vampire, long dark coat, violet scarf ---
function drawHero() {
  seed = 4242;
  return sprite(270, 300, 124, 266, 40, (c, e) => {
    const coat = col(0.05, 0.048, 0.062), coatD = col(0.025, 0.024, 0.032), coatL = col(0.11, 0.1, 0.13);
    const vio = col(0.11, 0.025, 0.3), vioD = col(0.05, 0.012, 0.15), vioL = col(0.25, 0.08, 0.55);
    const skin = col(0.5, 0.47, 0.52), skinD = col(0.24, 0.21, 0.27), hair = col(0.015, 0.015, 0.022);
    // scarf tail trailing in the air
    ribbon(c, [140, 124, 160, 132, 182, 124, 204, 132, 226, 122, 248, 130], 15, 7, vio, 0.25);
    ribbon(c, [138, 128, 158, 140, 178, 136, 198, 146, 216, 140, 236, 150], 10, 4, vioD, 0.3);
    brush(c, 30, 140, 112, 250, 156, [vioL, vioD], 10, 0.1, 1.4, 0.5);
    // coat tail swept back
    blob(c, [146, 128, 166, 168, 186, 206, 204, 236, 214, 250, 196, 244, 184, 256, 166, 248, 150, 258, 136, 246, 130, 200, 134, 150], coatD);
    // legs and boots
    ribbon(c, [114, 190, 106, 222, 96, 256], 16, 12, col(0.03, 0.028, 0.035)); ribbon(c, [134, 190, 146, 224, 154, 255], 16, 12, col(0.03, 0.028, 0.035));
    blob(c, [84, 258, 92, 250, 104, 252, 108, 262, 98, 266, 86, 265], col(0.02, 0.018, 0.02)); blob(c, [148, 256, 154, 249, 165, 252, 168, 261, 158, 264, 148, 263], col(0.02, 0.018, 0.02));
    stroke(c, [92, 252, 102, 253], 1, col(0.2, 0.2, 0.24)); stroke(c, [153, 251, 163, 254], 1, col(0.2, 0.2, 0.24));
    // long coat, open in front
    blob(c, [102, 130, 96, 170, 90, 204, 80, 238, 92, 236, 100, 244, 110, 232, 114, 196, 118, 158, 118, 134], coat);
    blob(c, [140, 130, 148, 166, 156, 198, 170, 234, 158, 236, 150, 242, 140, 230, 132, 196, 128, 158, 126, 134], coat);
    blob(c, [113, 134, 111, 166, 113, 196, 122, 202, 131, 196, 133, 166, 131, 134], col(0.045, 0.03, 0.04)); // waistcoat
    stroke(c, [116, 186, 130, 186], 3, col(0.1, 0.08, 0.05)); c.fillStyle = col(0.35, 0.3, 0.2); c.fillRect(121, 184.5, 3, 3);
    brush(c, 60, 82, 140, 172, 244, [coatL, coatD, col(0.08, 0.075, 0.1)], 22, Math.PI / 2, 1.6, 0.25);
    // shoulder capelet with scalloped hem
    blob(c, [100, 126, 122, 120, 146, 126, 156, 146, 152, 158, 144, 152, 136, 160, 126, 154, 116, 160, 106, 152, 96, 158, 94, 144], coat);
    brush(c, 25, 94, 124, 156, 160, [coatL, coatD], 12, Math.PI / 2, 1.3, 0.6);
    // arms: left reaching with claws, right holding a rapier low
    ribbon(c, [104, 134, 90, 152, 80, 166, 72, 174], 15, 10, coat);
    c.fillStyle = coatL; c.beginPath(); c.ellipse(74, 172, 5, 4, 0.6, 0, 7); c.fill();
    blob(c, [64, 176, 70, 170, 76, 174, 74, 182, 66, 184], skin);
    for (const [dx, dy] of [[-12, 4], [-11, 9], [-7, 14], [-2, 15]]) { const sx = 66 + dx * 0.3, sy = 180 + dy * 0.2; stroke(c, [sx, sy, 66 + dx * 0.7, 180 + dy * 0.7, 66 + dx, 180 + dy], 1.3, skin); }
    ribbon(c, [146, 134, 156, 160, 160, 186, 161, 192], 15, 10, coatD);
    blob(c, [156, 192, 163, 188, 168, 194, 164, 202, 157, 199], skin);
    stroke(c, [156, 199, 162, 194, 170, 199, 165, 205], 1.5, col(0.4, 0.33, 0.15)); // swept hilt
    stroke(c, [164, 201, 216, 264], 2.4, col(0.35, 0.37, 0.42)); stroke(c, [165, 200, 215, 262], 0.8, col(0.85, 0.88, 0.95));
    // stand-up collar behind the head
    blob(c, [104, 126, 98, 108, 100, 92, 110, 100, 120, 112, 132, 112, 142, 100, 152, 92, 152, 108, 146, 126, 124, 122], coatD);
    stroke(c, [100, 94, 104, 112], 1.2, coatL); stroke(c, [151, 94, 148, 112], 1.2, coatL);
    // scarf wrap and hanging end with fringe
    blob(c, [104, 122, 112, 114, 126, 116, 140, 114, 146, 122, 142, 132, 126, 136, 108, 134], vio);
    ribbon(c, [120, 132, 118, 150, 121, 168, 118, 182], 10, 9, vio, 0.2);
    for (let k = 0; k < 5; k++) stroke(c, [114 + k * 2, 182, 114 + k * 2 + (k - 2) * 0.5, 188], 0.9, vio);
    brush(c, 30, 104, 112, 146, 184, [vioL, vioD, vio], 7, 0.3, 1.2, 1.4);
    // gaunt face
    blob(c, [111, 104, 112, 92, 120, 86, 129, 89, 133, 98, 131, 110, 125, 118, 118, 120, 113, 114], skin);
    blob(c, [112, 106, 116, 112, 120, 116, 117, 116, 113, 112], skinD); blob(c, [128, 106, 130, 110, 126, 115, 125, 111], skinD);
    stroke(c, [119, 116, 123, 116], 0.8, col(0.15, 0.05, 0.08)); // thin mouth
    // hair swept back by the motion
    blob(c, [108, 102, 106, 88, 114, 78, 126, 76, 138, 80, 148, 82, 160, 80, 152, 88, 158, 92, 144, 94, 136, 98, 130, 90, 122, 88, 114, 94], hair);
    for (const [a, b, cc, d] of [[140, 84, 164, 76], [144, 90, 166, 88], [138, 94, 160, 98]]) stroke(c, [a, b, (a + cc) / 2, (b + d) / 2 - 2, cc, d], 1.2, hair);
    brush(c, 12, 106, 76, 160, 96, [col(0.08, 0.08, 0.12)], 10, 0, 0.8, 0.4);
    c.fillStyle = col(0.04, 0.02, 0.04); c.beginPath(); c.ellipse(116, 99, 3.8, 2, 0.15, 0, 7); c.ellipse(126.5, 99.5, 3.4, 1.9, -0.1, 0, 7); c.fill();
    e.fillStyle = 'rgb(255,40,36)'; e.beginPath(); e.ellipse(116.5, 99.2, 1.8, 0.9, 0.15, 0, 7); e.fill(); e.beginPath(); e.ellipse(126.8, 99.6, 1.6, 0.85, -0.1, 0, 7); e.fill();
    stroke(e, [178, 220, 214, 262], 0.8, 'rgba(170,200,255,0.45)');
  });
}
// --- ghoul: emaciated hunched biped, long arms, pale eyes (faces right) ---
function drawGhoul() {
  seed = 99;
  return sprite(240, 196, 104, 176, 55, (c, e) => {
    const sk = col(0.2, 0.215, 0.2), skD = col(0.075, 0.08, 0.08), skL = col(0.34, 0.35, 0.32), bruise = col(0.12, 0.08, 0.11), rag = col(0.055, 0.045, 0.04), ragL = col(0.1, 0.085, 0.07);
    // far limbs
    ribbon(c, [84, 112, 70, 140, 76, 172], 13, 7, skD); blob(c, [68, 172, 76, 168, 88, 172, 84, 176, 70, 177], skD);
    ribbon(c, [118, 76, 122, 112, 132, 146, 140, 164], 10, 6, skD);
    for (const dx of [-3, 2, 7]) stroke(c, [140, 164, 146 + dx, 174], 1.4, skD);
    // torso, hunched: back arched high
    blob(c, [76, 114, 78, 92, 88, 72, 104, 60, 124, 58, 140, 66, 144, 80, 134, 96, 120, 106, 100, 116, 84, 120], sk);
    blob(c, [92, 116, 108, 108, 126, 100, 140, 82, 142, 92, 128, 106, 108, 118], skD); // belly shadow
    for (let k = 0; k < 5; k++) stroke(c, [108 + k * 7, 72 + k * 1.5, 112 + k * 7, 86 + k * 2, 108 + k * 6.5, 100 + k * 1.2], 1.3, skD);
    for (let k = 0; k < 8; k++) { const t = k / 7; const x = mix(80, 132, t), y = 92 - Math.sin(t * Math.PI * 0.85 + 0.25) * 32; c.fillStyle = skL; c.beginPath(); c.ellipse(x, y, 2.6, 2, 0, 0, 7); c.fill(); }
    brush(c, 40, 76, 58, 146, 120, [skL, skD, bruise, sk], 6, 0.6, 1.4, 2.5);
    // torn shroud over the shoulders, loincloth
    blob(c, [100, 62, 120, 58, 128, 66, 122, 82, 118, 96, 112, 90, 108, 100, 104, 88, 96, 92, 98, 76], rag);
    blob(c, [76, 108, 98, 112, 102, 126, 100, 140, 96, 132, 92, 144, 88, 134, 82, 142, 80, 128], rag);
    brush(c, 20, 76, 58, 130, 146, [ragL, col(0.03, 0.025, 0.02)], 9, Math.PI / 2, 1, 0.5);
    // near leg (digitigrade, bent)
    ribbon(c, [92, 114, 114, 136, 104, 158, 108, 172], 15, 7, sk);
    blob(c, [100, 172, 108, 167, 122, 170, 126, 176, 110, 178, 100, 178], skD);
    // neck and skull thrust forward
    ribbon(c, [134, 70, 146, 76, 154, 82], 12, 10, sk);
    blob(c, [146, 72, 156, 64, 172, 64, 182, 72, 184, 82, 176, 90, 164, 92, 152, 88], sk);
    blob(c, [160, 88, 172, 90, 184, 86, 188, 92, 178, 104, 166, 104, 158, 96], skD); // hanging jaw
    for (let k = 0; k < 5; k++) stroke(c, [166 + k * 4, 91, 167 + k * 4, 95], 1.1, col(0.55, 0.52, 0.42));
    stroke(c, [150, 70, 162, 64, 176, 66], 1.4, skL);
    c.fillStyle = col(0.02, 0.02, 0.02); c.beginPath(); c.ellipse(168, 76, 4.5, 3.4, 0, 0, 7); c.ellipse(178.5, 77, 3.6, 3, 0, 0, 7); c.fill();
    e.fillStyle = 'rgb(205,255,228)'; e.beginPath(); e.arc(168.5, 76.5, 2.1, 0, 7); e.fill(); e.beginPath(); e.arc(178.8, 77.3, 1.7, 0, 7); e.fill();
    // near arm reaching forward, long fingers
    ribbon(c, [134, 74, 146, 102, 162, 128, 180, 146], 12, 7, sk);
    c.fillStyle = skL; c.beginPath(); c.ellipse(146, 102, 3.6, 3, 0, 0, 7); c.fill();
    for (const [dx, dy] of [[16, 6], [18, 12], [13, 17], [6, 19]]) stroke(c, [180, 146, 180 + dx * 0.6, 146 + dy * 0.5, 180 + dx, 146 + dy], 1.5, col(0.25, 0.24, 0.2));
    stroke(c, [130, 70, 144, 84, 150, 100], 1.6, skL);
  });
}
function flip(s) { const o = mk(s.cv.width, s.cv.height), oe = mk(s.cv.width, s.cv.height); for (const [src, dst] of [[s.cv, o], [s.em, oe]]) { const x = dst.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); } return { cv: o, em: oe, ax: s.cv.width - s.ax, ay: s.ay, hw: s.hw }; }
// --- Order crossbowman (faces left), kettle hat, sun tabard, lantern ---
function drawXbow() {
  seed = 515;
  return sprite(260, 300, 126, 266, 40, (c, e) => {
    const steel = col(0.22, 0.23, 0.25), steelL = col(0.5, 0.52, 0.56), steelD = col(0.08, 0.085, 0.095);
    const tab = col(0.36, 0.33, 0.26), tabD = col(0.19, 0.17, 0.13), tabL = col(0.5, 0.47, 0.38), gold = col(0.6, 0.4, 0.08), wood = col(0.14, 0.07, 0.035);
    // cape
    blob(c, [130, 120, 156, 132, 166, 180, 176, 240, 162, 236, 152, 250, 140, 240, 124, 248, 118, 196, 120, 146], col(0.11, 0.025, 0.02));
    brush(c, 25, 118, 120, 178, 250, [col(0.18, 0.04, 0.03), col(0.05, 0.01, 0.01)], 20, Math.PI / 2, 1.4, 0.3);
    // legs
    ribbon(c, [118, 198, 108, 230, 100, 258], 17, 13, col(0.07, 0.05, 0.04)); ribbon(c, [138, 198, 146, 230, 150, 258], 17, 13, col(0.055, 0.04, 0.03));
    blob(c, [88, 262, 92, 253, 106, 254, 110, 263, 100, 268, 89, 267], col(0.035, 0.025, 0.02)); blob(c, [143, 258, 148, 251, 161, 254, 162, 262, 153, 266, 144, 264], col(0.035, 0.025, 0.02));
    // mail skirt and sleeves
    blob(c, [104, 180, 102, 206, 104, 220, 124, 226, 146, 222, 152, 206, 150, 180], steel);
    for (let y = 182; y < 224; y += 3) for (let x = 102; x < 154; x += 3) { c.fillStyle = (x + y) % 2 ? steelD : steelL; c.globalAlpha = 0.35; c.fillRect(x + (y % 6 ? 1.5 : 0), y, 1.2, 1.2); }
    c.globalAlpha = 1;
    // tabard with folds
    blob(c, [104, 128, 100, 160, 102, 200, 106, 234, 116, 228, 124, 236, 132, 228, 142, 234, 148, 226, 152, 200, 152, 160, 146, 128], tab);
    brush(c, 50, 100, 128, 152, 236, [tabL, tabD, col(0.28, 0.25, 0.19)], 20, Math.PI / 2, 1.5, 0.3);
    // dirt and blood at the hem
    brush(c, 18, 100, 214, 152, 236, [col(0.12, 0.1, 0.07), col(0.18, 0.04, 0.03)], 6, 0, 2, 3);
    stroke(c, [102, 186, 152, 186], 4.5, col(0.08, 0.05, 0.03)); c.fillStyle = col(0.45, 0.32, 0.1); c.fillRect(122, 184, 6, 5);
    // golden sun on the chest
    c.save(); c.translate(126, 158); c.fillStyle = gold; for (let k = 0; k < 12; k++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(-3.2, 9); c.lineTo(0, k % 2 ? 17 : 21); c.lineTo(3.2, 9); c.fill(); } c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill();
    c.fillStyle = col(0.3, 0.18, 0.04); c.beginPath(); c.arc(0, 0, 5.5, 0, 7); c.fill(); c.fillStyle = gold; c.beginPath(); c.arc(0, 0, 3.6, 0, 7); c.fill(); c.restore();
    // pauldrons and arms
    blob(c, [98, 128, 100, 116, 114, 112, 122, 120, 118, 134, 104, 138], steel); stroke(c, [100, 120, 112, 114, 120, 120], 1.4, steelL);
    blob(c, [132, 120, 140, 110, 154, 114, 158, 128, 150, 138, 138, 134], steel); stroke(c, [136, 114, 148, 112, 156, 120], 1.4, steelL);
    ribbon(c, [146, 130, 136, 148, 118, 154], 13, 11, steel); ribbon(c, [104, 132, 90, 146, 76, 152], 13, 11, steel);
    // crossbow aimed left
    stroke(c, [142, 150, 48, 150], 6.5, wood); stroke(c, [140, 147.5, 52, 147.5], 1.2, col(0.3, 0.17, 0.08));
    blob(c, [57, 128, 51, 140, 51, 160, 57, 172, 61, 170, 55, 158, 55, 142, 61, 130], steelD); stroke(c, [57, 130, 52, 150, 57, 170], 1, steelL);
    stroke(c, [58, 131, 96, 149, 58, 169], 0.9, col(0.4, 0.38, 0.33));
    stroke(c, [96, 147, 38, 147], 1.8, col(0.25, 0.2, 0.15)); poly(c, [39, 143.5, 28, 147, 39, 150.5], steelL);
    c.fillStyle = col(0.09, 0.06, 0.035); c.beginPath(); c.arc(76, 153, 5.5, 0, 7); c.fill(); c.beginPath(); c.arc(117, 154, 5.5, 0, 7); c.fill();
    // face under a kettle hat
    blob(c, [108, 116, 106, 104, 114, 98, 124, 100, 130, 108, 130, 118, 122, 126, 112, 124], col(0.33, 0.21, 0.15));
    blob(c, [104, 114, 100, 120, 108, 128, 120, 126, 126, 118, 116, 116], col(0.13, 0.09, 0.07)); // beard
    c.fillStyle = steel; c.beginPath(); c.ellipse(120, 100, 31, 10, -0.06, 0, 7); c.fill();
    c.fillStyle = steelL; c.beginPath(); c.ellipse(120, 98.5, 30, 8.5, -0.06, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = steel; c.beginPath(); c.arc(122, 93, 15, Math.PI, 0); c.fill(); c.fillRect(107, 92, 30, 6);
    stroke(c, [111, 86, 121, 79, 133, 86], 1.8, steelL); stroke(c, [122, 79, 122, 98], 1.4, steelD);
    c.fillStyle = col(0.02, 0.015, 0.015); c.fillRect(104, 104, 22, 3.5);
    // lantern at the belt
    stroke(c, [104, 186, 99, 196], 1.4, col(0.05, 0.04, 0.03)); c.fillStyle = col(0.06, 0.05, 0.04); c.fillRect(92, 196, 14, 18); c.fillRect(90, 194, 18, 3); c.fillRect(90, 213, 18, 3);
    e.fillStyle = 'rgba(255,200,120,1)'; e.fillRect(94, 198, 10, 14); e.fillStyle = 'rgba(255,250,220,1)'; e.fillRect(97, 202, 4, 7);
    poly(e, [30, 145, 22, 147, 30, 149], 'rgba(255,240,220,0.6)');
  });
}
