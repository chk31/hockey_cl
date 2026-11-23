# PWA化・全画面・GitHub Pages 公開

## 配置
```
site/
  index.html
  manifest.webmanifest   ← public/ からコピー
  icons/                 ← public/icons/ からコピー
  sw.js                  ← 任意（オフライン用キャッシュ）
```

## index.html の <head> に追加
```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AIR HOCKEY">
<meta name="theme-color" content="#000000">
```
- viewport に `viewport-fit=cover` を追加。キャンバスは全面、`resize()` で `env(safe-area-inset-*)` 分を考慮
  （CSS変数で読み取って論理領域の配置余白に足す）。

## 全画面ボタン
- タイトル画面の隅に小さな全画面アイコン（ドット絵の四隅カギ）を置く。文字は出さない。
- `el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()`。クリックハンドラ内で呼ぶ。
- ホーム画面から起動中（`navigator.standalone` または `matchMedia('(display-mode: standalone)')`）は非表示。

## Service Worker（任意）
- `index.html`・アイコン・CDNのライブラリ（three.js、PeerJS、Google Fonts）をキャッシュ。
- バージョン文字列でキャッシュ更新。

## GitHub Pages
- `.github/workflows/pages.yml` を使用（`site/` をデプロイ）。
- リポジトリ Settings → Pages → Source を「GitHub Actions」に設定。
- 公開URL：`https://<user>.github.io/<repo>/`

## iPad での遊び方（READMEに記載）
1. Safariで公開URLを開く → 共有 → ホーム画面に追加 → ホーム画面のアイコンから起動。
2. ホームへのスワイプを止めたい場合は アクセスガイド（設定 → アクセシビリティ）を使う。
