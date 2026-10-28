// The Order's men of the necropolis (mockup only): the trades it keeps among the graves. Each man(pose) with pose 'idle'
// or 'tele' (the wind-up: the body's tell), as creatures.mjs. No floor mark: the body, the light it carries, the sound.
import { sdEll, sdRC, smax, clamp, lerp, vn, vn3, fbm3, L, mix, mul, mulberry32, partsSdf } from '../ennemis/lib.mjs';
import { humanoid, std, S, skinTex, boundsOf } from '../ennemis/cast.mjs';
import { B, done, K, glow, ironM, goldM, bloodHem, HOLY, FIRE } from '../ennemis/foes.mjs';
import { chainLinks } from '../boss/bosses.mjs';
import { add, sub, sc, nz, lp, crs, dot, clone, oel, oelN, obox, kitMat, ORDER, stele } from './kit.mjs';

const prop = (name, model) => ({ name, model: { ...model, nomask: true } });
// an emissive effect (no shadow, left out of the silhouette)
const fx = (name, parts, mat) => ({ name, model: { sdf: partsSdf(parts), mat, bounds: boundsOf(parts, 2), step: 0.7, nomask: true, noShadow: true, noSelfAO: true } });
const skinM = (x, y, z, seed = 101) => ({ alb: skinTex(L('#a88a72'), L('#6e5444'), x, y, z, seed), sss: 0.4, wrap: 0.3, spec: 0.2, gloss: 30 });
const cloth = (a, b2, x, y, z, s = 1, k = 1) => ({ alb: mix(a, b2, clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, s) * 1.6 - 0.35) * k), wrap: 0.3, spec: 0.04, gloss: 10 });
// a wide-brimmed hat on head H (brim radius R, droop: how much the brim sags at its edge)
function hat(b, H, R = 10, crown = 7, droop = 1.5, m = 4) {
  const hc = add(H, [0, -0.5, 3.6]);
  b.f((x, y, z) => { const r = Math.hypot(x - hc[0], y - hc[1]); return Math.max(r - R, Math.abs(z - hc[2] + droop * (r / R) ** 2) - 0.5); }, [hc[0] - R - 1, hc[1] - R - 1, hc[2] - droop - 2, hc[0] + R + 1, hc[1] + R + 1, hc[2] + 2], m, 0);
  b.rc(hc, add(hc, [0, -0.3, crown]), 5.2, 4.2, m, 0.4);
  return hc;
}
// the Order's sun: a gold disc with rays on c facing n
function sun(b, c, n, r = 2.4) { n = nz(n); const u = nz(crs(n, [0, 0, 1])), v = crs(u, n); oel(b, c, n, u, [0.5, r, r], 8); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = add(sc(u, Math.cos(a)), sc(v, Math.sin(a))); b.rc(add(c, sc(d, r)), add(c, sc(d, r * 1.8)), 0.45, 0.1, 8); } }

