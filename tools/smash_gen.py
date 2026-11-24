#!/usr/bin/env python3
"""スマッシュ（強打）のドット絵アニメーションを FX STYLE ごとに生成するツール。

・ARCADE：進行方向に伸びたギザギザの爆発星＋後ろへ流れる速度線 → 星が割れて破片が前へ
・KAWAII：打った側の色の大きな星がポンと出て、前方へハートが飛び、キラキラで消える
・WEB90 ：立体ボタンの縁が広がり、後ろへ細い虹のライン → 四隅のカギとキラキラだけ残る

向きは回転させずに8方向（45°ごと）をそれぞれ描き分ける（ドットが崩れないように）。
色は焼き込まず「パレット番号」で保存し、ゲーム側で FX COLOR 等から着色する。
  1-4 = FX COLOR の spk[0..3]   5 = 縁取り（黒）   6-11 = FX COLOR の tr[0..5]（虹）
  12  = 打った側のプレイヤー色    13 = 白            14 = 灰（立体の影）
PNG には番号 i を灰色 (i*16) で保存する。シートは 横＝コマ、縦＝向き（0°,45°,…,315°）。

使い方:  python3 tools/smash_gen.py [--preview DIR]
出力:    site/fx/smash_arcade.png / smash_kawaii.png / smash_web90.png（48px × 7コマ × 8方向）
"""
import math, os, sys
from PIL import Image

S, N, C = 48, 7, 24


