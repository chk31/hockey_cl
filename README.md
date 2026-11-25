# アイテムエアホッケー — P2P オンライン対戦版

`site/index.html` が完成版（単一HTML・ビルド不要）。`src/index.html` は原本。

## 遊び方
- 公開URL（GitHub Pages）：`https://<user>.github.io/<repo>/`
- タイトルの **ONLINE** → **HOST** で4桁のルームコードが出る（点滅＝待機中）。
- もう1台で **ONLINE** → **JOIN** → キーパッドでコード入力 → **OK**。つながると自動で試合開始。
- ホスト＝1P（赤・下）、ゲスト＝2P（青）。ゲスト端末は画面が180°反転し、自分が下に表示される。
- **ゲーム全体の速度**：タイトルの OPTION 最下段の **SPEED** バー（左＝遅い／右＝速い、0.5〜1.5倍・0.1刻み・1.0倍が標準）。バーはドラッグでも選べ、端末に保存される。物理・アイテムの寿命・爆発までの4秒・CPUがこの倍率で進む。オンラインは**ホストの設定**が両者に適用される。
- 試合中、自分のアイテム欄の左（スコアの右）の **‖** で中断。**▶** で再開、**QUIT** でタイトルへ（オンラインは両者が止まり、QUIT すると相手側は DISCONNECTED 表示）。
- 試合終了後に画面をタップ → 両者ロビーへ。ホストの **▶** で再戦、**<** で切断。
- 相手が閉じる／3秒応答なしで **DISCONNECTED** を出してタイトルへ戻る。
- 対戦中、自分のアイテム欄の右下に RTT(ms) を小さく表示（緑 <60 / 黄 <120 / 赤）。

### iPad
1. Safari で公開URLを開く → 共有 → ホーム画面に追加 → アイコンから起動（全画面）。
2. Safari のままならタイトル右上のカギ型アイコンで全画面（ホーム画面起動中は非表示）。
3. ホームへのスワイプを止めたいときは アクセスガイド（設定 → アクセシビリティ）。

## バージョン
- タイトル画面のメニュー枠の右下に `v1.29` のように表示（`site/index.html` の `VER`）。更新のたびに上げる。
- 公開ページが最新か迷ったら、この番号で確認する。

## 実装メモ
- PeerJS 1.5.5（unpkg 固定版）＋ 公開クラウドシグナリング。ピアID＝`aihockey-<コード>`。
- DataConnection 2本：`ev`（reliable：開始・ロビー・エフェクト/音/揺れ・入力の押下/離し）、`st`（順不同：60Hzスナップショット・指の移動）。
- ホスト権威型：ホストが物理・アイテム・猶予タイマー・スローをすべて計算。ゲストは指の論理座標を送るだけ。
- ゲストは回線の揺れに合わせた最小限の遅れ（25〜120ms、通常30ms前後）でスナップショット（60Hz）を補間表示。エフェクト・音もホストの発生時刻に合わせて再生（各自のテーマ色・FX設定で）。自分のマレットはローカル予測。自陣側のパックは「入力がホストに届く時点」まで外挿して描き、自陣で起きたエフェクト・音は即再生（打ってから反応までの遅れを往復時間程度に）。
- テーマは各端末ローカル（同期しない）。CPU戦・同じ端末の2P・OPTION は従来どおり。

### TURN（別回線でつながらない場合）
片方がモバイル回線などで直接つながらないときは、TURN サーバーで中継する。Metered.ca（無料枠あり）を使う。
- 現在は Metered の固定の認証情報（`TURN_STATIC`：`global.relay.metered.ca` の UDP/TCP 80・443、TLS 443）を直接使っている。
- 代わりに `site/index.html` の `TURN_CFG` に、Metered のアプリ名（`xxx.metered.live` の `xxx`）と TURN 認証情報 API のキーを書く。
  キーはサイトに公開される種類のもの。空なら STUN だけ（直接つながる場合のみ）。
