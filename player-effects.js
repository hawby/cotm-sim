(function(root) {
  'use strict';
  // Native player-effect streams. The initializer advances the ROM animation
  // VM twice, so only the opening record loses one visible tick.
  const sequences={
    3:{row:0,ids:[66,67,68,69,71,124,125],ticks:[1,4,4,4,4,4,4]},
    4:{row:1,ids:[66,67,76,77,80,82,85,86],ticks:[2,4,4,4,4,4,3,2]},
    9:{row:5,ids:[126,127,129,131,133,135],ticks:[1,3,4,4,3,3]}
  };
  for(const sequence of Object.values(sequences))sequence.total=sequence.ticks.reduce((sum,ticks)=>sum+ticks,0);
  const states=new WeakMap();
  let atlas=null,ready=false;
  if(typeof Image==='function') {
    atlas=new Image();
    atlas.onload=()=>{ready=atlas.naturalWidth===768&&atlas.naturalHeight===576;};
    atlas.onerror=()=>{ready=false;};
    atlas.src='assets/player-effects/player-dust.png';
  }
  function reset(game) {states.delete(game);}
  function stateFor(game) {
    let state=states.get(game);
    if(!state||state.player!==game.player||game.frame<state.lastFrame) {
      state={player:game.player,lastFrame:null,effects:[]};states.set(game,state);
    }
    return state;
  }
  function step(game,pose,beforePlayer=game.player) {
    if(!game?.player||game.state!=='playing')return;
    const state=stateFor(game);
    if(state.lastFrame===game.frame)return;
    const elapsed=state.lastFrame===null?0:game.frame-state.lastFrame;
    state.lastFrame=game.frame;
    for(const effect of state.effects)effect.age+=elapsed;
    state.effects=state.effects.filter(effect=>effect.age<sequences[effect.type].total);
    const player=game.player,land=game.events.find(event=>event.type==='land');
    let type=0,origin=player;
    if(land&&!land.hurtLanding) {
      // Running landing enters the dash helper, which emits its own type 3.
      // Air-whip and crouched landings clear velocity before selecting type 9.
      type=land.attackLanding?9:pose?.name==='dash'?3:pose?.crouching||player.vx===0?9:3;
    } else if(!land&&(pose?.movementEffect===3||pose?.movementEffect===4)) {
      type=pose.movementEffect;
      // Ground-state helpers run before horizontal integration. Preserve that
      // launch point instead of moving the new puff forward with the player.
      origin=beforePlayer;
    }
    if(type)state.effects.push({type,age:0,x:origin.x,y:origin.y,facing:player.facing<0?-1:1});
  }
  function snapshot(game) {
    const state=states.get(game);
    if(!state||state.player!==game.player)return [];
    return state.effects.map(effect=>{
      const sequence=sequences[effect.type];let end=0;
      for(let index=0;index<sequence.ticks.length;index++) {
        end+=sequence.ticks[index];
        if(effect.age<end)return {...effect,index,spriteId:sequence.ids[index],
          source:[index*96,sequence.row*96,96,96],origin:[48,64]};
      }
    }).filter(Boolean);
  }
  function draw(ctx,game,cameraY=game.cameraY||0) {
    if(!ready)return false;
    const effects=snapshot(game);
    for(const effect of effects) {
      ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
      // Native fixed-point coordinates are floored before camera subtraction.
      ctx.translate(Math.floor(effect.x),Math.floor(effect.y)-cameraY);
      ctx.scale(effect.facing,1);
      ctx.drawImage(atlas,...effect.source,-48,-64,96,96);
      ctx.restore();
    }
    return effects.length>0;
  }
  root.StairPlayerEffects={reset,step,snapshot,draw};
})(typeof window!=='undefined'?window:globalThis);