// ======================= 9. LE FOSSOYEUR =======================
// the Order's gravedigger: hunched, a leather apron, a slouch hat and a rag over his mouth, a spade; on a pole off his back
// an Order lantern hangs over his head, its dirty green light (that burns) thrown round him. 'tele': the spade swung up
// behind his shoulder in both hands, the pole and its lantern pitched forward over you.
export function fossoyeur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std); const { rc, el } = b;
  Object.assign(J, { head: [0, 5, 86], neck: [0, 3.5, 79], chest: [0, 2, 68], pelvis: [0, 0, 49] }, tele ? {
    head: [-1, 3, 84], Sr: [-9, 0, 75], Er: [-14, 2, 84], Wr: [-9, 4, 92], Hr_: [-8, 4, 94], Sl: [9, 1, 75], El: [6, 9, 66], Wl: [-3, 8, 78], Hl_: [-5, 7, 80],
    Kl: [5, 9, 26], Al: [5.5, 7, 4], Tl: [6, 13, 1.2], Kr: [-5, -6, 26], Ar: [-5.5, -13, 5], Tr: [-6, -8, 1.2],
  } : { Sr: [-9, 1, 75], Er: [-11, 7, 62], Wr: [-9, 13, 58], Hr_: [-8.5, 14, 58], Sl: [9, 1, 75], El: [9, 8, 62], Wl: [-4, 13, 54], Hl_: [-6, 14, 53] });
  humanoid(J, b, { thin: 1.15, armM: 2, legM: 5 });
  b.rev(0, 0.5, 30, 74, t => lerp(12.5, 9, Math.pow(t, 0.8)), 2, 1.2, 0.85, { fold: [7, 1.2] }); // patched coat to the knees
  b.f((x, y, z) => Math.max(Math.abs(y - 9.5 + (z - 50) * 0.02) - 0.7, Math.abs(x) - 8, z - 66, 24 - z), [-11, 6, 22, 11, 13, 68], 6, 0.6, { pri: 1 }); // leather apron
  const hc = hat(b, J.head, 11, 6.5, 2.2, 4);
  b.rcs(add(J.head, [0, 2.5, -2.5]), add(J.head, [0, 3.4, -6]), 4.6, 5.4, 3, 0.8, 0.9, { pri: 1 }); // the rag over his mouth
  // the spade: planted and leant on at rest, swung up over his shoulder on the wind-up
  const h0 = tele ? add(J.Hl_, [3, 3, -6]) : [-7, 16, 64], h1 = tele ? [-20, -14, 112] : [-9, 18, 12];
  rc(h0, h1, 1.0, 1.0, 42); const sd = nz(sub(h1, h0)); obox(b, add(h1, sc(sd, 7)), sd, tele ? [0.6, 0.2, 0.8] : [1, 0, 0], [7, 5.5, 0.5], 9, 0, 0.6);
  rc(h0, add(h0, sc(sd, -4)), 1.6, 1.6, 42); rc(add(h0, sc(sd, -4)), add(add(h0, sc(sd, -4)), [2, 0, 0]), 1.2, 1.2, 42);
  // the lantern pole off his back
  const pb = [0, -8, 56], pt = tele ? [0, 10, 132] : [0, -10, 130], arm = tele ? [0, 32, 126] : [0, 14, 136];
  rc(pb, pt, 1.2, 1.0, 42); rc(pt, arm, 1.0, 0.9, 42); b.tor(add(J.chest, [0, -1, 0]), [0, 0.1, 1], 9, 0.9, 6); rc([0, -8, 56], [0, -7, 74], 2, 2, 6);
  const lan = add(arm, tele ? [0, 6, -18] : [0, 1, -16]);
  b.chain([add(arm, [0, 0, -1]), add(lan, [0, 0, 6])], 0.5, 9);
  for (const s of [-1, 1]) for (const t of [-1, 1]) rc(add(lan, [s * 3, t * 3, -5]), add(lan, [s * 3, t * 3, 5]), 0.5, 0.5, 9);
  b.box(add(lan, [0, 0, 5.5]), [3.8, 3.8, 0.8], 9, 0, 0.3); b.box(add(lan, [0, 0, -5.5]), [3.6, 3.6, 0.7], 9, 0, 0.3);
  el(lan, [2.3, 2.3, 3.6], 10);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 111);
    switch (m) {
      case 2: { let c = mix(L('#3a3426'), L('#1a1610'), clamp(n * 1.6 - 0.3)); if (vn3(x * 0.2, y * 0.2, z * 0.2, 112) > 0.62) c = mix(c, L('#4a3e2a'), 0.7); c = mix(c, L('#1e170e'), clamp((22 - z) / 10)); return { alb: c, wrap: 0.3, spec: 0.05, rim: 0.9 }; }
      case 3: return cloth(L('#6e624a'), L('#3a3226'), x, y, z, 113);
      case 4: return { alb: mix(L('#2a2018'), L('#120e0a'), n), spec: 0.15, gloss: 20, rim: 1.0 };
      case 5: return { alb: mix(L('#3a2e22'), L('#1a140e'), n), wrap: 0.3 };
      case 6: return { alb: mix(L('#4a3220'), L('#22160c'), n), spec: 0.35, gloss: 35 };
      case 9: return ironM(x, y, z);
      case 10: return glow(ORDER, tele ? 1.2 : 1.0);
      case 42: return kitMat(42, x, y, z);
    }
    return skinM(x, y, z, 114);
  };
  const r = done(b, mat);
  r.lights = [{ p: add(lan, [0, 0, -4]), c: L('#a8ac5c'), I: tele ? 4.2 : 3.4, r0: 30, R: 220, pad: 5, haze: 0.03, hazeR: 4 }];
  return r;
}

