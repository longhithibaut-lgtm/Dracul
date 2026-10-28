// The fifteen necropolis foes proposed (mockup only, names provisional): their models and how each card frames them
// (fiche.mjs): W x H native, the feet row, the rest pose at F and the wind-up at A (x, y, yaw), chasm: the floor ends there.
import { corneilles, enterre, mendiant, pecheuse, gave, fouisseur, gouffre, pleureuse } from './creatures.mjs';
import { fossoyeur, chaulier, crocheteur, tireur, miroitier, tombeur, porteDalle } from './ordre.mjs';

export const FOES = [
  { fn: corneilles, W: 165, H: 120, feet: 100, F: { x: 44, y: 0, yaw: 0.3 }, A: { x: 120, y: 0, yaw: -0.3 } },
  { fn: enterre, W: 170, H: 120, feet: 92, F: { x: 44, y: 0, yaw: 0.5 }, A: { x: 122, y: -24, yaw: -0.55 } },
  { fn: mendiant, W: 170, H: 120, feet: 100, F: { x: 46, y: 0, yaw: 0.45 }, A: { x: 122, y: -14, yaw: -0.8 } },
  { fn: pecheuse, W: 270, H: 120, feet: 92, F: { x: 70, y: 0, yaw: 0.45 }, A: { x: 196, y: -10, yaw: -0.45 } },
  { fn: gave, W: 280, H: 124, feet: 96, F: { x: 84, y: 0, yaw: 1.15 }, A: { x: 200, y: -12, yaw: -0.4 } },
  { fn: fouisseur, W: 270, H: 130, feet: 114, F: { x: 72, y: 0, yaw: 0.4 }, A: { x: 200, y: -6, yaw: -0.35 } },
  { fn: gouffre, W: 400, H: 170, feet: 128, chasm: -14, F: { x: 100, y: 0, yaw: 0 }, A: { x: 300, y: 0, yaw: 0 } },
  { fn: pleureuse, W: 170, H: 120, feet: 104, F: { x: 46, y: 0, yaw: 0.3 }, A: { x: 124, y: -6, yaw: -0.5 } },
  { fn: fossoyeur, W: 180, H: 128, feet: 116, F: { x: 48, y: 0, yaw: 0.4 }, A: { x: 132, y: 0, yaw: -0.5 } },
  { fn: chaulier, W: 170, H: 120, feet: 104, F: { x: 44, y: 0, yaw: 0.4 }, A: { x: 122, y: 0, yaw: -0.6 } },
  { fn: crocheteur, W: 190, H: 132, feet: 112, F: { x: 46, y: 0, yaw: 0.4 }, A: { x: 136, y: -6, yaw: -0.6 } },
  { fn: tireur, W: 200, H: 124, feet: 108, F: { x: 46, y: 0, yaw: 0.4 }, A: { x: 132, y: -24, yaw: -1.3 } },
  { fn: miroitier, W: 190, H: 136, feet: 116, F: { x: 52, y: 0, yaw: 0.3 }, A: { x: 140, y: 0, yaw: -0.4 } },
  { fn: tombeur, W: 250, H: 170, feet: 150, F: { x: 66, y: 0, yaw: 0.35 }, A: { x: 190, y: -10, yaw: -0.6 } },
  { fn: porteDalle, W: 240, H: 140, feet: 124, F: { x: 66, y: 0, yaw: 0.35 }, A: { x: 176, y: -10, yaw: -0.6 } },
];
