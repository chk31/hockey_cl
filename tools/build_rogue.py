#!/usr/bin/env python3
"""ローグライク版 site/rogue/index.html を本体 site/index.html から作る（公開時に GitHub Actions が実行。手元の確認でも実行する）。
本体はそのまま。変えるのは：基準の場所を1つ上に（<base href="../">。画像などは本体と同じ物を使う）、manifest とホーム画面の名前、本体のスクリプトの内側に rogue/rogue.js を埋め込む。"""
import pathlib,re,sys
root=pathlib.Path(__file__).resolve().parent.parent/'site'
s=(root/'index.html').read_text(encoding='utf-8')
ver=re.search(r'<meta name="version" content="([0-9.]+)">',s).group(1)
def rep(a,b):
    global s
    if s.count(a)!=1: sys.exit('build_rogue: not found once: '+a)
    s=s.replace(a,b)
rep('<head>\n','<head>\n<base href="../">\n')
rep('<link rel="manifest" href="manifest.webmanifest">','<link rel="manifest" href="rogue/manifest.webmanifest">')
rep('<meta name="apple-mobile-web-app-title" content="AIR HOCKEY">','<meta name="apple-mobile-web-app-title" content="HOCKEY ROGUE">')
rep('<title>アイテムエアホッケー</title>','<title>アイテムエアホッケー ROGUE</title>')
# 本体のスクリプトは全体が { … } で囲まれているので、rogue.js はその内側（最後の } の直前）に埋め込む（本体の変数・関数をそのまま使い、包み直せる）
rg=(root/'rogue'/'rogue.js').read_text(encoding='utf-8')
end='\n}\n</script>\n</body>'
if s.count(end)!=1: sys.exit('build_rogue: main script end not found')
s=s.replace(end,'\n/* ===== rogue/rogue.js（公開時に埋め込み） ===== */\n'+rg+'\n}\n</script>\n</body>')
(root/'rogue'/'index.html').write_text(s,encoding='utf-8')
print('built site/rogue/index.html v'+ver)
