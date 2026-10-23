(function(root) {
  'use strict';
  // Original ROM artwork and one-shot clocks; only the costume-change trigger
  // and attachment to the player's torso are custom to this game.
  const sequences={
    blood:{ids:[17,18,19,22,26,29],ticks:[4,4,8,8,8,8]},
    cloud:{ids:[105,106,107,109,113,117],ticks:[3,3,3,4,3,3]}
  };
  const active=new WeakMap();
  for(const [kind,sequence] of Object.entries(sequences)) {
    sequence.total=sequence.ticks.reduce((sum,ticks)=>sum+ticks,0);
    sequence.ready=false;
    if(typeof Image!=='function')continue;
    sequence.image=new Image();
    sequence.image.onload=()=>{
      sequence.ready=sequence.image.naturalWidth===288&&sequence.image.naturalHeight===192;
    };
    sequence.image.onerror=()=>{sequence.ready=false;};
    sequence.image.src='assets/costume-effects/'+kind+'.png';
  }
  function reset(game) {active.delete(game);}
  function trigger(game,costume) {
    if(!game?.player)return;
    const selected=costume==='alternate'?'alternate':'original';
    active.set(game,{kind:selected==='alternate'?'blood':'cloud',costume:selected,
      age:0,started:false,facing:game.player.facing<0?-1:1});
  }
  function advance(game,seconds) {
    const effect=active.get(game);
    if(!effect)return;
    if(!effect.started) {
      // Present frame zero once even if the code completed during this RAF.
      // Loading a costume must not consume its effect before it can be seen.
      if(!sequences[effect.kind].ready)return;
      if(root.StairCharacter?.isCostumeReady&&!root.StairCharacter.isCostumeReady(effect.costume))return;
      effect.started=true;
      return;
    }
    effect.age+=Math.max(0,Number.isFinite(seconds)?seconds:0)*(game.physics?.hz||16777216/280896);
    if(effect.age+1e-8>=sequences[effect.kind].total)reset(game);
  }
  function snapshot(game) {
    const effect=active.get(game);
    if(!effect||!game.player)return null;
    const sequence=sequences[effect.kind],age=Math.floor(effect.age+1e-8);
    let end=0;
    for(let index=0;index<sequence.ticks.length;index++) {
      end+=sequence.ticks[index];
      if(age<end)return {kind:effect.kind,age,index,spriteId:sequence.ids[index],
        source:[index%3*96,Math.floor(index/3)*96,96,96],origin:[48,64],
        facing:effect.facing,started:effect.started,x:game.player.x,y:game.player.y-16};
    }
    return null;
  }
  function draw(ctx,game,cameraY=game.cameraY||0) {
    const pose=snapshot(game);
    if(!pose?.started||!sequences[pose.kind].ready)return false;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
    ctx.translate(Math.round(pose.x),Math.round(pose.y-cameraY));
    if(pose.kind==='blood')ctx.scale(pose.facing,1);
    ctx.drawImage(sequences[pose.kind].image,...pose.source,-48,-64,96,96);
    ctx.restore();
    return true;
  }
  root.StairCostumeEffects={trigger,advance,reset,snapshot,draw};
})(typeof window!=='undefined'?window:globalThis);
