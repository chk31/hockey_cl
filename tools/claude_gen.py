#!/usr/bin/env python3
"""FX STYLE「CLAUDE」のドット絵アニメーション（インパクト・スマッシュ・ゴール）を生成するツール。

モチーフ：会話の吹き出し、考え中の「…」、アスタリスク風のキラキラ（＊）。暖色系の専用パレット。
色は「パレット番号」で保存し、ゲーム側で CLAUDE 用パレットを当てる（i*40 の灰色で保存）。
  1=クリーム  2=オレンジ  3=濃いオレンジ  4=白  5=縁取り（墨色）  6=ウォームグレー

使い方:  python3 tools/claude_gen.py [--preview DIR]   （DIR に確認用のアニメGIFも書き出す）
出力:    site/fx/claude_impact.png（32px×6コマ）
         site/fx/claude_smash.png （48px×7コマ×8方向）
         site/fx/claude_goal.png  （64px×10コマ）
         site/fx/claude_spark.png （9px×2コマ：ゴールの紙吹雪）
"""
import math, os, sys
from PIL import Image

PAL = {1: (240, 238, 230), 2: (217, 119, 87), 3: (193, 95, 60), 4: (255, 255, 255), 5: (31, 30, 29), 6: (176, 174, 165)}


class G:
    def __init__(s, w, h=None, ang=0):
        s.w, s.h = w, h or w; s.px = [[0] * s.w for _ in range(s.h)]; s.cx, s.cy = s.w / 2, s.h / 2
        s.ca, s.sa = math.cos(ang), math.sin(ang)

    def put(s, x, y, i):
        x, y = math.floor(x), math.floor(y)
        if 0 <= x < s.w and 0 <= y < s.h: s.px[y][x] = i

    def rect(s, x, y, w, h, i):
        for yy in range(math.floor(y), math.floor(y) + h):
            for xx in range(math.floor(x), math.floor(x) + w): s.put(xx, yy, i)

    def fill(s, test, i):
        for y in range(s.h):
            for x in range(s.w):
                if test(x + .5 - s.cx, y + .5 - s.cy): s.px[y][x] = i

    def at(s, u, v):  # 進行方向基準 (u=前, v=横) → ドット座標
        return s.cx + u * s.ca - v * s.sa, s.cy + u * s.sa + v * s.ca

    def outline(s):
        out = [r[:] for r in s.px]
        for y in range(s.h):
            for x in range(s.w):
                if s.px[y][x] == 0 and any(0 <= x + a < s.w and 0 <= y + b < s.h and s.px[y + b][x + a] not in (0, 5)
                                           for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 5
        s.px = out


def asterisk(g, cx, cy, r, th, rot, i, core=None):
    """6本腕の＊（腕の先は丸い）。"""
    for y in range(g.h):
        for x in range(g.w):
            dx, dy = x + .5 - cx, y + .5 - cy
            for k in range(6):
                a = rot + k * math.pi / 3; ux, uy = math.cos(a), math.sin(a)
                t = dx * ux + dy * uy; d = abs(-dx * uy + dy * ux)
                if (0 <= t <= r and d <= th / 2) or math.hypot(dx - ux * r, dy - uy * r) <= th / 2:
                    g.px[y][x] = i
    if core: g.fill(lambda u, v: math.hypot(u + g.cx - cx, v + g.cy - cy) <= core[0], core[1])


def twinkle(g, x, y, r, i):
    x, y = math.floor(x), math.floor(y)
    for k in range(-r, r + 1): g.put(x + k, y, i); g.put(x, y + k, i)


def bubble(g, cx, cy, w, h, tail=(0, 1), sq=1.0, dots=0, bounce=0, heart=False):
    """会話の吹き出し（角丸・クリーム地・オレンジの縁）。tail はしっぽの向き。dots は「…」の数。"""
    w, h = w * sq, h / sq; x0, y0 = cx - w / 2, cy - h / 2; r = min(3, h / 3)
    def inb(px, py):
        qx = min(max(px, x0 + r), x0 + w - r); qy = min(max(py, y0 + r), y0 + h - r)
        return math.hypot(px - qx, py - qy) <= r and x0 <= px <= x0 + w and y0 <= py <= y0 + h
    for y in range(g.h):
        for x in range(g.w):
            px, py = x + .5, y + .5
            if inb(px, py): g.px[y][x] = 2 if not inb(px - 1, py) or not inb(px + 1, py) or not inb(px, py - 1) or not inb(px, py + 1) else 1
    tx, ty = tail  # しっぽ：吹き出しの縁から外へ出る小さな三角
    bx, by = cx + tx * (w / 2 - 1) * .6, cy + ty * (h / 2)
    for k in range(4):
        for j in range(-(3 - k) // 2 - 1, (3 - k) // 2 + 1):
            g.put(bx + tx * k + (j if ty else 0) - (1 if tx and not ty else 0), by + ty * k + (j if tx and not ty else 0), 2)
    for k in range(dots):  # 考え中の点
        dx = cx + (k - 1) * max(3, w / 5); dy = cy - (bounce if (k + int(bounce)) % 2 == 0 and bounce else 0)
        g.rect(dx - 1, dy - 1, 2, 2, 3)
    if heart:
        for yy in range(g.h):
            for xx in range(g.w):
                X, Y = (xx + .5 - cx) / (h * .22), -(yy + .5 - cy) / (h * .22) + .2
                if (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0: g.px[yy][xx] = 2


def impact_frames():
    fs = []
    for f in range(6):
        g = G(32); c = 16
        if f == 0: g.fill(lambda u, v: math.hypot(u, v) <= 3, 2); g.fill(lambda u, v: 4.5 <= math.hypot(u, v) <= 5.5, 1)
        elif f == 1: asterisk(g, c, c, 7, 3, 0, 2, (2, 1))
        elif f == 2: asterisk(g, c, c, 10, 3, .3, 2, (2.5, 4)); twinkle(g, c + 12, c - 9, 1, 1)
        elif f == 3:
            asterisk(g, c, c, 9, 2, .6, 3)
            g.fill(lambda u, v: math.hypot(u, v) <= 5, 0)  # 中心が抜けて腕だけに
            for k in range(6): twinkle(g, c + math.cos(k * 1.047 + .9) * 13, c + math.sin(k * 1.047 + .9) * 13, 1, 1)
        elif f == 4:
            for k in range(6):
                a = k * 1.047 + .9; g.rect(c + math.cos(a) * 12 - 1, c + math.sin(a) * 12 - 1, 2, 2, 2); twinkle(g, c + math.cos(a + .5) * 15, c + math.sin(a + .5) * 15, 1, 4)
        else:
            for k in range(6):
                a = k * 1.047 + 1.4; g.put(c + math.cos(a) * 14, c + math.sin(a) * 14, 1)
        g.outline(); fs.append(g.px)
    return fs


def smash_frames(ang):
    fs = []
    for f in range(7):
        g = G(48, ang=ang)
        if f == 0:
            g.fill(lambda u, v: math.hypot(u, v) <= 5, 1); g.fill(lambda u, v: 6 <= math.hypot(u, v) <= 7, 2)
        elif f in (1, 2, 3):
            fw = {1: 0, 2: 6, 3: 11}[f]
            for k in range(1, 4 + f):  # 後ろへ続く点の軌跡
                x, y = g.at(fw - 9 - k * 3.2, (k % 2) * 1.5 - .75); g.rect(x - 1, y - 1, 2 if k < 3 else 1, 2 if k < 3 else 1, 3 if k % 2 else 2)
            bx, by = g.at(fw, 0); tx, ty = -g.ca, -g.sa
            bubble(g, bx, by, 16, 11, (round(tx), round(ty)) if abs(tx) + abs(ty) > 0 else (0, 1), 1.0 + (f - 1) * .12, 3, 1.5 if f == 2 else 0)
        elif f == 4:
            x, y = g.at(12, 0); asterisk(g, x, y, 12, 3, .2, 2, (3, 1))
        elif f == 5:
            x, y = g.at(13, 0); asterisk(g, x, y, 14, 2, .5, 3); g.fill(lambda u, v: math.hypot(u + g.cx - x, v + g.cy - y) <= 7, 0)
            for k in range(6): twinkle(g, x + math.cos(k * 1.047) * 17, y + math.sin(k * 1.047) * 17, 1, 1)
        else:
            x, y = g.at(14, 0)
            for k in range(6): twinkle(g, x + math.cos(k * 1.047 + .5) * 18, y + math.sin(k * 1.047 + .5) * 18, 1, 4 if k % 2 else 1)
        g.outline(); fs.append(g.px)
    return fs


def goal_frames():
    fs = []
    spec = [  # (大きさ, 点の数, 跳ね, ハート, つぶれ)
        (.35, 0, 0, False, 1.0), (1.15, 0, 0, False, 1.0), (1.0, 1, 0, False, 1.0), (1.0, 2, 0, False, 1.0), (1.0, 3, 0, False, 1.0),
        (1.0, 3, 2, False, 1.0), (1.0, 0, 0, True, 1.0), (1.0, 0, 0, True, 1.2), (0, 0, 0, False, 1.0), (0, 0, 0, False, 1.0)]
    for f, (sc, dots, bo, hrt, sq) in enumerate(spec):
        g = G(64, 64); c = 32
        if sc: bubble(g, c, c - 3, 34 * sc, 24 * sc, (-1, 1), sq, dots, bo, hrt)
        if f == 8: asterisk(g, c, c - 3, 22, 4, .25, 2, (5, 1))
        if f == 9:
            asterisk(g, c, c - 3, 26, 3, .55, 3); g.fill(lambda u, v: math.hypot(u, v + 3) <= 14, 0)
            for k in range(8): twinkle(g, c + math.cos(k * .785) * 29, c - 3 + math.sin(k * .785) * 29, 2, 1 if k % 2 else 4)
        g.outline(); fs.append(g.px)
    return fs


def spark_frames():
    fs = []
    for f in range(2):
        g = G(9); asterisk(g, 4.5, 4.5, 3.2 if f == 0 else 2.4, 1.6, f * .5, 2 if f == 0 else 3); g.outline(); fs.append(g.px)
    return fs


def save(path, grid_rows):
    h = len(grid_rows[0][0]); w = len(grid_rows[0][0][0]); cols = len(grid_rows[0])
    img = Image.new('RGBA', (w * cols, h * len(grid_rows)), (0, 0, 0, 0))
    for r, row in enumerate(grid_rows):
        for f, px in enumerate(row):
            for y in range(h):
                for x in range(w):
                    if px[y][x]: img.putpixel((f * w + x, r * h + y), (px[y][x] * 40,) * 3 + (255,))
    img.save(path); print('wrote', os.path.basename(path), img.size)


def gif(path, frames, scale, ms):
    out = []
    for px in frames:
        h, w = len(px), len(px[0]); im = Image.new('RGB', (w, h), (0, 0, 85))
        for y in range(h):
            for x in range(w):
                if px[y][x]: im.putpixel((x, y), PAL[px[y][x]])
        out.append(im.resize((w * scale, h * scale), Image.NEAREST))
    out[0].save(path, save_all=True, append_images=out[1:], duration=ms, loop=0)


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'fx'); os.makedirs(root, exist_ok=True)
    imp = impact_frames(); sm = [smash_frames(d * math.pi / 4) for d in range(8)]; gl = goal_frames(); sp = spark_frames()
    save(os.path.join(root, 'claude_impact.png'), [imp]); save(os.path.join(root, 'claude_smash.png'), sm)
    save(os.path.join(root, 'claude_goal.png'), [gl]); save(os.path.join(root, 'claude_spark.png'), [sp])
    if '--preview' in sys.argv:
        d = sys.argv[sys.argv.index('--preview') + 1]; os.makedirs(d, exist_ok=True)
        gif(os.path.join(d, 'claude_impact.gif'), imp, 8, 80); gif(os.path.join(d, 'claude_smash.gif'), sm[7], 6, 100)
        gif(os.path.join(d, 'claude_goal.gif'), gl, 5, 220)


if __name__ == '__main__':
    main()