// ======================= 10. LE CHAULIER =======================
// the man who throws quicklime over the mass graves: white with it from head to foot, his face wound in rags behind black
// glass goggles, a sack of lime on his back, a wooden scoop. 'tele': the scoop full and cocked back high over his
// shoulder, lime streaming off it, his other arm out to aim.
export function chaulier(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std); const { rc, el } = b; const dust = [];
  Object.assign(J, { head: [0, 3, 88], neck: [0, 2, 81], chest: [0, 1, 70] }, tele ? {
    Sr: [-8.5, -1, 78], Er: [-15, -8, 88], Wr: [-12, -13, 102], Hr_: [-11, -14, 105], Sl: [8.5, 1.5, 78], El: [13, 12, 76], Wl: [12, 24, 76], Hl_: [11.5, 27, 76],
    Kl: [4.5, 9, 26], Al: [5, 8, 4], Tl: [5.5, 14, 1.2], Kr: [-4.5, -6, 26], Ar: [-5, -13, 5], Tr: [-5.5, -8, 1.2],
  } : { Sr: [-8.5, 0, 78], Er: [-10, 2, 61], Wr: [-11, 6, 47], Hr_: [-11.2, 8, 44], Sl: [8.5, 0, 78], El: [10, 1, 61], Wl: [10.5, 3, 47], Hl_: [10.8, 4, 44] });
  humanoid(J, b, { thin: 1.05, armM: 2, legM: 5 });
  b.rev(0, 0.5, 42, 76, t => lerp(11.5, 9, t), 2, 1.2, 0.85, { fold: [7, 1.0] }); // smock
  // head wound in rags, two black glass goggles
  el(add(J.head, [0, -0.3, 0.5]), [5.0, 5.6, 6.0], 3, 0.8, { pri: 1 });
  for (let i = 0; i < 5; i++) b.tor(add(J.head, [0, 0, -3 + i * 1.8]), [0, 0.15, 1], 4.6 + Math.sin(i) * 0.4, 0.8, 3, 0.5);
  for (const s of [-1, 1]) { el(add(J.head, [s * 2.1, 4.6, 1]), [1.6, 0.9, 1.6], 11, 0.2, { pri: 2 }); b.tor(add(J.head, [s * 2.1, 4.6, 1]), [0, 1, 0], 1.7, 0.45, 9); }
  // the sack of lime on his back
  oelN(b, [0, -13, 72], [0, 0, 1], [1, 0, 0], [19, 13, 11], 7, 2, 1.4, 0.3); b.tor([0, -13, 90], [0, 0, 1], 4.5, 1.3, 6); oelN(b, [0, -13, 93], [0, 0, 1], [1, 0, 0], [3, 4.5, 4.5], 47, 1, 0.8, 0.5); // the sack, lime at its mouth
  rc(add(J.Sr, [0, 2, 0]), [-6, -6, 58], 1.1, 1.1, 6); rc(add(J.Sl, [0, 2, 0]), [6, -6, 58], 1.1, 1.1, 6);
  // the scoop: a short handle, a deep wooden bowl, a heap of lime in it
  const hd = J.Hr_, sd = tele ? nz([0.1, -0.5, 1]) : [0, 0.2, -1], bowl = add(hd, sc(sd, 12));
  rc(hd, add(hd, sc(sd, 7)), 0.9, 0.9, 42);
  b.f((x, y, z) => smax(sdEll(x, y, z, bowl[0], bowl[1], bowl[2], 4.6, 4.6, 3.4), -sdEll(x, y, z, bowl[0], bowl[1], bowl[2] + (tele ? 1.6 : -1.6), 3.8, 3.8, 3), 0.3), [bowl[0] - 6, bowl[1] - 6, bowl[2] - 6, bowl[0] + 6, bowl[1] + 6, bowl[2] + 6], 42, 0.4);
  if (tele) { el(add(bowl, [0, 0, 2.2]), [4.2, 4.2, 2.6], 47, 0.6);
    const R = mulberry32(7); for (let i = 0; i < 26; i++) { const t = R(); dust.push(add(bowl, [(R() - 0.5) * 6 + t * 4, (R() - 0.5) * 6 + t * 4, -t * 60])); } }
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 121), wh = clamp(vn3(x * 0.35, y * 0.35, z * 0.35, 122) * 1.6 - 0.2); // how caked in lime
    const caked = (c) => mix(c, L('#c8c4b4'), wh * 0.75);
    switch (m) {
      case 2: return { alb: caked(mix(L('#5a5446'), L('#2a2620'), n)), wrap: 0.35, spec: 0.03, rim: 0.8 };
      case 3: return { alb: caked(mix(L('#8a8270'), L('#4a4436'), n)), wrap: 0.35 };
      case 5: return { alb: caked(mix(L('#3a3428'), L('#1a1610'), n)), wrap: 0.3 };
      case 6: return { alb: mix(L('#3a2a1a'), L('#1a120a'), n), spec: 0.2 };
      case 7: { let c = mix(L('#6a5a40'), L('#322a1c'), n); if (Math.abs(Math.sin(x * 2.4) * Math.sin(z * 2.4)) > 0.85) c = mul(c, 0.8); return { alb: mix(c, L('#e0dccc'), wh * 0.45), wrap: 0.4 }; }
      case 9: return ironM(x, y, z);
      case 11: return { alb: [0.02, 0.02, 0.025], spec: 1.2, gloss: 90 };
      case 42: return { ...kitMat(42, x, y, z), alb: caked(kitMat(42, x, y, z).alb) };
      case 47: return { alb: L('#e8e4d4'), wrap: 0.6, rim: 0.4 };
    }
    return { ...skinM(x, y, z, 123), alb: caked(skinTex(L('#a88a72'), L('#6e5444'), x, y, z, 123)) };
  };
  const r = done(b, mat);
  if (dust.length) { const v = B(); dust.forEach((p, i) => v.el(p, [0.9 + (i % 3) * 0.3, 0.9, 1.6 + (i % 4) * 0.5], 47)); r.subs = [{ name: 'lime', model: { sdf: partsSdf(v.parts), mat: () => ({ alb: L('#d8d4c4'), wrap: 0.8, rim: 0.3, noAO: true }), bounds: boundsOf(v.parts, 2), step: 0.7, nomask: true, noShadow: true, noSelfAO: true } }]; }
  return r;
}

