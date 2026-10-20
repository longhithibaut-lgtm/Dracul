# Shared layout of the FX mockups: sheet panels (640x360 native, shown x3) and the scene (960x540, shown x2).
# Positions are screen pixels on the hero's grid (the torture room's 960x540); feet = soles' contact point.
import json, os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../..')
DATA = open(os.path.join(ROOT, 'src/grand.data.ts')).read()
FRAMES = json.loads(re.search(r'FRAMES[^=]*= (\{.*\});', DATA).group(1))
S38, C38 = 0.6156615, 0.7880108  # sin/cos of the 38 degree camera

def lamp(cell, x, y, flip=False):
    lx, ly = FRAMES[cell]['lamp']
    return (x + ((60 - lx) if flip else (lx - 60)), y + (ly - 102))

# sheet panels: id, rect, world offset for the floor, heroes [cell, x, feet y, flip], ghouls [x, y, yaw, variant, seed], prey
H1, H2, H3 = 14 + 104, 144 + 92, 248 + 100
PI2 = 1.5707963
SHEET = dict(W=640, H=360, panels=[
  dict(id='c1', r=[0, 14, 160, 130], w=[420, 640], heroes=[['side-claw0-1', 72, H1]]),
  dict(id='c2', r=[160, 14, 160, 130], w=[560, 800], heroes=[['side-claw1-1', 232, H1]]),
  dict(id='c3', r=[320, 14, 160, 130], w=[300, 700], heroes=[['side-claw2-1', 393, H1]]),
  dict(id='c4', r=[480, 14, 160, 130], w=[640, 900], heroes=[['side-claw0-2', 552, H1]]),
  dict(id='hit', r=[0, 144, 240, 104], w=[380, 780], heroes=[['side-claw1-1', 26, H2], ['side-claw1-2', 140, H2]],
       ghouls=[[84, H2 + 2, PI2, 1, 21], [206, H2 + 2, PI2 - 0.25, 2, 22]]),
  dict(id='mist', r=[240, 144, 400, 104], w=[600, 980], heroes=[['side-dash0', 286, H2], ['side-dash1', 440, H2], ['side-idle0', 596, H2]]),
  dict(id='shard', r=[0, 248, 250, 112], w=[350, 900], heroes=[['side-throw-1', 34, H3]], ghouls=[[192, H3 + 1, PI2, 0, 23]]),
  dict(id='glyph', r=[250, 248, 210, 112], w=[700, 760], heroes=[['side-cast-1', 274, H3 - 30]], ghouls=[[388, H3 - 22, PI2 + 0.3, 0, 24]],
       glyph=[372, H3 - 34]),
  dict(id='bite', r=[460, 248, 180, 112], w=[460, 1000], heroes=[['side-bite-1', 520, H3]], prey=[[566, H3 - 3, PI2, 11]]),
])
# the scene: the mockup's crypt, the hero where the mockup had him, the ghouls pressed around him
HERO = [470, 462]; HS = [470, round(462 * S38 + 150)]
SCENE = dict(W=960, H=540, hero=['side-claw2-1', HS[0], HS[1]],
  ghouls=[[562, 470, PI2, 1, 21], [400, 532, -2.26, 0, 22], [560, 392, 0.96, 2, 23], [300, 600, -2.0, 0, 25]])

def out():
    for p in SHEET['panels']:
        p['lamps'] = [lamp(c, x, y, *f) for c, x, y, *f in p['heroes']]
    SCENE['lamp'] = lamp(*SCENE['hero'])
    json.dump(dict(sheet=SHEET, scene=SCENE, S=S38, C=C38), open('layout.json', 'w'), indent=1)

if __name__ == '__main__':
    out()
