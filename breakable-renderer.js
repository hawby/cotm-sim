(function(root) {
  'use strict';
  // Native ROM art, decoded in research/breakable-wall/extract-art.py.
  // The existing scenery supplies the intact wall. Once it breaks, the caller
  // omits that foreground tile and this module draws original opening tile38.
  const IDS=Object.freeze([105,106,107,109,113,117,121,123,136,137,138,139,140,141,142,143,144]);
  const frameIndex=new Map(IDS.map((id,index)=>[id,index]));
  const images={
    wall:{file:'wall-open.png',width:32,height:32},
    meat:{file:'spiced-meat.png',width:16,height:16},
    effects:{file:'wall-effects.png',width:1088,height:64}
  };
  for(const asset of Object.values(images)) {
    asset.image=null;asset.loaded=false;
    if(typeof Image!=='function')continue;
    asset.image=new Image();
    asset.image.onload=()=>{
      asset.loaded=asset.image.naturalWidth===asset.width&&asset.image.naturalHeight===asset.height;
    };
    asset.image.onerror=()=>{asset.loaded=false;};
    asset.image.src='assets/breakables/'+asset.file;
  }
  function camera(game,value) {
    return Math.round(Number.isFinite(value)?value:Number.isFinite(game.cameraY)?game.cameraY:0);
  }
  // X already includes the renderer's camera transform. Subtract integer Y once.
  function drawWall(ctx,game,cameraY) {
    const wall=game.breakables?.wall;
    if(!wall?.broken||!images.wall.loaded)return false;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(images.wall.image,Math.round(wall.x),Math.round(wall.y)-camera(game,cameraY),32,32);
    ctx.restore();return true;
  }
  function drawObjects(ctx,game,cameraY) {
    const state=game.breakables;
    if(!state)return false;
    const cam=camera(game,cameraY);
    let drawn=false;
    ctx.save();ctx.imageSmoothingEnabled=false;
    const item=state.item;
    if(item?.visible&&images.meat.loaded) {
      // Original pickup transform 0805E54E and OAM conversion 080032BC:
      // truncate after camera subtraction, with the native one-pixel Y bias.
      // Add X's camera back because the caller has already translated it.
      const cameraX=Math.round(Number.isFinite(game.cameraX)?game.cameraX:0);
      const x=Math.trunc(item.x-cameraX)+cameraX;
      const y=Math.trunc(item.y-cam+1);
      ctx.drawImage(images.meat.image,x-8,y-16,16,16);
      drawn=true;
    }
    if(images.effects.loaded)for(const effect of state.effects||[]) {
      const index=frameIndex.get(effect.spriteId);
      if(index===undefined)continue;
      ctx.drawImage(images.effects.image,index*64,0,64,64,Math.round(effect.x)-32,Math.round(effect.y)-cam-48,64,64);
      drawn=true;
    }
    ctx.restore();return drawn;
  }
  const api={drawWall,drawObjects,get ready(){return Object.values(images).every(asset=>asset.loaded);}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairBreakableRenderer=api;
})(typeof window!=='undefined'?window:globalThis);
