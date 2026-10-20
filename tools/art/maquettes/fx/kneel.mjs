// A weakened soldier of the Order on his knees, head thrown back (the bite's prey), built with the mockup cast's own
// humanoid (tools/art/maquettes/grand/cast.mjs, re-exported from a patched copy since it keeps it private).
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const G = new URL('../grand/', import.meta.url).pathname, TMP = `${tmpdir()}/dracul-cast2.mjs`;
const src = readFileSync(G + 'cast.mjs', 'utf8').replace("from './lib.mjs'", `from '${G}lib.mjs'`) + '\nexport { humanoid, builder, boundsOf, S };\n';
writeFileSync(TMP, src);
const { humanoid, builder, boundsOf, S } = await import(TMP);
const { partsSdf, fbm3, vn3, mix, mul, clamp, L } = await import(G + 'lib.mjs');

export function kneeling() {
  const J = {
    head: [0, -1.2, 63], neck: [0, 0.2, 57], chest: [0, 0.6, 47], pelvis: [0, 0, 29],
    Sr: [-8.5, 0, 54], Er: [-10.5, 1, 40], Wr: [-9.5, 4, 27], Hr_: [-9, 5, 22], Sl: [8.5, 0, 54], El: [10.5, 2, 40], Wl: [8.5, 6, 28], Hl_: [8, 7, 23],
    Hr: [-3.8, 0, 27], Kr: [-4.5, 5, 4], Ar: [-4.5, -14, 3], Tr: [-4.5, -19, 1], Hl: [3.8, 0, 27], Kl: [4.5, 4, 4], Al: [4.5, -15, 3], Tl: [4.5, -20, 1],
  };
  const b = builder(); humanoid(J, b, { thin: 1.12, torsoM: 3, pelvisM: 3, armM: 3, legM: 5, shinM: 5, footM: 6 });
  const sdf = partsSdf(b.parts);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.5, y * 0.5, z * 0.5, 3, 31);
    if (m === 3) { // gambeson, the Order's tabard over it, bloodied
      let c = mix(S.gamb, S.gambD, (0.5 + 0.5 * Math.sin(z * 1.6)) * 0.6 + n * 0.3);
      if (Math.abs(x) < 7 && y > 2 && z < 52 && z > 26) c = mix(S.tabard, S.tabardD, clamp(n * 1.5 - 0.3));
      c = mix(c, S.bloodD, clamp(vn3(x * 0.4, y * 0.4, z * 0.4, 8) * 1.8 - 0.8));
      return { alb: c, wrap: 0.3 };
    }
    if (m === 5) return { alb: mix(L('#3a3328'), L('#2a241c'), n), wrap: 0.2 };
    if (m === 6) return { alb: S.leather, spec: 0.2, gloss: 20 };
    let c = mix(S.skinH, mul(S.skinH, 0.6), n); // face and hands: grey with fear, blood at the throat
    if (z > 52 && z < 59) c = mix(c, S.blood, 0.5);
    return { alb: c, sss: 0.4, wrap: 0.3 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 2), step: 0.6 };
}
