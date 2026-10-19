// node run.mjs <scene module> : renders rows in parallel workers, then the module's finish() does post + output.
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { render } from './lib.mjs';
if (isMainThread) {
  const mod = process.argv[2], NW = +(process.env.NW || 4), t0 = Date.now();
  const parts = await Promise.all([...Array(NW)].map((_, k) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { mod, k, NW } }); w.on('message', res); w.on('error', rej);
  })));
  const m = await import('./' + mod); const sc = await m.scene();
  const { W, H } = sc; const img = { W, H, out: new Float32Array(W * H * 3), oid: new Int16Array(W * H), emis: new Float32Array(W * H), depth: new Float32Array(W * H), nrm: new Float32Array(W * H * 3), sun: new Float32Array(W * H) };
  for (let y = 0; y < H; y++) { const p = parts[y % NW], a = y * W, b = a + W;
    img.out.set(p.out.subarray(a * 3, b * 3), a * 3); img.nrm.set(p.nrm.subarray(a * 3, b * 3), a * 3);
    img.oid.set(p.oid.subarray(a, b), a); img.emis.set(p.emis.subarray(a, b), a); img.depth.set(p.depth.subarray(a, b), a); img.sun.set(p.sun.subarray(a, b), a); }
  console.log('render', Date.now() - t0, 'ms');
  await m.finish(img, sc);
} else {
  const { mod, k, NW } = workerData; const m = await import('./' + mod); const sc = await m.scene();
  sc.rowN = NW; sc.rowK = k; const r = render(sc);
  parentPort.postMessage({ out: r.out, oid: r.oid, emis: r.emis, depth: r.depth, nrm: r.nrm, sun: r.sun });
}
