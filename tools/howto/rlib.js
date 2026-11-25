// 遊び方ページ（site/howto.html）の動画を撮る道具。使い方は README.md の「ツール」を参照
// 撮影用：ブラウザを開き、ゲームを始め、シーンを録画して mp4 に切り出す
const {chromium}=require('playwright');const fs=require('fs');const {execFileSync}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const NM=__dirname+'/node_modules/';
const THREE=fs.readFileSync(NM+'three/build/three.min.js','utf8');
// Google Fonts の代わりに npm の @fontsource を使う（http://fonts.local/ で配信）
const CSS=['press-start-2p','dotgothic16'].map(f=>fs.readFileSync(NM+'@fontsource/'+f+'/index.css','utf8').replace(/url\(\.\/files\//g,'url(http://fonts.local/@fontsource/'+f+'/files/')).join('\n');
const W=600,H=864;
async function scene(name,body,opt={}){
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const dir=__dirname+'/out/raw_'+name;fs.rmSync(dir,{recursive:true,force:true});
  const ctx=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:1,recordVideo:{dir,size:{width:W,height:H}}});
  const tStart=Date.now();
  await ctx.addInitScript((ls)=>{try{localStorage.setItem('ah_speed','1');for(const k in ls)localStorage.setItem(k,ls[k])}catch(e){}
    // 指の位置の表示（押している間だけ白い輪）
    addEventListener('DOMContentLoaded',()=>{const d=document.createElement('div');d.style.cssText='position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid rgba(255,255,255,.95);border-radius:50%;background:rgba(255,255,255,.28);pointer-events:none;z-index:99999;display:none;box-shadow:0 0 0 2px rgba(0,0,0,.5)';document.body.appendChild(d);
      const mv=e=>{d.style.left=e.clientX+'px';d.style.top=e.clientY+'px'};
      addEventListener('pointerdown',e=>{mv(e);d.style.display='block'},true);addEventListener('pointermove',mv,true);addEventListener('pointerup',()=>{d.style.display='none'},true)})},opt.ls||{});
  const p=await ctx.newPage();
  await p.route('**/three.min.js',r=>r.fulfill({body:THREE,contentType:'application/javascript'}));
  await p.route('**/peerjs.min.js',r=>r.fulfill({body:''}));
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:CSS,contentType:'text/css'}));
  await p.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await p.route('http://fonts.local/**',r=>{const fp=NM+decodeURIComponent(new URL(r.request().url()).pathname.slice(1));r.fulfill({body:fs.readFileSync(fp),headers:{'Access-Control-Allow-Origin':'*','Content-Type':fp.endsWith('woff2')?'font/woff2':'font/woff'}})});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto((process.env.URL||'http://localhost:8081/')+'index.html?debug');await p.evaluate(()=>document.fonts.ready);await sleep(500);
  const L2=(x,y)=>p.evaluate(([x,y])=>__AH.scr(x,y),[x,y]);
  const tap=async(x,y,d=80)=>{const s=await L2(x,y);await p.mouse.click(s.x,s.y);await sleep(d)};
  const down=async(x,y)=>{const s=await L2(x,y);await p.mouse.move(s.x,s.y);await p.mouse.down()};
  const moveTo=async(x,y,steps=8)=>{const s=await L2(x,y);await p.mouse.move(s.x,s.y,{steps})};
  const up=()=>p.mouse.up();
  const marks={};const mark=k=>{marks[k]=(Date.now()-tStart)/1000};
  const ev=(f,a)=>p.evaluate(f,a);
  // CPU が打ったように見せて球を出す（CPU のマレットを球の後ろに置く）
  const launch=(x,y,vx,vy)=>ev(([x,y,vx,vy])=>{const c=__AH.P[1],d=Math.hypot(vx,vy);c.x=c.tx=x-vx/d*70;c.y=c.ty=y-vy/d*70;const C=__AH.cpu;C.t=.7;C.tx=c.x;C.ty=c.y;C.strike=0;Object.assign(__AH.puck,{x,y,vx,vy,air:0,hold:0,lastTouch:1,sup:-1})},[x,y,vx,vy]);
  const waitState=async(st,ms=8000)=>{for(let k=0;k<ms/50;k++){if(await ev(()=>__AH.state)===st)return true;await sleep(50)}return false};
  const api={p,L2,tap,down,moveTo,up,sleep,mark,errs,ev,launch,waitState};
  await body(api);
  await sleep(300);const vpath=await p.video().path();await ctx.close();await b.close();
  let a=marks.a;const z=marks.z;if(marks.g&&marks.g-a>(opt.pre||7))a=marks.g-(opt.pre||7);
  const out=__dirname+'/out/'+name+'.mp4';fs.mkdirSync(__dirname+'/out',{recursive:true});
  execFileSync('ffmpeg',['-y','-loglevel','error','-ss',String(a),'-i',vpath,'-t',String(z-a),'-vf','fps=30','-c:v','libx264','-pix_fmt','yuv420p','-crf','30','-preset','slow','-movflags','+faststart','-an',out]);
  console.log(name,'clip',a.toFixed(2),'→',z.toFixed(2),'s',(fs.statSync(out).size/1024|0)+'KB','errors',errs.length?errs:'none');
}
// 試合中にずっと動かす「演出係」：アイテムボックスやCPUのアイテム使用を止める等
const DIRECTOR=`window.__dirOn=true;(function loop(){if(!window.__dirOn)return;try{const P=__AH.P;for(const q of P){if(!window.__box)q.box.on=false,q.box.cd=99}if(!window.__cpuItems)P[1].items=window.__keep1||[];}catch(e){}requestAnimationFrame(loop)})();`;
// 1P を自動で動かす（パックの後ろに回ってゴールへ打つ）。指の輪をマレットの位置に出す
const BOT0=`window.__bot={on:true,st:0,gx:300,ring:true};(function(){const FY0=158,FY1=1158,MID=658,cl=(v,a,b)=>Math.max(a,Math.min(b,v));let last=performance.now();
const ring=document.querySelector('div[style*="border-radius: 50%"]');
(function loop(){const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;const b=window.__bot;
 if(b&&b.on&&__AH.state==='play'){const p=__AH.P[0],pk=__AH.puck;p.maxV=1500;let tx=300,ty=FY1-90;
  if(b.st>0){b.st-=dt;tx=b.sx;ty=b.sy;p.boost=2.2}
  else{p.boost=1;if(pk.y>MID+4&&pk.air===0&&__AH.SUP.aim<0){const px=cl(pk.x+pk.vx*.04,26,574),py=Math.min(pk.y+pk.vy*.04,FY1-26);let dx=b.gx-px,dy=FY0-30-py;const d=Math.hypot(dx,dy);dx/=d;dy/=d;const bx=px-dx*72,by=py-dy*72;
    if(py>p.y-6){tx=px+(px<p.x?1:-1)*84;ty=py+70}else if(Math.hypot(p.x-bx,p.y-by)<28){b.st=.16;b.sx=px+dx*100;b.sy=py+dy*100;tx=b.sx;ty=b.sy}else{tx=bx;ty=by}}
   else{tx=300+(pk.x-300)*.5;ty=FY1-90}}
  p.tx=cl(tx,40,560);p.ty=cl(ty,MID+40,FY1-40);
  if(ring&&b.ring){const s=__AH.scr(p.x,p.y);ring.style.left=s.x+'px';ring.style.top=s.y+'px';ring.style.display='block'}}
 else if(ring&&b&&b.ring===false){}
 requestAnimationFrame(loop)})()})();`;
module.exports={scene,sleep,DIRECTOR,BOT0};
