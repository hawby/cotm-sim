(function(root) {
  'use strict';
  // Original name request 08062394 and HUD update 080622DC. Each enemy
  // announces once, on its first received hit or accepted body contact.
  const LABELS=Object.freeze({medusaHead:'Goat Head',gargoyle:'Ginny?'});
  const ITEM_LABELS=Object.freeze({spicedMeat:'Spiced Meat'});
  const CONSTANTS=Object.freeze({duration:240,screenWidth:240,y:136,height:24});
  const assets={
    medusaHead:{file:'assets/enemy-name/goat-head.png',width:104},
    gargoyle:{file:'assets/enemy-name/ginny.png',width:80},
    spicedMeat:{file:'assets/breakables/spiced-meat-name.png',width:120}
  };
  for(const asset of Object.values(assets)) {
    asset.ready=false;
    if(typeof Image==='function') {
      asset.image=new Image();
      asset.image.onload=()=>{asset.ready=asset.image.naturalWidth===asset.width&&asset.image.naturalHeight===CONSTANTS.height;};
      asset.image.src=asset.file;
    }
  }
  const states=new WeakMap();
  function reset(game) {
    states.set(game,{player:game.player,lastFrame:-1,seen:new WeakSet(),popup:null});
  }
  function tick(game) {
    if(game.state!=='playing')return;
    let state=states.get(game);
    if(!state||state.player!==game.player) {reset(game);state=states.get(game);}
    if(state.lastFrame===game.frame)return;
    state.lastFrame=game.frame;
    // Combat retains killed bodies until the next world update. Resolve the
    // actual instance, so reused IDs and long climbs need no growing ID list.
    for(const event of game.events||[]) {
      if(event.type==='itemPickup'&&event.itemId===43) {
        // Items and enemies share the original HUD slot and countdown. The
        // item category uses its original green-backed nameplate artwork.
        state.popup={itemType:'spicedMeat',itemId:43,remaining:CONSTANTS.duration,age:0};
        continue;
      }
      if(event.type!=='enemyDeath'&&event.type!=='hurt')continue;
      const id=event.type==='enemyDeath'?event.enemyId:event.source;
      const enemy=(game.enemies||[]).find(candidate=>candidate.id===id);
      if(!enemy||!Object.hasOwn(LABELS,enemy.type)||state.seen.has(enemy))continue;
      state.seen.add(enemy);
      state.popup={enemyType:enemy.type,enemyId:enemy.id,remaining:CONSTANTS.duration,age:0};
    }
    // The ROM draws on the first update, decrements 240 to 239, and clears on
    // the update that reaches zero. No slide, fade, or repeated-hit refresh.
    if(state.popup) {
      state.popup.age++;
      if(--state.popup.remaining===0)state.popup=null;
    }
  }
  function snapshot(game) {
    const state=states.get(game),popup=state&&state.player===game.player?state.popup:null;
    if(!popup)return null;
    const asset=assets[popup.itemType||popup.enemyType];
    return {...popup,name:popup.itemType?ITEM_LABELS[popup.itemType]:LABELS[popup.enemyType],x:CONSTANTS.screenWidth-asset.width,
      y:CONSTANTS.y,width:asset.width,height:CONSTANTS.height};
  }
  // Called in native screen coordinates, after the world camera is restored.
  function draw(ctx,game) {
    const popup=snapshot(game);
    if(!popup)return false;
    const asset=assets[popup.itemType||popup.enemyType];
    if(!asset.ready)return false;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
    ctx.drawImage(asset.image,popup.x,popup.y);
    ctx.restore();return true;
  }
  const api={reset,tick,snapshot,draw,ready:()=>Object.values(assets).every(asset=>asset.ready),LABELS,CONSTANTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairEnemyName=api;
})(typeof window!=='undefined'?window:globalThis);