// ======================= 11. LE CROCHETEUR =======================
// a netter: oiled leather, a broad hat, a weighted net, a long boat-hook for dragging what he catches to the pyre.
// 'tele': the net whirled open over his head like a dark wheel, its leads swinging; the hook held low and ready.
export function crocheteur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std); const { rc, el } = b;
  Object.assign(J, tele ? {
    Sr: [-8.5, 0, 78], Er: [-12, 2, 92], Wr: [-7, 2, 105], Hr_: [-6, 2, 108], Sl: [8.5, 1, 78], El: [11, 8, 64], Wl: [8, 18, 58], Hl_: [7, 20, 58],
    Kl: [4.5, 8, 26], Al: [5, 7, 4], Tl: [5.5, 13, 1.2], Kr: [-4.5, -5, 26], Ar: [-5, -12, 5], Tr: [-5.5, -7, 1.2],
  } : { Sr: [-8.5, 0, 78], Er: [-10, 1, 61], Wr: [-11, 5, 47], Hr_: [-11, 6, 44], Sl: [8.5, 0, 78], El: [11, 3, 62], Wl: [11, 9, 54], Hl_: [11, 10, 53] });
  humanoid(J, b, { thin: 1.0, armM: 2, legM: 5, shinM: 6, footM: 6 });
  b.rev(0, 0.5, 18, 76, t => t < 0.5 ? lerp(13, 9, t / 0.5) : lerp(9, 8.4, (t - 0.5) / 0.5), 2, 1.2, 0.85, { fold: [8, 1.1] });
  hat(b, J.head, 12, 5, 3, 4);
  b.rcs(add(J.head, [0, 2.6, -2]), add(J.head, [0, 3.4, -6]), 4.6, 5.4, 3, 0.8, 0.9, { pri: 1 }); // the scarf
  b.tor([0, 0.5, 52], [0, 0, 1], 9.8, 1.0, 6, 0.3);
  // the boat-hook: a long pole, an iron spike and a curved hook
  const p0 = tele ? [16, -10, 40] : [12, 10, 0], p1 = tele ? [6, 60, 62] : [13, 11, 124], d = nz(sub(p1, p0));
  rc(p0, p1, 1.1, 1.0, 42); rc(p1, add(p1, sc(d, 7)), 0.8, 0.1, 9);
  const side = nz(crs(d, [1, 0, 0])); let q = add(p1, sc(d, -1));
  for (let i = 0; i < 6; i++) { const a = i / 5 * Math.PI * 1.1, n = add(add(p1, sc(d, -1 - 4 * Math.sin(a))), sc(side, 4 * (1 - Math.cos(a)))); rc(q, n, 0.9, 0.8 - i * 0.1, 9); q = n; }
  // the net: a bundle at his hip at rest; whirled open over his head on the wind-up
  if (!tele) { oelN(b, [-13, 4, 40], [0, 0, 1], [1, 0, 0], [12, 6, 7], 12, 1, 1.2, 0.6); for (let i = 0; i < 5; i++) el([-13 + (i - 2) * 2.4, 8, 28 - (i % 2) * 2], [1.2, 1.2, 1.2], 9); }
  else {
    const c = add(J.Hr_, [0, 0, 6]), n = nz([0.1, 0.25, 1]), u = nz(crs(n, [0, 1, 0])), v = crs(n, u), R = 30;
    b.f((x, y, z) => { const qq = sub([x, y, z], c), w = dot(qq, n), a = dot(qq, u), bb = dot(qq, v), r = Math.hypot(a, bb), sag = 3 * (r / R) ** 2;
      const ang = Math.atan2(bb, a), rad = Math.abs(((ang / (Math.PI * 2) * 16) % 1 + 1) % 1 - 0.5) / 16 * Math.PI * 2 * r, ring = Math.abs(((r / 5) % 1) - 0.5) * 5;
      return Math.max(Math.hypot(Math.min(rad, ring), w + sag) - 0.45, r - R); }, [c[0] - R - 4, c[1] - R - 4, c[2] - R - 4, c[0] + R + 4, c[1] + R + 4, c[2] + R + 4], 12, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; el(add(c, add(add(sc(u, Math.cos(a) * R), sc(v, Math.sin(a) * R)), sc(n, -4))), [1.4, 1.4, 1.4], 9); }
  }
  const mat = (m, x, y, z) => {
    const nn = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 131);
    switch (m) {
      case 2: { const c = mix(L('#3a2e1e'), L('#1a140c'), clamp(nn * 1.6 - 0.3)); return { alb: bloodHem(c, x, y, z, 26), spec: 0.4, gloss: 40, wrap: 0.2, rim: 0.9 }; }
      case 3: return cloth(L('#4a4234'), L('#24201a'), x, y, z, 132);
      case 4: return { alb: mix(L('#241c14'), L('#100c08'), nn), spec: 0.3, gloss: 30, rim: 1.0 };
      case 5: return { alb: mix(L('#2e261c'), L('#16120c'), nn), wrap: 0.3 };
      case 6: return { alb: mix(L('#2a2018'), L('#120e0a'), nn), spec: 0.4, gloss: 40 };
      case 9: return ironM(x, y, z);
      case 12: return { alb: mix(L('#5a4e38'), L('#2a2418'), nn), wrap: 0.5, spec: 0.05, rim: 1.2 };
      case 42: return kitMat(42, x, y, z);
    }
    return skinM(x, y, z, 133);
  };
  return done(b, mat);
}

