const {scene,DIRECTOR,BOT0}=require('./rlib');
scene('basic',async({p,tap,sleep,mark})=>{
  await tap(300,842,200); // CPU ふつう
  await p.evaluate(DIRECTOR);await p.evaluate(BOT0);
  for(let tr=0;tr<12;tr++){
    for(let k=0;k<60&&await p.evaluate(()=>__AH.state)!=='play';k++)await sleep(100);
    await p.evaluate(()=>{__AH.P[0].score=0;__AH.P[1].score=0;__AH.P[0].x=300;__AH.P[0].y=1068;Object.assign(__AH.puck,{x:300,y:480,vx:0,vy:0,hold:0});__bot.gx=300+(Math.random()-.5)*120});
    await sleep(150);mark('a');const t0=Date.now();
    let ok=false;for(let k=0;k<150;k++){const st=await p.evaluate(()=>[__AH.state,__AH.P[0].score]);if(st[0]==='goal'){ok=st[1]>0&&Date.now()-t0>3500;break}await sleep(100)}
    if(ok){mark('g');console.log('try',tr);break}
  }
  await sleep(2300);mark('z');
});
