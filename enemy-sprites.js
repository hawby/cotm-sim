(function () {
  'use strict';
  // Authored native and detail art share the same logical actor coordinates.
  // Image loading also works when play.html is opened offline.
  const assets={
    goat:{file:'goat-medusa.png',detailFile:'goat-medusa-detailed.png',width:120,height:64},
    gargoyle:{file:'devil-gargoyle.png',detailFile:'devil-gargoyle-detailed.png',width:256,height:168},
    trident:{file:'trident.png',detailFile:'trident-detailed.png',width:64,height:80}
  };
  for(const asset of Object.values(assets)) {
    asset.image=new Image();asset.ready=false;
    asset.image.onload=()=>{asset.ready=asset.image.naturalWidth===asset.width&&asset.image.naturalHeight===asset.height;};
    asset.image.onerror=()=>{asset.ready=false;};
    asset.image.src='assets/enemies/'+asset.file;
    asset.detailImage=new Image();asset.detailReady=false;
    asset.detailImage.onload=()=>{asset.detailReady=asset.detailImage.naturalWidth===asset.width*2&&asset.detailImage.naturalHeight===asset.height*2;};
    asset.detailImage.onerror=()=>{asset.detailReady=false;};
    asset.detailImage.src='assets/enemies/'+asset.detailFile;
  }
  function isStyleReady(style) {
    return Object.values(assets).every(asset=>style==='classic'?asset.ready:asset.detailReady);
  }
  function getActiveStyle() {
    const selected=window.StairCharacter?.getRenderStyle()||'detailed';
    // Keep one complete enemy set during loading; never mix native and detail
    // actors because an individual image happened to arrive first.
    return selected==='detailed'&&isStyleReady('detailed')?'detailed':'classic';
  }
  // Sprite 23 is both throw recovery and the middle unarmed wing pose.
  const gargoyleSlots={5:0,10:1,15:2,29:4,34:5,39:6,44:7,20:8,23:9,26:10};
  function snapshot(enemy) {
    // These remain native logical rectangles for animation/collision consumers.
    // Selecting a render style never changes this mapping or the enemy clock.
    if(enemy.type==='medusaHead') {
      // The first original post-update snapshot has age 1 and counter 1.
      // This clock is independent of the 82-tick vertical movement wave.
      const index=Math.floor(Math.max(0,(enemy.age||0)-1)/15)%6;
      return {asset:'goat',frame:'pose-'+String(index+1).padStart(2,'0'),index,
        source:[index%3*40,Math.floor(index/3)*32,40,32],origin:[20,20],scale:2/3,sourceFacing:-1};
    }
    if(enemy.type==='gargoyle') {
      const slot=gargoyleSlots[enemy.spriteId];
      if(slot===undefined)return null;
      return {asset:'gargoyle',frame:'sprite-'+enemy.spriteId,index:slot,
        source:[slot%4*64,Math.floor(slot/4)*56,64,56],origin:[31,28],sourceFacing:1};
    }
    if(enemy.type==='gargoyleShot'&&enemy.kind==='spear')
      return {asset:'trident',frame:'trident',index:0,source:[0,0,64,80],origin:[31,44],sourceFacing:1};
    return null;
  }
  function draw(ctx,enemy) {
    const pose=snapshot(enemy);
    if(!pose)return false;
    const asset=assets[pose.asset],detailed=getActiveStyle()==='detailed';
    if(!(detailed?asset.detailReady:asset.ready))return false;
    const [sx,sy,w,h]=pose.source;
    const sampleScale=detailed?2:1,image=detailed?asset.detailImage:asset.image;
    ctx.save();ctx.imageSmoothingEnabled=false;
    // Outer renderer has already applied the actor's facing. Goat source faces
    // left, whereas the red girl and projectile source face right.
    ctx.scale(pose.sourceFacing,1);
    // ROM Medusa width / Nathan height is about 0.575. At 2/3 size the
    // custom goat / wolf ratio is 0.572, including the goat's horn silhouette.
    if(pose.scale)ctx.scale(pose.scale,pose.scale);
    ctx.drawImage(image,sx*sampleScale,sy*sampleScale,w*sampleScale,h*sampleScale,-pose.origin[0],-pose.origin[1],w,h);
    ctx.restore();
    return true;
  }
  window.StairEnemySprites={draw,snapshot,ready:()=>isStyleReady('classic'),isStyleReady,getActiveStyle};
})();