// ======================= 12. LE TIREUR DU MAUSOLÉE =======================
// a marksman posted on the mausoleums' roofs: a hooded cape, a bandolier of powder charges, a long arquebus and its
// forked rest, a slow match coiled at his wrist, its ember always lit. 'tele': down on one knee, the gun on its fork,
// his cheek to the stock, the ember at the lock blown bright.
export function tireur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std); const { rc, el } = b;
  Object.assign(J, tele ? {
    head: [-1, 9, 58], neck: [0, 6, 52], chest: [0, 3, 43], pelvis: [0, -2, 25],
    Sr: [-8, 3, 49], Er: [-12, 10, 40], Wr: [-6, 14, 44], Hr_: [-4.5, 15, 45], Sl: [8, 5, 49], El: [8, 16, 40], Wl: [3, 26, 42], Hl_: [2.5, 28, 42.5],
    Hr: [-3.6, -2, 23], Kr: [-4.5, -4, 2.5], Ar: [-4.5, -22, 3], Tr: [-4.5, -27, 1], Hl: [3.6, -1, 23], Kl: [5, 14, 25], Al: [5, 15, 4], Tl: [5.5, 21, 1.2],
  } : { Sr: [-8.5, 0, 78], Er: [-12, -2, 66], Wr: [-9, 4, 74], Hr_: [-8, 4.5, 77], Sl: [8.5, 0, 78], El: [10, 4, 62], Wl: [11, 10, 55], Hl_: [11, 11, 54] });
  humanoid(J, b, { thin: 0.95, armM: 2, legM: 5, shinM: 6, footM: 6 });
  const top = J.neck[2];
  b.rev(J.pelvis[0], J.pelvis[1], tele ? 4 : 10, top - 2, t => lerp(tele ? 15 : 13, 9, Math.pow(t, 0.7)), 2, 1.2, 0.85, { fold: [9, 1.3] }); // the cape
  const Hd = J.head; // a deep hood
  b.f((x, y, z) => smax(sdEll(x, y, z, Hd[0], Hd[1] - 0.8, Hd[2] + 0.8, 6, 6.8, 7), -sdEll(x, y, z, Hd[0], Hd[1] + 5.4, Hd[2] - 0.6, 3.4, 3.4, 4.2), 0.8), [Hd[0] - 9, Hd[1] - 9, Hd[2] - 9, Hd[0] + 9, Hd[1] + 9, Hd[2] + 9], 3, 1, { pri: 1 });
  rc(add(Hd, [0, -3, 3]), add(Hd, [0, -8, -1]), 3.6, 1.4, 3, 1);
  // the bandolier: a strap across his chest, a row of little powder flasks
  for (let i = 0; i < 7; i++) { const t = i / 6, p = add(lp(add(J.Sl, [0, 4, 0]), add(J.pelvis, [-7, 5, 4]), t), [0, 1.4, 0]); rc(p, add(p, [0, 0, -3.2]), 0.9, 0.9, 6); }
  // the arquebus (shouldered at rest, laid on its fork and aimed on the wind-up) and the fork
  const st = tele ? add(J.Sr, [1, 1, -2]) : [-12, -10, 70], mz = tele ? [3, 84, 46] : [-8, 14, 128], gd = nz(sub(mz, st));
  rc(st, add(st, sc(gd, 18)), 2.2, 1.4, 42); rc(add(st, sc(gd, 14)), mz, 1.2, 1.0, 9); rc(mz, add(mz, sc(gd, -2)), 1.4, 1.4, 9);
  const fork = tele ? [2, 34, 0] : [12, 12, 0], ft = tele ? add(st, sc(gd, 34)) : [12, 12, 110];
  rc(fork, add(ft, [0, 0, -4]), 0.9, 0.9, 42); const fs = nz(crs(gd, [0, 0, 1])); for (const s of [-1, 1]) rc(add(ft, [0, 0, -4]), add(ft, add(sc(fs, s * 3), [0, 0, 2])), 0.7, 0.5, 9);
  // the slow match: coiled round his wrist; its ember in the serpentine by the lock, bright on the wind-up
  const lock = add(st, sc(gd, 12)), ember = tele ? add(lock, [-1.5, -1, 2.5]) : add(J.Hl_, [0, 1, -3]);
  b.tor(add(lp(J.El, J.Wl, 0.8), [0, 0, 0]), nz(sub(J.Wl, J.El)), 2.6, 0.5, 5); b.tor(add(lp(J.El, J.Wl, 0.6), [0, 0, 0]), nz(sub(J.Wl, J.El)), 2.6, 0.5, 5);
  if (tele) b.chain([lp(J.El, J.Wl, 0.7), add(lp(J.El, J.Wl, 0.7), [-2, -2, -4]), ember], 0.4, 5);
  el(ember, [0.9, 0.9, 0.9], 19);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 141);
    switch (m) {
      case 2: return { alb: bloodHem(mix(L('#2a2622'), L('#121010'), clamp(n * 1.5 - 0.3)), x, y, z, 12), wrap: 0.25, spec: 0.08, rim: 0.5 };
      case 3: return { alb: mix(L('#1a1714'), L('#0a0908'), n), wrap: 0.3, rim: 0.3 };
      case 5: return { alb: mix(L('#3a3226'), L('#1a1610'), n), wrap: 0.3 };
      case 6: return { alb: mix(L('#4a3220'), L('#22160c'), n), spec: 0.4, gloss: 40 };
      case 9: return ironM(x, y, z);
      case 19: return glow(FIRE, tele ? 1.6 : 0.9);
      case 42: return kitMat(42, x, y, z);
    }
    return skinM(x, y, z, 143);
  };
  const r = done(b, mat);
  r.lights = [{ p: add(ember, [0, 2, 1]), c: L('#e07028'), I: tele ? 1.6 : 0.6, r0: 6, R: 50, pad: 2, haze: tele ? 0.12 : 0.05, hazeR: 1.6 }];
  return r;
}

