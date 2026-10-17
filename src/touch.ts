// On-screen controls for touch screens, as DOM over the canvas, Plein écran and Entraînement at the top right, clear
// of the HUD. Played with one thumb (the default): an invisible floating stick that appears where the thumb lands on the
// game, and a quick tap anywhere for the mist; the attacks are automatic. The old manual combat (training room): a
// fixed stick on the left and action buttons on the right, the same thumb arc held sideways or upright. Only on coarse
// pointers (phones, tablets), so a laptop keeps its keyboard (the floating stick also answers the mouse there).
import { T } from './tuning.ts';
import { isTap, stickTilt } from './logic.ts';

/** The stick's tilt, each axis in [-1, 1]; 0 when released or inside the dead zone. */
export const stick = { x: 0, y: 0 };

type Action = 'slash' | 'shoot' | 'dash' | 'cast' | 'bite' | 'training';
// [action, label, size in px, right and bottom offsets in px]. Attacks repeat while held, like a held key would.
const BUTTONS: [Action, string, number, number, number][] = [
  ['slash', 'Griffes', 84, 22, 26],
  ['dash', 'Brume', 64, 120, 14],
  ['shoot', 'Tir', 64, 18, 124],
  ['cast', 'Glyphe', 56, 104, 100],
  ['bite', 'Mordre', 56, 186, 34],
];
const REPEAT = new Set<Action>(['slash', 'shoot']);
const RADIUS = 56; // px the stick's knob travels from its centre at full tilt

const CSS = `
#touch{position:fixed;inset:0;pointer-events:none;z-index:5;font:600 13px/1 Georgia,"Times New Roman",serif;color:#e8dcc8;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#touch .pad,#touch button{pointer-events:auto;touch-action:none;position:absolute}
#touch .pad{left:calc(24px + env(safe-area-inset-left,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));width:150px;height:150px;
  border-radius:50%;background:#170d2266;border:2px solid #2e1838cc}
#touch .knob{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px;border-radius:50%;background:#5a446899;border:2px solid #8a6f8f}
#touch button{border-radius:50%;border:2px solid #8a6f8f;background:#2e1838aa;color:inherit;font:inherit;padding:0}
#touch button[data-a="slash"]{background:#5c0a1cbb;border-color:#e0284a}
#touch .top{position:absolute;display:flex;gap:8px;right:calc(12px + env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px))}
#touch .top button{position:static;border-radius:6px;padding:6px 10px;font-size:12px}
#touch button.on{background:#e0284acc}
#touch .ring,#touch .dot{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%)}
#touch .ring{border:2px solid #e8dcc840;background:#0b071026}
#touch .dot{width:34px;height:34px;background:#e8dcc84d;border:2px solid #e8dcc866}
@media (orientation:portrait){#touch .pad{left:calc(12px + env(safe-area-inset-left,0px));width:128px;height:128px}}`;

