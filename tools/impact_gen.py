#!/usr/bin/env python3
"""ARCADE スタイルの IMPACT（打撃・壁・火花）のドット絵アニメーションを生成するツール。

色は焼き込まず「パレット番号」で出力し、ゲーム側で FX COLOR のパレットに差し替えて描く。
  0=透明  1=芯（明）  2=主色  3=副色  4=余韻色  5=縁取り（黒）
PNG には番号 i を灰色 (i*40, i*40, i*40) として保存する（ゲーム側で読み戻して番号に戻す）。

使い方:  python3 tools/impact_gen.py [--preview DIR]
出力:    site/fx/impact_idx.png（32px × 6コマ）
"""
import math, os, sys
from PIL import Image

S, N, C = 32, 6, 16  # 1コマの大きさ, コマ数, 中心


def blank():
    return [[0] * S for _ in range(S)]


def dot(g, x, y, i, w=1):
    for yy in range(int(y), int(y) + w):
        for xx in range(int(x), int(x) + w):
            if 0 <= xx < S and 0 <= yy < S and (g[yy][xx] == 0 or i < g[yy][xx]):
                g[yy][xx] = i


def disc(g, r, i):
    for y in range(S):
        for x in range(S):
            if math.hypot(x + .5 - C, y + .5 - C) <= r:
                dot(g, x, y, i)


def ring(g, r, th, i, keep=lambda a: True):
    for y in range(S):
        for x in range(S):
            d = math.hypot(x + .5 - C, y + .5 - C)
            a = math.atan2(y + .5 - C, x + .5 - C)
            if r - th / 2 <= d <= r + th / 2 and keep(a):
                dot(g, x, y, i)


def ray(g, a, r0, r1, i, w=1, tip=None):
    steps = int((r1 - r0) * 3) + 1
    for k in range(steps):
        r = r0 + (r1 - r0) * k / max(1, steps - 1)
        col = tip if (tip and r > r1 - 2) else i
        dot(g, C + math.cos(a) * r - (w - 1) / 2, C + math.sin(a) * r - (w - 1) / 2, col, w)


def outline(g):
    out = [row[:] for row in g]
    for y in range(S):
        for x in range(S):
            if g[y][x] == 0 and any(0 <= x + dx < S and 0 <= y + dy < S and 0 < g[y + dy][x + dx] < 5
                                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 5
    return out


def frames():
    fs = []
    A8 = [k * math.pi / 4 for k in range(8)]
    # 0: 芯がはじける（白い点＋十字）
    g = blank(); disc(g, 3.2, 1)
    for a in A8[::2]: ray(g, a, 2, 7, 2, 2)
    fs.append(outline(g))
    # 1: 8方向の光条（先端は副色）
    g = blank(); disc(g, 3, 1)
    for k, a in enumerate(A8): ray(g, a, 3, 11 if k % 2 == 0 else 9, 2, 2 if k % 2 == 0 else 1, tip=3)
    fs.append(outline(g))
    # 2: 輪が広がり、とげが外へ
    g = blank(); ring(g, 9.5, 2.2, 2); ring(g, 7.5, 1, 1)
    for a in A8: ray(g, a + math.pi / 8, 10, 14, 3, 1)
    fs.append(outline(g))
    # 3: 輪が割れて破片になる
    g = blank(); ring(g, 12, 1.6, 3, keep=lambda a: (a % (math.pi / 4)) < math.pi / 6)
    for a in A8: dot(g, C + math.cos(a + math.pi / 8) * 14.5 - 1, C + math.sin(a + math.pi / 8) * 14.5 - 1, 2, 2)
    fs.append(outline(g))
    # 4: 破片が散る
    g = blank()
    for k, a in enumerate(A8):
        dot(g, C + math.cos(a + math.pi / 8) * 15 - 1, C + math.sin(a + math.pi / 8) * 15 - 1, 3, 2)
        dot(g, C + math.cos(a) * 11.5, C + math.sin(a) * 11.5, 4)
    fs.append(outline(g))
    # 5: 余韻の点
    g = blank()
    for k in range(6):
        a = k * math.pi / 3 + .3
        dot(g, C + math.cos(a) * 15, C + math.sin(a) * 15, 4)
    fs.append(g)
    return fs


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'fx')
    os.makedirs(root, exist_ok=True)
    fs = frames()
    img = Image.new('RGBA', (S * N, S), (0, 0, 0, 0))
    for f, g in enumerate(fs):
        for y in range(S):
            for x in range(S):
                i = g[y][x]
                if i: img.putpixel((f * S + x, y), (i * 40, i * 40, i * 40, 255))
    img.save(os.path.join(root, 'impact_idx.png'))
    print('wrote impact_idx.png', img.size)
    if '--preview' in sys.argv:  # ARCADE パレットで着色した確認用の拡大画像
        d = sys.argv[sys.argv.index('--preview') + 1]; os.makedirs(d, exist_ok=True)
        pal = {1: (255, 255, 255), 2: (255, 255, 0), 3: (255, 170, 0), 4: (255, 0, 85), 5: (0, 0, 0)}
        pv = Image.new('RGBA', (S * N, S), (0, 0, 85, 255))
        for f, g in enumerate(fs):
            for y in range(S):
                for x in range(S):
                    if g[y][x]: pv.putpixel((f * S + x, y), pal[g[y][x]] + (255,))
        pv.resize((S * N * 8, S * 8), Image.NEAREST).save(os.path.join(d, 'impact_preview.png'))


if __name__ == '__main__':
    main()