- 接続前に Metered から中継サーバーの情報を取得し、STUN に加えて使う。取得に失敗しても STUN だけで続ける。
- 中継でつながっているときは、右下の RTT の数字の後ろに `R` が付く。診断表示（タイトルの AIR HOCKEY を長押し）にも `turn` と `path` が出る。
- 確認用：URL に `?relayonly=1` を付けると中継だけでつなぐ。`?turnapp=...&turnkey=...` で一時的に設定を上書きできる。

### 開発・テスト
- `?ps=127.0.0.1:9000` で自前の PeerServer（`npx peer --port 9000 --host 127.0.0.1 --path /`）を使う。
- `?debug` で `window.__AH` に状態を公開（自動テスト用）。

## 開発者画面（DEV）
- タイトル → OPTION → 上の「OPTION」の文字を2回続けてタップすると入る。
- FX STYLE / FX COLOR / FX LEVEL を切り替えながら、全エフェクト（8種と、その変化＝壁向き・小さな火花・ぬかるみ4状態、＋MIN のヒットストップの点）と、
  盤面の縁・パックの軌跡・スロー演出・スーパーシュートのオーラ・スタン・GOAL!! の装飾を上半分の盤面で確認できる。
- ここで変えた設定は確認用で、`<` で抜けると元に戻る。

## ツール
- `tools/slime_gen.py`：ぬかるみを床に置いたときのスライム（上から見た図、24px×4コマ）を生成。床に貼り付いた形・飛び散ったしずくと糸・つや・泡。`site/fx/slime.png`。
- `tools/claude_gen.py`：FX STYLE「CLAUDE」のドット絵（impact 6コマ／smash 7コマ×8方向／goal 10コマ／紙吹雪の＊）を生成。色はパレット番号で `site/fx/claude_*.png` に保存し、FX COLOR で着色する（FX COLOR を CLAUDE にすると暖色の見た目になる）。
- `tools/smash_gen.py`：SMASH（強打）のドット絵アニメを FX STYLE ごと（ARCADE／KAWAII／WEB90）に生成。7コマ×8方向をそれぞれ描き分け、色はパレット番号で `site/fx/smash_*.png` に保存（FX COLOR・虹色・打った側の色で着色）。
- `tools/impact_gen.py`：ARCADE の IMPACT（打撃の弾け）のドット絵アニメ（6コマ）を生成。色はパレット番号で `site/fx/impact_idx.png` に保存し、ゲーム側で FX COLOR に合わせて着色する。
- `tools/aura_gen.py`：スーパーシュートの青いオーラ（燃え立つ炎の輪）のドット絵連番を生成。`python3 tools/aura_gen.py [--preview DIR]` で `site/fx/aura_mallet.png`・`aura_puck.png`（各8コマ）を書き出す（Pillow が必要）。

## デプロイ
`.github/workflows/pages.yml` が `site/` を GitHub Pages に公開する。
リポジトリの Settings → Pages → Source を「GitHub Actions」に設定すること。

---

## 元パッケージの説明
# アイテムエアホッケー — P2P対戦版 作業パッケージ

Codex に渡して、オンライン対戦対応と GitHub Pages 公開まで実装してもらうためのパッケージです。

## 中身
```
AGENTS.md                 Codex への指示（最初に読まれる）
src/index.html            現行ゲーム（原本）
docs/SPEC.md              ゲーム仕様
docs/CODEMAP.md           コード構造
docs/P2P_DESIGN.md        オンライン対戦の設計・通信仕様
docs/DEPLOY.md            PWA・全画面・公開手順
docs/TEST_CHECKLIST.md    受け入れテスト
public/                   manifest・アイコン（ドット絵）
.github/workflows/pages.yml  GitHub Pages デプロイ
```

## 使い方
1. このフォルダを新しい GitHub リポジトリとして push（ブランチ `main`）。
2. リポジトリの Settings → Pages → Source を「GitHub Actions」にする。
3. Codex にリポジトリを開かせ、次の依頼文を渡す。

```
AGENTS.md と docs/ 以下をすべて読み、src/index.html を元に site/ に
P2P オンライン対戦対応版（PeerJS・ホスト権威型）を実装してください。
PWA 化と全画面ボタンも追加し、GitHub Pages へのデプロイまで完了させてください。
既存機能・見た目・数値は変えず、docs/TEST_CHECKLIST.md を満たしたら完了です。
```