class G:
    def __init__(s, ang):
        s.px = [[0] * S for _ in range(S)]; s.ca, s.sa = math.cos(ang), math.sin(ang)

    def local(s, x, y):  # ドット中心 → 進行方向基準の座標 (u=前, v=横)
        dx, dy = x + .5 - C, y + .5 - C
        return dx * s.ca + dy * s.sa, -dx * s.sa + dy * s.ca

    def fill(s, test, i, world=False):
        for y in range(S):
            for x in range(S):
                u, v = (x + .5 - C, y + .5 - C) if world else s.local(x, y)
                if test(u, v): s.px[y][x] = i

    def dot(s, u, v, i, w=1, world=False):  # 進行方向基準の位置に w×w の点
        if world: x, y = C + u, C + v
        else: x, y = C + u * s.ca - v * s.sa, C + u * s.sa + v * s.ca
        x0, y0 = math.floor(x - w / 2 + .5), math.floor(y - w / 2 + .5)  # round() は偶数丸めでずれるので使わない
        for yy in range(y0, y0 + w):
            for xx in range(x0, x0 + w):
                if 0 <= xx < S and 0 <= yy < S: s.px[yy][xx] = i

    def outline(s, skip=()):
        out = [r[:] for r in s.px]
        for y in range(S):
            for x in range(S):
                if s.px[y][x] == 0 and any(0 <= x + a < S and 0 <= y + b < S and s.px[y + b][x + a] not in (0, 5) + tuple(skip)
                                           for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 5
        s.px = out


def star(n, ro, ri, rot=0, sx=1.0):
    def t(u, v):
        u /= sx; r = math.hypot(u, v); a = math.atan2(v, u) - rot
        k = (a % (2 * math.pi / n)) / (2 * math.pi / n); k = abs(k - .5) * 2  # 0=谷 1=山
        return r <= ri + (ro - ri) * k
    return t


def seg(u0, u1, v, th):
    return lambda u, w: u0 <= u <= u1 and abs(w - v) <= th / 2


def heart(cu, cv, sz):
    def t(u, v):
        x, y = (v - cv) / sz, -(u - cu) / sz - .1  # 前方（u）を上にしたハート
        return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
    return t


def sparkle(g, u, v, r, i, world=False):
    u, v = round(u), round(v)  # 十字の腕が途切れないよう整数に揃える
    for k in range(-r, r + 1):
        g.dot(u + k, v, i, 1, world); g.dot(u, v + k, i, 1, world)


def arcade(g, f):
    if f == 0:
        g.fill(lambda u, v: math.hypot(u, v) <= 4, 13); g.fill(seg(-14, -4, 0, 2), 2)
    elif f == 1:
        for v in (-6, 0, 6): g.fill(seg(-22, -10, v, 1), 12)
        g.fill(star(8, 12, 5, sx=1.3), 2); g.fill(lambda u, v: math.hypot(u, v) <= 4, 13)
    elif f == 2:
        for v in (-7, 0, 7): g.fill(seg(-24, -12, v, 1), 12)
        g.fill(star(8, 17, 7, .2, 1.3), 3); g.fill(star(8, 12, 5, sx=1.3), 2); g.fill(lambda u, v: math.hypot(u, v) <= 3, 13)
    elif f == 3:
        for v in (-8, 8): g.fill(seg(-20, -14, v, 1), 12)
        t = star(8, 20, 9, .2, 1.3); g.fill(lambda u, v: t(u, v) and math.hypot(u / 1.3, v) > 8, 3)
        g.fill(lambda u, v: t(u, v) and math.hypot(u / 1.3, v) > 14, 4)
    elif f in (4, 5, 6):
        d = {4: 16, 5: 20, 6: 22}[f]
        for k, v in enumerate((-12, -6, 0, 6, 12)):
            if f == 6 and k % 2: continue
            g.dot(d - abs(v) * .4 + (k % 2) * 2, v * (1 + (f - 4) * .15), 3 if (k + f) % 2 else 4, 2 if f < 6 else 1)
        if f < 6:
            for v in (-15, 15): g.dot(d - 8, v, 4, 1)
    g.outline()


def kawaii(g, f):
    W = True  # 星は向きに関係なく正立
    cols = (6, 8, 10)
    if f == 0:
        g.fill(lambda u, v: math.hypot(u, v) <= 5, 13); g.fill(lambda u, v: 6.5 <= math.hypot(u, v) <= 7.5, 12)
    else:
        so = {1: 11, 2: 14, 3: 13, 4: 10, 5: 6, 6: 0}[f]
        if so:
            g.fill(star(5, so, so * .45, -math.pi / 2 + (.2 if f >= 2 else 0)), 12, world=W)
            g.fill(lambda u, v: math.hypot(u + so * .25, v + so * .3) <= max(1, so * .15), 13, world=W)  # つや
        hu = {1: 12, 2: 16, 3: 19, 4: 21, 5: 22, 6: 0}[f]
        if hu:
            for k, v in enumerate((-9, 0, 9)):
                g.fill(heart(hu - abs(v) * .3, v, 2.2 + (1 if f in (2, 3) else 0)), cols[k])
        for k, (u, v) in enumerate(((0, -16), (6, 15), (-8, 12), (14, -10))):
            if f >= 2 and k < f - 1: sparkle(g, u * (1 + f * .05), v * (1 + f * .05), 2 if f < 6 else 1, 13 if k % 2 else 1, True)  # キラキラは常に正立
    g.outline()


def web90(g, f):
    def bevel(h, th=1, corners=0):
        for y in range(S):
            for x in range(S):
                u, v = x + .5 - C, y + .5 - C
                inb = max(abs(u), abs(v)) <= h + th / 2 and max(abs(u), abs(v)) >= h - th / 2
                if corners and not (abs(abs(u) - h) < th and abs(v) > h - corners or abs(abs(v) - h) < th and abs(u) > h - corners): inb = False
                if inb: g.px[y][x] = 13 if (u < 0 and abs(u) >= abs(v)) or (v < 0 and abs(v) >= abs(u)) else 14

    def rainbow(u0, u1, every=1):
        g.fill(lambda u, v: u0 <= u <= u1 and -3 <= v < 3 and (every == 1 or int(u) % every == 0), 0)
        for y in range(S):
            for x in range(S):
                u, v = g.local(x, y)
                if u0 <= u <= u1 and -3 <= v < 3 and (every == 1 or int(u) % every == 0): g.px[y][x] = 6 + min(5, int(v + 3))
    if f == 0: bevel(5)
    elif f == 1: rainbow(-26, -11); bevel(9, 2)
    elif f == 2: rainbow(-30, -14); bevel(13)
    elif f == 3: rainbow(-26, -17, 2); bevel(16)
    elif f == 4: bevel(18, 1, 5); sparkle(g, -18, -18, 2, 2, True); sparkle(g, 18, 18, 2, 3, True)
    elif f == 5: bevel(19, 1, 3); sparkle(g, -19, -19, 1, 3, True)
    elif f == 6: g.dot(-19, -19, 1, 1, True); g.dot(19, 19, 1, 1, True)
    g.outline()


def sheet(fn):
    img = Image.new('RGBA', (S * N, S * 8), (0, 0, 0, 0)); grids = {}
    for d in range(8):
        for f in range(N):
            g = G(d * math.pi / 4); fn(g, f); grids[(d, f)] = g.px
            for y in range(S):
                for x in range(S):
                    i = g.px[y][x]
                    if i: img.putpixel((f * S + x, d * S + y), (i * 16, i * 16, i * 16, 255))
    return img, grids


PREV = {1: (255, 255, 255), 2: (255, 255, 0), 3: (255, 170, 0), 4: (255, 0, 85), 5: (0, 0, 0), 6: (255, 0, 85), 7: (255, 170, 0), 8: (255, 255, 0),
        9: (0, 255, 85), 10: (0, 255, 255), 11: (170, 85, 255), 12: (255, 0, 85), 13: (255, 255, 255), 14: (128, 128, 128)}


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'fx'); os.makedirs(root, exist_ok=True)
    prev = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    for name, fn in (('arcade', arcade), ('kawaii', kawaii), ('web90', web90)):
        img, grids = sheet(fn); img.save(os.path.join(root, f'smash_{name}.png')); print('wrote', f'smash_{name}.png', img.size)
        if prev:
            os.makedirs(prev, exist_ok=True); pv = Image.new('RGB', (S * N, S * 2), (0, 0, 85))
            for r, d in enumerate((7, 1)):  # 上向き(315°→ -45°)と右下向き
                for f in range(N):
                    for y in range(S):
                        for x in range(S):
                            i = grids[(d, f)][y][x]
                            if i: pv.putpixel((f * S + x, r * S + y), PREV[i])
            pv.resize((S * N * 5, S * 2 * 5), Image.NEAREST).save(os.path.join(prev, f'smash_{name}_preview.png'))


if __name__ == '__main__':
    main()
