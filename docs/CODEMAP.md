# src/index.html コードマップ

単一HTML。`<script>` は1ブロック `{ ... }` で囲まれたブロックスコープ。

## 座標系
- 論理座標：x ∈ [0, FW=600]、y ∈ [0, TL]。`GUT`（端の余白）→ `TRAY`（アイテム欄）→ フィールド `FY0..FY1` → TRAY → GUT。
- `MID` はセンターライン。1P＝`y>MID`、2P＝`y<MID`。
- 画面への写像：`resize()` で縦横判定（`rot`）し、`base()` が Canvas2D の変換行列を設定。
  `toL(clientX, clientY)` が画面→論理座標の逆変換。
- `frame(i, fn)`：プレイヤー i の向きで描く（i=1 は180°回転）。`local(i,x,y)` も同じ変換（対合）。
- 3D：world X = x−FW/2、Z = y−TL/2。カメラは真上から（縦横で `cam.up` を切替）。

## 主な状態
| 変数 | 内容 |
|---|---|
| `state` | `'title' / 'options' / 'play' / 'goal' / 'over'` |
| `mode`, `lvl` | `'cpu'` or `'2p'`、CPU強さ 0..2 |
| `P[0..1]` | プレイヤー：マレット位置 x,y,vx,vy, 目標 tx,ty, `ptr`（担当ポインタ）, score, items[], box{on,cd,x,y} |
| `puck` | x,y,vx,vy, air/airT（ジャンプ）, hold/side（4秒ルール）, boom, inMud ほか |
| `placed[]` | 設置アイテム {type,x,y,o(owner),age,life,hit,mesh, dx,dy(加速床の向き)} |
| `drags` (Map) | pointerId → ドラッグ中アイテム {i,slot,type,x,y,t(猶予)} |
| `arm[0..1]` | タップ選択中アイテム {slot,type,t} |
| `live` | サーブ後パックが動いたか |
| `ts` | 時間倍率（スロー） |
| `fx[]` | エフェクト（`addFx` で追加、`drawFx` / `drawFxK` で描画） |
| `TH` | テーマ選択 {puck,field,st,fx,lv} |

## 主な関数
- 進行：`start(mode,lvl)`, `serve(side)`, `goal(scorer)`, `explode(side)`, `update(dt)`, `loop(t)`
- 物理：`sub(h, ms)`（サブステップ、壁・マレット・アイテム・ボックス判定）, `bounceOff`, `bumperHit`, `wall`
- アイテム：`spawnBox`, `give`, `place(d)`, `expire`, `validPos`, `ghost(d)`, `boostDir`
- 入力：`down/move/up`（Pointer Events）, `aim(p,x,y)`
- CPU：`cpuDecide`, `cpuItems`, `cpuUpdate`
- 演出：`addFx`, `juice`（揺れ・フラッシュ・ヒットストップ・色ズレ）, `hit`, 音 `beep/seq/slide/noise`
- 描画：`build3D`, `render3D`, `applyTheme`, `drawUI`, `tray`, `ghosts`, `drawOptions`, `marquee`, `trail`, `landMark`

## オンライン化で触る主な箇所
- `down/move/up`：ゲスト端末では自分＝下側として入力し、論理座標を反転してホストへ送る。
- `update`：ゲスト端末では物理を回さず、受信スナップショットを補間して描画。
- `addFx / juice / 音`：ホスト側で発生したものをイベントとしてゲストへ転送。
- タイトル画面 `BTN` と `drawUI` のタイトル部分に ONLINE ボタンとロビーを追加。