// ======================= 13. LE MIROITIER =======================
// an acolyte under the breach where the Dawn falls: a great round mirror of polished bronze in a sun-rayed iron frame,
// smoked-glass goggles; he throws the Dawn back into the shade. 'tele': the mirror lifted over his head and tilted at
// you, flaring with the Dawn it caught: the burning beam follows.
export function miroitier(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std); const { rc, el } = b;
  Object.assign(J, tele ? {
    head: [0, -1, 89], Sr: [-8.5, -1, 78], Er: [-14, 0, 92], Wr: [-11, 3, 104], Hr_: [-10, 3.5, 107], Sl: [8.5, -1, 78], El: [14, 0, 92], Wl: [11, 3, 104], Hl_: [10, 3.5, 107],
    Kl: [4.5, 6, 26], Al: [5, 5, 4], Tl: [5.5, 11, 1.2], Kr: [-4.5, -4, 26], Ar: [-5, -10, 5], Tr: [-5.5, -5, 1.2],
  } : { Sr: [-8.5, 0, 78], Er: [-10, 2, 62], Wr: [-12, 8, 52], Hr_: [-12.5, 10, 51], Sl: [8.5, 0, 78], El: [10, 2, 62], Wl: [9, 9, 50], Hl_: [8.5, 10, 49] });
  humanoid(J, b, { thin: 0.9, armM: 2 });
  b.rev(0, 0, 0.5, 78, t => t < 0.6 ? lerp(14, 9, Math.pow(t / 0.6, 0.7)) : lerp(9, 7.4, (t - 0.6) / 0.4), 2, 1.5, 0.82, { fold: [9, 1.1] });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 3.0, 3.2, 2, 1.2); rc(E, lp(E, W, 0.8), 3.2, 4.4, 2, 0.8); }
  const Hd = J.head; // a close hood, smoked-glass goggles, a gold sun on his breast
  el(add(Hd, [0, -0.6, 0.8]), [5.2, 5.8, 6.2], 3, 0.8, { pri: 1 });
  for (const s of [-1, 1]) { el(add(Hd, [s * 2.1, 4.4, 0.8]), [1.7, 1.0, 1.6], 11, 0.2, { pri: 2 }); b.tor(add(Hd, [s * 2.1, 4.4, 0.8]), [0, 1, 0], 1.8, 0.5, 8); }
  sun(b, add(J.chest, [0, 6.6, 1]), [0, 1, 0.1], 2.4);
  // the mirror: a bronze disc in an iron ring with rays; resting on its foot at his side, or raised and tilted at you
  const mc = tele ? [0, 10, 112] : [-20, 8, 30], mn = tele ? nz([0.3, 1, -0.32]) : nz([0.35, 1, 0.05]), mu = nz(crs([0, 0, 1], mn)), mv = crs(mn, mu), RM = 22;
  b.f((x, y, z) => { const q = sub([x, y, z], mc); const w = dot(q, mn), r = Math.hypot(dot(q, mu), dot(q, mv)); return Math.max(r - RM, Math.abs(w + 0.004 * r * r) - 1.0); }, [mc[0] - RM - 2, mc[1] - RM - 2, mc[2] - RM - 2, mc[0] + RM + 2, mc[1] + RM + 2, mc[2] + RM + 2], 22, 0);
  b.tor(add(mc, sc(mn, -0.5)), mn, RM + 1, 1.4, 9);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, d = add(sc(mu, Math.cos(a)), sc(mv, Math.sin(a))); rc(add(mc, sc(d, RM + 2)), add(mc, sc(d, RM + (i & 1 ? 5 : 8))), 0.9, 0.15, 9); }
  for (const s of [-1, 1]) rc(add(mc, add(sc(mn, -2), sc(mu, s * 10))), add(mc, add(sc(mn, -4), sc(mu, s * 10))), 1, 1, 9); // the grips behind
  if (!tele) rc(add(mc, sc(mv, -RM)), [mc[0], mc[1], 0], 1.2, 1.2, 9); // its foot
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 151);
    switch (m) {
      case 2: { let c = mix(K.ivory, K.ivoryD, clamp(n * 1.5 - 0.3)); c = bloodHem(c, x, y, z, 12, 152); if (z < 20) c = mix(c, L('#3a3226'), 0.4); return { alb: c, wrap: 0.35, spec: 0.04 }; }
      case 3: return { alb: mix(L('#8a8068'), L('#4a4436'), clamp(n * 1.5 - 0.3)), wrap: 0.3 };
      case 8: return goldM(x, y, z);
      case 9: return ironM(x, y, z);
      case 11: return { alb: [0.03, 0.025, 0.02], spec: 1.2, gloss: 90 };
      case 22: { const q = sub([x, y, z], mc), r = Math.hypot(dot(q, mu), dot(q, mv)); let c = mix(L('#a07a3a'), L('#5a3e1a'), clamp(vn3(x * 0.3, y * 0.3, z * 0.3, 153) * 1.4 - 0.2)); if (Math.abs(r - RM * 0.62) < 0.6) c = L('#3a2a14');
        const flare = tele ? clamp(1 - r / (RM * 0.55)) ** 1.5 * 1.6 : 0; return { alb: c, spec: 2.2, gloss: 140, emi: [1.7 * flare, 1.35 * flare, 0.6 * flare], rim: 0.2 }; }
    }
    return skinM(x, y, z, 154);
  };
  const r = done(b, mat);
  r.lights = [{ p: tele ? add(mc, [0, -40, 70]) : add(mc, [10, -40, 80]), c: L('#fbf0b0'), I: tele ? 3 : 1.2, r0: 40, R: 200, pad: 4, noShadow: false }];
  if (tele) { // the beam it throws: a shaft of the Dawn down and out at you
    r.lights.push({ p: add(mc, sc(mn, 4)), c: L('#f8e8a0'), I: 3, r0: 20, R: 160, pad: 4, haze: 0.03, hazeR: 3, noShadow: true });
    r.lights.push({ p: add(mc, add(sc(mn, 40), [0, 0, -10])), c: L('#f8e0a0'), I: 2.4, r0: 30, R: 140, pad: 4, noShadow: true }); // the reflected Dawn, falling ahead of him
  }
  return r;
}