export function controls(act: (a: Action) => void, manual: boolean, canvas: HTMLCanvasElement, playing: () => boolean): () => void {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse && manual) return () => {};
  const root = document.createElement('div');
  root.id = 'touch';
  const inset = (side: 'right' | 'bottom', px: number) => `${side}:calc(${px}px + env(safe-area-inset-${side},0px))`;
  root.innerHTML = `<style>${CSS}</style>${!manual ? '<div class="ring" hidden></div><div class="dot" hidden></div>' : `<div class="pad" aria-label="Déplacement"><div class="knob"></div></div>${BUTTONS.map(([a, label, size, r, b]) =>
    `<button type="button" data-a="${a}" style="width:${size}px;height:${size}px;${inset('right', r)};${inset('bottom', b)}">${label}</button>`).join('')}`}
    ${coarse ? `<div class="top"><button type="button" data-a="full">Plein écran</button><button type="button" data-a="training">Entraînement</button></div>` : ''}`;
  const off = manual ? () => {} : floating(root, canvas, () => act('dash'), playing);

  // The stick follows one finger, from wherever it lands on the pad.
  const pad = root.querySelector<HTMLElement>('.pad'), knob = root.querySelector<HTMLElement>('.knob')!;
  let finger = -1;
  const move = (e: PointerEvent) => {
    if (e.pointerId !== finger) return;
    const r = pad!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const live = d > RADIUS * 0.25; // dead zone: a resting thumb doesn't walk him
    stick.x = live ? dx / RADIUS : 0;
    stick.y = live ? dy / RADIUS : 0;
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== finger) return;
    finger = -1;
    stick.x = stick.y = 0;
    knob.style.transform = '';
  };
  pad?.addEventListener('pointerdown', (e) => { finger = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); });
  pad?.addEventListener('pointermove', move);
  pad?.addEventListener('pointerup', release);
  pad?.addEventListener('pointercancel', release);

  // Buttons fire on touch-down; attacks repeat while held (the scene's input buffer paces them).
  for (const b of root.querySelectorAll<HTMLButtonElement>('button')) {
    const a = b.dataset.a as Action | 'full';
    if (a === 'full') {
      b.addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => {})); // refused: the game simply stays as it is
      continue;
    }
    let timer = 0;
    const up = () => { clearInterval(timer); b.classList.remove('on'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* a pointer already gone can't be captured; the release still comes */ }
      b.classList.add('on');
      act(a);
      if (REPEAT.has(a)) timer = window.setInterval(() => act(a), 120);
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
  root.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press must not open a menu

  // Full screen, either way up (the view follows the screen's shape): hides the browser's and the app's bars where the page is allowed to (not every
  // app view is); the button only shows where it can work, and goes away once in full screen.
  const full = root.querySelector<HTMLButtonElement>('[data-a="full"]');
  const showFull = () => full && (full.hidden = !document.fullscreenEnabled || !!document.fullscreenElement);
  document.addEventListener('fullscreenchange', showFull);
  showFull();

  document.body.append(root);
  return () => {
    document.removeEventListener('fullscreenchange', showFull);
    off();
    stick.x = stick.y = 0;
    root.remove();
  };
}

/**
 * The floating stick on `canvas` (the game itself, never the buttons over it): where a finger lands, a faint ring and
 * knob appear; the knob follows it within T.stick.radius, the ring follows a finger that drags farther; lifting the
 * finger hides them. A finger lifted soon without straying (any finger, a second one too) is a tap: `tap()`. Nothing
 * starts while `playing()` is false (the cards are open: the tap picks a card).
 */
function floating(root: HTMLElement, canvas: HTMLCanvasElement, tap: () => void, playing: () => boolean) {
  const S = T.stick, ring = root.querySelector<HTMLElement>('.ring')!, dot = root.querySelector<HTMLElement>('.dot')!;
  const fingers = new Map<number, { t: number; x: number; y: number; moved: number }>();
  let lead = -1, base = { x: 0, y: 0 };
  const place = (el: HTMLElement, p: { x: number; y: number }) => ((el.style.left = `${p.x}px`), (el.style.top = `${p.y}px`));
  const down = (e: PointerEvent) => {
    if (!playing()) return;
    fingers.set(e.pointerId, { t: e.timeStamp, x: e.clientX, y: e.clientY, moved: 0 });
    if (lead >= 0) return;
    lead = e.pointerId;
    base = { x: e.clientX, y: e.clientY };
    ring.style.width = ring.style.height = `${2 * S.radius + 34}px`;
    [ring, dot].forEach((el) => (place(el, base), (el.hidden = false)));
  };
  const move = (e: PointerEvent) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.x, e.clientY - f.y));
    if (e.pointerId !== lead) return;
    const at = { x: e.clientX, y: e.clientY }, tilt = stickTilt(base, at, S.radius, S.dead);
    base = tilt.base;
    [stick.x, stick.y] = [tilt.x, tilt.y];
    place(ring, base);
    place(dot, at);
  };
  const up = (e: PointerEvent) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    if (e.type === 'pointerup' && isTap(e.timeStamp - f.t, f.moved, S.tapMs, S.slopPx)) tap();
    if (e.pointerId !== lead) return;
    lead = -1;
    stick.x = stick.y = 0;
    ring.hidden = dot.hidden = true;
  };
  canvas.style.touchAction = 'none'; // no scrolling or zooming the page under the thumb
  canvas.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
}
