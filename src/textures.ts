import Phaser from 'phaser';

// shortcut: placeholder art drawn in code, replace with real sprites in M2 (see docs/gameplan.md).
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('player')) return; // textures are global; scene restarts reuse them
  const g = scene.make.graphics({}, false);
  const draw = (key: string, w: number, h: number, paint: () => void) => {
    g.clear();
    paint();
    g.generateTexture(key, w, h);
  };

  draw('player', 28, 36, () => {
    g.fillStyle(0x2a0710).fillTriangle(2, 34, 26, 34, 14, 12); // cape
    g.fillStyle(0x6b1020).fillRoundedRect(7, 14, 14, 20, 5); // body
    g.fillStyle(0xe9e1d6).fillCircle(14, 10, 8); // pale head
    g.fillStyle(0x16090d).fillRect(6, 2, 16, 5); // hair
    g.fillStyle(0xff2a3a).fillRect(10, 9, 3, 2).fillRect(16, 9, 3, 2); // eyes
  });

  draw('ghoul', 30, 28, () => {
    g.fillStyle(0x3d4836).fillEllipse(15, 17, 28, 20); // hunched back
    g.fillStyle(0x5d6b52).fillEllipse(15, 13, 20, 16); // head
    g.fillStyle(0xffd23a).fillRect(9, 11, 4, 3).fillRect(17, 11, 4, 3); // eyes
    g.fillStyle(0xd9d2b8).fillTriangle(11, 18, 19, 18, 15, 22); // teeth
  });

  draw('pillar', 48, 64, () => {
    g.fillStyle(0x2c2632).fillRect(4, 14, 40, 50);
    g.fillStyle(0x413949).fillEllipse(24, 14, 44, 20);
    g.fillStyle(0x1c1820).fillRect(4, 56, 40, 8);
  });

  draw('floor', 64, 64, () => {
    g.fillStyle(0x17121c).fillRect(0, 0, 64, 64);
    g.fillStyle(0x1f1826).fillRect(0, 0, 64, 2).fillRect(0, 0, 2, 64).fillRect(32, 32, 32, 2);
  });

  draw('door', 80, 28, () => {
    g.fillStyle(0x221b28).fillRect(0, 0, 80, 28);
    g.fillStyle(0x3a3042).fillRect(4, 4, 72, 20);
  });

  draw('door-open', 80, 28, () => {
    g.fillStyle(0x3d0a14).fillRect(0, 0, 80, 28);
    g.fillStyle(0xc4182f).fillRect(6, 6, 68, 16);
  });

  draw('spawn', 40, 40, () => {
    g.lineStyle(3, 0xc4182f).strokeCircle(20, 20, 17);
  });

  draw('blood', 6, 6, () => {
    g.fillStyle(0xc4182f).fillCircle(3, 3, 3);
  });

  g.destroy();
}