// ======================= 14. LE TOMBEUR =======================
// the man who stakes the dead in their graves so they stay down: a giant in a leather jerkin, an iron cage over his face,
// a quiver of sharpened ash stakes on his back, a cooper's mallet. 'tele': crouched to charge, a stake levelled at you
// in his left fist, the mallet reared high behind his head.
export function tombeur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el } = b; const s = 1.35;
  const J = {}; for (const k in std) J[k] = std[k].map(v => v * s);
  Object.assign(J, { head: [0, 6, 114], neck: [0, 4, 107], chest: [0, 2, 94], pelvis: [0, 0, 68] }, tele ? {
    head: [0, 17, 103], neck: [0, 13, 97], chest: [0, 7, 86], pelvis: [0, 0, 62],
    Sr: [-16, 6, 96], Er: [-25, -4, 108], Wr: [-17, -10, 124], Hr_: [-15, -11, 127], Sl: [16, 9, 96], El: [17, 22, 86], Wl: [9, 32, 86], Hl_: [7, 35, 86],
    Hr: [-7, 0, 60], Kr: [-9, -10, 34], Ar: [-9, -24, 7], Tr: [-10, -17, 1.6], Hl: [7, 0, 60], Kl: [9, 14, 36], Al: [9, 10, 6], Tl: [10, 18, 1.6],
  } : {
    Sr: [-16, 2, 102], Er: [-21, 2, 82], Wr: [-19, 6, 66], Hr_: [-18.5, 7, 62], Sl: [16, 2, 102], El: [19, 4, 82], Wl: [18, 9, 64], Hl_: [17.5, 10, 60],
  });
  humanoid(J, b, { thin: 1.9, torsoM: 2, pelvisM: 2, legM: 5, shinM: 6, footM: 6 });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { el(S1, [6.5, 6.5, 6], 1, 3); rc(S1, E, 5.2, 4.2, 1, 2); rc(E, W, 4.2, 3.2, 1, 1.4); }
  for (const Hh of [J.Hr_, J.Hl_]) el(Hh, [3, 3, 3.4], 1, 1.2);
  b.rev(J.pelvis[0], J.pelvis[1] + 1, J.pelvis[2] - 30, J.chest[2] + 8, t => t < 0.45 ? lerp(16, 14, t / 0.45) : lerp(14, 16.5, (t - 0.45) / 0.55), 2, 1.2, 0.78, { fold: [7, 1.2] }); // a sleeveless leather jerkin
  for (const sd of [-1, 1]) b.tor(add(J.chest, [0, 0.5, -6 + sd * 7]), [sd * 0.4, 0, 1], 15.5, 0.9, 6, 0.3); // its straps
  // the iron cage over his face
  const Hd = J.head; el(add(Hd, [0, -0.5, 0.5]), [6.2, 6.8, 7.2], 3, 0.8, { pri: 1 });
  for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; rc(add(Hd, [Math.sin(a) * 6.8, Math.cos(a) * 6.8 + 0.5, 6.5]), add(Hd, [Math.sin(a) * 7.2, Math.cos(a) * 7.2 + 0.5, -6.5]), 0.55, 0.55, 9); }
  for (const dz of [5, -1]) b.tor(add(Hd, [0, 0.5, dz]), [0, 0, 1], 7.2, 0.6, 9);
  // the quiver of stakes on his back, fanning over his shoulders
  const qb = add(J.chest, [0, -10, -8]); obox(b, qb, [0, 0, 1], [1, 0, 0], [16, 8, 4], 6, 1, 1.5);
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 1.3, base = add(qb, [Math.sin(a) * 6, -1, 6]), tip = add(base, [Math.sin(a) * 18, -4 - Math.abs(a) * 4, 30 + Math.cos(a) * 6]); rc(base, tip, 1.5, 0.15, 42); }
  // the stake in his left fist; the mallet
  const sk0 = tele ? add(J.Hl_, [0, -8, 0]) : add(J.Hl_, [0, 0, 10]), sk1 = tele ? add(J.Hl_, [0, 22, -2]) : add(J.Hl_, [0, 1, -22]); rc(sk0, sk1, 1.6, 0.15, 42);
  const m0 = tele ? add(J.Hr_, [0, 4, -12]) : add(J.Hr_, [0, 0, 8]), m1 = tele ? add(J.Hr_, [2, -14, 28]) : add(J.Hr_, [-1, 6, -30]);
  rc(m0, m1, 1.6, 1.4, 42); const md = nz(sub(m1, m0)), ms = nz(crs(md, [1, 0, 0]));
  rc(add(m1, sc(ms, -9)), add(m1, sc(ms, 9)), 7, 7, 43, 0.5); for (const t of [-1, 1]) b.tor(add(m1, sc(ms, t * 7.5)), ms, 7, 0.8, 9);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 161);
    switch (m) {
      case 2: { let c = mix(L('#3a2818'), L('#160e08'), clamp(n * 1.6 - 0.3)); if (Math.abs(Math.sin(x * 1.1 + z * 0.2) * Math.sin(y * 0.9 - z * 0.7)) > 0.92) c = mul(c, 0.6); return { alb: bloodHem(c, x, y, z, 40), spec: 0.1, gloss: 15, wrap: 0.3, rim: 0.7 }; }
      case 3: return { alb: mix(L('#2a2018'), L('#100c08'), n), spec: 0.2 };
      case 5: return { alb: mix(L('#2e261c'), L('#16120c'), n), wrap: 0.3 };
      case 6: return { alb: mix(L('#3a2a1a'), L('#1a120a'), n), spec: 0.3, gloss: 30 };
      case 9: return ironM(x, y, z);
      case 42: { const k = kitMat(42, x, y, z); k.alb = mix(k.alb, L('#8a7a5a'), 0.35); return k; }
      case 43: { const g = Math.abs(Math.sin(Math.atan2(z - m1[2], x - m1[0]) * 10)); return { alb: mix(mix(L('#5a4630'), L('#2a1e12'), g), S.bloodD, clamp(vn3(x * 0.4, y * 0.4, z * 0.4, 162) * 2 - 0.9)), spec: 0.15, gloss: 20 }; }
    }
    let c = skinTex(L('#b08a72'), L('#7a5848'), x, y, z, 163); if (vn3(x * 0.2, y * 0.2, z * 0.1, 164) > 0.62) c = mix(c, S.bloodD, 0.5);
    return { alb: c, sss: 0.4, wrap: 0.3, spec: 0.3, gloss: 40 };
  };
  return done(b, mat, { size: 1.35 });
}

