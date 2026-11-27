/* ================= ローグライク版（/rogue/）=================
   公開時に tools/build_rogue.py が本体 index.html をコピーし、本体のスクリプトの { … } の内側の最後にこのファイルを埋め込んで rogue/index.html を作る。
   なので本体の let/const（P・puck・BOSS など）をそのまま読み書きでき、本体の関数（goal / update / pdown / drawAll / parryStart / give）を包み直せる。
   流れ：タイトル → [戦1 ザコ] → 3枚から1枚 → [戦2 強敵] → 3枚から1枚 → [戦3 ボス NULL] → 3枚から1枚 → エンドレス。負けたらその場で終わり。
   エンドレス：[ザコ] → [強敵] → 3枚から1枚 を1周として繰り返す。1周ごとに CPU の数値が少し上がり、敵の強化の数が1つ増える。
   各試合はお互い HP3（3点取られたら負け）。ボスも HP3・プレイヤーのライフ3。
   開発者用サンドボックス：左上の SB ボタン。プレイ中でも状態を変えられる。 */
(function(){
'use strict';
const RG={
  hp:3,                                   // 各試合の HP（RULE.win）
  boss:{hp:3,lives:3,ph2:2,ph3:1},        // ボス：HP3（2で第2段階、1で最終段階）・プレイヤーのライフ3
  noItems:true,                           // ザコ・強敵はアイテム箱を使わない（技の物だけ）
  jumpT:10,chargeT:15,blockCD:15,tele:.8, // 強敵の技：ジャンプ台の間隔・スーパーシュートの間隔・バンパーを置き直すまで・前兆の時間
  blockHP:3,
  infMe:false,infEnemy:false,             // 開発者メニュー：HP 無限（点を取られても減らない）
  parStun:.3,                             // パリィの時間停止が終わったあと、敵が動けない時間（秒）
  /* 戦力ポイント：試合ごとの予算 B を「基礎の動き d・強化パーク・技・技の強化」に割り振って敵を組み立てる（docs/ROGUE.md）。
     d は CPU の動きの強さ（0＝よわい、1＝ふつう、2＝つよい の数値を混ぜる）。強さの表示＝pow.base×pow.r^P（P＝使った戦力ポイント、上限 bud.max で 10000） */
  cost:{d:10,hard:3,big:3,wide:4,life:1,jumper:3,blocker:4,charger:5,up:1}, // d は 1.0 あたり
  cap:{hard:4,big:3,wide:3,life:3,up:3},                                     // 敵のパークの Lv・技の強化の上限
  bud:{z:4,e0:6,e:5,max:60},          // 予算：ザコ＝z×周回、強敵＝e0＋e×周回、上限 max
  pow:{base:50,r:1.0923},             // 強さの表示（P=0 で 50、P=60 で 10000）
  nullP:25,                           // ボス NULL の戦力（固定）
  zakoD:.7,eliteD:[.4,.6],            // 基礎の動きに使う割合：ザコは 70% 以上、強敵は技を引いた残りの 40〜60%
  rareP:.1,                           // ふつうの報酬の1枚がレアパークになる確率
  jumpW:[0,5,8,11,14],                // ジャンプ台の出やすさ（ほかのアイテムは5）：パークの Lv ごと。Lv0＝出ない
  homing:2.4,                         // パリィホーミング：1秒に曲がる角度（ラジアン）×Lv
  homeT:3,                            // パリィホーミング Lv2 以上：敵やアイテムで跳ね返ったあとも続く時間（秒、自分が触るか点が入ると終わる）
};
const STAGES=[{k:'zako',n:'DRONE'},{k:'elite',n:''},{k:'boss',n:'NULL'}];
/* 数値のくせ（コスト0の入れ替え） */
const QUIRK={speed:{n:'スピード型',f:L=>{L.sp*=1.2;L.err*=1.3}},prec:{n:'精密型',f:L=>{L.err*=.6;L.sp*=.85}},
  power:{n:'強打型',f:L=>{L.pw+=.2;L.tr=Math.max(0,L.tr-.1)}},guard:{n:'守備型',f:L=>{L.tr=Math.min(1,L.tr+.15);L.re*=.9;L.pw=Math.max(.8,L.pw-.1)}}};
const SKILL_PREF={jumper:['hard','life'],blocker:['big'],charger:['hard']},SKILL_QUIRK={jumper:'speed',blocker:'guard',charger:'power'};
const SKILLS={
  jumper:{n:'JUMPER',d:'ジャンプ台を自分の陣地に置く',c:'#ff3366'}, // JUMPER のジャンプ台は色違い（向きなし＝本体と同じ性能）
  blocker:{n:'BLOCKER',d:'ゴールの前にかたいバンパー',c:IT.bumper.c},
  charger:{n:'CHARGER',d:'ときどきスーパーシュート',c:AURA},
};
/* パッシブ（自分だけ）。apply はマッチ開始時に P[0] などへ書き込む */
const PASS={
  // st＝ステータスアップ系：重ねがけできる（n＝重ねた数。同じカードをもう一度取ると Lv が上がり、枠は使わない）
  hard:{n:'ハードショット',d:['打ったパックが','12% 速くなる'],ic:'H',c:'#ff5555',st:1,ap:(p,n)=>{p.hm=1+.12*n}},
  big:{n:'ビッグマレット',d:['マレットが','25% 大きくなる'],ic:'B',c:'#ffaa00',st:1,ap:(p,n)=>{p.mr=MR*(1+.25*n)}},
  wide:{n:'ワイドゴール',d:['相手のゴールが','左右に20ずつ広い'],ic:'W',c:'#55ff55',st:1,ap:(p,n)=>{const w=Math.min(20*n,WSEG-RC);if(p.i===0)WB.t=w;else WB.bl=WB.br=w}}, // 敵が持つと自分のゴールが広がる
  box:{n:'箱の常連',d:['アイテム箱が','35% 早く出る'],ic:'?',c:YEL,st:1,ap:(p,n)=>{p.boxK=Math.pow(.65,n)}},
  life:{n:'長持ち',d:['置いた物が','60% 長く残る'],ic:'L',c:'#00ffff',st:1,ap:(p,n)=>{p.lifeK=1+.6*n}},
  fav:{n:'ひいき',d:['','がよく出る（3倍）'],ic:'F',c:'#ff88ff',ap:()=>{}}, // 出やすさは applyMods でまとめて計算
  gosen:{n:'後の先',d:['パリィに成功すると','アイテム箱がすぐ出る'],ic:'P',c:'#3399ff',ap:()=>{}},
  giri:{n:'ギリギリ王',d:['パリィの受付が半分','成功すると次の得点が2点'],ic:'G',c:'#ff0055',ap:p=>{p.parK=.5}},
  zan:{n:'残心',d:['パリィ後の敵のスタンが','0.2秒長くなる'],ic:'Z',c:'#aaaaff',st:1,ap:()=>{}},
  tsuki:{n:'つらぬき',d:['パリィで返した球に','当たった敵が0.3秒スタン'],ic:'T',c:'#ff8800',st:1,ap:()=>{}},
  jump:{n:'ジャンプ台',d:['ジャンプ台が出るようになる','重ねるほど出やすい'],ic:'J',c:IT.jump.c,st:1,ap:()=>{}}, // ローグ版のジャンプ台はこのパークを取るまで出ない
  // rare＝レアパーク：ふつうの報酬では1枚ごとに RG.rareP の確率で出る。ボスのあとはレア1つか、ランダム2つのどちらか
  homing:{n:'パリィホーミング',d:['パリィで返した球が','相手のゴールへ曲がる','Lv2〜 跳ね返っても'],ic:'@',c:'#ff66ff',st:1,rare:1,ap:()=>{}},
  slot:{n:'アイテム枠 +1',d:['アイテム欄が','3つになる'],ic:'+',c:'#ffffff',rare:1,ap:()=>{}},
};
const PKEYS=Object.keys(PASS),MAXP=99; // パークの数の制限はなし（v1.65〜）
const NKEYS=PKEYS.filter(k=>!PASS[k].rare),RKEYS=PKEYS.filter(k=>PASS[k].rare);
const favItems=()=>KEYS.filter(q=>q!=='super'&&(q!=='jump'||RUN.pass.includes('jump'))); // ひいきで選べるアイテム（ジャンプ台は解禁後）
/* 一覧用：Lv を含めた今の効き */
const FXT_P={hard:n=>'打つ速さ +'+12*n+'%',big:n=>'マレット +'+25*n+'%',wide:n=>'相手のゴール 左右に +'+Math.min(20*n,WSEG-RC),box:n=>'箱の間隔 ×'+Math.pow(.65,n).toFixed(2),
  life:n=>'置いた物 ×'+(1+.6*n).toFixed(1),fav:()=>IT[RUN.fav].n+' が3倍出やすい',gosen:()=>'パリィ成功で箱がすぐ出る',giri:()=>'受付半分・成功で次の得点2点',
  zan:n=>'パリィ後の敵スタン +'+(.2*n).toFixed(1)+'秒',tsuki:n=>'パリィ球に当たった敵 '+(.3*n).toFixed(1)+'秒スタン',
  jump:n=>'出やすさ '+RG.jumpW[Math.min(n,RG.jumpW.length-1)]+'（ほかは5）・敵の方へ飛ぶ',homing:n=>'曲がる強さ ×'+n+(n>=2?'・跳ね返っても'+RG.homeT+'秒':''),slot:()=>'アイテム欄 3つ'};
const FXT_E={hard:n=>'打つ速さ +'+12*n+'%',big:n=>'マレット +'+25*n+'%',wide:n=>'自分のゴール 左右に +'+Math.min(20*n,WSEG-RC),life:n=>'ジャンプ台 ×'+(1+.6*n).toFixed(1)};
const RUN={home:0,listMode:'run',listPg:0,sbBack:null,dOv:null,pOv:null,E:null,items:[],listBack:null,on:false,stage:0,loop:0,wins:0,pass:[],epass:[],lv:{},elv:{},fav:'jump',skills:[],ov:{},cpuOv:{},double:false,res:null,t:0,cards:[],enemy:null,
  sk:{jump:0,charge:0,block:0},tele:[],pfl:{},reached:0};
let SB_FREEZE=false,SB_SLOW=false;

/* ---- 本体の値の準備 ---- */
Object.assign(BOSSC,{hp:RG.boss.hp,lives:RG.boss.lives,ph2:RG.boss.ph2,ph3:RG.boss.ph3,par2:1,parDelay:0}); // パリィ球のゴールも1点、パリィ後の止め方は下の parStun（全部の敵で同じ）
RULE.win=RG.hp;
const best=()=>{try{return JSON.parse(localStorage.getItem('ah_rogue')||'{}')}catch(e){return {}}};
const saveBest=o=>{try{localStorage.setItem('ah_rogue',JSON.stringify(o))}catch(e){}};

function applyMods(){const p=P[0];
  for(const q of P){delete q.hm;delete q.mr;delete q.boxK;delete q.lifeK;delete q.parK;delete q.iw}WB.t=0;if(!BOSS.on)WB.bl=WB.br=0;
  for(const k of RUN.pass)PASS[k].ap(p,RUN.lv[k]||1);
  {const w=Object.assign({},IW),jl=RUN.pass.includes('jump')?(RUN.lv.jump||1):0;w.jump=IW.jump>0?RG.jumpW[Math.min(jl,RG.jumpW.length-1)]:0; // ジャンプ台はパークを取るまで出ない
    if(RUN.pass.includes('fav'))w[RUN.fav]=(w[RUN.fav]||1)*3;p.iw=w}
  SLOTS=RUN.pass.includes('slot')?3:2;if(p.items.length>SLOTS)p.items.length=SLOTS;
  if(!BOSS.on)for(const k of RUN.epass)PASS[k].ap(P[1],RUN.elv[k]||1);
  P[1].parFrz=true; // パリィの時間停止中は CPU も完全に止まる
  for(const k in RUN.ov){if(k==='wt')WB.t=RUN.ov[k];else p[k]=RUN.ov[k]}
  bossField()}
const curD=()=>RUN.dOv!=null?RUN.dOv:RUN.E?RUN.E.d:0;
function stageLv(){const L=cpuAt(curD());if(RUN.E&&RUN.E.quirk)QUIRK[RUN.E.quirk].f(L);return Object.assign(L,RUN.cpuOv)}
/* ---- 戦力ポイントで敵を組み立てる ---- */
function budget(){const k=STAGES[RUN.stage].k,B=RUN.pOv!=null?RUN.pOv:k==='zako'?RG.bud.z*RUN.loop:RG.bud.e0+RG.bud.e*RUN.loop;return Math.max(0,Math.min(RG.bud.max,B))}
const pick=a=>a[Math.floor(Math.random()*a.length)];
function buildEnemy(){const k=STAGES[RUN.stage].k,C=RG.cost,E={kind:k,B:budget(),d:0,quirk:null,skill:null,up:0,pass:[],lv:{}};let R=E.B;
  const add=q=>{if(!E.lv[q]){E.pass.push(q);E.lv[q]=0}E.lv[q]++;R-=C[q]};
  if(k==='zako'){ // ザコ：70% 以上を基礎の動きに。残りはステータス系パーク1種類だけ（重ねがけ可）。技なし
    const q=pick(['hard','big','wide']);let pb=Math.floor(E.B*(1-RG.zakoD)+1e-9);while(pb>=C[q]&&(E.lv[q]||0)<RG.cap[q]){add(q);pb-=C[q]}
    E.d=Math.min(2,R/10);R-=E.d*10;if(!(RUN.loop===0&&E.B===0))E.quirk=pick(Object.keys(QUIRK))}
  else{ // 強敵：技を1つ必ず → 2周目から技の強化 → 残りの 40〜60% を基礎の動き → 残りは技と相性のよいパーク
    E.skill=pick(Object.keys(SKILLS));R-=C[E.skill];
    if(RUN.loop>=1){E.up=Math.min(RG.cap.up,Math.floor(Math.max(0,R)/8));R-=E.up*C.up}
    const sh=rnd(RG.eliteD[0],RG.eliteD[1]);E.d=Math.min(2,Math.max(0,R*sh)/10);R-=E.d*10;
    const pool=['hard','big','wide'].concat(E.skill==='jumper'?['life']:[]),pref=SKILL_PREF[E.skill];
    for(let n=0;n<60&&R>=1;n++){const cand=pool.filter(q=>C[q]<=R&&(E.lv[q]||0)<RG.cap[q]);if(!cand.length)break;const pc=cand.filter(q=>pref.includes(q));add(pc.length&&Math.random()<.6?pick(pc):pick(cand))}
    E.d=Math.min(2,E.d+Math.max(0,R)/10);E.quirk=SKILL_QUIRK[E.skill]}
  E.d=Math.round(E.d*100)/100;return E}
/* 今の相手の戦力ポイント P（開発者メニューで変えた分も入る）と強さの表示 */
function curP(){if(STAGES[RUN.stage].k==='boss')return RG.nullP;const C=RG.cost;let P=curD()*C.d;for(const q of RUN.epass)P+=C[q]*(RUN.elv[q]||1);for(const q of RUN.skills)P+=C[q];return P+(RUN.E?RUN.E.up*C.up:0)}
const powOf=P=>P>=RG.bud.max?10000:Math.min(10000,Math.max(50,Math.round(RG.pow.base*Math.pow(RG.pow.r,P)/10)*10));
const powCol=v=>v<100?'#fff':v<500?YEL:v<2000?'#ffaa00':(blink(4)?'#ff0055':'#ff6688');
const UP=()=>RUN.E?RUN.E.up:0;
function cpuAt(d){const a=d<=1?LV[0]:LV[1],b=d<=1?LV[1]:LV[2],t=d<=1?d:d-1,L={n:'R'};
  for(const k of ['sp','re','err','cd','pw','tr'])L[k]=a[k]+(b[k]-a[k])*t;
  if(d>1)L.sp=LV[1].sp+(LV[2].sp-LV[1].sp)*t*.5; // 「つよい」の速さ 2700 は極端なので半分まで
  return L}
const diffName=d=>d<.34?'よわい':d<.67?'ややよわい':d<1.2?'ふつう':d<1.6?'ややつよい':'つよい';

/* ---- 試合を始める ---- */
function startMatch(){RUN.double=false;RUN.tele=[];RUN.sk={jump:RG.jumpT*.6,charge:RG.chargeT*.6,block:1.5};
  const st=STAGES[RUN.stage];
  if(st.k==='boss'){BOSS.on=false;bossStart();Object.assign(LV[3],RUN.cpuOv)}
  else{bossOff();LV[4]=stageLv();start('cpu',4)}
  RULE.win=RG.hp;applyMods();P[0].box.cd=4*(P[0].boxK||1);P[0].items=(RUN.items||[]).slice(0,SLOTS); // アイテム欄は前の試合から持ち越し
  if(st.k!=='boss'&&RG.noItems){const b=P[1].box;b.on=false;b.cd=99;P[1].items=[]} // ザコ・強敵は箱を出さない（毎フレーム 99 に戻す）
  RUN.reached=Math.max(RUN.reached,RUN.stage+1)}
function newRun(){Object.assign(RUN,{on:true,stage:0,loop:0,wins:0,items:[],pass:[],lv:{},skills:[],double:false,reached:0});
  {const k=pick(NKEYS);RUN.pass=[k];RUN.lv={[k]:1};if(k==='fav')RUN.fav=pick(favItems());RUN.startPerk=k} // 最初からランダムに1つ
  pickEnemy();toIntro()}
/* 次の相手を組み立てる（ボスは固定） */
function pickEnemy(){const k=STAGES[RUN.stage].k;if(k==='boss'){RUN.E=null;RUN.skills=[];RUN.enemy=null;RUN.epass=[];RUN.elv={};return}
  const E=buildEnemy();RUN.E=E;RUN.skills=E.skill?[E.skill]:[];RUN.enemy=E.skill?SKILLS[E.skill]:null;RUN.epass=E.pass.slice();RUN.elv=Object.assign({},E.lv)}
function toIntro(){state='rg_intro';RUN.t=0;beep(660,.05);beep(990,.06,'square',.06,.07)}
function toTitle(){RUN.on=false;SLOTS=2;bossOff();clearMatch();placed.forEach(drop);placed=[];P=[mk(0),mk(1)];WB.t=0;bossField();state='rg_title';RUN.t=0}

/* ---- 報酬：3枚から1枚 ---- */
/* 報酬のカード。ふつう：3枚（1枚ごとに rareP でレア）。ボスのあと：レア1つ か ランダム2つ（どちらか） */
const canTake=k=>!RUN.pass.includes(k)||PASS[k].st;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function makeCards(boss){RUN.favPick=pick(favItems());const np=shuffle(NKEYS.filter(canTake)),rp=shuffle(RKEYS.filter(canTake));
  if(boss&&rp.length&&np.length>=2){RUN.cards=[{k:rp[0],rare:1},{pair:[np[0],np[1]]}];RUN.bossPick=true;return}
  RUN.bossPick=false;RUN.cards=[];for(let j=0;j<3;j++){if(rp.length&&Math.random()<RG.rareP)RUN.cards.push({k:rp.shift(),rare:1});else if(np.length)RUN.cards.push({k:np.shift()})}}
function givePerk(key){if(RUN.pass.includes(key))RUN.lv[key]=(RUN.lv[key]||1)+1;else{RUN.pass.push(key);RUN.lv[key]=1}if(key==='fav')RUN.fav=RUN.favPick}
const CARD=k=>RUN.bossPick?{x:60+k*250,y:MID-190,w:230,h:330}:{x:24+k*192,y:MID-190,w:168,h:330};
function takeCard(k){const c=RUN.cards[k];if(!c)return;
  if(c.pair)c.pair.forEach(givePerk);else givePerk(c.k);
  sfx('pwr');
  if(RUN.sbBack){state=RUN.sbBack;RUN.sbBack=null;if(state==='play'||state==='goal'||state==='pause')applyMods();return} // 開発者メニューから引いた報酬：今の試合に戻る（勝ちにはしない）
  nextStage()}
/* 次の戦へ：最初の1周はザコ→強敵→NULL、NULL を倒したらエンドレス（ザコ→強敵→報酬 の繰り返し） */
function nextStage(){if(RUN.loop===0&&RUN.stage<2)RUN.stage++;else if(RUN.loop>0&&RUN.stage===0)RUN.stage=1;else{RUN.loop++;RUN.stage=0}pickEnemy();toIntro()}

/* ---- 本体の関数を包む ---- */
const _goal=goal;
goal=function(scorer){
  if(RUN.on){if(scorer===1&&RG.infMe){if(BOSS.on)BOSS.lives++;else P[1].score--}if(scorer===0&&RG.infEnemy){if(BOSS.on)BOSS.hp++;else P[0].score--}} // HP 無限：入った点をなかったことに
  if(RUN.on&&scorer===0&&RUN.double){RUN.double=false;RUN.pfl.giri=1.2;
    if(BOSS.on)BOSS.hp=Math.max(1,BOSS.hp-1);else if(P[0].score+1<RULE.win)P[0].score++;else P[0].score=RULE.win-1}
  return _goal(scorer)};
const _parryStart=parryStart;
parryStart=function(i,nx,ny){const r=_parryStart(i,nx,ny);
  if(RUN.on&&i===0){if(RUN.pass.includes('gosen')&&!P[0].box.on){spawnBox(P[0]);RUN.pfl.gosen=1.2}if(RUN.pass.includes('giri')){RUN.double=true;RUN.pfl.giri=1.2}}
  return r};
/* パリィ：時間停止が終わったあと、敵は少し動けない（残心で長く） */
const _parryFire=parryFire;
parryFire=function(dx,dy){const i=PAR.who,r=_parryFire(dx,dy);if(RUN.on&&i===0)RUN.home=RG.homeT;if(RUN.on&&i===0)stunE(RG.parStun+.2*(RUN.pass.includes('zan')?(RUN.lv.zan||1):0),RUN.pass.includes('zan')?'zan':null);return r};
function stunE(t,pk){const b=P[1];b.stun=Math.max(b.stun,t);addFx('impact',b.x,b.y,60,'',AURA);if(pk)RUN.pfl[pk]=Math.max(RUN.pfl[pk]||0,.6)}
/* ジャンプ台は置いた人の相手のゴールへ向けて飛ばす（本体の it.aim） */
const _place=place;
place=function(d){const r=_place(d);const it=placed.find(q=>q.id===pid);if(RUN.on&&it&&it.type==='jump')it.aim=true;return r};
const _give=give;
give=function(p){if(RUN.on&&p.i===0&&RUN.pass.includes('fav'))RUN.pfl.fav=.8;return _give(p)};

const _update=update;
update=function(dt){
  if(state==='title'){toTitle()} // 本体のタイトル（中断→QUIT など）はローグライクのタイトルへ
  if(state.startsWith('rg_')){clock+=dt;flash=Math.max(0,flash-dt*4);for(const f of fx)f.t+=dt;for(let k=fx.length-1;k>=0;k--)if(fx[k].t>fx[k].life)fx.splice(k,1);
    RUN.t+=dt;if(state==='rg_intro'&&RUN.t>2.2)startMatch();return}
  if(SB_FREEZE&&(state==='play'||state==='goal')){clock+=dt;return}
  const par0=puck.par,lt0=puck.lastTouch;
  _update(SB_SLOW?dt*.25:dt);
  if(RUN.home>0){RUN.home-=dt;if(state!=='play'||(lt0!==0&&puck.lastTouch===0&&puck.par!==0))RUN.home=0} // （パリィの発射でも lastTouch は 0 になるので、par が付いていない＝マレットで触った時だけ） // Lv2〜：自分が触る・点が入るまで（homeT 秒まで）続く
  if(RUN.on&&state==='play'&&(puck.par===0||(RUN.home>0&&(RUN.lv.homing||1)>=2))&&puck.air===0&&PAR.who<0&&SUP.aim<0&&RUN.pass.includes('homing')){ // パリィホーミング：相手のゴールへ少しずつ向きを変える（速さはそのまま）
    const sp=Math.hypot(puck.vx,puck.vy),a=Math.atan2(puck.vy,puck.vx),b=Math.atan2(FY0-30-puck.y,FW/2-puck.x);let df=b-a;while(df>Math.PI)df-=2*Math.PI;while(df<-Math.PI)df+=2*Math.PI;
    const mx=RG.homing*(RUN.lv.homing||1)*dt*ts*SPD,t=a+clamp(df,-mx,mx);if(sp>1&&puck.y>FY0+40){puck.vx=Math.cos(t)*sp;puck.vy=Math.sin(t)*sp}}
  if(RUN.on&&par0===0&&lt0!==1&&puck.lastTouch===1&&RUN.pass.includes('tsuki'))stunE(.3*(RUN.lv.tsuki||1),'tsuki'); // つらぬき：パリィ球に当たった敵
  for(const k in RUN.pfl)RUN.pfl[k]=Math.max(0,RUN.pfl[k]-dt);
  if(state==='over'&&RUN.on){const win=BOSS.on?BOSS.result==='win':P[0].score>=RULE.win;RUN.res=win?'win':'lose';state='rg_res';RUN.t=0;if(win)RUN.wins++;RUN.items=P[0].items.filter(k=>k!=='restore');
    if(win&&STAGES[RUN.stage].k!=='boss')setTimeout(()=>_seq([523,659,784,1047],.08,'square',.06),300);
    if(!win)setTimeout(()=>_seq([392,330,262,196],.14,'square',.07),400)}
  if(RUN.on&&RG.noItems&&!BOSS.on&&P[1].box.cd>=90){P[1].box.on=false;P[1].box.cd=99}
  if(state==='play'&&RUN.on)skills(dt)};

/* ---- 強敵の技 ---- */
function skills(dt){if(!live||PAR.who>=0||SUP.aim>=0)return;const S=RUN.skills;
  for(const t of RUN.tele){t.t-=dt;if(t.t<=0)t.go()}RUN.tele=RUN.tele.filter(t=>t.t>0);
  if(S.includes('jumper')){RUN.sk.jump-=dt;if(RUN.sk.jump<=0){RUN.sk.jump=RG.jumpT*Math.pow(.8,UP());skillFire('jumper')}}
  if(S.includes('blocker')){const alive=placed.some(q=>q.rgBlock&&!q.dead);if(!alive&&!RUN.tele.some(t=>t.k==='blocker')){RUN.sk.block-=dt;if(RUN.sk.block<=0){RUN.sk.block=RG.blockCD*Math.pow(.8,UP());skillFire('blocker')}}}
  if(S.includes('charger')&&!P[1].pw){RUN.sk.charge-=dt;if(RUN.sk.charge<=RG.tele&&!RUN.tele.some(t=>t.k==='charger'))skillFire('charger');}
}
function skillFire(k){const T=RG.tele;beep(1760,.05,'square',.05);beep(1760,.05,'square',.05,.12);
  if(k==='jumper'){let x=0,y=0;for(let n=0;n<10;n++){x=rnd(110,FW-110);y=rnd(FY0+250,MID-130);if(!placed.some(q=>Math.hypot(q.x-x,q.y-y)<120))break}
    RUN.tele.push({k,x,y,t:T,go:()=>{const it={id:++pid,type:'jump',x,y,o:1,age:0,life:9.6*(P[1].lifeK||1),hit:0,mesh:null,rgJ:true};placed.push(it);enemyJumpMesh(it);sfx('place',x);addFx('wave',x,y,IT.jump.r+60,'',SKILLS.jumper.c)}})}
  else if(k==='blocker'){const x=FW/2,y=FY0+200;RUN.tele.push({k,x,y,t:T,go:()=>{placed.push({id:++pid,type:'bumper',x,y,o:1,age:0,life:1e9,hit:0,mesh:null,mega:true,hp:RG.blockHP+UP(),rgBlock:true});sfx('place',x);addFx('wave',x,y,IT.bumper.r+60,'',IT.bumper.c)}})}
  else if(k==='charger'){RUN.tele.push({k,x:0,y:0,t:T,go:()=>{RUN.sk.charge=RG.chargeT*Math.pow(.8,UP());const b=P[1];if(b.pw)return;b.pw=true;addFx('wave',b.x,b.y,110,'',AURA);sfx('pwr')}})}}

/* JUMPER のジャンプ台の 3D：先に作って色を変える（台も上の絵も SKILLS.jumper.c に） */
function enemyJumpMesh(it){if(!has3D||!meshes.make)return;const m=meshes.make.jump();m.position.set(wx(it.x),0,wz(it.y));m.rotation.y=Math.PI;
  for(const c of m.children)if(c.material&&c.material.color)c.material.color.set(SKILLS.jumper.c); // 台と上の絵（絵は色を掛ける）
  scene.add(m);it.mesh=m}

/* ---- 入力 ---- */
const _pdown=pdown;
const PL_TRAY={x:420,y:FY1+20,w:96,h:76},PL_BTN={x:FW/2-90,y:MID+168,w:180,h:52};
function openList(mode='run'){if(state==='rg_list')return;RUN.listBack=state;RUN.listMode=mode;RUN.listPg=0;state='rg_list';RUN.t=0;beep(880,.04)}
pdown=function(id,x,y){
  if(RUN.on&&(state==='play'||state==='pause'||state==='goal')&&inR(local(0,x,y),PL_TRAY)){openList();return} // 自分のトレイのパークのアイコンを触ると一覧
  if(!state.startsWith('rg_'))return _pdown(id,x,y);
  const l=local(0,x,y);unlock();
  if(state==='rg_title'){if(inR(l,T_START))newRun();else if(inR(l,T_PERK))openList('all');else if(inR(l,T_BACK)){beep(660,.05);setTimeout(()=>{location.href='./'},80)}return}
  if(state==='rg_intro'){if(RUN.t>.4)startMatch();return}
  if(state==='rg_res'){if(RUN.t<resWait())return;
    if(RUN.res==='lose'){state='rg_end';RUN.t=0;return}
    if(STAGES[RUN.stage].k==='boss'){bossOff();placed.forEach(drop);placed=[];const b=best();saveBest(Object.assign(b,{clears:(b.clears||0)+1}));_seq([523,659,784,1047,0,1047,1319,1568,2093],.1,'square',.07)}
    if(RUN.loop>0&&STAGES[RUN.stage].k==='zako'){nextStage();return} // エンドレスはザコのあとは報酬なし
    makeCards(STAGES[RUN.stage].k==='boss');state='rg_pick';RUN.t=0;return}
  if(state==='rg_list'){if(RUN.t<.2)return;listTap(l);return}
  if(state==='rg_pick'){if(RUN.t<.5)return;if(inR(l,PL_BTN)){openList();return}for(let k=0;k<3;k++)if(inR(l,CARD(k))){takeCard(k);return}return}
  if(state==='rg_end'){if(RUN.t<1)return;const b=best();if(RUN.res==='lose')saveBest(Object.assign(b,{best:Math.max(b.best||0,RUN.reached),wins:Math.max(b.wins||0,RUN.wins),loop:Math.max(b.loop||0,RUN.loop)}));toTitle();beep(660,.06);return}
};
const resWait=()=>BOSS.on&&RUN.res==='win'?2.6:1.2;

/* ---- 描画 ---- */
const T_START={x:150,y:MID-36,w:300,h:88},T_PERK={x:150,y:MID+66,w:300,h:64},T_BACK={x:150,y:MID+146,w:300,h:58};
const _drawAll=drawAll;
drawAll=function(){_drawAll();g.save();try{overlay()}finally{g.restore()}};
function heart(x,y,on,c){sq(x,y,22,'#000');sq(x,y,16,on?c:'#333');if(on)sq(x-4,y-4,6,'#fff')}
const pcol=(k,fav)=>k==='fav'?IT[fav||RUN.fav].c:PASS[k].c; // ひいきはアイテムの色
function passIcon(k,x,y,s,lit,n=1,fav){const P0=PASS[k],c=pcol(k,fav);pbox(x-s/2,y-s/2,s,s,lit?(blink(10)?'#fff':YEL):c,'#111');ptext(P0.ic,x,y+2,s*.45,lit?'#fff':c);
  if(n>1){g.fillStyle='#000';g.fillRect(x+s/2-s*.42,y+s/2-s*.36,s*.5,s*.4);ptext(String(n),x+s/2-s*.17,y+s/2-s*.14,Math.max(8,s*.28),'#fff')}} // 右下＝重ねた数
/* ---- パーク一覧（試合中・報酬画面から）とパーク図鑑（タイトルから）：ページ送りつき ---- */
const LB_PREV={x:30,y:FY1-96,w:150,h:64},LB_CLOSE={x:FW/2-80,y:FY1-96,w:160,h:64},LB_NEXT={x:FW-180,y:FY1-96,w:150,h:64},LB_TOP=FY0+124,LB_BOT=FY1-112;
function listEntries(){const E=[];
  if(RUN.listMode==='all'){ // 図鑑：実装済みのパークをすべて
    const row=k=>{const P0=PASS[k],own=RUN.on&&RUN.pass.includes(k);E.push({t:'perk',k,n:1,name:P0.n+(P0.st?'（重ねがけ）':''),c:P0.c,
      txt:k==='fav'?'アイテム1種がよく出る（3倍）':P0.d.join(''),txt2:P0.st&&FXT_P[k]?(t=>t.length>24?'Lv1：'+FXT_P[k](1):t)('Lv1：'+FXT_P[k](1)+'　Lv2：'+FXT_P[k](2)):'',own})};
    E.push({t:'head',s:'NORMAL '+NKEYS.length,c:'#fff'});NKEYS.forEach(row);E.push({t:'head',s:'RARE '+RKEYS.length,c:'#ff66ff'});RKEYS.forEach(row);return E}
  E.push({t:'head',s:'YOU  '+RUN.pass.length,c:COL[0]});if(!RUN.pass.length)E.push({t:'none'});
  RUN.pass.forEach(k=>{const n=RUN.lv[k]||1,P0=PASS[k];E.push({t:'perk',k,n,name:P0.n+(P0.st?'  Lv'+n:'')+(P0.rare?'  RARE':''),c:pcol(k),txt:FXT_P[k]?FXT_P[k](n):''})});
  if(RUN.on&&STAGES[RUN.stage].k!=='boss'){const C=RG.cost,v=powOf(curP());E.push({t:'head',s:'ENEMY  POWER '+v,c:powCol(v)});
    E.push({t:'text',s:'動き d'+curD().toFixed(2)+(RUN.E&&RUN.E.quirk?'・'+QUIRK[RUN.E.quirk].n:'')+'　P '+(Math.round(curP()*10)/10)});
    if(RUN.skills.length)E.push({t:'text',s:'技 '+RUN.skills.map(q=>SKILLS[q].n).join(',')+(UP()?'（強化 +'+UP()+'）':'')});
    RUN.epass.forEach(k=>{const n=RUN.elv[k]||1;E.push({t:'perk',k,n,name:PASS[k].n+'  Lv'+n,c:PASS[k].c,txt:FXT_E[k]?FXT_E[k](n):''})})}
  return E}
const entH=e=>e.t==='head'?52:e.t==='text'||e.t==='none'?34:e.txt2?94:74;
function listPages(){const pages=[[]];let h=0;for(const e of listEntries()){const eh=entH(e);if(h+eh>LB_BOT-LB_TOP&&pages[pages.length-1].length){pages.push([]);h=0}pages[pages.length-1].push(e);h+=eh}return pages}
function drawList(){dim(.9);const pages=listPages(),pg=clamp(RUN.listPg|0,0,pages.length-1);RUN.listPg=pg;
  frame(0,()=>{ptext(RUN.listMode==='all'?'パーク図鑑':'PERKS',FW/2,FY0+66,RUN.listMode==='all'?28:28,YEL,RUN.listMode==='all'?DOT:PIX);let y=LB_TOP;
    for(const e of pages[pg]){
      if(e.t==='head'){ptext(e.s,36,y+22,15,e.c,PIX,'left');g.fillStyle='#333';g.fillRect(36,y+40,FW-72,3)}
      else if(e.t==='text'){ptext(e.s,40,y+16,16,'#ccc',DOT,'left')}
      else if(e.t==='none'){ptext('なし',60,y+16,17,'#666',DOT,'left')}
      else{passIcon(e.k,64,y+30,48,false,e.n);ptext(e.name,102,y+16,20,e.c,DOT,'left');ptext(e.txt,102,y+46,16,'#ddd',DOT,'left');if(e.txt2)ptext(e.txt2,102,y+72,14,'#999',DOT,'left');if(e.own)ptext('所持',FW-40,y+16,14,YEL,DOT,'right')}
      y+=entH(e)}
    if(pages.length>1){ptext((pg+1)+' / '+pages.length,FW/2,LB_CLOSE.y-24,14,'#aaa');
      if(pg>0){pbox(LB_PREV.x,LB_PREV.y,LB_PREV.w,LB_PREV.h,'#fff');ptext('◀ まえ',LB_PREV.x+LB_PREV.w/2,LB_PREV.y+33,20,'#fff',DOT)}
      if(pg<pages.length-1){pbox(LB_NEXT.x,LB_NEXT.y,LB_NEXT.w,LB_NEXT.h,'#fff');ptext('つぎ ▶',LB_NEXT.x+LB_NEXT.w/2,LB_NEXT.y+33,20,'#fff',DOT)}}
    pbox(LB_CLOSE.x,LB_CLOSE.y,LB_CLOSE.w,LB_CLOSE.h,YEL);ptext('もどる',LB_CLOSE.x+LB_CLOSE.w/2,LB_CLOSE.y+33,20,'#fff',DOT)})}
function listTap(l){const n=listPages().length;
  if(inR(l,LB_PREV)&&RUN.listPg>0){RUN.listPg--;beep(880,.03);return}
  if(inR(l,LB_NEXT)&&RUN.listPg<n-1){RUN.listPg++;beep(880,.03);return}
  if(inR(l,LB_CLOSE)||l.v<LB_TOP-40||l.v>LB_BOT){state=RUN.listBack||'rg_title';RUN.listBack=null;beep(660,.04)}}

function overlay(){
  const inMatch=state==='play'||state==='goal'||state==='pause';
  // トレイの点数の所は HP の表示にする（試合の外では隠す。ボス戦は本体がライフを出す）
  if(!BOSS.on&&RG.noItems&&!P[1].box.on&&P[1].box.cd>=90)frame(1,()=>{g.fillStyle='#000';g.fillRect(512,FY1+18,60,74)}); // 箱を使わない敵：箱の欄を隠す（試合の外でも）
  if(!BOSS.on)for(const i of [0,1])frame(i,()=>{g.fillStyle='#000';g.fillRect(14,FY1+30,100,60);if(RUN.on&&(inMatch||state==='rg_res')){const hp=RULE.win-P[1-i].score;for(let k=0;k<RULE.win;k++)heart(34+k*30,FY1+56,k<hp,COL[i])}});
  if(RUN.on&&(inMatch||state==='rg_res')){
    frame(0,()=>{const n=RUN.pass.length,cols=n<=2?2:n<=6?3:4,s=cols===2?38:cols===3?26:19,gp=s+3,rows=Math.ceil(Math.min(n,12)/cols),y0=FY1+56-(rows-1)*gp/2; // 自分のパーク（多いときは小さく並べる。12個まで）
      RUN.pass.slice(0,12).forEach((k,j)=>passIcon(k,426+s/2+(j%cols)*gp,y0+Math.floor(j/cols)*gp,s,(RUN.pfl[k]||0)>0,RUN.lv[k]||1));if(n>12)ptext('+'+(n-12),500,FY1+100,12,'#fff');if(RUN.double){ptext('×2',412,FY1+100,16,blink(6)?YEL:'#ff0055')}});
    frame(1,()=>{if(!BOSS.on){if(RG.noItems&&!P[1].box.on&&P[1].box.cd>=90){g.fillStyle='#000';g.fillRect(512,FY1+18,60,74)} // 箱を使わない敵：箱の欄を隠して強化を出す
      RUN.epass.slice(0,3).forEach((k,j)=>passIcon(k,554-j*31,FY1+52,28,false,RUN.elv[k]||1));
      ptext(RUN.loop?'LOOP '+RUN.loop:(RUN.stage+1)+'/3',430,FY1+32,11,RUN.loop?'#ff0055':'#999');ptext(RUN.enemy?RUN.enemy.n:STAGES[RUN.stage].n,430,FY1+54,13,RUN.enemy?RUN.enemy.c:'#bbb')}
      {const v=powOf(curP());ptext('PWR '+v,BOSS.on?120:430,BOSS.on?FY1+100:FY1+78,12,powCol(v))}});
    // 強敵の技の前兆・耐久
    for(const t of RUN.tele){const a=1-t.t/RG.tele;if(t.k==='charger'){const b=P[1];for(let j=0;j<14;j++){const an=j/14*6.2832+clock*6;sq(b.x+Math.cos(an)*(mrOf(1)+16),b.y+Math.sin(an)*(mrOf(1)+16),8,blink(10)?'#fff':AURA)}}
      else{const c=t.k==='jumper'?SKILLS.jumper.c:IT.bumper.c,R=60-a*20;for(let j=0;j<16;j++){const an=j/16*6.2832;if(blink(8))sq(t.x+Math.cos(an)*R,t.y+Math.sin(an)*R,8,c)}}
      if(blink(6))ptext('!',t.k==='charger'?P[1].x:t.x,(t.k==='charger'?P[1].y:t.y)-70,24,YEL)}
    for(const it of placed)if(it.aim&&!it.dead){const a=boostDir(it.o,it.x,it.y),c=it.o?COL[1]:COL[0];for(let j=0;j<3;j++){const t=((clock*2+j/3)%1),x=it.x+a.dx*(20+t*44),y=it.y+a.dy*(20+t*44);sq(x,y,8,'#000');sq(x,y,5,c)}} // ジャンプ台の向き（流れる点）
    if(!BOSS.on)for(const it of placed)if(it.rgBlock&&!it.dead)for(let j=0;j<it.hp;j++){sq(it.x-12+j*12,it.y-50,10,'#000');sq(it.x-12+j*12,it.y-50,6,'#cc88ff')}
  }
  if(state==='rg_title'){dim(.7);frame(0,()=>{pbox(36,MID-280,FW-72,560,'#ff0055');ptext('AIR HOCKEY',FW/2,MID-222,22,'#999');ptext('ROGUE',FW/2,MID-152,52,YEL);
      ptext('3戦勝ちぬけ・HP3',FW/2,MID-84,20,'#fff',DOT);
      pbox(T_START.x,T_START.y,T_START.w,T_START.h,blink(2)?YEL:'#fff','#1a1a1a');ptext('START',FW/2,T_START.y+T_START.h/2+2,26,'#fff');
      pbox(T_PERK.x,T_PERK.y,T_PERK.w,T_PERK.h,'#ff66ff','#100810');ptext('パーク図鑑',FW/2,T_PERK.y+T_PERK.h/2+2,22,'#fff',DOT);
      pbox(T_BACK.x,T_BACK.y,T_BACK.w,T_BACK.h,'#666');ptext('◀ ふつうのモード',FW/2,T_BACK.y+T_BACK.h/2+2,18,'#ccc',DOT);
      const b=best();if(b.clears)ptext('CLEAR ×'+b.clears+(b.loop?'  LOOP '+b.loop:''),FW/2,MID+232,14,YEL);else if(b.best)ptext('BEST '+b.best+'/3',FW/2,MID+232,14,'#aaa');
      ptext('v'+VER,FW-50,MID+262,10,'#777',PIX,'right')})}
  else if(state==='rg_intro'){dim(.78);const st=STAGES[RUN.stage],e=RUN.enemy;frame(0,()=>{
      ptext(RUN.loop?'ENDLESS  LOOP '+RUN.loop:'STAGE '+(RUN.stage+1)+'/3',FW/2,MID-214,20,RUN.loop?'#ff0055':'#aaa');
      {const v=powOf(curP());ptext('POWER',FW/2,MID-170,13,'#999');ptext(String(v),FW/2,MID-130,36,powCol(v))}
      ptext(st.k==='boss'?'NULL':e?e.n:st.n,FW/2,MID-66,40,st.k==='boss'?'#ff0055':e?e.c:'#fff');
      ptext(st.k==='boss'?'ボス・HP3':(e?e.d:'')+'',FW/2,MID-16,18,'#fff',DOT);
      if(st.k!=='boss')ptext(diffName(curD())+'の動き'+(RUN.E&&RUN.E.quirk?'・'+QUIRK[RUN.E.quirk].n:''),FW/2,e?MID+12:MID-16,18,'#ccc',DOT);
      if(st.k!=='boss'){const n=RUN.epass.length+(UP()?1:0);let j=0;const x0=FW/2-(n-1)*27;
        RUN.epass.forEach(k=>{passIcon(k,x0+j*54,MID+60,42,false,RUN.elv[k]||1);j++});if(UP()){pbox(x0+j*54-21,MID+39,42,42,RUN.enemy.c,'#111');ptext('+'+UP(),x0+j*54,MID+62,16,RUN.enemy.c)}}
      if(RUN.pass.length){ptext('YOU',FW/2,MID+112,13,'#999');const n=Math.min(RUN.pass.length,9);RUN.pass.slice(0,9).forEach((k,j)=>passIcon(k,FW/2+(j-(n-1)/2)*54,MID+154,44,false,RUN.lv[k]||1))}
      if(RUN.loop===0&&RUN.stage===0&&RUN.startPerk&&RUN.pass.includes(RUN.startPerk))ptext('START：'+PASS[RUN.startPerk].n,FW/2,MID+204,18,pcol(RUN.startPerk),DOT);
      if(blink(2))ptext('▶',FW/2,MID+244,24,'#fff',DOT)})}
  else if(state==='rg_res'){const w=RUN.res==='win';if(RUN.t<resWait()-.6&&w&&BOSS.on)return;dim(.55*Math.min(1,RUN.t*3));
    frame(0,()=>{ptext(w?(BOSS.on?'NULL DEFEATED!':'STAGE CLEAR!'):'GAME OVER',FW/2,MID-40,w?32:38,w?YEL:'#ff0055');
      if(RUN.t>resWait())ptext('▶',FW/2,MID+60,26,'#fff',DOT)})}
  else if(state==='rg_pick'){dim(.78);frame(0,()=>{ptext(RUN.bossPick?'BONUS':'PASSIVE',FW/2,MID-240,26,YEL);ptext(RUN.bossPick?'レア1つ か ランダム2つ':'ひとつ選ぶ',FW/2,MID-208,17,'#bbb',DOT);
      RUN.cards.forEach((c,j)=>{const r=CARD(j),a=Math.min(1,Math.max(0,RUN.t*4-j*.4));if(a<=0)return;g.globalAlpha=a;const cx=r.x+r.w/2;
        if(c.pair){pbox(r.x,r.y,r.w,r.h,'#aaa','#0c0c14');ptext('RANDOM ×2',cx,r.y+30,14,'#fff');
          c.pair.forEach((k,m)=>{const y=r.y+86+m*126,up=RUN.pass.includes(k);passIcon(k,cx,y,50,false,up?(RUN.lv[k]||1)+1:1,RUN.favPick);ptext(PASS[k].n+(up?' Lv'+((RUN.lv[k]||1)+1):''),cx,y+44,17,'#fff',DOT);
            (k==='fav'?[IT[RUN.favPick].n+'が','よく出る（3倍）']:PASS[k].d).forEach((t,q)=>ptext(t,cx,y+66+q*18,13,'#ccc',DOT))})}
        else{const k=c.k,P0=PASS[k],up=RUN.pass.includes(k);pbox(r.x,r.y,r.w,r.h,c.rare?(blink(3)?YEL:'#ff66ff'):pcol(k,RUN.favPick),c.rare?'#1a0c1a':'#0c0c14');
          if(c.rare)ptext('RARE',cx,r.y+24,14,blink(3)?YEL:'#ff66ff');
          passIcon(k,cx,r.y+76,64,false,up?(RUN.lv[k]||1)+1:1,RUN.favPick);if(up)ptext('Lv'+((RUN.lv[k]||1)+1)+' UP',cx,r.y+126,13,YEL);
          ptext(P0.n,cx,r.y+156,18,'#fff',DOT);
          const d=k==='fav'?[IT[RUN.favPick].n,P0.d[1]]:P0.d;d.forEach((t,m)=>ptext(t,cx,r.y+204+m*30,13,'#ddd',DOT));
          if(k==='fav')spr(RUN.favPick,cx,r.y+286,44,-1)}
        g.globalAlpha=1});
      if(RUN.pass.length){pbox(PL_BTN.x,PL_BTN.y,PL_BTN.w,PL_BTN.h,'#888');RUN.pass.slice(0,3).forEach((k,j)=>passIcon(k,PL_BTN.x+26+j*34,PL_BTN.y+26,26,false,RUN.lv[k]||1));ptext('PERKS',PL_BTN.x+PL_BTN.w-40,PL_BTN.y+28,12,'#fff')}})}
  else if(state==='rg_list')drawList();
  else if(state==='rg_end'){dim(.82);const w=RUN.res==='win';frame(0,()=>{ptext(w?'ALL CLEAR!':'GAME OVER',FW/2,MID-200,36,w?YEL:'#ff0055');
      ptext(RUN.loop?'LOOP '+RUN.loop+'   WIN '+RUN.wins:'STAGE '+RUN.reached+'/3',FW/2,MID-130,20,'#fff');
      ptext('PERKS '+RUN.pass.length,FW/2,MID-80,14,'#999');const cols=7;RUN.pass.slice(0,21).forEach((k,j)=>passIcon(k,FW/2+((j%cols)-(Math.min(RUN.pass.length,cols)-1)/2)*60,MID-30+Math.floor(j/cols)*60,48,false,RUN.lv[k]||1));
      if(RUN.t>1)ptext('タップでタイトルへ',FW/2,MID+190,20,'#fff',DOT)})}
}
function dim(a){g.fillStyle='rgba(0,0,0,'+a+')';g.fillRect(-40,FY0,FW+80,FL)}

/* ================= 開発者用サンドボックス ================= */
const css=`#sbB{position:fixed;left:calc(6px + env(safe-area-inset-left,0px));top:calc(6px + env(safe-area-inset-top,0px));z-index:50;font:13px "Press Start 2P",monospace;color:#ff0;background:#000;border:2px solid #ff0;padding:10px 10px;opacity:.75}
#sbP{position:fixed;left:0;top:0;bottom:0;width:min(380px,94vw);z-index:49;background:rgba(0,0,0,.88);border-right:2px solid #ff0;color:#fff;font:16px "DotGothic16",monospace;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:46px 8px 40px;display:none}
#sbP details{border-bottom:1px solid #444;padding:2px 0 6px}#sbP summary{font:17px "DotGothic16",monospace;color:#ff0;padding:10px 4px;cursor:pointer;list-style:none}#sbP summary::before{content:"▶ ";color:#888}#sbP details[open]>summary::before{content:"▼ "}#sbP summary::-webkit-details-marker{display:none}
#sbP .r{display:flex;align-items:center;gap:4px;margin:3px 0}#sbP .r span.l{flex:1}#sbP .r span.v{min-width:70px;text-align:right;color:#0ff;font:12px "Press Start 2P",monospace}
#sbP button{font:15px "DotGothic16",monospace;color:#fff;background:#111;border:2px solid #777;padding:7px 9px;margin:3px;touch-action:manipulation;min-width:44px}
#sbP button.on{border-color:#ff0;color:#ff0;background:#332}#sbP .w{display:flex;flex-wrap:wrap}`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const B=document.createElement('div');B.id='sbB';B.textContent='SB';document.body.appendChild(B);
const PN=document.createElement('div');PN.id='sbP';document.body.appendChild(PN);
for(const el of [B,PN])for(const ev of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','gesturestart'])el.addEventListener(ev,e=>e.stopPropagation(),{passive:true});
let open=false;B.addEventListener('click',()=>{open=!open;PN.style.display=open?'block':'none';B.style.opacity=open?1:.75;if(open)build()});
const fmt=v=>typeof v==='number'?(Math.abs(v)>=100?Math.round(v)+'':(Math.round(v*1000)/1000)+''):String(v);
let REF=[],CUR=null;
/* 項目ごとに開け閉めできる（開いている項目は端末に覚える） */
const SBO=(()=>{try{return JSON.parse(localStorage.getItem('ah_rogue_sb')||'{}')}catch(e){return {}}})();
function h(t,def){const d=document.createElement('details');d.open=SBO[t]!=null?SBO[t]:!!def;d.addEventListener('toggle',()=>{SBO[t]=d.open;try{localStorage.setItem('ah_rogue_sb',JSON.stringify(SBO))}catch(e){}});
  const su=document.createElement('summary');su.textContent=t;d.appendChild(su);PN.appendChild(d);CUR=d}
function wrap(){const w=document.createElement('div');w.className='w';(CUR||PN).appendChild(w);return w}
function btn(par,t,fn,on){const b=document.createElement('button');b.textContent=t;b.addEventListener('click',()=>{unlock();fn();refresh()});par.appendChild(b);if(on)REF.push(()=>b.classList.toggle('on',!!on()));return b}
function row(lab,get,step,set){const r=document.createElement('div');r.className='r';const l=document.createElement('span');l.className='l';l.textContent=lab;const v=document.createElement('span');v.className='v';
  r.append(l,v);if(step){btn(r,'−',()=>set(get()-step));btn(r,'＋',()=>set(get()+step))}(CUR||PN).appendChild(r);REF.push(()=>{v.textContent=fmt(get())})}
function refresh(){for(const f of REF)f()}
setInterval(()=>{if(open)refresh()},250);
const inGame=()=>state==='play'||state==='goal'||state==='pause';
function ensureRun(){if(!RUN.on){RUN.on=true;RUN.pass=RUN.pass||[];RUN.reached=0}}
function goStage(s){ensureRun();RUN.stage=s;pickEnemy();startMatch()}
function build(){PN.innerHTML='';REF=[];CUR=PN;
  {const w=wrap();btn(w,'すべて開く',()=>{for(const d of PN.querySelectorAll('details'))d.open=true});btn(w,'すべて閉じる',()=>{for(const d of PN.querySelectorAll('details'))d.open=false})}
  h('進行',1);{const w=wrap();btn(w,'ザコ戦',()=>goStage(0));btn(w,'強敵戦',()=>goStage(1));btn(w,'ボス戦',()=>goStage(2));btn(w,'新しいラン',()=>newRun());btn(w,'タイトル',()=>toTitle())}
  {const w=wrap();btn(w,'いま勝ち',()=>{if(!inGame())return;if(BOSS.on){BOSS.hp=1;BOSS.rw=[]}else P[0].score=RULE.win-1;goal(0)});btn(w,'いま負け',()=>{if(!inGame())return;if(BOSS.on)BOSS.lives=1;else P[1].score=RULE.win-1;goal(1)})}
  {const w=wrap();btn(w,'報酬を引く',()=>{ensureRun();if(state==='rg_pick')return;RUN.sbBack=state;makeCards();state='rg_pick';RUN.t=1});btn(w,'ボス後の報酬を引く',()=>{ensureRun();if(state==='rg_pick')return;RUN.sbBack=state;makeCards(true);state='rg_pick';RUN.t=1})}
  {const w=wrap();btn(w,'エンドレスへ',()=>{ensureRun();RUN.loop=Math.max(1,RUN.loop);RUN.stage=0;pickEnemy();toIntro()});btn(w,'パーク一覧',()=>openList('run'));btn(w,'パーク図鑑',()=>openList('all'))}
  row('周回 LOOP（0＝最初の1周）',()=>RUN.loop,1,v=>{RUN.loop=clamp(v,0,50);if(RUN.loop>0&&RUN.stage>1)RUN.stage=0});
  h('HP');{const w=wrap();btn(w,'自分の HP 無限',()=>{RG.infMe=!RG.infMe},()=>RG.infMe);btn(w,'相手の HP 無限',()=>{RG.infEnemy=!RG.infEnemy},()=>RG.infEnemy)}
  row('HP（試合ごと）',()=>RG.hp,1,v=>{RG.hp=clamp(v,1,9);RULE.win=RG.hp});
  row('自分の HP',()=>BOSS.on?BOSS.lives:RULE.win-P[1].score,1,v=>{if(BOSS.on)BOSS.lives=clamp(v,1,9);else P[1].score=clamp(RULE.win-v,0,RULE.win-1)});
  row('相手の HP',()=>BOSS.on?BOSS.hp:RULE.win-P[0].score,1,v=>{if(BOSS.on){BOSS.hp=clamp(v,1,BOSSC.hp);BOSS.phase=BOSS.hp<=BOSSC.ph3?3:BOSS.hp<=BOSSC.ph2?2:1}else P[0].score=clamp(RULE.win-v,0,RULE.win-1)});
  h('自分のパーク（今の試合にもすぐ反映）');{const w=wrap();for(const k of PKEYS)btn(w,PASS[k].n,()=>{const i=RUN.pass.indexOf(k);if(i>=0)RUN.pass.splice(i,1);else{RUN.pass.push(k);RUN.lv[k]=RUN.lv[k]||1}if(inGame())applyMods()},()=>RUN.pass.includes(k))}
  for(const k of PKEYS.filter(k=>PASS[k].st))row(PASS[k].n+' Lv',()=>RUN.pass.includes(k)?(RUN.lv[k]||1):0,1,v=>{v=clamp(v,0,9);const i=RUN.pass.indexOf(k);if(v<=0){if(i>=0)RUN.pass.splice(i,1);delete RUN.lv[k]}else{if(i<0)RUN.pass.push(k);RUN.lv[k]=v}if(inGame())applyMods()});
  {const w=wrap();for(const k of KEYS.filter(k=>k!=='super'))btn(w,'ひいき:'+IT[k].n,()=>{RUN.fav=k;if(inGame())applyMods()},()=>RUN.fav===k)}
  h('自分の数値（上書き）');
  const ov=(lab,key,def,step,lo,hi)=>row(lab,()=>key==='wt'?WB.t:(P[0][key]!=null?P[0][key]:def),step,v=>{v=clamp(Math.round(v*1000)/1000,lo,hi);RUN.ov[key]=v;if(key==='wt'){WB.t=v;bossField()}else P[0][key]=v});
  ov('マレット半径','mr',MR,5,20,90);ov('打つ速さ倍率','hm',1,.05,.5,2);ov('箱の間隔倍率','boxK',1,.05,.1,3);ov('置物の持続倍率','lifeK',1,.1,.2,5);ov('パリィ受付倍率','parK',1,.1,.1,3);ov('相手ゴール＋幅','wt',0,10,0,150);
  {const w=wrap();btn(w,'上書きを消す',()=>{RUN.ov={};applyMods()})}
  h('相手：戦力と組み直し');
  row('今の相手の POWER',()=>powOf(curP()),0,()=>{});row('今の相手の P',()=>Math.round(curP()*10)/10,0,()=>{});
  row('予算 P を指定',()=>RUN.pOv!=null?RUN.pOv:budget(),2,v=>{RUN.pOv=clamp(v,0,RG.bud.max)});
  {const w=wrap();btn(w,'この予算で組み直す',()=>{if(STAGES[RUN.stage].k==='boss')return;pickEnemy();if(inGame())startMatch()});btn(w,'予算を自動に戻す',()=>{RUN.pOv=null})}
  row('動き d（0よわい 1ふつう 2つよい）',()=>+curD().toFixed(2),.1,v=>{RUN.dOv=clamp(Math.round(v*10)/10,0,2)});{const w=wrap();btn(w,'d を自動に戻す',()=>{RUN.dOv=null})}
  h('相手：CPU の数値（今の試合）');
  const cv=(lab,key,step,lo,hi)=>row(lab,()=>LV[lvl][key],step,v=>{v=clamp(Math.round(v*1000)/1000,lo,hi);LV[lvl][key]=v;RUN.cpuOv[key]=v;if(key==='sp')P[1].maxV=v});
  cv('速さ sp','sp',100,100,4000);cv('反応 re（小さいほど速い）','re',.02,.01,1);cv('狙いのずれ err','err',5,0,150);cv('アイテム間隔 cd','cd',.5,.5,99);cv('打つ力 pw','pw',.05,.5,2.5);cv('追いかけ tr','tr',.05,0,1);
  {const w=wrap();btn(w,'CPU の上書きを消す',()=>{RUN.cpuOv={}})}
  h('相手：強化と技');{const w=wrap();for(const k of ['hard','big','wide','life'])btn(w,PASS[k].n,()=>{const i=RUN.epass.indexOf(k);if(i>=0)RUN.epass.splice(i,1);else{RUN.epass.push(k);RUN.elv[k]=RUN.elv[k]||1}if(inGame())applyMods()},()=>RUN.epass.includes(k))}
  for(const k of ['hard','big','wide','life'])row('敵 '+PASS[k].n+' Lv',()=>RUN.epass.includes(k)?(RUN.elv[k]||1):0,1,v=>{v=clamp(v,0,9);const i=RUN.epass.indexOf(k);if(v<=0){if(i>=0)RUN.epass.splice(i,1);delete RUN.elv[k]}else{if(i<0)RUN.epass.push(k);RUN.elv[k]=v}if(inGame())applyMods()});
  {const w=wrap();btn(w,'ザコ・強敵は箱なし',()=>{RG.noItems=!RG.noItems;if(inGame()&&!BOSS.on){const b=P[1].box;if(RG.noItems){b.on=false;b.cd=99;P[1].items=[]}else b.cd=4}},()=>RG.noItems)}
  {const w=wrap();for(const k of Object.keys(SKILLS))btn(w,SKILLS[k].n,()=>{const i=RUN.skills.indexOf(k);if(i>=0)RUN.skills.splice(i,1);else RUN.skills.push(k)},()=>RUN.skills.includes(k))}
  {const w=wrap();for(const k of Object.keys(SKILLS))btn(w,'発動:'+SKILLS[k].n,()=>{if(state==='play')skillFire(k)})}
  row('ジャンプ台の間隔',()=>RG.jumpT,1,v=>RG.jumpT=clamp(v,1,60));row('スーパーの間隔',()=>RG.chargeT,1,v=>RG.chargeT=clamp(v,2,60));row('バンパー置き直し',()=>RG.blockCD,1,v=>RG.blockCD=clamp(v,1,60));row('バンパー耐久',()=>RG.blockHP,1,v=>RG.blockHP=clamp(v,1,9));row('前兆の時間',()=>RG.tele,.1,v=>RG.tele=clamp(Math.round(v*10)/10,.1,3));
  h('アイテム');{const w=wrap();for(const k of KEYS)btn(w,'自分+'+IT[k].n,()=>{if(P[0].items.length<SLOTS)P[0].items.push(k)})}
  {const w=wrap();for(const k of KEYS)btn(w,'CPU+'+IT[k].n,()=>{if(P[1].items.length<SLOTS)P[1].items.push(k)})}
  {const w=wrap();btn(w,'自分の箱',()=>{if(!P[0].box.on)spawnBox(P[0])});btn(w,'CPU の箱',()=>{if(!P[1].box.on)spawnBox(P[1])});btn(w,'置いた物を消す',()=>{placed.forEach(drop);placed=[]});btn(w,'自分を強化',()=>{P[0].pw=true})}
  h('パリィ・世界');{const w=wrap();btn(w,'一時停止',()=>{SB_FREEZE=!SB_FREEZE},()=>SB_FREEZE);btn(w,'スロー ×0.25',()=>{SB_SLOW=!SB_SLOW},()=>SB_SLOW);btn(w,'パックを中央へ',()=>{serve(0)})}
  row('パックの速さ SPD',()=>SPD,.1,v=>{SPD=clamp(Math.round(v*10)/10,.3,2)});row('パリィ受付 秒',()=>PARC.w,.01,v=>{PARC.w=clamp(Math.round(v*1000)/1000,.01,.4)});row('パリィ停止 秒',()=>PARC.t,.1,v=>{PARC.t=clamp(Math.round(v*10)/10,.1,3)});
  row('パリィ後の敵スタン 秒',()=>RG.parStun,.1,v=>RG.parStun=clamp(Math.round(v*10)/10,0,3));row('ホーミングの曲がり（/秒・Lv1）',()=>RG.homing,.2,v=>RG.homing=clamp(Math.round(v*10)/10,0,10));row('ホーミング Lv2〜 の続く秒',()=>RG.homeT,.5,v=>RG.homeT=clamp(v,.5,10));
  h('ボス（ボス戦中）');{const w=wrap();for(const k of Object.keys(BOSS_NAME))btn(w,BOSS_NAME[k],()=>{if(BOSS.on&&state==='play')bossExec(k)})}
  {const w=wrap();for(const ph of [1,2,3])btn(w,'PHASE '+ph,()=>{if(!BOSS.on)return;BOSS.phase=ph;BOSS.rot[ph]=0;BOSS.next=BOSS_ROT[ph][0]},()=>BOSS.on&&BOSS.phase===ph)}
  row('ボス NULL の P（POWER の表示）',()=>RG.nullP,1,v=>RG.nullP=clamp(v,0,200));
  h('戦力の設定（コスト・予算）');
  for(const k in RG.cost)row('コスト '+({d:'動き d 1.0',hard:'ハード',big:'ビッグ',wide:'ワイド',life:'長持ち',jumper:'JUMPER',blocker:'BLOCKER',charger:'CHARGER',up:'技の強化'})[k],()=>RG.cost[k],1,v=>{RG.cost[k]=clamp(v,0,50)});
  row('予算 ザコ／周',()=>RG.bud.z,1,v=>RG.bud.z=clamp(v,0,30));row('予算 強敵 最初',()=>RG.bud.e0,1,v=>RG.bud.e0=clamp(v,0,60));row('予算 強敵／周',()=>RG.bud.e,1,v=>RG.bud.e=clamp(v,0,30));row('予算の上限（=10000）',()=>RG.bud.max,5,v=>{RG.bud.max=clamp(v,10,200);RG.pow.r=Math.pow(10000/RG.pow.base,1/RG.bud.max)});
  row('レアが出る確率（1枚ごと）',()=>RG.rareP,.05,v=>RG.rareP=clamp(Math.round(v*100)/100,0,1));
  refresh()}

state='rg_title';
if(/[?&]debug/.test(location.search))window.__RGev=src=>eval(src); // テスト用：本体の中の変数を読む
})();
