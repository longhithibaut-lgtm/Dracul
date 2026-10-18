// On-screen controls for touch screens, as DOM over the canvas: a stick on the left to move, action buttons on the
// right, Plein écran and Entraînement at the top right, clear of the HUD. The same thumb arc held sideways or upright
// (the stick a little smaller upright, to leave the buttons room). Only on coarse pointers (phones, tablets), so a
// laptop keeps its keyboard and mouse.

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
@media (orientation:portrait){#touch .pad{left:calc(12px + env(safe-area-inset-left,0px));width:128px;height:128px}}`;

export function controls(act: (a: Action) => void): () => void {
  if (!matchMedia('(pointer: coarse)').matches) return () => {};
  const root = document.createElement('div');
  root.id = 'touch';
  const inset = (side: 'right' | 'bottom', px: number) => `${side}:calc(${px}px + env(safe-area-inset-${side},0px))`;
  root.innerHTML = `<style>${CSS}</style><div class="pad" aria-label="Déplacement"><div class="knob"></div></div>${BUTTONS.map(([a, label, size, r, b]) =>
    `<button type="button" data-a="${a}" style="width:${size}px;height:${size}px;${inset('right', r)};${inset('bottom', b)}">${label}</button>`).join('')}
    <div class="top"><button type="button" data-a="full">Plein écran</button><button type="button" data-a="training">Entraînement</button></div>`;

  // The stick follows one finger, from wherever it lands on the pad.
  const pad = root.querySelector<HTMLElement>('.pad')!, knob = root.querySelector<HTMLElement>('.knob')!;
  let finger = -1;
  const move = (e: PointerEvent) => {
    if (e.pointerId !== finger) return;
    const r = pad.getBoundingClientRect();
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
  pad.addEventListener('pointerdown', (e) => { finger = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); });
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);

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
  const full = root.querySelector<HTMLButtonElement>('[data-a="full"]')!;
  const showFull = () => (full.hidden = !document.fullscreenEnabled || !!document.fullscreenElement);
  document.addEventListener('fullscreenchange', showFull);
  showFull();

  document.body.append(root);
  return () => {
    document.removeEventListener('fullscreenchange', showFull);
    stick.x = stick.y = 0;
    root.remove();
  };
}
