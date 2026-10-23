(function(root) {
  'use strict';
  // CotM room entity 0x1DF: original sprites 60/61/62, eight game ticks each.
  // Original x128,y1832 becomes x128,y209 with the level's -1623 translation.
  const WIDTH=16,HEIGHT=16,ORIGIN_X=8,ORIGIN_Y=16,LOWEST_Y=209,SPACING=128;
  let image=null,loaded=false;
  if(typeof Image==='function') {
    image=new Image();
    image.onload=()=>{loaded=image.naturalWidth===48&&image.naturalHeight===16;};
    image.src='assets/level/flames.png';
  }
  function snapshot(frame=0) {
    const tick=Math.max(0,Math.floor(Number.isFinite(frame)?frame:0));
    const index=Math.floor(tick/8)%3;
    return {index,spriteId:60+index,source:[index*WIDTH,0,WIDTH,HEIGHT],origin:[ORIGIN_X,ORIGIN_Y]};
  }
  function visible(cameraY,height=160) {
    const cam=Math.round(cameraY),first=Math.max(0,Math.floor((LOWEST_Y-HEIGHT-cam-height)/SPACING)+1);
    const last=Math.floor((LOWEST_Y-cam-1)/SPACING),result=[];
    for(let id=first;id<=last;id++)result.push({id,x:128,y:LOWEST_Y-id*SPACING});
    return result;
  }
  // Renderer has already applied integer camera X; Y is subtracted exactly once.
  function draw(ctx,game,cameraY=Math.round(game.cameraY)) {
    if(!loaded)return false;
    const pose=snapshot(game.frame);
    ctx.save();ctx.imageSmoothingEnabled=false;
    for(const flame of visible(cameraY))
      ctx.drawImage(image,...pose.source,flame.x-ORIGIN_X,flame.y-cameraY-ORIGIN_Y,WIDTH,HEIGHT);
    ctx.restore();return true;
  }
  const api={draw,snapshot,visible,ready:()=>loaded};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairFlames=api;
})(typeof window!=='undefined'?window:globalThis);
