# アイテムエアホッケー — P2P オンライン対戦版

`site/index.html` が完成版（単一HTML・ビルド不要）。`src/index.html` は原本。

## 遊び方
- 公開URL（GitHub Pages）：`https://<user>.github.io/<repo>/`
- タイトルの **ONLINE** → **HOST** で4桁のルームコードが出る（点滅＝待機中）。
- もう1台で **ONLINE** → **JOIN** → キーパッドでコード入力 → **OK**。つながると自動で試合開始。
- ホスト＝1P（赤・下）、ゲスト＝2P（青）。ゲスト端末は画面が180°反転し、自分が下に表示される。
- 試合中、自分のアイテム欄の左（スコアの右）の **‖** で中断。**▶** で再開、**QUIT** でタイトルへ（オンラインは両者が止まり、QUIT すると相手側は DISCONNECTED 表示）。
- 試合終了後に画面をタップ → 両者ロビーへ。ホストの **▶** で再戦、**<** で切断。
- 相手が閉じる／3秒応答なしで **DISCONNECTED** を出してタイトルへ戻る。
- 対戦中、自分のアイテム欄の右下に RTT(ms) を小さく表示（緑 <60 / 黄 <120 / 赤）。

### iPad
1. Safari で公開URLを開く → 共有 → ホーム画面に追加 → アイコンから起動（全画面）。
2. Safari のままならタイトル右上のカギ型アイコンで全画面（ホーム画面起動中は非表示）。
3. ホームへのスワイプを止めたいときは アクセスガイド（設定 → アクセシビリティ）。

## 実装メモ
- PeerJS 1.5.5（unpkg 固定版）＋ 公開クラウドシグナリング。ピアID＝`aihockey-<コード>`。
- DataConnection 2本：`ev`（reliable：開始・ロビー・エフェクト/音/揺れ・入力の押下/離し）、`st`（順不同：60Hzスナップショット・指の移動）。
- ホスト権威型：ホストが物理・アイテム・猶予タイマー・スローをすべて計算。ゲストは指の論理座標を送るだけ。
- ゲストは回線の揺れに合わせた最小限の遅れ（25〜120ms、通常30ms前後）でスナップショット（60Hz）を補間表示。エフェクト・音もホストの発生時刻に合わせて再生（各自のテーマ色・FX設定で）。自分のマレットはローカル予測。
- テーマは各端末ローカル（同期しない）。CPU戦・同じ端末の2P・OPTION は従来どおり。

### TURN（別回線でつながらない場合）
STUN（Google）のみ設定済み。モバイル回線や企業Wi-Fiなど対称NAT同士だとつながらないことがある。
その場合は `site/index.html` の `PEER_CONFIG.config.iceServers` に TURN を追加する：
```js
{urls:'turn:turn.example.com:3478',username:'USER',credential:'PASS'}
```

### 開発・テスト
- `?ps=127.0.0.1:9000` で自前の PeerServer（`npx peer --port 9000 --host 127.0.0.1 --path /`）を使う。
- `?debug` で `window.__AH` に状態を公開（自動テスト用）。

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
