// The vampire: ~100 units tall (1 u ~ 1.85 cm), 7.7 heads, thin, long coat, bare claws.
// Local frame: x = his left, y = forward, z = up, feet at z = 0.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, segT, partsSdf, setMat, MAT, clamp, lerp, sstep, vn, vn3, fbm3, h2, L, mix, mul } from './lib.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const M = { SKIN: 1, COAT: 2, LINING: 3, SHIRT: 4, PANTS: 5, BOOT: 6, BELT: 7, HAIR: 8, CLAW: 9, SLEEVE: 14, SMEAR: 15, IRON: 10, GLASS: 11, BUCKLE: 12, CHAIN: 13 };

export const POSES = {
  idle: {
    head: [0, 1.4, 92.6], tilt: -0.04, neck: [0, 0.6, 82.5], chest: [0, 0.4, 72], pelvis: [0, 0, 51.5],
    Sr: [-8.0, -0.2, 79], Er: [-9.6, -1.6, 61], Wr: [-9.9, 0.8, 46], Kr_: [-10.2, 2.2, 42.2],
    Sl: [8.0, -0.2, 79], El: [10.4, 0.5, 62], Wl: [12.4, 9.5, 54], Kl_: [12.6, 12.0, 52.6], lanternHand: true,
    Hr: [-3.5, 0, 50], Kr: [-3.9, 1.2, 27.5], Ar: [-3.9, -0.6, 5], Tr: [-4.6, 6.2, 1.2],
    Hl: [3.5, 0, 50], Kl: [3.9, 1.0, 27.5], Al: [4.1, -0.6, 5], Tl: [5.0, 6.0, 1.2],
    curl: 0.9, spread: 0.55, coatFlare: 0, coatBack: 0,
  },
  slash: { // end of a downward claw rake with the right hand, long forward stride
    head: [0, 17.5, 82.5], tilt: 0.05, neck: [0, 13.5, 74], chest: [0, 9, 64], pelvis: [0, 3, 46],
    Sr: [-7.5, 11, 71], Er: [-8.5, 26, 66], Wr: [-8, 38, 58], Kr_: [-8, 42, 56],
    Sl: [7.5, 8, 71], El: [10, -4, 62], Wl: [11, -14, 54], Kl_: [11, -17, 52], lanternHand: true,
    Hr: [-3.6, 3.5, 45], Kr: [-4.5, 18, 28], Ar: [-4.5, 17, 4.5], Tr: [-4.8, 23.5, 1.2],
    Hl: [3.6, 2.5, 45], Kl: [4.5, -8, 26], Al: [4.8, -22, 8], Tl: [4.8, -17, 1],
    curl: 0.0, spread: 1.8, coatFlare: 1, coatBack: 1, smear: true,
  },
};

