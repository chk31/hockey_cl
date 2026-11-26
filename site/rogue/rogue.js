/* ================= ローグライク版（/rogue/）=================
   公開時に tools/build_rogue.py が本体 index.html をコピーし、本体のスクリプトの { … } の内側の最後にこのファイルを埋め込んで rogue/index.html を作る。
   なので本体の let/const（P・puck・BOSS など）をそのまま読み書きでき、本体の関数（goal / update / pdown / drawAll / parryStart / give）を包み直せる。
   流れ：タイトル → [戦1 ザコ] → 3枚から1枚 → [戦2 強敵] → 3枚から1枚 → [戦3 ボス NULL] → クリア。負けたらその場で終わり。
   各試合はお互い HP3（3点取られたら負け）。ボスも HP3・プレイヤーのライフ3。
   開発者用サンドボックス：左上の SB ボタン。プレイ中でも状態を変えられる。 */
(function(){
'use strict';
const RG={
  hp:3,                                   // 各試合の HP（RULE.win）
  boss:{hp:3,lives:3,ph2:2,ph3:1},        // ボス：HP3（2で第2段階、1で最終段階）・プレイヤーのライフ3
  jumpT:10,chargeT:15,blockCD:15,tele:.8, // 強敵の技：ジャンプ台の間隔・スーパーシュートの間隔・バンパーを置き直すまで・前兆の時間
  blockHP:3,
};
const STAGES=[
  {k:'zako',n:'DRONE',d:'ふつうの CPU',lv:()=>Object.assign({},LV[1],{n:'DRONE'})},
  {k:'elite',n:'',d:'',lv:()=>Object.assign({},LV[1],{n:'ELITE',sp:LV[1].sp*1.1,re:LV[1].re*.9})},
  {k:'boss',n:'NULL',d:'ボス'},
];
const SKILLS={
  jumper:{n:'JUMPER',d:'ジャンプ台を自分の陣地に置く',c:IT.jump.c},
  blocker:{n:'BLOCKER',d:'ゴールの前にかたいバンパー',c:IT.bumper.c},
  charger:{n:'CHARGER',d:'ときどきスーパーシュート',c:AURA},
};
/* パッシブ（自分だけ）。apply はマッチ開始時に P[0] などへ書き込む */
const PASS={
  hard:{n:'ハードショット',d:['打ったパックが','12% 速くなる'],ic:'H',c:'#ff5555',ap:p=>{p.hm=1.12}},
  big:{n:'ビッグマレット',d:['マレットが','1.25倍の大きさ'],ic:'B',c:'#ffaa00',ap:p=>{p.mr=MR*1.25}},
  wide:{n:'ワイドゴール',d:['相手のゴールが','左右に20ずつ広い'],ic:'W',c:'#55ff55',ap:()=>{WB.t=20}},
  box:{n:'箱の常連',d:['アイテム箱が','35% 早く出る'],ic:'?',c:YEL,ap:p=>{p.boxK=.65}},
  life:{n:'長持ち',d:['置いた物が','1.6倍長く残る'],ic:'L',c:'#00ffff',ap:p=>{p.lifeK=1.6}},
  fav:{n:'ひいき',d:['','がよく出る（3倍）'],ic:'F',c:'#ff88ff',ap:p=>{const w=Object.assign({},IW);w[RUN.fav]=(w[RUN.fav]||1)*3;p.iw=w}},
  gosen:{n:'後の先',d:['パリィに成功すると','アイテム箱がすぐ出る'],ic:'P',c:'#3399ff',ap:()=>{}},
  giri:{n:'ギリギリ王',d:['パリィの受付が半分','成功すると次の得点が2点'],ic:'G',c:'#ff0055',ap:p=>{p.parK=.5}},
};
const PKEYS=Object.keys(PASS),MAXP=2;
const RUN={on:false,stage:0,pass:[],fav:'jump',skills:[],ov:{},cpuOv:{},double:false,res:null,t:0,cards:[],enemy:null,
  sk:{jump:0,charge:0,block:0},tele:[],pfl:{},reached:0};
let SB_FREEZE=false,SB_SLOW=false;

/* ---- 本体の値の準備 ---- */
Object.assign(BOSSC,{hp:RG.boss.hp,lives:RG.boss.lives,ph2:RG.boss.ph2,ph3:RG.boss.ph3});
RULE.win=RG.hp;
const best=()=>{try{return JSON.parse(localStorage.getItem('ah_rogue')||'{}')}catch(e){return {}}};
const saveBest=o=>{try{localStorage.setItem('ah_rogue',JSON.stringify(o))}catch(e){}};

function applyMods(){const p=P[0];
  delete p.hm;delete p.mr;delete p.boxK;delete p.lifeK;delete p.parK;delete p.iw;WB.t=0;
  for(const k of RUN.pass)PASS[k].ap(p);
  for(const k in RUN.ov){if(k==='wt')WB.t=RUN.ov[k];else p[k]=RUN.ov[k]}
  bossField()}
function stageLv(){const L=STAGES[RUN.stage].lv();return Object.assign(L,RUN.cpuOv)}

/* ---- 試合を始める ---- */
function startMatch(){RUN.double=false;RUN.tele=[];RUN.sk={jump:RG.jumpT*.6,charge:RG.chargeT*.6,block:1.5};
  const st=STAGES[RUN.stage];
  if(st.k==='boss'){BOSS.on=false;bossStart();Object.assign(LV[3],RUN.cpuOv)}
  else{bossOff();LV[4]=stageLv();start('cpu',4)}
  RULE.win=RG.hp;applyMods();P[0].box.cd=4*(P[0].boxK||1);
  RUN.reached=Math.max(RUN.reached,RUN.stage+1)}
function newRun(){Object.assign(RUN,{on:true,stage:0,pass:[],skills:[],double:false,reached:0});pickEnemy();toIntro()}
function pickEnemy(){if(STAGES[RUN.stage].k==='elite'){const ks=Object.keys(SKILLS),k=ks[Math.floor(Math.random()*ks.length)];RUN.skills=[k];RUN.enemy=SKILLS[k]}
  else{RUN.skills=[];RUN.enemy=null}}
function toIntro(){state='rg_intro';RUN.t=0;beep(660,.05);beep(990,.06,'square',.06,.07)}
function toTitle(){RUN.on=false;bossOff();clearMatch();placed.forEach(drop);placed=[];P=[mk(0),mk(1)];WB.t=0;bossField();state='rg_title';RUN.t=0}

/* ---- 報酬：3枚から1枚 ---- */
function makeCards(){const pool=PKEYS.filter(k=>!RUN.pass.includes(k));for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  RUN.cards=pool.slice(0,3);RUN.favPick=KEYS.filter(k=>k!=='super')[Math.floor(Math.random()*4)]}
const CARD=k=>({x:24+k*192,y:MID-190,w:168,h:330});
function takeCard(k){const key=RUN.cards[k];if(!key)return;if(RUN.pass.length>=MAXP)RUN.pass.shift();RUN.pass.push(key);if(key==='fav')RUN.fav=RUN.favPick;
  sfx('pwr');RUN.stage++;pickEnemy();toIntro()}

/* ---- 本体の関数を包む ---- */
const _goal=goal;
goal=function(scorer){
  if(RUN.on&&scorer===0&&RUN.double){RUN.double=false;RUN.pfl.giri=1.2;
    if(BOSS.on)BOSS.hp=Math.max(1,BOSS.hp-1);else if(P[0].score+1<RULE.win)P[0].score++;else P[0].score=RULE.win-1}
  return _goal(scorer)};
const _parryStart=parryStart;
parryStart=function(i,nx,ny){const r=_parryStart(i,nx,ny);
  if(RUN.on&&i===0){if(RUN.pass.includes('gosen')&&!P[0].box.on){spawnBox(P[0]);RUN.pfl.gosen=1.2}if(RUN.pass.includes('giri')){RUN.double=true;RUN.pfl.giri=1.2}}
  return r};
const _give=give;
give=function(p){if(RUN.on&&p.i===0&&RUN.pass.includes('fav'))RUN.pfl.fav=.8;return _give(p)};

const _update=update;
update=function(dt){
  if(state==='title'){toTitle()} // 本体のタイトル（中断→QUIT など）はローグライクのタイトルへ
  if(state.startsWith('rg_')){clock+=dt;flash=Math.max(0,flash-dt*4);for(const f of fx)f.t+=dt;for(let k=fx.length-1;k>=0;k--)if(fx[k].t>fx[k].life)fx.splice(k,1);
    RUN.t+=dt;if(state==='rg_intro'&&RUN.t>2.2)startMatch();return}
  if(SB_FREEZE&&(state==='play'||state==='goal')){clock+=dt;return}
  _update(SB_SLOW?dt*.25:dt);
  for(const k in RUN.pfl)RUN.pfl[k]=Math.max(0,RUN.pfl[k]-dt);
  if(state==='over'&&RUN.on){const win=BOSS.on?BOSS.result==='win':P[0].score>=RULE.win;RUN.res=win?'win':'lose';state='rg_res';RUN.t=0;
    if(win&&STAGES[RUN.stage].k!=='boss')setTimeout(()=>_seq([523,659,784,1047],.08,'square',.06),300);
    if(!win)setTimeout(()=>_seq([392,330,262,196],.14,'square',.07),400)}
  if(state==='play'&&RUN.on)skills(dt)};

/* ---- 強敵の技 ---- */
function skills(dt){if(!live||PAR.who>=0||SUP.aim>=0)return;const S=RUN.skills;
  for(const t of RUN.tele){t.t-=dt;if(t.t<=0)t.go()}RUN.tele=RUN.tele.filter(t=>t.t>0);
  if(S.includes('jumper')){RUN.sk.jump-=dt;if(RUN.sk.jump<=0){RUN.sk.jump=RG.jumpT;skillFire('jumper')}}
  if(S.includes('blocker')){const alive=placed.some(q=>q.rgBlock&&!q.dead);if(!alive&&!RUN.tele.some(t=>t.k==='blocker')){RUN.sk.block-=dt;if(RUN.sk.block<=0){RUN.sk.block=RG.blockCD;skillFire('blocker')}}}
  if(S.includes('charger')&&!P[1].pw){RUN.sk.charge-=dt;if(RUN.sk.charge<=RG.tele&&!RUN.tele.some(t=>t.k==='charger'))skillFire('charger');}
}
function skillFire(k){const T=RG.tele;beep(1760,.05,'square',.05);beep(1760,.05,'square',.05,.12);
  if(k==='jumper'){let x=0,y=0;for(let n=0;n<10;n++){x=rnd(110,FW-110);y=rnd(FY0+250,MID-130);if(!placed.some(q=>Math.hypot(q.x-x,q.y-y)<120))break}
    RUN.tele.push({k,x,y,t:T,go:()=>{placed.push({id:++pid,type:'jump',x,y,o:1,age:0,life:9.6,hit:0,mesh:null});sfx('place',x);addFx('wave',x,y,IT.jump.r+60,'',IT.jump.c)}})}
  else if(k==='blocker'){const x=FW/2,y=FY0+200;RUN.tele.push({k,x,y,t:T,go:()=>{placed.push({id:++pid,type:'bumper',x,y,o:1,age:0,life:1e9,hit:0,mesh:null,mega:true,hp:RG.blockHP,rgBlock:true});sfx('place',x);addFx('wave',x,y,IT.bumper.r+60,'',IT.bumper.c)}})}
  else if(k==='charger'){RUN.tele.push({k,x:0,y:0,t:T,go:()=>{RUN.sk.charge=RG.chargeT;const b=P[1];if(b.pw)return;b.pw=true;addFx('wave',b.x,b.y,110,'',AURA);sfx('pwr')}})}}

/* ---- 入力 ---- */
const _pdown=pdown;
pdown=function(id,x,y){
  if(!state.startsWith('rg_'))return _pdown(id,x,y);
  const l=local(0,x,y);unlock();
  if(state==='rg_title'){if(inR(l,T_START))newRun();else if(inR(l,T_BACK)){beep(660,.05);setTimeout(()=>{location.href='./'},80)}return}
  if(state==='rg_intro'){if(RUN.t>.4)startMatch();return}
  if(state==='rg_res'){if(RUN.t<resWait())return;
    if(RUN.res==='lose'){state='rg_end';RUN.t=0;return}
    if(STAGES[RUN.stage].k==='boss'){state='rg_end';RUN.t=0;const b=best();saveBest({clears:(b.clears||0)+1,best:3});_seq([523,659,784,1047,0,1047,1319,1568,2093],.1,'square',.07);return}
    makeCards();state='rg_pick';RUN.t=0;return}
  if(state==='rg_pick'){if(RUN.t<.5)return;for(let k=0;k<3;k++)if(inR(l,CARD(k))){takeCard(k);return}return}
  if(state==='rg_end'){if(RUN.t<1)return;const b=best();if(RUN.res==='lose')saveBest(Object.assign(b,{best:Math.max(b.best||0,RUN.reached)}));toTitle();beep(660,.06);return}
};
const resWait=()=>BOSS.on&&RUN.res==='win'?2.6:1.2;

/* ---- 描画 ---- */
const T_START={x:150,y:MID+40,w:300,h:90},T_BACK={x:150,y:MID+160,w:300,h:56};
const _drawAll=drawAll;
drawAll=function(){_drawAll();g.save();try{overlay()}finally{g.restore()}};
function heart(x,y,on,c){sq(x,y,22,'#000');sq(x,y,16,on?c:'#333');if(on)sq(x-4,y-4,6,'#fff')}
function passIcon(k,x,y,s,lit){const P0=PASS[k];pbox(x-s/2,y-s/2,s,s,lit?(blink(10)?'#fff':YEL):P0.c,'#111');ptext(P0.ic,x,y+2,s*.45,lit?'#fff':P0.c)}
function overlay(){
  const inMatch=state==='play'||state==='goal'||state==='pause';
  // トレイの点数の所は HP の表示にする（試合の外では隠す。ボス戦は本体がライフを出す）
  if(!BOSS.on)for(const i of [0,1])frame(i,()=>{g.fillStyle='#000';g.fillRect(14,FY1+30,100,60);if(RUN.on&&(inMatch||state==='rg_res')){const hp=RULE.win-P[1-i].score;for(let k=0;k<RULE.win;k++)heart(34+k*30,FY1+56,k<hp,COL[i])}});
  if(RUN.on&&(inMatch||state==='rg_res')){
    // HP（自分＝相手の点で減る）：トレイの点数の所に
    frame(0,()=>{const n=RUN.pass.length,s=n<=2?38:Math.max(16,Math.floor(96/n)-4),dx=n<=2?46:s+4;RUN.pass.forEach((k,j)=>passIcon(k,420+j*dx,FY1+56,s,(RUN.pfl[k]||0)>0));if(RUN.double){ptext('×2',420,FY1+98,12,blink(6)?YEL:'#ff0055')}});
    frame(1,()=>{if(!BOSS.on){ptext((RUN.stage+1)+'/3',430,FY1+40,10,'#888');ptext(RUN.enemy?RUN.enemy.n:STAGES[RUN.stage].n,430,FY1+68,10,RUN.enemy?RUN.enemy.c:'#aaa')}});
    // 強敵の技の前兆・耐久
    for(const t of RUN.tele){const a=1-t.t/RG.tele;if(t.k==='charger'){const b=P[1];for(let j=0;j<14;j++){const an=j/14*6.2832+clock*6;sq(b.x+Math.cos(an)*(mrOf(1)+16),b.y+Math.sin(an)*(mrOf(1)+16),8,blink(10)?'#fff':AURA)}}
      else{const c=t.k==='jumper'?IT.jump.c:IT.bumper.c,R=60-a*20;for(let j=0;j<16;j++){const an=j/16*6.2832;if(blink(8))sq(t.x+Math.cos(an)*R,t.y+Math.sin(an)*R,8,c)}}
      if(blink(6))ptext('!',t.k==='charger'?P[1].x:t.x,(t.k==='charger'?P[1].y:t.y)-70,20,YEL)}
    if(!BOSS.on)for(const it of placed)if(it.rgBlock&&!it.dead)for(let j=0;j<it.hp;j++){sq(it.x-12+j*12,it.y-50,10,'#000');sq(it.x-12+j*12,it.y-50,6,'#cc88ff')}
  }
  if(state==='rg_title'){dim(.7);frame(0,()=>{pbox(36,MID-260,FW-72,500,'#ff0055');ptext('AIR HOCKEY',FW/2,MID-200,20,'#888');ptext('ROGUE',FW/2,MID-130,48,YEL);
      ptext('3戦勝ちぬけ・HP3',FW/2,MID-62,16,'#fff',DOT);
      pbox(T_START.x,T_START.y,T_START.w,T_START.h,blink(2)?YEL:'#fff','#1a1a1a');ptext('START',FW/2,T_START.y+T_START.h/2+2,24,'#fff');
      pbox(T_BACK.x,T_BACK.y,T_BACK.w,T_BACK.h,'#666');ptext('◀ ふつうのモード',FW/2,T_BACK.y+T_BACK.h/2+2,14,'#ccc',DOT);
      const b=best();if(b.clears)ptext('CLEAR ×'+b.clears,FW/2,MID+250,12,YEL);else if(b.best)ptext('BEST '+b.best+'/3',FW/2,MID+250,12,'#aaa');
      ptext('v'+VER,FW-48,MID+226,8,'#777',PIX,'right')})}
  else if(state==='rg_intro'){dim(.75);const st=STAGES[RUN.stage],e=RUN.enemy;frame(0,()=>{
      ptext('STAGE '+(RUN.stage+1)+'/3',FW/2,MID-150,18,'#aaa');
      ptext(st.k==='boss'?'NULL':e?e.n:st.n,FW/2,MID-80,40,st.k==='boss'?'#ff0055':e?e.c:'#fff');
      ptext(st.k==='boss'?'ボス・HP3':e?e.d:st.d,FW/2,MID-20,18,'#fff',DOT);
      if(RUN.pass.length){ptext('PASSIVE',FW/2,MID+60,10,'#888');RUN.pass.forEach((k,j)=>passIcon(k,FW/2+(j-(RUN.pass.length-1)/2)*56,MID+110,44,false))}
      if(blink(2))ptext('▶',FW/2,MID+190,20,'#fff',DOT)})}
  else if(state==='rg_res'){const w=RUN.res==='win';if(RUN.t<resWait()-.6&&w&&BOSS.on)return;dim(.55*Math.min(1,RUN.t*3));
    frame(0,()=>{ptext(w?(BOSS.on?'NULL DEFEATED!':'STAGE CLEAR!'):'GAME OVER',FW/2,MID-40,w?30:36,w?YEL:'#ff0055');
      if(RUN.t>resWait())ptext('▶',FW/2,MID+60,22,'#fff',DOT)})}
  else if(state==='rg_pick'){dim(.75);frame(0,()=>{ptext('PASSIVE',FW/2,MID-236,22,YEL);ptext(RUN.pass.length>=MAXP?'（いちばん古いものと入れかわる）':'ひとつ選ぶ',FW/2,MID-206,13,'#aaa',DOT);
      RUN.cards.forEach((k,j)=>{const r=CARD(j),P0=PASS[k],a=Math.min(1,Math.max(0,RUN.t*4-j*.4));if(a<=0)return;g.globalAlpha=a;
        pbox(r.x,r.y,r.w,r.h,P0.c,'#0c0c14');passIcon(k,r.x+r.w/2,r.y+70,64,false);
        ptext(P0.n,r.x+r.w/2,r.y+150,16,'#fff',DOT);
        const d=k==='fav'?[IT[RUN.favPick].n,P0.d[1]]:P0.d;d.forEach((t,m)=>ptext(t,r.x+r.w/2,r.y+200+m*28,12,'#ccc',DOT));
        if(k==='fav')spr(RUN.favPick,r.x+r.w/2,r.y+280,44,-1);g.globalAlpha=1})})}
  else if(state==='rg_end'){dim(.8);const w=RUN.res==='win';frame(0,()=>{ptext(w?'ALL CLEAR!':'GAME OVER',FW/2,MID-170,34,w?YEL:'#ff0055');
      ptext('STAGE '+RUN.reached+'/3',FW/2,MID-100,16,'#fff');
      RUN.pass.forEach((k,j)=>{passIcon(k,FW/2-120,MID-30+j*60,44,false);ptext(PASS[k].n,FW/2-80,MID-28+j*60,14,'#fff',DOT,'left')});
      if(RUN.t>1)ptext('タップでタイトルへ',FW/2,MID+170,16,'#fff',DOT)})}
}
function dim(a){g.fillStyle='rgba(0,0,0,'+a+')';g.fillRect(-40,FY0,FW+80,FL)}

/* ================= 開発者用サンドボックス ================= */
const css=`#sbB{position:fixed;left:calc(6px + env(safe-area-inset-left,0px));top:calc(6px + env(safe-area-inset-top,0px));z-index:50;font:10px "Press Start 2P",monospace;color:#ff0;background:#000;border:2px solid #ff0;padding:8px 8px;opacity:.75}
#sbP{position:fixed;left:0;top:0;bottom:0;width:min(330px,92vw);z-index:49;background:rgba(0,0,0,.88);border-right:2px solid #ff0;color:#fff;font:13px "DotGothic16",monospace;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:46px 8px 40px;display:none}
#sbP h3{font:10px "Press Start 2P",monospace;color:#ff0;margin:14px 0 6px;border-bottom:1px solid #444;padding-bottom:4px}
#sbP .r{display:flex;align-items:center;gap:4px;margin:3px 0}#sbP .r span.l{flex:1}#sbP .r span.v{min-width:62px;text-align:right;color:#0ff;font:10px "Press Start 2P",monospace}
#sbP button{font:12px "DotGothic16",monospace;color:#fff;background:#111;border:2px solid #777;padding:5px 7px;margin:2px;touch-action:manipulation}
#sbP button.on{border-color:#ff0;color:#ff0;background:#332}#sbP .w{display:flex;flex-wrap:wrap}`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const B=document.createElement('div');B.id='sbB';B.textContent='SB';document.body.appendChild(B);
const PN=document.createElement('div');PN.id='sbP';document.body.appendChild(PN);
for(const el of [B,PN])for(const ev of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','gesturestart'])el.addEventListener(ev,e=>e.stopPropagation(),{passive:true});
let open=false;B.addEventListener('click',()=>{open=!open;PN.style.display=open?'block':'none';B.style.opacity=open?1:.75;if(open)build()});
const fmt=v=>typeof v==='number'?(Math.abs(v)>=100?Math.round(v)+'':(Math.round(v*1000)/1000)+''):String(v);
let REF=[];
function h(t){const e=document.createElement('h3');e.textContent=t;PN.appendChild(e)}
function wrap(){const w=document.createElement('div');w.className='w';PN.appendChild(w);return w}
function btn(par,t,fn,on){const b=document.createElement('button');b.textContent=t;b.addEventListener('click',()=>{unlock();fn();refresh()});par.appendChild(b);if(on)REF.push(()=>b.classList.toggle('on',!!on()));return b}
function row(lab,get,step,set){const r=document.createElement('div');r.className='r';const l=document.createElement('span');l.className='l';l.textContent=lab;const v=document.createElement('span');v.className='v';
  r.append(l,v);btn(r,'−',()=>set(get()-step));btn(r,'＋',()=>set(get()+step));PN.appendChild(r);REF.push(()=>{v.textContent=fmt(get())})}
function refresh(){for(const f of REF)f()}
setInterval(()=>{if(open)refresh()},250);
const inGame=()=>state==='play'||state==='goal'||state==='pause';
function ensureRun(){if(!RUN.on){RUN.on=true;RUN.pass=RUN.pass||[];RUN.reached=0}}
function goStage(s){ensureRun();RUN.stage=s;if(STAGES[s].k==='elite'&&!RUN.skills.length)pickEnemy();if(STAGES[s].k!=='elite'){RUN.enemy=RUN.skills.length?SKILLS[RUN.skills[0]]:null}startMatch()}
function build(){PN.innerHTML='';REF=[];
  h('RUN');{const w=wrap();btn(w,'ザコ戦',()=>goStage(0));btn(w,'強敵戦',()=>goStage(1));btn(w,'ボス戦',()=>goStage(2));btn(w,'新しいラン',()=>newRun());btn(w,'タイトル',()=>toTitle())}
  {const w=wrap();btn(w,'いま勝ち',()=>{if(!inGame())return;if(BOSS.on){BOSS.hp=1;BOSS.rw=[]}else P[0].score=RULE.win-1;goal(0)});btn(w,'いま負け',()=>{if(!inGame())return;if(BOSS.on)BOSS.lives=1;else P[1].score=RULE.win-1;goal(1)});
    btn(w,'報酬を引く',()=>{ensureRun();makeCards();state='rg_pick';RUN.t=1})}
  h('HP');row('HP（試合ごと）',()=>RG.hp,1,v=>{RG.hp=clamp(v,1,9);RULE.win=RG.hp});
  row('自分の HP',()=>BOSS.on?BOSS.lives:RULE.win-P[1].score,1,v=>{if(BOSS.on)BOSS.lives=clamp(v,1,9);else P[1].score=clamp(RULE.win-v,0,RULE.win-1)});
  row('相手の HP',()=>BOSS.on?BOSS.hp:RULE.win-P[0].score,1,v=>{if(BOSS.on){BOSS.hp=clamp(v,1,BOSSC.hp);BOSS.phase=BOSS.hp<=BOSSC.ph3?3:BOSS.hp<=BOSSC.ph2?2:1}else P[0].score=clamp(RULE.win-v,0,RULE.win-1)});
  h('PASSIVE（次の試合から／今も反映）');{const w=wrap();for(const k of PKEYS)btn(w,PASS[k].n,()=>{const i=RUN.pass.indexOf(k);if(i>=0)RUN.pass.splice(i,1);else RUN.pass.push(k);if(inGame())applyMods()},()=>RUN.pass.includes(k))}
  {const w=wrap();for(const k of KEYS.filter(k=>k!=='super'))btn(w,'ひいき:'+IT[k].n,()=>{RUN.fav=k;if(inGame())applyMods()},()=>RUN.fav===k)}
  h('自分の数値（上書き）');
  const ov=(lab,key,def,step,lo,hi)=>row(lab,()=>key==='wt'?WB.t:(P[0][key]!=null?P[0][key]:def),step,v=>{v=clamp(Math.round(v*1000)/1000,lo,hi);RUN.ov[key]=v;if(key==='wt'){WB.t=v;bossField()}else P[0][key]=v});
  ov('マレット半径','mr',MR,5,20,90);ov('打つ速さ倍率','hm',1,.05,.5,2);ov('箱の間隔倍率','boxK',1,.05,.1,3);ov('置物の持続倍率','lifeK',1,.1,.2,5);ov('パリィ受付倍率','parK',1,.1,.1,3);ov('相手ゴール＋幅','wt',0,10,0,150);
  {const w=wrap();btn(w,'上書きを消す',()=>{RUN.ov={};applyMods()})}
  h('相手 CPU の数値（今の試合）');
  const cv=(lab,key,step,lo,hi)=>row(lab,()=>LV[lvl][key],step,v=>{v=clamp(Math.round(v*1000)/1000,lo,hi);LV[lvl][key]=v;RUN.cpuOv[key]=v;if(key==='sp')P[1].maxV=v});
  cv('速さ sp','sp',100,100,4000);cv('反応 re（小さいほど速い）','re',.02,.01,1);cv('狙いのずれ err','err',5,0,150);cv('アイテム間隔 cd','cd',.5,.5,99);cv('打つ力 pw','pw',.05,.5,2.5);cv('追いかけ tr','tr',.05,0,1);
  {const w=wrap();btn(w,'CPU の上書きを消す',()=>{RUN.cpuOv={}})}
  h('強敵の技');{const w=wrap();for(const k of Object.keys(SKILLS))btn(w,SKILLS[k].n,()=>{const i=RUN.skills.indexOf(k);if(i>=0)RUN.skills.splice(i,1);else RUN.skills.push(k)},()=>RUN.skills.includes(k))}
  {const w=wrap();for(const k of Object.keys(SKILLS))btn(w,'発動:'+SKILLS[k].n,()=>{if(state==='play')skillFire(k)})}
  row('ジャンプ台の間隔',()=>RG.jumpT,1,v=>RG.jumpT=clamp(v,1,60));row('スーパーの間隔',()=>RG.chargeT,1,v=>RG.chargeT=clamp(v,2,60));row('バンパー置き直し',()=>RG.blockCD,1,v=>RG.blockCD=clamp(v,1,60));row('バンパー耐久',()=>RG.blockHP,1,v=>RG.blockHP=clamp(v,1,9));row('前兆の時間',()=>RG.tele,.1,v=>RG.tele=clamp(Math.round(v*10)/10,.1,3));
  h('アイテム');{const w=wrap();for(const k of KEYS)btn(w,'自分+'+IT[k].n,()=>{if(P[0].items.length<SLOTS)P[0].items.push(k)})}
  {const w=wrap();for(const k of KEYS)btn(w,'CPU+'+IT[k].n,()=>{if(P[1].items.length<SLOTS)P[1].items.push(k)})}
  {const w=wrap();btn(w,'自分の箱',()=>{if(!P[0].box.on)spawnBox(P[0])});btn(w,'CPU の箱',()=>{if(!P[1].box.on)spawnBox(P[1])});btn(w,'置いた物を消す',()=>{placed.forEach(drop);placed=[]});btn(w,'自分を強化',()=>{P[0].pw=true})}
  h('世界');{const w=wrap();btn(w,'一時停止',()=>{SB_FREEZE=!SB_FREEZE},()=>SB_FREEZE);btn(w,'スロー ×0.25',()=>{SB_SLOW=!SB_SLOW},()=>SB_SLOW);btn(w,'パックを中央へ',()=>{serve(0)})}
  row('パックの速さ SPD',()=>SPD,.1,v=>{SPD=clamp(Math.round(v*10)/10,.3,2)});row('パリィ受付 秒',()=>PARC.w,.01,v=>{PARC.w=clamp(Math.round(v*1000)/1000,.01,.4)});row('パリィ停止 秒',()=>PARC.t,.1,v=>{PARC.t=clamp(Math.round(v*10)/10,.1,3)});
  h('ボス（ボス戦中）');{const w=wrap();for(const k of Object.keys(BOSS_NAME))btn(w,BOSS_NAME[k],()=>{if(BOSS.on&&state==='play')bossExec(k)})}
  {const w=wrap();for(const ph of [1,2,3])btn(w,'PHASE '+ph,()=>{if(!BOSS.on)return;BOSS.phase=ph;BOSS.rot[ph]=0;BOSS.next=BOSS_ROT[ph][0]},()=>BOSS.on&&BOSS.phase===ph)}
  refresh()}

state='rg_title';
if(/[?&]debug/.test(location.search))window.__RGev=src=>eval(src); // テスト用：本体の中の変数を読む
})();
