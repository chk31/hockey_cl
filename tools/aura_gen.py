#!/usr/bin/env python3
"""青いオーラ（メラメラ燃え立つ炎の輪）のドット絵アニメーションを生成するツール。

輪の縁から外へ炎の舌が立ち上り、揺らぎながら沸き立つ。色は青系5段階＋黒の縁取り、
4x4 のベイヤー網点で階調を付けたドット絵。8コマで継ぎ目なくループする。

使い方:  python3 tools/aura_gen.py [--preview DIR]
出力:    site/fx/aura_mallet.png（マレット用 40px×8コマ）
         site/fx/aura_puck.png  （パック用   28px×8コマ）
         --preview を付けると、8倍に拡大したアニメGIFも DIR に書き出す。
"""
import math, os, sys
from PIL import Image

N = 8  # コマ数（ゲーム側は12コマ/秒で再生）
PAL = [None, (0, 51, 170), (0, 102, 255), (51, 204, 255), (170, 238, 255), (255, 255, 255)]  # 0=透明, 1..5=暗→明
OUTLINE = (0, 8, 20)
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def frame(size, r0, hmax, f, seed):
    """1コマ分のインデックス画像（0=透明, 1..5=パレット）を作る。"""
    t = 2 * math.pi * f / N  # ループ用の位相（係数は整数＝8コマで一周）
    a = [seed * 1.7 + k * 2.3 for k in range(6)]
    c = size / 2
    px = [[0] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            dx, dy = x + .5 - c, y + .5 - c
            r, th = math.hypot(dx, dy), math.atan2(dy, dx)
            if r < r0 - 1:
                continue  # 中央は空ける（マレット／パックが見える）
            # 炎の舌：角度方向のうねりを尖らせて（べき乗）舌と谷を作る。整数周波数で輪がつながり、時間の係数も整数で8コマループ
            w = (.5 * math.sin(5 * th + t + a[0]) + .3 * math.sin(9 * th - 2 * t + a[1])
                 + .2 * math.sin(14 * th + 3 * t + a[2]))
            tongue = max(0.0, min(1.0, .5 + .62 * w)) ** 1.7
            flick = .85 + .15 * math.sin(3 * t + 7 * th + a[3])  # 舌ごとのちらつき
            h = hmax * (.22 + .9 * tongue * flick)
            u = (r - r0) / h  # 0=輪の縁, 1=炎の先端
            th2 = th + u * .35 * math.sin(t + a[5])  # 先端ほど少しねじれる（揺らめき）
            g = .5 + .5 * math.sin(4 * th2 - 2 * t + r * .9 + a[4])  # 沸き立つ明暗のうねり
            i = max(0.0, 1 - u) ** .85 * (.8 + .35 * g)
            if r < r0 + .8:
                i = max(i, 1.0)  # 輪の縁だけ白く
            elif r < r0 + 1.8:
                i = min(max(i, .7), .9)
            if i <= 0:
                continue
            v = i * 5 + (BAYER[y % 4][x % 4] / 16 - .5) * .9
            px[y][x] = max(1, min(5, int(v)))
    # 火の粉：輪の外へ飛んでいく粒（8コマで一周）
    for k in range(6):
        ang = a[k] * 3.1 + k * 1.05
        q = ((f / N) + k * .37) % 1
        rr = r0 + hmax * (.4 + q * 1.1)
        ex, ey = int(c + math.cos(ang) * rr), int(c + math.sin(ang) * rr)
        if 0 <= ex < size and 0 <= ey < size and q < .85:
            px[ey][ex] = 5 if q < .4 else 3
    return px


def to_image(px):
    size = len(px)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(size):
        for x in range(size):
            k = px[y][x]
            if k:
                img.putpixel((x, y), PAL[k] + (255,))
            else:  # 縁取り：色のあるドットに隣接する透明ドットを黒に
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < size and 0 <= ny < size and px[ny][nx]:
                        img.putpixel((x, y), OUTLINE + (255,))
                        break
    return img


def sheet(size, r0, hmax, seed):
    frames = [to_image(frame(size, r0, hmax, f, seed)) for f in range(N)]
    out = Image.new('RGBA', (size * N, size), (0, 0, 0, 0))
    for f, im in enumerate(frames):
        out.paste(im, (f * size, 0))
    return out, frames


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'fx')
    os.makedirs(root, exist_ok=True)
    prev = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    # マレット：半径40を1ドット4単位で描く → 内径10px。パック：半径26 → 内径6.5px
    for name, size, r0, hmax, seed in (('aura_mallet', 40, 10.5, 9, 1), ('aura_puck', 28, 7, 6.5, 2)):
        sh, frames = sheet(size, r0, hmax, seed)
        sh.save(os.path.join(root, name + '.png'))
        print('wrote', name + '.png', sh.size)
        if prev:
            os.makedirs(prev, exist_ok=True)
            big = []
            for im in frames:
                bg = Image.new('RGBA', im.size, (0, 0, 85, 255))  # ゲームの盤面色の上で確認
                bg.alpha_composite(im)
                big.append(bg.resize((size * 8, size * 8), Image.NEAREST).convert('P', palette=Image.ADAPTIVE))
            big[0].save(os.path.join(prev, name + '.gif'), save_all=True, append_images=big[1:], duration=83, loop=0)


if __name__ == '__main__':
    main()