export function hero(poseName = 'idle') {
  const P = POSES[poseName];
  const parts = [];
  const rc = (a, b, r1, r2, m, k = 0, extra = {}) => { const box = [Math.min(a[0], b[0]) - r1 - 1, Math.min(a[1], b[1]) - r1 - 1, Math.min(a[2], b[2]) - r1 - 1, Math.max(a[0], b[0]) + r1 + 1, Math.max(a[1], b[1]) + r1 + 1, Math.max(a[2], b[2]) + r1 + 1]; parts.push({ f: (x, y, z) => sdRC(x, y, z, a, b, r1, r2), m, k, box, ...extra }); };
  const el = (c, r, m, k = 0, extra = {}) => parts.push({ f: (x, y, z) => sdEll(x, y, z, c[0], c[1], c[2], r[0], r[1], r[2]), m, k, box: [c[0] - r[0] - 1, c[1] - r[1] - 1, c[2] - r[2] - 1, c[0] + r[0] + 1, c[1] + r[1] + 1, c[2] + r[2] + 1], ...extra });

  // ---- head (skull-like: cheek hollows, sockets, brow) ----
  const H = P.head, t = P.tilt; // tilt: chin forward/down
  const hp = (x, y, z) => [H[0] + x, H[1] + y * Math.cos(t) + z * Math.sin(t), H[2] + z * Math.cos(t) - y * Math.sin(t)];
  const headBox = [H[0] - 8, H[1] - 9, H[2] - 11, H[0] + 8, H[1] + 9, H[2] + 9];
  const hb = { box: headBox };
  el(hp(0, -0.6, 1.2), [4.1, 5.1, 5.4], M.SKIN, 0, hb);                 // cranium
  rc(hp(0, 1.4, -0.6), hp(0, 2.6, -5.6), 3.3, 1.5, M.SKIN, 1.6, hb);    // face/jaw wedge
  for (const s of [-1, 1]) {
    el(hp(s * 2.6, 2.6, -0.8), [1.3, 1.2, 1.0], M.SKIN, 0.8, hb);       // cheekbones
    rc(hp(s * 2.5, 0.5, -4.2), hp(s * 1.1, 2.4, -6.0), 0.9, 0.7, M.SKIN, 1.0, hb); // jaw line
    rc(hp(s * 3.9, -0.4, 0.2), hp(s * 5.2, -1.6, 2.6), 0.55, 0.12, M.SKIN, 0.4, hb); // pointed ears
  }
  rc(hp(-2.4, 3.6, 1.1), hp(2.4, 3.6, 1.1), 0.75, 0.75, M.SKIN, 0.9, hb); // brow ridge
  rc(hp(0, 4.2, 0.6), hp(0, 4.9, -1.9), 0.45, 0.6, M.SKIN, 0.5, hb);      // nose
  for (const s of [-1, 1]) {
    parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(s * 1.55, 4.15, 0.0), 1.05), sub: true, k: 0.5, box: headBox }); // sockets
    parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(s * 3.5, 2.7, -2.9), 1.35), sub: true, k: 1.0, box: headBox });  // hollow cheeks
  }
  parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(0, 4.1, -3.4), 0.5), sub: true, k: 0.3, box: headBox }); // mouth slit
  for (const s of [-1, 1]) el(hp(s * 1.5, 3.55, 0.0), [0.62, 0.5, 0.5], M.SKIN, 0, { ...hb, eye: s }); // eyeballs (glow)
  P._eyes = [hp(-1.5, 3.9, 0), hp(1.5, 3.9, 0)]; P._mouth = hp(0, 4.3, -3.4); P._hp = hp;

  // ---- hair: cap + long lank curtain parted in the middle, strands as ridges ----
  const ct = Math.cos(t), st = Math.sin(t);
  parts.push({
    m: M.HAIR, k: 0.5, box: [H[0] - 10, H[1] - 11, H[2] - 24, H[0] + 10, H[1] + 9, H[2] + 9], f: (x, y, z) => {
      const qx = x - H[0], qy = y - H[1], qz = z - H[2];
      const X = qx, Y = qy * ct - qz * st, Z = qy * st + qz * ct; // head-local
      let d = sdEll(X, Y, Z, 0, -1.0, 1.5, 4.75, 5.9, 5.9);
      d += 0.16 * Math.abs(Math.sin(Math.atan2(X, Z + 2) * 11 + vn(X, Y * 0.5, 6) * 2)) + 0.35 * Math.exp(-X * X * 2) * clamp(Z - 3);
      const hl = 1.7 + 0.16 * X * X;
      d = smax(d, -Math.max(0.6 - Y, Z - hl, Math.abs(X) - 3.5), 0.5); // face window
      // curtain hanging to the shoulder blades
      const u = clamp(-Z / 18);
      const cy = -1.4 - u * 0.8, rx = 4.9 + u * 1.8, ry = 5.2 - u * 0.6;
      const phi = Math.atan2(X, -(Y - cy));
      let c = Math.hypot(X / rx, (Y - cy) / ry) * Math.min(rx, ry) - Math.min(rx, ry);
      c += 0.35 * Math.abs(Math.sin(phi * 8 + vn(phi * 3, Z * 0.15, 4) * 4)) - 0.25;
      const strand = Math.floor(phi * 5);
      c = smax(c, Math.max(Z - 3, -17 - h2(strand, 1, 9) * 4 - vn(phi * 9, 0, 9) * 3 - Z), 0.6);
      c = smax(c, Y - 1.2 - u * 1.4, 0.6);                               // strands fall beside the face, not over it
      c = smax(c, -Math.max(Math.abs(X) - 2.9, -(Y + 1.4), -3 - Z), 0.6); // neck channel in front
      return smin(d, c, 1.0);
    },
  });

  // ---- neck, torso ----
  rc(P.neck, add(P.head, [0, -0.6, -6.5]), 2.3, 1.75, M.SKIN, 0.8);
  el(P.chest, [7.0, 3.9, 7.4], M.SHIRT, 1.5);
  rc(add(P.chest, [0, -0.1, -5]), add(P.pelvis, [0, 0, 4]), 4.9, 4.5, M.SHIRT, 2.0);
  el(P.pelvis, [6.1, 3.9, 4.8], M.PANTS, 1.5);
  rc(P.neck, P.Sr, 2.4, 2.2, M.SHIRT, 1.5); rc(P.neck, P.Sl, 2.4, 2.2, M.SHIRT, 1.5);

  // ---- arms: coat sleeves, bare hands, long fingers and claws ----
  for (const [S, E, Wr, K, side] of [[P.Sr, P.Er, P.Wr, P.Kr_, -1], [P.Sl, P.El, P.Wl, P.Kl_, 1]]) {
    rc(S, E, 2.4, 1.95, M.SLEEVE, 1.2); rc(E, Wr, 1.95, 1.6, M.SLEEVE, 0.8);
    rc(add(sc(sub(Wr, E), 0.86), E), add(sc(sub(Wr, E), 1.0), E), 1.8, 2.2, M.SLEEVE, 0.4); // ragged cuff
    rc(add(sc(sub(Wr, E), 0.7), E), Wr, 1.15, 1.05, M.SKIN, 0.5); // wrist
    const dir = nz(sub(K, Wr));
    const sideV = nz(crs(dir, [0, 0, 1])[0] === 0 && crs(dir, [0, 0, 1])[1] === 0 ? [1, 0, 0] : crs(dir, [0, 0, 1]));
    const palmN = nz(crs(sideV, dir));
    rc(Wr, K, 1.2, 1.0, M.SKIN, 0.7);
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.62;
      const base = add(K, sc(sideV, o * 1.2));
      const fd = nz(add(dir, sc(sideV, o * P.spread * 0.5)));
      const len = [4.0, 4.8, 4.6, 3.8][f] * 1.15;
      const mid = add(base, sc(fd, len * 0.5));
      const tip = add(mid, sc(nz(add(fd, sc(palmN, -P.curl * side * 0))), len * 0.25));
      const tip2 = add(tip, sc(nz(add(fd, sc([0, 0.4, -0.2], P.curl))), len * 0.42));
      rc(base, mid, 0.42, 0.36, M.SKIN, 0.3);
      rc(mid, tip, 0.36, 0.32, M.SKIN, 0.2);
      rc(tip, tip2, 0.34, 0.06, M.CLAW, 0.15);
    }
    // thumb
    const tb = add(Wr, add(sc(dir, 1.2), sc(sideV, -side * 0.9)));
    rc(tb, add(tb, add(sc(dir, 2.6), sc(sideV, -side * 1.5))), 0.5, 0.25, M.CLAW, 0.4);
  }

  // ---- legs, boots ----
  for (const [Hh, K, A, T] of [[P.Hr, P.Kr, P.Ar, P.Tr], [P.Hl, P.Kl, P.Al, P.Tl]]) {
    rc(Hh, K, 3.3, 2.15, M.PANTS, 1.6);
    rc(K, add(K, sc(sub(A, K), 0.35)), 2.25, 2.3, M.BOOT, 0.6); // boot shaft top (calf)
    rc(add(K, sc(sub(A, K), 0.3)), A, 2.25, 1.65, M.BOOT, 0.8);
    rc(add(K, sc(sub(A, K), -0.03)), add(K, sc(sub(A, K), 0.06)), 2.65, 2.6, M.BOOT, 0.3); // folded cuff
    const heel = add(A, [0, -1.2, -3.0]);
    parts.push({ m: M.BOOT, k: 0.8, box: [Math.min(heel[0], T[0]) - 4, Math.min(heel[1], T[1]) - 4, -1, Math.max(heel[0], T[0]) + 4, Math.max(heel[1], T[1]) + 4, A[2] + 4], f: (x, y, z) => Math.max(sdRC(x, y, z, heel, T, 1.75, 1.15), -z) });
  }

  // ---- belt + hip lantern ----
  const belt = add(P.pelvis, [0, 0.2, 5.0]);
  parts.push({ m: M.BELT, k: 0.3, box: [belt[0] - 9, belt[1] - 7, belt[2] - 3, belt[0] + 9, belt[1] + 7, belt[2] + 3], f: (x, y, z) => { const q = Math.hypot((x - belt[0]) / 5.6, (y - belt[1]) / 4.5) * 4.5 - 4.5; return Math.max(Math.abs(q) - 0.55, Math.abs(z - belt[2]) - 1.15); } });
  parts.push({ m: M.BUCKLE, k: 0, f: (x, y, z) => sdBox(x, y, z, belt[0], belt[1] + 4.4, belt[2], 1.3, 0.5, 1.1, 0.2) });
  const lan = P.lanternHand ? add(P.Kl_, [0.2, 0.6, -9.5]) : add(P.pelvis, [8.8, 3.5, -6.5]); // lantern centre
  P._lantern = lan;
  if (P.lanternHand) rc(add(P.Kl_, [0, -0.3, -0.4]), add(lan, [0, 0, 4.4]), 0.3, 0.3, M.CHAIN, 0);
  else rc(add(belt, [5.0, 3.0, -0.5]), add(lan, [0, 0, 3.4]), 0.35, 0.35, M.CHAIN, 0);
  parts.push({ m: M.IRON, k: 0.2, f: (x, y, z) => { // cage frame: box with windows carved
    const b = sdBox(x, y, z, lan[0], lan[1], lan[2], 2.1, 2.1, 3.0, 0.3);
    const win = Math.min(sdBox(x, y, z, lan[0], lan[1], lan[2], 3.5, 1.4, 2.2), sdBox(x, y, z, lan[0], lan[1], lan[2], 1.4, 3.5, 2.2));
    const cap = sdRC(x, y, z, add(lan, [0, 0, 2.9]), add(lan, [0, 0, 4.6]), 2.2, 0.6);
    return Math.min(Math.max(b, -win), cap);
  } });
  parts.push({ m: M.GLASS, k: 0, f: (x, y, z) => sdEll(x, y, z, lan[0], lan[1], lan[2] - 0.2, 1.6, 1.6, 2.3) });

  // ---- long coat ----
  const lean = sub(P.neck, P.pelvis);
  const flare = P.coatFlare, back = P.coatBack;
  const RX = [[10, 11.0], [22, 9.8], [40, 8.2], [50, 7.5], [57, 6.8], [64, 7.3], [72, 8.0], [77, 8.3], [80, 7.0], [82.5, 4.3]];
  const RY = [[10, 8.6], [22, 7.6], [40, 6.0], [50, 5.4], [57, 5.3], [64, 4.9], [72, 4.9], [77, 4.7], [80, 4.3], [82.5, 3.4]];
  const tab = (T, z) => { if (z <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (z <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (z - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return T[T.length - 1][1]; };
  parts.push({
    m: M.COAT, k: 1.4, pri: 0.3, box: [-22, -26, 0, 22, 22, 84], f: (x, y, z) => {
      const pz = P.pelvis[2], u = clamp((z - pz) / lean[2], -2, 1.2);
      z = z <= pz ? z * 51.5 / pz : 51.5 + (z - pz) * 31 / lean[2]; // standing-equivalent height
      const below = clamp((P.pelvis[2] - z) / 40);
      const cx = P.pelvis[0] + lean[0] * Math.max(u, 0), cy = P.pelvis[1] + lean[1] * Math.max(u, 0) - back * below * 9 + (P.Kr[1] + P.Kl[1]) * 0.5 * below * 0.3 * (1 - back);
      let rx = tab(RX, z) * (1 + flare * below * 0.35), ry = tab(RY, z) * (1 + flare * below * 0.6);
      const X = x - cx, Y = y - cy;
      const phi = Math.atan2(X, Y);
      const q0 = Math.hypot(X / rx, Y / ry), q1 = Math.hypot(X / (rx * rx), Y / (ry * ry));
      let e = q0 * (q0 - 1) / Math.max(q1, 1e-4);
      const fa = sstep(52, 14, z);
      e -= fa * (0.75 * Math.sin(phi * 6 + vn(phi * 2, z * 0.05, 3) * 4 + flare * z * 0.08) + 0.3 * Math.sin(phi * 13 + z * 0.1)) + 0.15 * (vn3(X * 0.4, Y * 0.4, z * 0.3, 8) - 0.5);
      const th = lerp(0.75, 30, sstep(53, 61, z));
      let d = Math.max(e, -e - th);
      // front opening (V at chest, open below the belt)
      const open = z > 77 ? 0.0 : z > 60 ? lerp(0.55, 0.12, (z - 60) / 17) : z > 54 ? 0.42 : lerp(0.48, 0.85 + flare * 0.5, clamp((54 - z) / 42));
      if (open > 0) d = Math.max(d, (open - Math.abs(phi)) * Math.min(rx, 9));
      // ragged hem in strips
      const strip = Math.floor((phi + Math.PI) / (2 * Math.PI) * 24);
      const hem = 12 + h2(strip, 3, 7) * 6 + (h2(strip, 5, 7) < 0.25 ? -5 : 0) + vn(phi * 20, 0, 5) * 2.0 - flare * 4;
      d = Math.max(d, hem - z);
      d = Math.max(d, z - 82.5);
      return d * 0.8;
    },
  });
  // high collar at the back of the neck
  parts.push({ m: M.COAT, k: 1.0, box: [P.neck[0] - 9, P.neck[1] - 9, P.neck[2] - 8, P.neck[0] + 9, P.neck[1] + 7, P.neck[2] + 10], f: (x, y, z) => {
    const cx = P.neck[0], cy = P.neck[1] - 0.6; const X = x - cx, Y = y - cy; const r = 4.2 + (z - P.neck[2] + 4.5) * 0.22;
    let d = Math.abs(Math.hypot(X, Y * 1.1) - r) - 0.55;
    d = Math.max(d, Math.abs(z - P.neck[2]) - 4.5 + Math.max(0, Y + 1) * 1.2);
    return Math.max(d, Y - 1.8);
  } });

  if (P.smear) { // claw rake: three concentric arcs in the arm's plane, thin at the start, thick at the hand
    const C0 = [P.Sr[0] - 1.5, P.Sr[1] + 3, P.Sr[2] - 1], t0 = 1.75, t1 = -0.5;
    P._sm = { C0, t0, t1 };
    parts.push({ m: M.SMEAR, k: 0, box: [C0[0] - 4, C0[1] - 20, C0[2] - 40, C0[0] + 4, C0[1] + 40, C0[2] + 40], f: (x, y, z) => {
      const X = x - C0[0], Y = y - C0[1], Z = z - C0[2]; const r = Math.hypot(Y, Z), th = Math.atan2(Z, Y);
      const u = (t0 - th) / (t0 - t1);
      let d = 1e9;
      for (const R of [26.5, 30, 33.5]) { const w = 0.12 + 0.75 * clamp(u) ** 1.5; d = Math.min(d, Math.max(Math.abs(r - R - u * 1.5) - w, Math.abs(X) - 0.9)); }
      return Math.max(d, -u * r, (u - 1) * r);
    } });
  }
  const sdf = partsSdf(parts);
  return { sdf, mat: heroMat(P), bounds: [-26, -28, -1, 26, 30, 104], P, step: 0.6 };
}

// ---------- materials ----------
const C = {
  skin: L('#cfcab6'), skinD: L('#9a9580'), vein: L('#6e7470'), blood: L('#5e0710'), bloodD: L('#350608'), bloodF: L('#7e0c12'),
  coat: L('#222020'), coatW: L('#36302c'), coatMud: L('#2c2418'), lining: L('#4c2a5a'), shirt: L('#3e372e'), shirtD: L('#2a251f'),
  pants: L('#2c2925'), boot: L('#3d2c1f'), bootW: L('#5a4430'), belt: L('#3c2819'), iron: L('#3a3632'), rust: L('#5a3420'), hair: L('#121014'), claw: L('#2b241a'), bone: L('#d8cdb0'),
};
function heroMat(P) {
  return (m, x, y, z, nx, ny, nz) => {
    const n = fbm3(x * 0.6, y * 0.6, z * 0.6, 3, 11);
    switch (m) {
      case M.SKIN: {
        let c = mix(C.skin, C.skinD, clamp(n * 1.4 - 0.3));
        if (vn3(x * 1.3, y * 1.3, z * 0.5, 21) > 0.72) c = mix(c, C.vein, 0.35);
        // eyes: dim red embers in the sockets
        for (const e of P._eyes) { const d = Math.hypot(x - e[0], y - e[1], z - e[2]); if (d < 0.95) return { alb: [0.05, 0, 0], emi: [1.1, 0.06, 0.03], noAO: true, wrap: 0 }; }
        // mouth, fangs and blood running from it
        const mo = P._mouth, dx = x - mo[0], dz = z - mo[2];
        if (y > mo[1] - 2.2 && Math.abs(dx) < 1.5 && Math.abs(dz) < 0.45) return { alb: C.bloodD, spec: 0.2, gloss: 40 };
        if (y > mo[1] - 2.2 && Math.abs(Math.abs(dx) - 0.75) < 0.35 && dz < -0.3 && dz > -1.3) return { alb: C.bone, spec: 0.4, gloss: 50 };
        let bl = 0;
        if (y > P.neck[1] - 1 && z < mo[2] + 0.2) { // drips down chin, throat, chest
          const strand = Math.abs(dx - 0.5 * Math.sin(z * 0.5)) - 1.4 * (1 - clamp((mo[2] - z) / 30)) - (vn(x * 1.5, 0, 31) - 0.5) * 1.2;
          bl = clamp(-strand * 1.5) * (1 - clamp((mo[2] - z - 22) / 8));
        }
        // hands bloody to the wrist
        if (z < P.Wr[2] + 2 && Math.hypot(x - P.Wr[0], y - P.Wr[1]) < 12 || z < P.Wl[2] + 2 && Math.hypot(x - P.Wl[0], y - P.Wl[1]) < 12) {
          const wz = Math.min(Math.abs(z - P.Wr[2]) + Math.hypot(x - P.Wr[0], y - P.Wr[1]) * 0, 99);
          const handR = Math.hypot(x - P.Wr[0], y - P.Wr[1], z - P.Wr[2]) < 13, handL = Math.hypot(x - P.Wl[0], y - P.Wl[1], z - P.Wl[2]) < 13;
          if (handR) bl = Math.max(bl, clamp(0.55 + n - 0.2)); if (handL) bl = Math.max(bl, clamp(n * 1.5 - 0.45));
        }
        // gaunt chest: ribs read through the open shirt (shade bands)
        if (bl > 0.15) return { alb: mix(c, n > 0.5 ? C.bloodF : C.blood, clamp(bl * 1.4)), spec: 0.45 * bl, gloss: 55, sss: 0.3 };
        return { alb: c, sss: 0.5, wrap: 0.3, spec: 0.08, gloss: 18 };
      }
      case M.SLEEVE: case M.COAT: case M.LINING: {
        // inside of the shell = lining (violet signature)
        const inner = (nx * (x - P.pelvis[0]) + ny * (y - P.pelvis[1])) < -0.2 && z < 60 && m === M.COAT;
        if (inner) return { alb: mix(C.lining, mul(C.lining, 0.5), n), spec: 0.12, gloss: 25 };
        let c = mix(C.coat, C.coatW, clamp((n - 0.5) * 2) * 0.5);
        const hemDirt = clamp((26 - z) / 16); c = mix(c, C.coatMud, hemDirt * 0.7);
        if (z < 22 && vn3(x * 0.9, y * 0.9, z * 0.4, 41) > 0.6) c = mix(c, C.bloodD, 0.8); // soaked hem
        if (z < 50 && vn3(x * 0.5, y * 0.5, z * 0.5, 43) > 0.7 && vn3(x * 2.3, y * 2.3, z * 2.3, 44) > 0.6) c = mix(c, C.blood, 0.55); // spatter clusters
        return { alb: c, spec: 0.06, gloss: 12, wrap: 0.3 };
      }
      case M.SHIRT: {
        // torn open in a V down the sternum: skin + ribs show
        const v = false; // open-shirt chest read as a lamp at 80 px: dropped
        if (v) {
          const rib = 0.5 + 0.5 * Math.sin((z - P.chest[2]) * 1.35 + Math.abs(x) * 0.25);
          let c = mix(C.skin, C.skinD, 0.25 + rib * 0.55);
          if (Math.abs(x - P.chest[0]) < 1.6 + (P._mouth[2] - z) * 0.03 && h2(z * 2 | 0, 1, 3) > 0.15) c = mix(c, C.blood, 0.75);
          return { alb: c, sss: 0.4, wrap: 0.3, ao: 0.75 + rib * 0.35 };
        }
        return { alb: mix(C.shirt, C.shirtD, n), wrap: 0.3 };
      }
      case M.PANTS: return { alb: mix(C.pants, mul(C.pants, 0.7), n), wrap: 0.2 };
      case M.BOOT: return { alb: mix(C.boot, C.bootW, clamp((n - 0.5) * 3) * 0.6), spec: 0.25, gloss: 22 };
      case M.BELT: return { alb: C.belt, spec: 0.15, gloss: 20 };
      case M.BUCKLE: case M.IRON: case M.CHAIN: return { alb: mix(C.iron, C.rust, clamp(n * 2 - 0.6)), spec: 0.5, gloss: 40 };
      case M.HAIR: return { alb: mix(C.hair, L('#221c24'), n * 0.6), spec: 0.12, gloss: 20, wrap: 0, rim: 0.5 };
      case M.CLAW: { const r = Math.hypot(x - P.Wr[0], y - P.Wr[1], z - P.Wr[2]) < 13; return { alb: r ? mix(C.claw, C.blood, 0.6) : C.claw, spec: 0.5, gloss: 50 }; }
      case M.SMEAR: { const k = clamp((P._sm.t0 - Math.atan2(z - P._sm.C0[2], y - P._sm.C0[1])) / (P._sm.t0 - P._sm.t1)); return { alb: [0, 0, 0], emi: [0.3 * k * k + 0.012, 0.012 * k * k, 0.008 * k], noAO: true, noShadow: true, rim: 0 }; }
      case M.GLASS: return { alb: [0.3, 0.3, 0.1], emi: [1.6, 1.45, 0.45], noAO: true, noShadow: true };
    }
    return { alb: [1, 0, 1] };
  };
}