// ======================= 15. LE PORTE-DALLE =======================
// a big man of the Order who carries a tombstone strapped to his arm for a shield: on the bridge and the causeway he
// shoves whatever stands before him into the chasm. 'tele': the slab set square before him, his shoulder behind it, his
// feet braced back: the charge comes.
export function porteDalle(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el } = b; const s = 1.28;
  const J = {}; for (const k in std) J[k] = std[k].map(v => v * s);
  Object.assign(J, tele ? {
    head: [0, 8, 106], neck: [0, 6, 98], chest: [0, 3, 86], pelvis: [0, -6, 60],
    Sr: [-12, 4, 92], Er: [-14, 12, 78], Wr: [-8, 20, 74], Hr_: [-6, 22, 74], Sl: [12, 6, 92], El: [12, 16, 84], Wl: [6, 22, 90], Hl_: [4, 23, 91],
    Hr: [-6, -6, 58], Kr: [-8, -16, 32], Ar: [-8, -34, 8], Tr: [-9, -29, 1.4], Hl: [6, -6, 58], Kl: [8, 4, 34], Al: [8, -6, 6], Tl: [9, 1, 1.4],
  } : {
    Sr: [-12, 0, 100], Er: [-14, 2, 80], Wr: [-14, 6, 62], Hr_: [-14, 7, 58], Sl: [12, 0, 100], El: [18, 4, 82], Wl: [22, 10, 70], Hl_: [23, 11, 68],
  });
  humanoid(J, b, { thin: 1.5, torsoM: 2, pelvisM: 2, legM: 5, shinM: 6, footM: 6 });
  b.rev(J.pelvis[0], J.pelvis[1], J.pelvis[2] - 34, J.chest[2] + 12, t => lerp(15, 12, t), 2, 1.2, 0.85, { fold: [8, 1.2] }); // the Order's tabard over mail
  sun(b, add(J.chest, [0, 9, 2]), [0, 1, 0.1], 3.6);
  // a kettle helmet with a wide iron brim
  const hc = add(J.head, [0, -0.4, 2]); el(hc, [6.2, 6.6, 6], 9, 0.5, { pri: 1 });
  b.f((x, y, z) => { const r = Math.hypot(x - hc[0], y - hc[1]); return Math.max(r - 11, Math.abs(z - hc[2] + 0.8 + 0.08 * r) - 0.6); }, [hc[0] - 12, hc[1] - 12, hc[2] - 3, hc[0] + 12, hc[1] + 12, hc[2] + 2], 9, 0);
  // the slab: a rounded tombstone, a sun cut in it, straps; at his side resting on its foot, or squared before him
  const sc0 = tele ? [0, 30, 50] : [26, 10, 44], su = tele ? [-1, 0, 0] : nz([-1, 0.55, 0]), sup = tele ? nz([0, 0.18, 1]) : [0, 0, 1], sn = crs(su, sup);
  obox(b, sc0, su, sup, [24, 40, 4], 41, 0, 1.2); oel(b, add(sc0, sc(sup, 38)), su, sup, [24, 12, 4], 41, 0.8);
  for (const t of [-14, 10]) obox(b, add(add(sc0, sc(sup, t)), sc(sn, -4.6)), su, sup, [16, 1.6, 0.6], 6, 0, 0.3);
  // a short pick
  const p0 = tele ? add(J.Hr_, [0, 0, 6]) : add(J.Hr_, [0, 0, 6]), p1 = tele ? add(J.Hr_, [0, 2, -24]) : add(J.Hr_, [0, 2, -30]);
  rc(p0, p1, 1.2, 1.2, 42); rc(add(p1, [0, -9, 0]), add(p1, [0, 9, -2]), 1.4, 0.2, 9);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 171);
    switch (m) {
      case 2: { let c = mix(K.ivory, K.ivoryD, clamp(n * 1.5 - 0.3)); c = mix(c, L('#3a3226'), 0.35); return { alb: bloodHem(c, x, y, z, J.pelvis[2] - 20, 172), wrap: 0.35, spec: 0.04, rim: 0.9 }; }
      case 5: { const ring = Math.abs(Math.sin(x * 2.2) * Math.sin(z * 2.2)) > 0.5; return { alb: mul(mix(S.iron, S.rust, n), ring ? 1 : 0.6), spec: 0.6, gloss: 40 }; }
      case 6: return { alb: mix(L('#3a2a1a'), L('#1a120a'), n), spec: 0.3, gloss: 30 };
      case 8: return goldM(x, y, z);
      case 9: return ironM(x, y, z);
      case 41: { const k = kitMat(41, x, y, z); const q = sub([x, y, z], add(sc0, sc(sup, 20))); const u = dot(q, su), v = dot(q, sup), rr = Math.hypot(u, v);
        if (dot(q, sn) > 2.5 && ((rr < 7 && rr > 5.2) || (rr > 8 && rr < 13 && Math.abs(Math.sin(Math.atan2(v, u) * 8)) < 0.2))) k.alb = mix(K.gold, K.goldD, 0.5); // the sun, gilt in the stone
        if (Math.abs(vn3(x * 0.2, y * 0.2, z * 0.2, 173) - 0.5) < 0.02) k.alb = L('#0e0c0a'); return k; }
      case 42: return kitMat(42, x, y, z);
    }
    return skinM(x, y, z, 174);
  };
  return done(b, mat, { size: 1.3 });
}
