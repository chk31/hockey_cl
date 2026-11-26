/* ピクセルの手続き的 VFX（コードだけで描く）
   どれも「小さなバッファ（n×n ドット）に1ドットずつ色番号を決め、パレットで色を付ける」作り。
   - 極座標（角度・半径）で形を作る
   - 値ノイズで縁を崩す
   - 4×4 の Bayer 行列で、ぼかさずにドットを間引いて消える（ディザ）
   - 暗い縁取り色をパレットに入れて、明るい所でも暗い所でも形が立つ（高コントラスト）
   呼び方：VFX.arc(ctx, cx, cy, p, {n, seed, ang})  p＝進み具合 0〜1。ctx へは n×n の ImageData を (cx-n/2, cy-n/2) に置く。
   ゲームでは小さな canvas に描いて、imageSmoothingEnabled=false で拡大する（nearest-neighbor）。 */
(function(root){
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v+.5)/16);
const bay=(x,y)=>BAYER[(y&3)*4+(x&3)];
const hash=(a,b,c=0)=>{let h=Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453;return h-Math.floor(h)};
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash(xi,yi,s),b=hash(xi+1,yi,s),c=hash(xi,yi+1,s),d=hash(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const PAL={
  arc:['#000000','#1c0838','#6a2cff','#2fd8ff','#ffffff'].map(hex),          // 0縁取り 1闇 2紫 3水色 4白
  hole:['#000000','#3a0a14','#c8202a','#ff7a1a','#ffd84a','#ffffff'].map(hex), // 0穴・縁 1暗赤 2赤 3橙 4黄 5白
};
const bufs={};
function buf(ctx,n){const k=n;if(!bufs[k])bufs[k]=ctx.createImageData(n,n);const im=bufs[k];im.data.fill(0);return im}
function put(im,i,c){const d=im.data,o=i*4;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255}
const eOut=t=>1-Math.pow(1-t,3);

/* 空間が砕けるアーク：三日月形の斬撃。中心が白、外へ水色→紫、外側に黒い縁取り。
   後半は弧に沿ってひびが入り、破片（三角）が外へずれて飛び、Bayer ディザで消える */
function arc(ctx,cx,cy,p,o={}){const n=o.n||96,s=o.seed||1,ang=o.ang||0,im=buf(ctx,n),P=PAL.arc,h=n/2;
  const sweep=Math.PI*1.25,a0=ang-sweep/2,grow=eOut(Math.min(1,p*2.2)),R=h*.62,th=h*.16*(1-p*.6),crack=Math.max(0,(p-.35)/.65);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const dx=x-h+.5,dy=y-h+.5;let a=Math.atan2(dy,dx)-a0;a=((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    if(a>sweep*grow)continue;const u=a/sweep; // 弧の上の位置 0〜1
    // 破片：弧を角度で区切り、区切りごとに外へずらす（砕ける）
    const seg=Math.floor(u*9),off=crack*(4+hash(seg,s)*10),rr=Math.hypot(dx,dy)-off;
    const taper=Math.sin(Math.PI*Math.min(1,u*1.15))*(1-crack*.3),w=th*taper*(.8+.4*vnoise(u*8,p*3,s));
    const d=Math.abs(rr-R*(1+.08*Math.sin(u*9+s)));if(d>w+1.6)continue;
    const edgeCut=crack>0&&Math.abs(((u*9)%1)-.5)>.5-crack*.18; // ひび：区切り目が開く
    if(edgeCut)continue;
    const fade=Math.max(0,(p-.55)/.45);if(fade>0&&bay(x,y)<fade)continue; // ディザで消える
    let c=d>w?0:d>w*.62?2:d>w*.28?3:4;if(p>.7&&c===4)c=3;put(im,y*n+x,P[c])}
  // 飛び散る粒（四角）
  for(let k=0;k<14;k++){const u=hash(k,s,3),a=a0+u*sweep*grow,r=R+(hash(k,s,5)-.3)*10+crack*24*hash(k,s,7),x=Math.round(h+Math.cos(a)*r),y=Math.round(h+Math.sin(a)*r);
    if(p<.15||x<1||y<1||x>=n-1||y>=n-1||bay(x,y)<Math.max(0,(p-.6)/.4))continue;put(im,y*n+x,P[k%3?3:4]);put(im,y*n+x+1,P[0])}
  ctx.putImageData(im,Math.round(cx-h),Math.round(cy-h))}

/* 降着円盤：楕円の円盤（上下につぶした円）を極座標＋ノイズの縞で回し、内側ほど白く熱い。中心は真っ黒な穴と白い光子リング。
   始まりは円盤が開き、最後は内側へ吸い込まれて白く閃いて消える */
function hole(ctx,cx,cy,p,o={}){const n=o.n||96,s=o.seed||1,im=buf(ctx,n),P=PAL.hole,h=n/2,t=p*6;
  const open=eOut(Math.min(1,p*3)),col=p>.8?(p-.8)/.2:0,R1=h*.18*(1-col*.8),R2=h*(.30+.55*open)*(1-col),tilt=.45;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const dx=x-h+.5,dy=(y-h+.5)/tilt,r=Math.hypot(dx,dy),dyr=y-h+.5,rr=Math.hypot(dx,dyr);
    let c=-1;
    if(rr<R1*.95)c=0; // 穴
    else if(rr<R1*1.25)c=5; // 光子リング
    else if(r>R1&&r<R2){const a=Math.atan2(dy,dx),q=(r-R1)/(R2-R1),sw=a*2+t*(3/(.3+q))+q*6; // 内側ほど速く回る
      const band=vnoise(Math.cos(sw)*2+3,Math.sin(sw)*2+q*5,s)*.75+.25*Math.sin(sw*3);let heat=(1-q)*1.25+band*.55-.25;
      if(dyr<0&&rr<R1*1.6)heat*=.4; // 穴の手前上は円盤が隠れる
      if(heat<.12)continue;c=heat>1.05?5:heat>.8?4:heat>.55?3:heat>.33?2:1;
      if(q>.85&&bay(x,y)>.5)continue}
    if(c<0)continue;
    if(col>0&&c>0&&bay(x,y)<col)continue;put(im,y*n+x,P[c])}
  // 吸い込まれる粒
  if(p<.85)for(let k=0;k<18;k++){const a=hash(k,s)*6.283+t*(1+hash(k,s,2)),r=(1-((p*2+hash(k,s,4))%1))*h*.95,x=Math.round(h+Math.cos(a)*r),y=Math.round(h+Math.sin(a)*r*tilt);if(x>=0&&y>=0&&x<n&&y<n)put(im,y*n+x,P[k%2?4:5])}
  // 消える瞬間の白い閃光（十字）
  if(p>.86&&p<.97){const L=Math.round((1-Math.abs(p-.915)/.055)*h*.9);for(let k=-L;k<=L;k++){put(im,h*n+h+k,P[5]);put(im,(h+k)*n+h,P[5])}}
  ctx.putImageData(im,Math.round(cx-h),Math.round(cy-h))}

/* 衝撃波（ARCADE スマッシュ）：打った向きへ、押しつぶされた弧（波面）が飛んでいく。
   - 前側に厚い波面（白→黄→橙→赤、外側に黒い縁）。横へ回るほど細く、後ろ側には出さない
   - 少し遅れて細い2つ目の波（こだま）
   - 打った瞬間：白い閃光と8本のとげ
   - 波面の前に、空気が押される短い線（前方の扇形）
   - 終わりは Bayer ディザで間引いて消える */
function shock(ctx,cx,cy,p,o={}){const n=o.n||96,s=o.seed||1,im=buf(ctx,n),h=n/2,ang=o.ang||0,ca=Math.cos(ang),sa=Math.sin(ang);
  const P=(o.pal||['#000000','#c8102e','#ff7a1a','#ffe14a','#ffffff']).map(c=>Array.isArray(c)?c:hex(c));
  const fade=Math.max(0,(p-.55)/.45);
  const wave=(x,y,dx,dy,R,TH,base)=>{const u=dx*ca+dy*sa,v=-dx*sa+dy*ca,back=-h*.18; // 波の中心は打点より少し後ろ
    const uu=u-back,e=Math.hypot(uu*1.0,v*1.25),ang2=Math.atan2(v,uu);const f=Math.cos(ang2); // f＝1 真正面、0 真横
    if(f<.05)return -1;const th=TH*Math.pow(f,1.4)+1,d=R-e;if(d<-1.3||d>th)return -1;
    if(d<0)return 0;const q=d/th;return base?(q<.22?4:q<.5?3:q<.8?2:1):(q<.5?3:2)};
  const R1=h*(.18+.78*eOut(p)),R2=h*(.1+.62*eOut(Math.max(0,p-.08)/.92));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const dx=x-h+.5,dy=y-h+.5;
    let c=wave(x,y,dx,dy,R1,h*.2*(1-p*.55),true);
    if(c<0&&p>.08)c=wave(x,y,dx,dy,R2,h*.07,false);
    if(c<0&&p<.22){const r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),sp=Math.pow(Math.abs(Math.cos(a*4)),12),L=h*.42*(1-p/.22); // 閃光ととげ
      if(r<h*.16*(1-p/.22))c=4;else if(r<L*sp)c=r<L*sp*.6?4:3}
    if(c<0)continue;if(fade>0&&bay(x,y)<fade*(c===0?.8:1))continue;put(im,y*n+x,P[c])}
  // 空気の線：波面の少し前、扇形に短く
  if(p>.05&&p<.8)for(let k=0;k<9;k++){const a=(hash(k,s)-.5)*1.1,r0=R1+3+hash(k,s,2)*6,len=3+Math.round(hash(k,s,3)*5),fc=Math.cos(a),fs=Math.sin(a);
    for(let j=0;j<len;j++){const r=r0+j*1.2,uu=r*fc-h*.18,vv=r*fs/1.25,x=Math.round(h+uu*ca-vv*sa),y=Math.round(h+uu*sa+vv*ca);if(x<0||y<0||x>=n||y>=n||bay(x,y)<fade)continue;put(im,y*n+x,P[j===0?4:3])}}
  ctx.putImageData(im,Math.round(cx-h),Math.round(cy-h))}

root.VFX={arc,hole,shock,PAL,bay,vnoise};
})(typeof window!=='undefined'?window:globalThis);
