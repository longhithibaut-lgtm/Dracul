# Dark combat FX mockups: three directions (A « Sang », B « Ombre », C « Cendre ») drawn over the plates of plate.mjs
# with the game's real hero frames (src/grand-hero.png). Everything is on the hero's pixel grid (960x540 room), unlit
# like the game's effect layer (dark.ts), then snapped to the mockups' palette with their ordered dither.
# Run from an output folder: python3 <this dir>/layout.py; node <this dir>/plate.mjs sheet; node <this dir>/plate.mjs scene;
# python3 <this dir>/fx.py [A B C]  -> fx-<x>.png (sheet, x3) and fx-<x>-scene.png (crypt frame, x2). ~1 min in all.
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from layout import FRAMES

LAY = json.load(open('layout.json'))
PAL = np.array(json.load(open('palette.json')), float) / 255
HSHEET = np.asarray(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../src/grand-hero.png')).convert('RGBA')).astype(float) / 255
SQ = 0.72  # the ground seen at an angle (fx.ts SQUASH)


def H(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255


# ---------- noise ----------
def hash2(x, y, s=0):
    n = (np.asarray(x, np.int64) * 374761393 + np.asarray(y, np.int64) * 668265263 + s * 982451653) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return (n ^ (n >> 16)) / 4294967296.0


def vn(x, y, s=0):
    xi, yi = np.floor(x), np.floor(y)
    xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b, c, d = hash2(xi, yi, s), hash2(xi + 1, yi, s), hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm(x, y, o=3, s=0):
    t, a, f, n = 0, 0.5, 1, 0
    for i in range(o):
        t = t + a * vn(x * f, y * f, s + i * 17)
        n += a; a *= 0.5; f *= 2
    return t / n


# ---------- layers ----------
class Layer:
    """Premultiplied colour + alpha, and a darkening factor applied under it."""
    def __init__(s, h, w):
        s.h, s.w = h, w
        s.c, s.a, s.m = np.zeros((h, w, 3)), np.zeros((h, w)), np.ones((h, w))
        s.clip = (0, 0, w, h)  # effects stay inside their sheet panel

    def box(s, x0, y0, x1, y1):
        cx0, cy0, cx1, cy1 = s.clip
        x0, y0, x1, y1 = max(cx0, int(x0)), max(cy0, int(y0)), min(cx1, int(math.ceil(x1))), min(cy1, int(math.ceil(y1)))
        if x1 <= x0 or y1 <= y0:
            return None
        Y, X = np.mgrid[y0:y1, x0:x1]
        return (slice(y0, y1), slice(x0, x1)), X + 0.0, Y + 0.0

    def over(s, sl, col, a):
        a = np.clip(a, 0, 1)
        col = np.broadcast_to(col, a.shape + (3,))
        s.c[sl] = col * a[..., None] + s.c[sl] * (1 - a[..., None])
        s.a[sl] = a + s.a[sl] * (1 - a)

    def dark(s, sl, k):
        s.m[sl] *= np.clip(k, 0, 1)

    def px(s, x, y, col, a=1.0):
        x, y = int(round(x)), int(round(y))
        if s.clip[0] <= x < s.clip[2] and s.clip[1] <= y < s.clip[3]:
            s.c[y, x] = col * a + s.c[y, x] * (1 - a)
            s.a[y, x] = a + s.a[y, x] * (1 - a)

    def apply(s, img):
        img *= s.m[..., None]
        img[:] = img * (1 - s.a[..., None]) + s.c


def line(L, x0, y0, x1, y1, colf, a=1.0, w=1):
    n = max(1, int(math.ceil(max(abs(x1 - x0), abs(y1 - y0)))))
    for i in range(n + 1):
        k = i / n
        c = colf(k)
        if c is None:
            continue
        x, y = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
        L.px(x, y, c, a)
        if w > 1:
            L.px(x, y + 1, c, a)


# ---------- the hero sprite ----------
def cell(name):
    c = FRAMES[name]['cell']
    return HSHEET[(c // 17) * 120:(c // 17) * 120 + 120, (c % 17) * 120:(c % 17) * 120 + 120]


def sprite(img, name, x, y, recolor=None, flip=False):
    sp = cell(name).copy()
    if flip:
        sp = sp[:, ::-1]
    if recolor is not None:
        sp = recolor(sp)
    x0, y0 = int(x) - 60, int(y) - 102
    h, w = img.shape[:2]
    ys, xs = slice(max(0, y0), min(h, y0 + 120)), slice(max(0, x0), min(w, x0 + 120))
    s = sp[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
    a = s[..., 3:4]
    img[ys, xs] = img[ys, xs] * (1 - a) + s[..., :3] * a


def ramp(stops, t):
    """Colour along a list of hex stops, t in [0, 1] (array ok)."""
    cs = np.array([H(c) for c in stops])
    t = np.clip(np.asarray(t, float), 0, 1) * (len(cs) - 1)
    k = np.minimum(len(cs) - 2, np.floor(t)).astype(int)
    f = (t - k)[..., None]
    return cs[k] * (1 - f) + cs[k + 1] * f


def mist_recolor(stops):
    """The dash frames' turquoise mist, re-dyed onto a style's ramp by its brightness."""
    def f(sp):
        sp = sp.copy()
        r, g, b = sp[..., 0], sp[..., 1], sp[..., 2]
        m = (b > r + 0.06) & (g > r + 0.04) & (sp[..., 3] > 0)
        lum = (0.3 * r + 0.59 * g + 0.11 * b)
        sp[m, :3] = ramp(stops, np.clip((lum[m] - 0.12) / 0.6, 0, 1))
        return sp
    return f


def ghost(L, name, x, y, k, col, a0, seed, rise=True):
    """An afterimage of a frame, filled with `col`, breaking up from the feet as k goes 0..1 (dithered, no blend)."""
    sp = cell(name)[..., 3] > 0
    ys, xs = np.nonzero(sp)
    n = fbm(xs / 4.0, ys / 4.0, 2, seed)
    keep = (1.25 - k * 0.9 - (ys / 102) * k * 0.9 + (n - 0.5) * 0.8) > hash2(xs, ys, seed)
    for cx, cy in zip(xs[keep], ys[keep]):
        L.px(x - 60 + cx, y - 102 + cy - (k * 3 if rise else 0), col, a0)


# ---------- swing geometry (fx.ts crescent) ----------
def swing_field(X, Y, ox, oy, aim, d, a0, a1):
    gx, gy = X + 0.5 - ox, (Y + 0.5 - oy) / SQ
    ang = np.angle(np.exp(1j * (np.arctan2(gy, gx) - aim)))
    u = (d * ang - a0) / (a1 - a0)
    return u, np.hypot(gx, gy), gy


def arc_pt(ox, oy, aim, d, a, r):
    t = aim + d * a
    return ox + math.cos(t) * r, oy + math.sin(t) * r * SQ


# ---------- styles ----------
BLOOD = ['#120204', '#260407', '#3e060b', '#5a0a10', '#781116', '#951c18', '#b42c1e']
VIOLET = ['#030303', '#120c16', '#211628', '#33203c', '#4a2c56', '#64406e']
BONE = ['#8c7e64', '#ad9e80', '#cfc2a2', '#ece2c6']
ASH = ['#1a1611', '#2b251d', '#3e362b', '#544a3b', '#6e624e', '#8c7e64', '#ad9e80']
EMBER = ['#2a1206', '#5a2a0e', '#8a4516', '#c06a20', '#e8a040']
FOG = ['#1a2124', '#2b3436', '#3c4626', '#435052', '#66706e', '#959c94']
MIST_RAMP = {'A': ['#120204', '#120204', '#260407', '#3e060b', '#5a0a10'], 'B': ['#030303', '#030303', '#0c0a08', '#120c16', '#211628', '#33203c'],
             'C': ['#1a2124', '#2b3436', '#3c4626', '#435052', '#535d31', '#66706e']}


class FX:
    def __init__(s, st, h, w, seed=1):
        s.st, s.F, s.B, s.T = st, Layer(h, w), Layer(h, w), Layer(h, w)
        s.rng = np.random.default_rng(seed)
        s.tints = []  # (mask, colour, amount): enemy flashes, applied to the plate

    # ----- the claw swing -----
    def slash(s, x, feet, angle, combo, k=0.0):
        """Claw swing at its strongest frame (k: 0 at the end of the swing, up to 1 faded). Aim angle on screen."""
        st, rnd = s.st, s.rng
        heavy, mist = combo == 2, combo == 3
        d = -1 if combo == 1 else 1
        R = 70 if heavy else 54
        n = 4 if heavy or mist else 3
        a0 = math.radians(-170 if heavy else -150 if mist else -125)
        a1 = math.radians(50 if heavy else 40 if mist else 30)
        ox, oy = x, feet - 28
        aim = math.atan2(math.sin(angle) / SQ, math.cos(angle))
        head, tail = 1.0, 0.04 + 0.5 * k
        r = R + 6
        b = s.T.box(ox - r - 14, oy - r * SQ - 14, ox + r + 15, oy + r * SQ + 15)
        sl, X, Y = b
        u, rad, gy = swing_field(X, Y, ox, oy, aim, d, a0, a1)
        lenpx = (a1 - a0) * R
        inside = (u >= tail) & (u <= head)
        q = np.clip((head - u) / (head - tail), 0, 1)  # 0 at the blade, 1 at the end of the tail
        front = np.clip((head - u) * lenpx / 5, 0, 1) ** 0.5
        back = gy < 0
        sp = (3.8 if heavy else 3.1) * (1.35 if st == 'B' else 1)
        W = sp * n + 2
        depth = R - rad
        col, al = np.zeros(X.shape + (3,)), np.zeros(X.shape)
        dk = np.ones(X.shape)

        def gash(i, wmax, jag=0.0, seed=0, signed=False):
            off = 1.5 + i * sp + (i * 0.6 if heavy else 0)
            u_i0, u_i1 = tail + 0.05 * i + 0.04 * hash2(i, 3, 9), head - 0.03 * i - 0.03 * hash2(i, 5, 9)
            qi = np.clip((u_i1 - u) / (u_i1 - u_i0), 0, 1)
            wi = wmax * np.clip((u_i1 - u) * lenpx / 6, 0, 1) ** 0.5 * (0.35 + 0.65 * (1 - qi) ** 1.2)
            j = (vn(u * lenpx / 7, i * 7.0, seed) - 0.5) * jag + (vn(u * lenpx / 2, i * 3.0, seed + 1) - 0.5) * jag * 0.3
            m = (np.abs(depth - off - j) < wi / 2 + 0.15) & (u >= u_i0) & (u <= u_i1)
            if signed:
                return m, qi, np.abs(depth - off - j) - wi / 2, depth - off - j
            return m, qi, np.abs(depth - off - j) - wi / 2

        band = inside & (depth > -1) & (depth < W)
        if st == 'A':
            # a wet dark sweep, brush-streaked, then the gashes, the leading edge glistening
            streak = vn(u * lenpx / 2.5, depth * 0.9, 5)
            sweep = band & (streak > 0.25 + 0.6 * q)
            dk[sweep] *= 0.55 + 0.3 * q[sweep]
            al[sweep], col[sweep] = 0.5 * (1 - q[sweep]) ** 1.3, H('#3e060b')
            for i in range(n):
                m, qi, e = gash(i, (2.8 if heavy else 2.3) - 0.3 * i, 1.6, i)
                c = ramp(['#5a0a10', '#781116', '#951c18'], np.clip(1 - qi[m] * 1.25, 0, 1) * (1 - 0.2 * i))
                dith = ((X[m] + Y[m]).astype(int) & 1) == 1
                keep = ~((qi[m] > 0.8) & dith)
                idx = np.argwhere(m)[keep]
                col[idx[:, 0], idx[:, 1]] = c[keep]
                al[idx[:, 0], idx[:, 1]] = 1
                lead = m & (e > -0.9) & (qi < 0.22) & (depth - (1.5 + i * sp) < 0) & (i < 2)
                col[lead], al[lead] = H('#b42c1e'), 1
            # the spray: droplets flung off the claws, farther the older the part of the arc they left
            for _ in range(70 if heavy else 40):
                uu = head - (head - tail) * rnd.random() ** 1.6
                age = (head - uu) / (head - tail)
                rr = R - rnd.uniform(0, W) + 3 + age * rnd.uniform(6, 22 if heavy else 16)
                a_ = a0 + uu * (a1 - a0) + d * age * rnd.uniform(0, 0.12)
                px_, py_ = arc_pt(ox, oy, aim, d, a_, rr)
                fall = age * age * rnd.uniform(4, 14)
                L = s.B if math.sin(aim + d * a_) < 0 else s.T
                c = H(BLOOD[rnd.choice([3, 4, 4, 5])])
                if rnd.random() < 0.35:  # a streak, stretched along the swing
                    t = aim + d * a_ + d * math.pi / 2
                    line(L, px_, py_ + fall, px_ - math.cos(t) * 3, py_ + fall - math.sin(t) * 2, lambda kk: c if kk < 0.6 else H(BLOOD[2]))
                else:
                    L.px(px_, py_ + fall, c)
                    if rnd.random() < 0.3:
                        L.px(px_ + 1, py_ + fall, H(BLOOD[2]))
            # on the floor below the arc, what already fell
            for _ in range(30 if heavy else 14):
                a_ = a0 + rnd.random() * (a1 - a0)
                fx_, fy_ = arc_pt(ox, feet, aim, d, a_, R * rnd.uniform(0.8, 1.15))
                s.F.px(fx_, fy_, H(BLOOD[rnd.choice([1, 2, 2, 3])]))
                if rnd.random() < 0.4:
                    s.F.px(fx_ + 1, fy_, H(BLOOD[1]))
        elif st == 'B':
            # the lantern's light dies around the rip; the rips are black, their outer lips catch a little violet
            halo = inside & (depth > -5) & (depth < W + 5)
            soft = np.clip(1 - np.maximum(-depth, depth - W) / 5, 0, 1) * (0.6 + 0.4 * vn(X / 3, Y / 3, 44))
            dk[halo] *= 1 - 0.7 * (1 - q[halo]) ** 0.8 * soft[halo]
            for i in range(n):
                m, qi, e, sg = gash(i, (6.5 if heavy else 5.5) - 0.9 * i, 3.2, 11 + i, signed=True)
                m &= vn(X / 1.3, Y / 1.3, 50 + i) > 0.12 + 0.3 * (e > -1.2)  # ragged lips
                # the tear closes back from its tail: there it is only a broken seam
                gap = (qi > 0.62) & (vn(u * lenpx / 1.6, i * 5.0, 77) < 0.45)
                mm = m & ~gap
                lip = mm & (e > -0.9) & (sg < 0) & (qi < 0.7)
                col[mm], al[mm] = H('#030303'), 1
                col[lip] = ramp(['#211628', '#33203c', '#4a2c56', '#64406e'], np.clip(1 - qi[lip] / 0.7, 0, 1))
            # torn strands hanging from the rips, and ink peeling off them
            for _ in range(40 if heavy else 24):
                uu = head - (head - tail) * rnd.random() ** 1.2
                age = (head - uu) / (head - tail)
                a_ = a0 + uu * (a1 - a0)
                i = rnd.integers(n)
                rr = R - 1.5 - i * sp - (1 if age < 0.5 else 0)
                px_, py_ = arc_pt(ox, oy, aim, d, a_, rr)
                L = s.B if math.sin(aim + d * a_) < 0 else s.T
                ln = int(rnd.uniform(2, 7) * (1 - age * 0.6))
                sway = rnd.uniform(-0.5, 0.5)
                for j in range(ln):
                    L.px(px_ + sway * j, py_ + 1 + j, H('#030303' if j < ln - 1 else '#120c16'), 0.95)
            for _ in range(18 if heavy else 10):
                uu = head - (head - tail) * rnd.random() ** 1.3
                age = (head - uu) / (head - tail)
                a_ = a0 + uu * (a1 - a0)
                rr = R + 1 + age * rnd.uniform(2, 9)
                px_, py_ = arc_pt(ox, oy, aim, d, a_, rr)
                L = s.B if math.sin(aim + d * a_) < 0 else s.T
                ph = rnd.uniform(0, 6)
                for j in range(int(3 + age * 6)):
                    if j > 3 and j % 2:
                        continue
                    L.px(px_ + j * 0.7 * math.cos(ph), py_ - j * 0.6 + math.sin(ph + j) * 1.0, H('#030303' if j < 3 else '#120c16'), 0.9)
        else:  # C: a smear of ash with soot gashes, embers dying along the claws
            nz = fbm(X / 3.0, Y / 3.0, 3, 21)
            streak = vn(u * lenpx / 2.0, depth * 0.7, 9)
            ash = band & (nz * 0.6 + streak * 0.6 > 0.35 + 0.55 * q)
            al[ash] = (0.85 - 0.5 * q[ash])
            col[ash] = ramp(ASH[2:], np.clip(0.95 - q[ash] * 0.9 + (streak[ash] - 0.5) * 0.4, 0, 1))
            for i in range(n):
                m, qi, e = gash(i, 2.0 if heavy else 1.6, 0.8, 30 + i)
                dith = ((X[m] + Y[m]).astype(int) & 1) == 1
                keep = ~((qi[m] > 0.6) & dith)
                idx = np.argwhere(m)[keep]
                col[idx[:, 0], idx[:, 1]] = ramp(['#0c0a08', '#1a1611', '#2b251d'], qi[m][keep])
                al[idx[:, 0], idx[:, 1]] = 1
                # the claws' tips still smoulder: ember along the first stretch of each gash
                hot = m & (qi < 0.12) & (i < 2)
                col[hot] = ramp(EMBER[1:4], np.clip(1 - qi[hot] / 0.12, 0, 1) * (0.7 if i else 1))
                spark = m & (hash2(X, Y, 5 + i) < 0.07) & (qi < 0.6)
                col[spark] = H(EMBER[1])
            # ash flakes and a few dying sparks
            for _ in range(60 if heavy else 32):
                uu = head - (head - tail) * rnd.random() ** 1.2
                age = (head - uu) / (head - tail)
                a_ = a0 + uu * (a1 - a0)
                rr = R - rnd.uniform(-2, W) + age * rnd.uniform(0, 8)
                px_, py_ = arc_pt(ox, oy, aim, d, a_, rr)
                py_ += -age * rnd.uniform(0, 6)
                L = s.B if math.sin(aim + d * a_) < 0 else s.T
                if rnd.random() < 0.1 and age < 0.5:
                    L.px(px_, py_, H(EMBER[rnd.choice([1, 2, 2, 3])]))
                else:
                    L.px(px_, py_, H(ASH[rnd.choice([4, 5, 5, 6])]), 0.9)
            for _ in range(24 if heavy else 10):  # ash settling on the floor
                a_ = a0 + rnd.random() * (a1 - a0)
                fx_, fy_ = arc_pt(ox, feet, aim, d, a_, R * rnd.uniform(0.8, 1.1))
                s.F.px(fx_, fy_, H(ASH[rnd.choice([3, 4, 5])]), 0.8)
        if mist:  # the dash strike's tail is the mist it came out of
            tailm = band & (q > 0.45)
            nz = fbm(X / 4.0, Y / 4.0, 3, 3)
            cl = tailm & (nz > 0.42 + 0.3 * (1 - q))
            col[cl] = ramp(MIST_RAMP[st], np.clip(nz[cl] * 1.4 - 0.4, 0, 1))
            al[cl] = 0.75 if st != 'C' else 0.55
        # split behind / in front of the hero
        for L, m in ((s.B, back), (s.T, ~back)):
            L.dark(tuple(sl), np.where(m, dk, 1))
            L.over(tuple(sl), col, np.where(m, al, 0))
        if heavy:  # the finisher's mark on the floor
            s.floor_mark(ox, feet, aim, d, R, a0, a1)
        return ox, oy

    def floor_mark(s, ox, feet, aim, d, R, a0, a1):
        st, rnd = s.st, s.rng
        b = s.F.box(ox - R - 8, feet - R * SQ - 8, ox + R + 8, feet + R * SQ + 8)
        sl, X, Y = b
        u, rad, gy = swing_field(X, Y, ox, feet, aim, d, a0 + 0.6, a1)
        m = (u > 0.05) & (u < 1) & (np.abs(rad - R * 0.9) < 2.5 + 2 * vn(X / 3, Y / 3, 4))
        nz = vn(X / 2, Y / 2, 8)
        m &= nz > 0.35
        if st == 'A':
            s.F.over(sl, ramp(BLOOD[1:4], nz), np.where(m, 0.9, 0))
        elif st == 'B':
            s.F.dark(sl, np.where(m, 0.25, 1))
        else:
            s.F.over(sl, ramp(['#0c0a08', '#1a1611', '#2b251d'], nz), np.where(m, 0.85, 0))
            hot = m & (nz > 0.8) & (u > 0.7)
            s.F.over(sl, H(EMBER[1]), np.where(hot, 1, 0))

    # ----- a blow lands -----
    def hit(s, ix, iy, angle, heavy, mask=None, floor_y=None):
        st, rnd = s.st, s.rng
        ca, sa = math.cos(angle), math.sin(angle)
        fy = floor_y if floor_y is not None else iy + 20
        if mask is not None:  # the flash spreads from the wound over the struck body, not all of it
            Yg, Xg = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
            mask = mask * np.clip(1.35 - np.hypot(Xg - ix, (Yg - iy) * 1.3) / (24 if heavy else 18), 0, 1) ** 0.8
        if st == 'A':
            if mask is not None:
                s.tints.append((mask, None, 0.9))
            # the wound bursts: a dark clot at the meeting point, a cone of blood thrown with the blow
            for _ in range(36 if heavy else 24):
                a = angle + rnd.normal(0, 0.55)
                dist = rnd.uniform(3, 18 if heavy else 13)
                ln = rnd.uniform(2, 6)
                x0, y0 = ix + math.cos(a) * dist, iy + math.sin(a) * dist * 0.8 - dist * 0.15
                c0, c1 = H(BLOOD[rnd.choice([4, 5, 5, 6])]), H(BLOOD[3])
                line(s.T, x0, y0, x0 - math.cos(a) * ln, y0 - math.sin(a) * ln * 0.8, lambda k: c0 if k < 0.4 else c1)
            b = s.T.box(ix - 6, iy - 6, ix + 7, iy + 7)
            sl, X, Y = b
            dd = np.hypot(X - ix, (Y - iy) * 1.2) + (vn(X / 1.5, Y / 1.5, 2) - 0.5) * 3
            s.T.over(sl, np.where((dd < 2)[..., None], H('#781116'), H('#3e060b')), np.where(dd < (4.5 if heavy else 3.5), 1, 0))
            s.T.px(ix - 1, iy - 1, H('#b42c1e')); s.T.px(ix + 1, iy - 2, H('#b42c1e'))
            # jets that streak the floor beyond the enemy, and the gush
            for _ in range(9 if heavy else 6):
                a = angle + rnd.normal(0, 0.3)
                dist = rnd.uniform(14, 34)
                x0, y0 = ix + ca * 6 + math.cos(a) * dist, fy + math.sin(a) * dist * 0.5
                line(s.F, x0, y0, x0 + math.cos(a) * rnd.uniform(3, 7), y0 + math.sin(a) * 2, lambda k: H(BLOOD[3]) if k < 0.5 else H(BLOOD[2]))
            s.puddle(ix + ca * 10, fy + sa * 4, 7 if heavy else 5, BLOOD[1:5])
        elif st == 'B':
            if mask is not None:
                s.tints.append((mask, None, 0.9))
            # a dark burst: ragged spikes of ink, mostly along the blow, lips of violet; bone-white flecks fly out
            b = s.T.box(ix - 24, iy - 20, ix + 25, iy + 21)
            sl, X, Y = b
            dx, dy = X + 0.5 - ix, (Y + 0.5 - iy) * 1.15
            r, a = np.hypot(dx, dy), np.arctan2(dy, dx)
            rel = np.angle(np.exp(1j * (a - angle)))
            spikes = np.abs(np.sin(a * 3.5 + 1.3)) ** 3 * (0.4 + vn(a * 4, 0, 7)) + 0.25 * np.abs(np.sin(a * 11 + 0.4)) ** 4
            reach = (3 if heavy else 2.5) + (22 if heavy else 16) * spikes * (0.3 + 0.7 * np.exp(-rel ** 2 / 0.9))
            body = r < reach
            lip = body & (r > reach - 1.3) & (r > 3)
            s.T.dark(sl, np.where(r < reach + 6, 1 - 0.5 * np.clip(1 - (r - reach) / 6, 0, 1), 1))
            s.T.over(sl, H('#030303'), np.where(body & ~lip, 1, 0))
            s.T.over(sl, H('#33203c'), np.where(lip, 1, 0))
            for _ in range(12 if heavy else 8):
                a = angle + rnd.normal(0, 0.9)
                dist = rnd.uniform(8, 22 if heavy else 17)
                x0, y0 = ix + math.cos(a) * dist, iy + math.sin(a) * dist * 0.85
                s.T.px(x0, y0, H(BONE[rnd.choice([2, 3])]))
                if rnd.random() < 0.4:
                    s.T.px(x0 - math.cos(a), y0 - math.sin(a), H(BONE[0]))
            # its shadow on the floor
            s.stain(ix + ca * 8, fy + sa * 3, 9 if heavy else 7, 4, lambda nz: None, dark=0.35)
        else:  # C
            if mask is not None:
                s.tints.append((mask, None, 0.9))
            # the flesh crumbles: a puff of ash thrown with the blow, soot at its heart, a few dying sparks
            b = s.T.box(ix - 22, iy - 18, ix + 23, iy + 16)
            sl, X, Y = b
            cx, cy = ix + ca * 5, iy + sa * 4 - 2
            dx, dy = X - cx, (Y - cy) * 1.25
            r = np.hypot(dx - ca * 3, dy) + (fbm(X / 3, Y / 3, 3, 12) - 0.5) * 9
            R0 = 14 if heavy else 10
            puff = r < R0
            shade = np.clip((dy / R0) * 0.5 + 0.5 + (fbm(X / 2, Y / 2, 2, 13) - 0.5), 0, 1)
            s.T.over(sl, ramp(ASH[3:], 1 - shade), np.where(puff, 0.85, 0))
            s.T.over(sl, ramp(['#0c0a08', '#1a1611', '#2b251d'], r / (R0 * 0.5)), np.where(r < R0 * 0.5, 0.95, 0))
            for _ in range(10 if heavy else 6):
                a = angle + rnd.normal(0, 0.8)
                dist = rnd.uniform(9, 22)
                x0, y0 = ix + math.cos(a) * dist, iy + math.sin(a) * dist * 0.8
                c = H(EMBER[rnd.choice([2, 3, 3, 4])])
                line(s.T, x0, y0, x0 - math.cos(a) * 2, y0 - math.sin(a) * 2, lambda k: c if k < 0.5 else H(EMBER[1]))
            for _ in range(26 if heavy else 16):
                a = angle + rnd.normal(0, 1.0)
                dist = rnd.uniform(6, 26)
                s.T.px(ix + math.cos(a) * dist, iy + math.sin(a) * dist * 0.7 + dist * 0.2, H(ASH[rnd.choice([4, 5, 6])]), 0.9)
            s.ashpile(ix + ca * 6, fy + 1, 6 if heavy else 4)

    def puddle(s, x, y, rx, stops):
        ry = rx * 0.55
        b = s.F.box(x - rx - 3, y - ry - 3, x + rx + 4, y + ry + 4)
        sl, X, Y = b
        d = np.hypot((X - x) / rx, (Y - y) / ry) + (vn(X / 2, Y / 2, 5) - 0.5) * 0.6
        s.F.over(sl, ramp(stops, np.clip(1 - d, 0, 1) * 0.9), np.where(d < 1, 1, 0))
        s.F.px(x - rx * 0.3, y - ry * 0.3, H('#951c18'))

    def stain(s, x, y, rx, ry, colf, dark=1.0):
        b = s.F.box(x - rx - 3, y - ry - 3, x + rx + 4, y + ry + 4)
        sl, X, Y = b
        d = np.hypot((X - x) / rx, (Y - y) / ry) + (vn(X / 2, Y / 2, 6) - 0.5) * 0.7
        if dark < 1:
            s.F.dark(sl, np.where(d < 1, dark + (1 - dark) * np.clip(d, 0, 1) ** 3, 1))

    def ashpile(s, x, y, r):
        b = s.F.box(x - r - 3, y - r - 3, x + r + 4, y + 3)
        sl, X, Y = b
        d = np.hypot((X - x) / r, (Y - y) / (r * 0.45)) + (vn(X / 1.5, Y / 1.5, 7) - 0.5) * 0.6
        s.F.over(sl, ramp(ASH[2:6], np.clip(1 - d, 0, 1) + (Y < y) * 0.2), np.where((d < 1) & (Y <= y + 1), 0.95, 0))

    # ----- the mist dash -----
    def cloud(s, L, x, y, rx, ry, density, seed, stops, alpha=0.9, drip=0):
        b = L.box(x - rx - 2, y - ry - 2, x + rx + 3, y + ry + 3)
        sl, X, Y = b
        e = np.hypot((X - x) / rx, (Y - y) / ry)
        nz = fbm(X / 4.5, Y / 3.5, 3, seed)
        v = nz + (1 - e) * 0.6 - (1 - density) * 0.6
        m = v > 0.55
        tone = np.clip((v - 0.55) * 2.2 + (y - Y) / (ry * 4), 0, 1)  # lighter on top
        dith = (((X + Y).astype(int) & 1) == 1) & (v < 0.62)
        L.over(sl, ramp(stops, tone), np.where(m & ~dith, alpha, 0))
        for _ in range(drip):  # A: clots hanging and dripping from the vapour
            dx = s.rng.uniform(-rx * 0.7, rx * 0.7)
            ln = int(s.rng.uniform(1, 5))
            for j in range(ln):
                L.px(x + dx, y + ry * 0.5 + j, H(BLOOD[3] if j < ln - 1 else BLOOD[4]))

    def plume(s, L, xa, xb, yc, h0, h1, seed, faint=False):
        st = s.st
        stops = {'A': ['#120204', '#260407', '#3e060b', '#5a0a10', '#781116'], 'B': ['#030303', '#030303', '#0c0a08', '#211628', '#4a2c56'],
                 'C': ['#2b3436', '#3c4626', '#435052', '#535d31', '#66706e', '#959c94']}[st]
        hm = max(h0, h1)
        b = L.box(min(xa, xb) - 4, yc - hm * 1.8 - 6, max(xa, xb) + 4, yc + hm * 1.5 + 6)
        sl, X, Y = b
        t = np.clip((X - xa) / (xb - xa), 0, 1)
        hh = h0 + (h1 - h0) * t
        yy = yc + np.sin(t * 6 + seed) * 3 * (1 - t) - (1 - t) * 5  # it rises as it ages
        e = (Y - yy) / hh
        nz = fbm(X / 5, Y / 3.5, 3, seed)
        curl = fbm(X / 2.5, Y / 2.5, 2, seed + 3)
        v = nz * 0.8 + curl * 0.35 + (1 - np.abs(e)) * 0.9 - 0.7 - (1 - t) * 0.2 - faint * 0.15
        v *= np.clip(np.minimum(X - xa, xb - X) / 6, 0, 1)
        m = v > 0.32
        tone = np.clip(0.55 - e * 0.45 + (curl - 0.5) * 0.9, 0, 1)
        dith = (((X + Y).astype(int) & 1) == 1) & (v < 0.4)
        a_ = {'A': 0.92, 'B': 0.95, 'C': 0.72}[st] * (0.75 if faint else 1)
        if st == 'B':
            L.dark(sl, np.where(v > 0.1, 1 - 0.5 * np.clip((v - 0.1) * 3, 0, 1), 1))
        L.over(sl, ramp(stops, tone), np.where(m & ~dith, a_, 0))
        if st == 'A':  # clots hang from it and drip
            for _ in range(10 if not faint else 4):
                x_ = s.rng.uniform(xa + 6, xb - 4)
                tt = (x_ - xa) / (xb - xa)
                y_ = yc + (h0 + (h1 - h0) * tt) * 0.7 - (1 - tt) * 5
                for j in range(int(s.rng.uniform(1, 6))):
                    L.px(x_, y_ + j, H(BLOOD[3] if j % 3 else BLOOD[4]))
                s.F.px(x_, yc + 30 + s.rng.uniform(-2, 2), H(BLOOD[2]))

    def ring(s, x, y, k, big):
        st, rnd = s.st, s.rng
        rx = (12 if big else 8) + (16 if big else 10) * (1 - (1 - k) ** 3)
        ry = rx * 0.4
        b = s.F.box(x - rx - 4, y - ry - 4, x + rx + 5, y + ry + 5)
        sl, X, Y = b
        e = np.hypot((X - x) / rx, (Y - y) / ry)
        ang = np.arctan2((Y - y) * 2.5, X - x)
        broken = hash2(np.floor((ang + 4) * 3), 7, int(x)) > (k - 0.3) * 1.6
        if st == 'A':  # a ring of thrown clots on the stone
            m = (np.abs(e - 1) < 0.16) & broken & (vn(X / 1.3, Y / 1.3, 3) > 0.45)
            s.F.over(sl, ramp(BLOOD[1:5], vn(X / 2, Y / 2, 1)), np.where(m, 1, 0))
            inner = (e < 0.8) & (vn(X / 2.5, Y / 2.5, 9) > 0.7)
            s.F.over(sl, H(BLOOD[1]), np.where(inner, 0.8, 0))
        elif st == 'B':  # a pool of shadow spreading under him, a thin violet lip
            s.F.dark(sl, np.where(e < 1, 0.3 + 0.5 * e ** 2, 1))
            m = (np.abs(e - 1) < 0.09) & broken
            s.F.over(sl, H('#33203c'), np.where(m, 1, 0))
        else:  # fog rolling outward on the floor
            m = (e > 0.55) & (e < 1.15) & (fbm(X / 3, Y / 2, 2, 5) > 0.35 + 0.3 * abs(e - 0.85) * 3)
            s.F.over(sl, ramp(FOG[2:], fbm(X / 4, Y / 3, 2, 6)), np.where(m, 0.55 * (1 - k * 0.6), 0))

    def dash(s, img, pts, cells, recolor):
        """Start, middle, arrival: rings at both ends, afterimages along the way, the vapour."""
        st, rnd = s.st, s.rng
        (x0, y0), (xm, ym), (x1, y1) = pts
        s.ring(x0, y0 + 1, 0.55, True)
        s.ring(x1, y1 + 1, 0.15, False)
        ramp_ = MIST_RAMP[st]
        gcol = {'A': H('#260407'), 'B': H('#030303'), 'C': H('#66706e')}[st]
        ga = {'A': 0.55, 'B': 0.7, 'C': 0.35}[st]
        for i, gx in enumerate(np.linspace(x0 + 36, xm - 30, 2)):
            ghost(s.B, 'side-run1', gx, y0, 0.75 - i * 0.2, gcol, ga, 11 + i)
        ghost(s.B, 'side-run1', xm + 50, y0, 0.45, gcol, ga, 21)
        # the vapour he leaves: one plume, thick at his heels, thinning and breaking up behind
        s.plume(s.B, x0 - 8, xm + 6, y0 - 38, 8, 22, 41)
        s.plume(s.B, xm + 14, x1 - 6, y0 - 40, 14, 7, 42, faint=True)
        # the arrival: wisps converging on him as he takes shape again
        for _ in range(14):
            a = rnd.uniform(-math.pi, 0.4)
            r0 = rnd.uniform(10, 20)
            sx_, sy_ = x1 + math.cos(a) * r0, y1 - 34 + math.sin(a) * r0 * 0.9
            line(s.T, sx_, sy_, sx_ - math.cos(a) * 4, sy_ - math.sin(a) * 4, lambda k: H(ramp_[2]) if k < 0.5 else H(ramp_[3]), 0.85)

    # ----- Le Tir -----
    def shard(s, x0, y0, hx, hy, tx, ty, target_mask):
        """Flicked from the hand (x0, y0), its point now at (hx, hy), it will strike at (tx, ty)."""
        st, rnd = s.st, s.rng
        ang = math.atan2(hy - y0, hx - x0)
        c, si = math.cos(ang), math.sin(ang)
        ln_ = min(46, math.hypot(hx - x0, hy - y0) - 4)
        tail = (hx - c * ln_, hy - si * ln_)
        def needle(L, body, top, under, tip, ln=13, w=3):
            # a sliver ln px long, w thick in the middle, pointed both ends; top edge lit, underside in shadow
            for j in range(ln + 1):
                k = j / ln
                th = max(1, round(w * math.sin(math.pi * min(1, k * 1.15)) ** 0.7))
                x_, y_ = hx - c * (ln - j), hy - si * (ln - j)
                for t in range(th):
                    col = top if t == 0 else under if t == th - 1 and th > 2 else body
                    L.px(x_, y_ - th // 2 + t, col)
            L.px(hx + c, hy + si, tip)
        if st == 'A':
            # a smear of blood hanging in the air behind it, dripping
            for j in range(40):
                k = j / 40
                x_, y_ = tail[0] + (hx - tail[0]) * k, tail[1] + (hy - tail[1]) * k
                if k < 0.5 and j % 2:
                    continue
                s.T.px(x_, y_, H(BLOOD[2] if k < 0.6 else BLOOD[3]))
                if k > 0.55:
                    s.T.px(x_, y_ + 1, H(BLOOD[1]))
            for j in range(6):
                px_ = hx - c * (14 + j * 6 + rnd.uniform(0, 3))
                fall = 2 + j * j * 0.7 + rnd.uniform(0, 2)
                s.T.px(px_, hy + fall, H(BLOOD[3]))
                if j % 2:
                    s.T.px(px_, hy + fall - 1, H(BLOOD[2]))
                s.F.px(px_ - 2, hy + 23 + rnd.uniform(-1, 1), H(BLOOD[2]))
            needle(s.T, H(BLOOD[4]), H(BLOOD[6]), H(BLOOD[1]), H(BLOOD[6]), 16, 4)
        elif st == 'B':
            # black needle, violet lip, a single bone-white point; a ribbon of black smoke behind
            for j in range(44):
                k = j / 44
                px_, py_ = tail[0] + (hx - tail[0]) * k, tail[1] + (hy - tail[1]) * k + math.sin(k * 14 + 1) * 1.8 * (1 - k)
                if k < 0.45 and j % 2:
                    continue
                s.T.px(px_, py_, H('#030303' if k > 0.45 else '#120c16'), 0.95)
                if k > 0.6:
                    s.T.px(px_, py_ + 1, H('#030303'), 0.9)
                    s.T.px(px_, py_ - 1, H('#120c16'), 0.7)
            b2 = s.T.box(hx - 26, hy - 9, hx + 5, hy + 9)
            sl2, X2, Y2 = b2
            dd = np.hypot((X2 - (hx - 8)) / 16, (Y2 - hy) / 6)
            s.T.dark(sl2, np.where(dd < 1, 0.35 + 0.65 * dd ** 2, 1))
            needle(s.T, H('#030303'), H('#64406e'), H('#030303'), H(BONE[3]), 16, 4)
        else:
            # a cinder: charcoal sliver, an ember at its point, smoke and sparks falling behind
            b = s.T.box(tail[0] - 4, min(hy, tail[1]) - 10, hx + 2, max(hy, tail[1]) + 6)
            sl, X, Y = b
            along = (X - tail[0]) / (hx - tail[0])
            wob = (Y - (tail[1] + (hy - tail[1]) * along)) + np.sin(along * 9) * 2 * (1 - along)
            nz = fbm(X / 3, Y / 2, 2, 31)
            m = (along > 0) & (along < 0.82) & (np.abs(wob) < 1 + (1 - along) * 3) & (nz > 0.3 + (1 - along) * 0.4)
            s.T.over(sl, ramp(ASH[3:7], nz), np.where(m, 0.8, 0))
            for j in range(5):
                px_ = hx - c * (14 + j * 7)
                s.T.px(px_, hy - si * (14 + j * 7) + 2 + j * 1.5, H(EMBER[2] if j < 2 else EMBER[1]))
            needle(s.T, H('#8c7e64'), H('#cfc2a2'), H('#2b251d'), H(EMBER[4]), 16, 4)
            for j in range(1, 6):
                s.T.px(hx - c * j, hy - si * j, H(EMBER[3] if j < 3 else EMBER[2]))
        # the impact on the target (a second shard, shown landing)
        s.hit(tx, ty, ang, False, target_mask, floor_y=ty + 20)

    # ----- Le Glyphe -----
    def glyph(s, cx, cy, bound=None, rx=60):
        st, rnd = s.st, s.rng
        ry = rx * SQ
        b = s.F.box(cx - rx - 4, cy - ry - 4, cx + rx + 5, cy + ry + 5)
        sl, X, Y = b
        e = np.hypot((X + 0.5 - cx) / rx, (Y + 0.5 - cy) / ry)
        ang = np.arctan2((Y + 0.5 - cy) / SQ, X + 0.5 - cx)
        rim = (e <= 1) & (e > 1 - 2.2 / rx * 1.2)
        ring_ = np.abs(e - 0.72) < 0.9 / (rx * 0.72) * 1.3
        stroke = rim | ring_
        # runes in the band between the rim and the ring: angular marks, on a 2 px grid
        RUNES = ['X.X/XXX/.X./.X.', 'XX./X.X/XX./X..', 'X../XX./X.X/X..', '.X./X.X/X.X/.X.', 'X.X/.X./X.X/X..', 'XXX/.X./X.X/.X.',
                 'X../.X./..X/.X.', '.XX/X../.X./XX.', 'X.X/X.X/.X./X.X']
        runes = np.zeros(X.shape, bool)
        for i in range(14):
            a = i / 14 * 2 * math.pi + 0.1
            rr = 0.86
            rcx, rcy = cx + math.cos(a) * rx * rr, cy + math.sin(a) * ry * rr
            g = RUNES[i % len(RUNES)].split('/')
            for gy_, row in enumerate(g):
                for gx_, ch in enumerate(row):
                    if ch == 'X':
                        xx, yy = int(rcx - 2 + gx_ * 1.5), int(rcy - 3 + gy_ * 1.6)
                        runes |= (X == xx) & (Y == yy)
        # the fang triangle on the ring
        P = [(cx + math.cos(a) * rx * 0.72, cy + math.sin(a) * ry * 0.72) for a in [math.pi / 2, math.radians(210), math.radians(330)]]
        tri = np.zeros(X.shape, bool)
        for (ax, ay), (bx, by) in zip(P, P[1:] + P[:1]):
            vx, vy = bx - ax, by - ay
            t = np.clip(((X + 0.5 - ax) * vx + (Y + 0.5 - ay) * vy) / (vx * vx + vy * vy), 0, 1)
            tri |= np.hypot(X + 0.5 - ax - vx * t, Y + 0.5 - ay - vy * t) < 0.75
        allm = stroke | runes | tri
        if st != 'C':
            allm = (allm & (vn(X / 2.5, Y / 2.5, 61) > 0.2)) | (np.roll(allm, 1, 0) & (vn(X / 3, Y / 3, 62) > 0.72))
        nz = vn(X / 2, Y / 2, 17)
        if st == 'A':
            s.F.dark(sl, np.where(e < 1, 0.8, 1))
            s.F.over(sl, ramp(BLOOD[2:6], nz * 0.8 + 0.2 * (Y < cy)), np.where(allm, 1, 0))
            hl = allm & ~np.roll(allm, 1, 0)  # wet top edge of each stroke
            s.F.over(sl, H('#951c18'), np.where(hl & (nz > 0.5), 1, 0))
            # it bleeds: runnels leaking out of the rim
            for _ in range(16):
                a = rnd.uniform(0, 2 * math.pi)
                x_, y_ = cx + math.cos(a) * rx, cy + math.sin(a) * ry
                for j in range(int(rnd.uniform(2, 6))):
                    s.F.px(x_ + math.cos(a) * j, y_ + math.sin(a) * j * 0.6, H(BLOOD[2]))
        elif st == 'B':
            s.F.dark(sl, np.where(e < 1, 0.55, 1))
            s.F.over(sl, H('#030303'), np.where(allm, 1, 0))
            lipm = ~allm & (np.roll(allm, 1, 0) | np.roll(allm, -1, 1)) & (e < 1.05)
            s.F.over(sl, ramp(VIOLET[2:], nz), np.where(lipm & (nz > 0.35), 1, 0))
        else:
            near = allm | np.roll(allm, 1, 0) | np.roll(allm, -1, 0) | np.roll(allm, 1, 1) | np.roll(allm, -1, 1)
            s.F.dark(sl, np.where(near, 0.45, np.where(e < 1, 0.85, 1)))
            s.F.over(sl, ramp(ASH[3:7], nz), np.where(allm & (nz > 0.18), 1, 0))
            glow = allm & (vn(X / 3, Y / 3, 23) > 0.7)
            s.F.over(sl, ramp(EMBER[1:4], (vn(X / 3, Y / 3, 23) - 0.7) * 3.5), np.where(glow, 1, 0))
            dust = (e < 1.12) & (e > 0.92) & (vn(X / 1.2, Y / 1.2, 3) > 0.74)
            s.F.over(sl, H(ASH[4]), np.where(dust & ~allm, 0.8, 0))
        if bound is not None:  # chains from the triangle's points to what it holds
            bx, by = bound
            for (ax, ay) in P:
                n = int(math.hypot(bx - ax, by - ay))
                for j in range(n):
                    k = j / n
                    x_, y_ = ax + (bx - ax) * k, ay + (by - ay) * k - math.sin(k * math.pi) * 6
                    if st == 'A':
                        s.T.px(x_, y_, H(BLOOD[3] if j % 3 else BLOOD[5]))
                    elif st == 'B':
                        s.T.px(x_ + math.sin(j * 0.8) * 1.2, y_, H('#030303'))
                        if j % 4 == 0:
                            s.T.px(x_ + math.sin(j * 0.8) * 1.2, y_ - 1, H('#33203c'))
                    else:
                        if j % 3 == 2:
                            continue
                        s.T.px(x_, y_, H(ASH[4] if j % 3 else EMBER[2]))

    # ----- La Morsure -----
    def bite(s, mx, my, body, prey=None):
        """The fangs in the throat at (mx, my); what is drunk is pulled out of the body (around `body`)."""
        st, rnd = s.st, s.rng
        bx, by = body
        if prey is not None:
            s.tints.append((prey, 'prey', 0.55))
        for i in range(9):
            x0, y0 = bx + rnd.uniform(-7, 7), by + rnd.uniform(-4, 14)
            bend = rnd.uniform(-8, 8)
            pts = [(x0 + (mx - x0) * k + math.sin(k * math.pi) * bend, y0 + (my - y0) * k) for k in np.linspace(0, 1, 24)]
            for j, (x_, y_) in enumerate(pts):
                k = j / 23
                if st == 'A':
                    if k < 0.3 and j % 2:
                        continue
                    s.T.px(x_, y_, H(BLOOD[2] if k < 0.4 else BLOOD[3] if k < 0.75 else BLOOD[5]))
                    if k > 0.5 and i % 2:
                        s.T.px(x_ + 1, y_, H(BLOOD[2]))
                elif st == 'B':
                    s.T.px(x_, y_, H('#030303'))
                    s.T.px(x_ + 1, y_, H('#030303' if k > 0.3 else '#120c16'), 0.9)
                    if j % 5 == 2:
                        s.T.px(x_ - 1, y_, H('#33203c'))
                else:
                    if (j + i) % 3:
                        continue
                    s.T.px(x_, y_, H(EMBER[1] if k < 0.4 else EMBER[2] if k < 0.8 else EMBER[3]))
                    if k < 0.5 and (j + i) % 2:
                        s.T.px(x_, y_ - 2, H(ASH[5]), 0.8)
        if st == 'A':  # it spurts past the lips
            for dx, ln in ((-1, 6), (3, 4)):
                line(s.T, mx + dx, my + 1, mx + dx + 2, my + 1 + ln, lambda j: H(BLOOD[5]) if j < 0.4 else H(BLOOD[3]))
            s.T.px(mx, my, H(BLOOD[6]))
        elif st == 'B':  # darkness closes on the bite like a second jaw
            b = s.T.box(mx - 12, my - 9, mx + 13, my + 10)
            sl, X, Y = b
            r = np.hypot(X - mx, (Y - my) * 1.2)
            s.T.dark(sl, np.where(r < 12, 0.3 + 0.7 * (r / 12) ** 2, 1))
            s.T.px(mx - 1, my, H(BONE[3])); s.T.px(mx + 2, my, H(BONE[2]))
        else:
            for _ in range(12):
                a = rnd.uniform(-math.pi, 0)
                s.T.px(mx + math.cos(a) * rnd.uniform(2, 8), my + math.sin(a) * rnd.uniform(2, 10), H(ASH[5]), 0.85)
            s.T.px(mx, my, H(EMBER[3]))


# ---------- composition ----------
def snap(img):
    """The mockups' post: ordered dither, nearest palette colour in their luma/chroma metric."""
    h, w = img.shape[:2]
    bay = (np.array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]).reshape(4, 4) + 0.5) / 16 - 0.5
    d = np.tile(bay, (h // 4 + 1, w // 4 + 1))[:h, :w, None] * 0.02
    c = np.clip(img + d, 0, 1) * 255
    P = PAL * 255
    flat = c.reshape(-1, 3)
    out = np.empty_like(flat)
    for i in range(0, len(flat), 65536):
        q = flat[i:i + 65536, None, :] - P[None]
        dY = 0.3 * q[..., 0] + 0.59 * q[..., 1] + 0.11 * q[..., 2]
        dCo, dCg = q[..., 0] - q[..., 2], q[..., 1] - (q[..., 0] + q[..., 2]) / 2
        out[i:i + 65536] = P[np.argmin(dY * dY * 1.6 + dCo * dCo * 0.6 + dCg * dCg * 0.7, 1)]
    return out.reshape(h, w, 3) / 255


def compose(st, plate, oid, heroes, draw, seed):
    img = np.asarray(Image.open(plate).convert('RGB')).astype(float) / 255
    h, w = img.shape[:2]
    fx = FX(st, h, w, seed)
    rec = mist_recolor(MIST_RAMP[st])
    for name, x, y in heroes:  # contact shadows (the hero is not in the plate)
        b = fx.F.box(x - 14, y - 4, x + 15, y + 5)
        sl, X, Y = b
        e = np.hypot((X - x) / 13, (Y - y) / 3.5)
        fx.F.dark(sl, np.where(e < 1, 0.45 + 0.55 * e ** 2, 1))
    draw(fx)
    for wgt, col, amt in fx.tints:  # the struck enemy's flash, dark: dyed red, swallowed by black, or greyed to ash
        w = (wgt.astype(float) * amt)[..., None]
        lum = img.mean(-1, keepdims=True)
        if isinstance(col, str):  # drained: A leaves him pale, B in shadow, C greyed to ash
            t = {'A': lum * np.array([1.05, 0.98, 0.95]), 'B': img * 0.3, 'C': lum * np.array([1, 0.98, 0.94]) + 0.04}[fx.st]
        elif fx.st == 'A':
            t = ramp(BLOOD[1:6], lum[..., 0] * 0.8)
        elif fx.st == 'B':
            t = img * 0.35 * np.array([0.9, 0.85, 1.0])
        else:
            t = (lum * 0.9 + 0.05) * np.array([1, 0.97, 0.9])
        img[:] = img * (1 - w) + t * w
    fx.F.apply(img)
    fx.B.apply(img)
    for name, x, y in heroes:
        sprite(img, name, x, y, rec if 'dash' in name else None)
    fx.T.apply(img)
    return snap(img)


FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
TITLES = {'A': ('A. Sang', 'rouge artériel, gerbes de gouttes, caillots'),
          'B': ('B. Ombre', 'déchirures noir-violet, éclats d’os, fumée noire'),
          'C': ('C. Cendre', 'traînées de cendre, braises mourantes, brume grise')}
LABELS = {'c1': 'Coup 1', 'c2': 'Coup 2 (revers)', 'c3': 'Coup 3 — final', 'c4': 'Frappe de brume (après la ruée)',
          'hit': 'Touché : impact  →  recul', 'mist': 'Brume : départ · traversée · arrivée',
          'shard': 'Le Tir : éclat, traînée, impact', 'glyph': 'Le Glyphe (une goule liée)', 'bite': 'La Morsure'}


def oid_mask(oid, p, i):
    x, y, w, h = p['r']
    m = np.zeros(oid.shape, bool)
    m[y:y + h, x:x + w] = oid[y:y + h, x:x + w] == i
    return m


def sheet(st):
    S = LAY['sheet']
    P = {p['id']: p for p in S['panels']}
    oid = np.frombuffer(open('oid-sheet.bin', 'rb').read(), np.int16).reshape(S['H'], S['W'])

    def gmask(pid, i):
        x, y, w, h = P[pid]['r']
        m = np.zeros(oid.shape, bool)
        m[y:y + h, x:x + w] = oid[y:y + h, x:x + w] == 70 + i
        return m
    heroes = [(c, x, y) for p in S['panels'] for c, x, y, *_ in p['heroes']]

    def panel(fx, pid):
        x, y, w, h = P[pid]['r']
        for L in (fx.F, fx.B, fx.T):
            L.clip = (x, y, x + w, y + h)

    def draw(fx):
        H1 = P['c1']['heroes'][0][2]
        for pid, x, a, c in (('c1', 72, 0.0, 0), ('c2', 232, 0.0, 1), ('c3', 393, 0.15, 2), ('c4', 552, -0.1, 3)):
            panel(fx, pid)
            fx.slash(x, H1, a, c)
        panel(fx, 'hit')
        H2 = P['hit']['heroes'][0][2]
        fx.slash(26, H2, 0.05, 1, k=0.0)
        fx.hit(62, H2 - 20, 0.1, False, gmask('hit', 0), floor_y=H2)
        # the recoil: the ghoul thrown back, its wound still giving
        st = fx.st
        if st == 'A':
            fx.puddle(170, H2 + 4, 6, BLOOD[1:5])
            for j in range(22):  # a smear dragged from where it was struck
                xx = 150 + j * 2
                fx.F.px(xx, H2 + 2 + math.sin(j) * 0.8, H(BLOOD[2 if j % 3 else 3]))
                fx.F.px(xx + 1, H2 + 3, H(BLOOD[1]))
            for j in range(9):
                fx.T.px(190 + fx.rng.uniform(-3, 3), H2 - 16 + j * 2.2, H(BLOOD[4 if j % 2 else 3]))
            fx.tints.append((gmask('hit', 1) & (np.arange(oid.shape[1])[None, :] < 200), H('#3e060b'), 0.35))
        elif st == 'B':
            m = gmask('hit', 1)
            fx.tints.append((m & (np.arange(oid.shape[1])[None, :] < 202), H('#030303'), 0.7))
            for j in range(16):
                a = fx.rng.uniform(-2.6, -0.5)
                r = fx.rng.uniform(4, 14)
                x_, y_ = 196 + math.cos(a) * r, H2 - 22 + math.sin(a) * r
                fx.T.px(x_, y_, H('#030303' if j % 3 else '#33203c'))
            fx.stain(196, H2 + 3, 10, 4, None, dark=0.4)
        else:
            m = gmask('hit', 1)
            fx.tints.append((m & (np.arange(oid.shape[1])[None, :] < 202), H('#6e624e'), 0.5))
            for j in range(26):
                x_, y_ = 194 + fx.rng.uniform(-6, 6), H2 - 20 + fx.rng.uniform(0, 22)
                fx.T.px(x_, y_, H(ASH[fx.rng.choice([3, 4, 5])]))
            fx.ashpile(192, H2 + 3, 7)
            for j in range(5):
                fx.T.px(188 + j * 2, H2 - 30 - j * 3, H(ASH[4]), 0.7)
        panel(fx, 'mist')
        Hm = P['mist']['heroes'][0][2]
        fx.dash(None, [(286, Hm), (440, Hm), (596, Hm)], None, None)
        panel(fx, 'shard')
        H3 = P['shard']['heroes'][0][2]
        fx.shard(74, H3 - 52, 120, H3 - 27, 170, H3 - 15, gmask('shard', 0))
        panel(fx, 'glyph')
        gx, gy = P['glyph']['glyph']
        fx.glyph(gx, gy, bound=(388, P['glyph']['ghouls'][0][1] - 16))
        fx.tints.append((gmask('glyph', 0), {'A': H('#3e060b'), 'B': H('#120c16'), 'C': H('#544a3b')}[st], 0.25))
        panel(fx, 'bite')
        bx, by = P['bite']['heroes'][0][1:3]
        fx.bite(bx + 36, by - 60, (bx + 47, by - 30), oid_mask(oid, P['bite'], 70))

    img = compose(st, 'plate-sheet.png', oid, heroes, draw, 7)
    big = Image.fromarray((img * 255).astype(np.uint8)).resize((1920, 1080), Image.NEAREST)
    d = ImageDraw.Draw(big)
    # panel gutters, title and captions
    for p in S['panels']:
        x, y, w, h = [v * 3 for v in p['r']]
        d.rectangle([x, y, x + w - 1, y + h - 1], outline=(7, 6, 5), width=3)
        f = ImageFont.truetype(FONT, 19)
        t = LABELS[p['id']]
        tw = d.textlength(t, font=f)
        d.rectangle([x + 3, y + 3, x + 18 + tw, y + 31], fill=(7, 6, 5))
        d.text((x + 10, y + 6), t, font=f, fill=(207, 194, 162))
    d.rectangle([0, 0, 1920, 41], fill=(7, 6, 5))
    title, sub = TITLES[st]
    d.text((18, 4), f'Effets de combat — {title}', font=ImageFont.truetype(FONTB, 26), fill=(207, 194, 162))
    f = ImageFont.truetype(FONT, 17)
    t = f'{sub} · pixels du héros ×3 · palette des maquettes'
    d.text((1902 - d.textlength(t, font=f), 12), t, font=f, fill=(140, 126, 100))
    return big


def scene(st):
    S = LAY['scene']
    oid = np.frombuffer(open('oid-scene.bin', 'rb').read(), np.int16).reshape(540, 960)
    hx, hy = S['hero'][1], S['hero'][2]
    proj = lambda x, y: (x, y * 0.6156615 + 150)

    def draw(fx):
        g = [proj(x, y) for x, y, *_ in S['ghouls']]
        # earlier: the glyph binding the ghoul at his back-left, the ring where his mist landed, a ghoul already cut
        fx.glyph(g[1][0] + 6, g[1][1] - 4, bound=(g[1][0], g[1][1] - 14), rx=60)
        fx.ring(hx - 6, hy + 1, 0.7, True)
        fx.hit(g[2][0] - 18, g[2][1] - 18, -0.6, False, oid == 72, floor_y=g[2][1])
        # now: the finisher landing on the lunging ghoul
        fx.slash(hx, hy, 0.15, 2)
        fx.hit(g[0][0] - 24, g[0][1] - 15, 0.1, True, oid == 70, floor_y=g[0][1])
    img = compose(st, 'plate-scene.png', oid, [(S['hero'][0], hx, hy)], draw, 3)
    return Image.fromarray((img * 255).astype(np.uint8)).resize((1920, 1080), Image.NEAREST)


if __name__ == '__main__':
    names = {'A': 'a-sang', 'B': 'b-ombre', 'C': 'c-cendre'}
    for st in sys.argv[1:] or ['A', 'B', 'C']:
        sheet(st).save(f'fx-{names[st]}.png')
        scene(st).save(f'fx-{names[st]}-scene.png')
        print('wrote', names[st])
