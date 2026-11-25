#!/usr/bin/env python3
"""ぬかるみ（緑のねばねばスライム）を床に置いたときのドット絵（上から見た図）を生成するツール。

床にべちゃっと貼り付いた不規則な形、周りに飛び散ったしずくと細い糸、つやのハイライト。
4コマで、ふちがゆっくり波打ち、泡がふくらんではじける（ループ）。

使い方:  python3 tools/slime_gen.py [--preview DIR]
出力:    site/fx/slime.png（24px × 4コマ、色つき RGBA）
"""
import math, os, sys
from PIL import Image

S, N, C = 24, 4, 12
COL = {'D': (0, 51, 0), 'H': (0, 136, 0), 'G': (68, 221, 68), 'L': (170, 255, 170), 'W': (255, 255, 255), 'O': (0, 26, 0)}


def frame(f):
    t = 2 * math.pi * f / N
    px = [['.'] * S for _ in range(S)]

    def setp(x, y, c):
        if 0 <= x < S and 0 <= y < S: px[y][x] = c

    # 本体：角度ごとに半径が揺らぐ不規則な形（ふちがゆっくり波打つ）
    def rad(a):
        return 7.4 + 1.0 * math.sin(3 * a + .7) + .7 * math.sin(5 * a - 1.3 + t) + .45 * math.sin(8 * a + 2.1 - t)
    for y in range(S):
        for x in range(S):
            dx, dy = x + .5 - C, y + .5 - C
            r, a = math.hypot(dx, dy), math.atan2(dy, dx)
            R = rad(a)
            if r <= R:
                c = 'G'
                if r > R - 1.3: c = 'H'  # ふちは濃く（厚みの影）
                if dx > 1 and dy > 1 and r > R - 3: c = 'H'  # 右下は影
                px[y][x] = c
    # 内側の濃いむら
    for (x, y) in ((14, 13), (15, 13), (14, 14), (9, 15), (10, 15)): setp(x, y, 'H')
    # つや（左上）
    for (x, y, c) in ((8, 8, 'W'), (9, 8, 'L'), (8, 9, 'L'), (10, 7, 'L'), (11, 9, 'L')): setp(x, y, c)
    if f in (1, 2): setp(12, 7, 'L')
    # 泡：ふくらんで（2コマ）はじける
    if f == 1: setp(15, 10, 'L')
    if f == 2:
        for (x, y) in ((15, 9), (14, 10), (16, 10), (15, 11)): setp(x, y, 'L')
        setp(15, 10, 'G')
    if f == 3:
        for (x, y) in ((14, 9), (16, 9), (13, 11), (17, 11)): setp(x, y, 'W')
    # 飛び散ったしずくと、本体につながる細い糸
    drops = [(.4, 10.2, 2), (1.6, 10.3, 1), (2.5, 10.4, 2), (3.4, 10.1, 1), (4.3, 10.2, 2), (5.4, 10.3, 1)]
    for k, (a, rr, sz) in enumerate(drops):
        x, y = C + math.cos(a) * rr - .5, C + math.sin(a) * rr - .5
        for yy in range(sz):
            for xx in range(sz): setp(int(round(x)) + xx, int(round(y)) + yy, 'G' if sz > 1 else 'H')
        if k % 2 == 0:  # 糸
            for q in range(6):
                rq = rad(a) + (rr - rad(a)) * q / 6
                setp(int(round(C + math.cos(a) * rq - .5)), int(round(C + math.sin(a) * rq - .5)), 'H')
    # 縁取り（暗い緑）
    out = [r[:] for r in px]
    for y in range(S):
        for x in range(S):
            if px[y][x] == '.' and any(0 <= x + a < S and 0 <= y + b < S and px[y + b][x + a] not in '.O'
                                       for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 'O'
    return out


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'fx'); os.makedirs(root, exist_ok=True)
    fs = [frame(f) for f in range(N)]
    img = Image.new('RGBA', (S * N, S), (0, 0, 0, 0))
    for f, px in enumerate(fs):
        for y in range(S):
            for x in range(S):
                if px[y][x] != '.': img.putpixel((f * S + x, y), COL[px[y][x]] + (255,))
    img.save(os.path.join(root, 'slime.png')); print('wrote slime.png', img.size)
    if '--preview' in sys.argv:
        d = sys.argv[sys.argv.index('--preview') + 1]; os.makedirs(d, exist_ok=True); out = []
        for f in range(N):
            bg = Image.new('RGBA', (S, S), (60, 0, 60, 255)); bg.alpha_composite(img.crop((f * S, 0, f * S + S, S)))
            out.append(bg.convert('RGB').resize((S * 10, S * 10), Image.NEAREST))
        out[0].save(os.path.join(d, 'slime.gif'), save_all=True, append_images=out[1:], duration=170, loop=0)
        strip = Image.new('RGB', (S * 10 * N + 30, S * 10), (34, 34, 34))
        for f, im in enumerate(out): strip.paste(im, (f * (S * 10 + 10), 0))
        strip.save(os.path.join(d, 'slime_strip.png'))


if __name__ == '__main__':
    main()
