(function () {
  'use strict';
  // Each costume/style uses one complete approved atlas, including all four idle poses.
  // Image loading also supports the portable game directly from file://.
  const players=new WeakMap(), outlines=new Map(), classicIdleFrames=new Map(), COLUMNS=8, WORLD_SCALE=8/13;
  const costumes={
    original:{folder:'white-wolf',columns:8,rows:7},
    // Canonical controller cells mapped by matching frame IDs to the authored
    // four-column atlas. Its unused cells and source pixels remain unchanged.
    alternate:{folder:'white-wolf-black-shorts',columns:4,rows:18,cells:[
      0,4,5,6,7,12,13,14,15,16,8,9,10,11,64,65,66,67,68,69,
      20,21,22,23,24,25,26,27,28,29,30,31,32,36,37,38,39,40,
      41,42,43,44,45,48,49,50,51,52,53,54,55,56,1,2,3,60
    ]}
  };
  const movementRowBase={1:1,2:5,3:10,4:14};
  // Remove the two isolated head/bang tips in both native breathing poses.
  const classicIdleCutouts={0:[[58,22],[59,25]],52:[[58,23],[59,26]]};
  let renderStyle='detailed',costume='original';
  for (const [costumeName,pack] of Object.entries(costumes)) {
    pack.styles={
      detailed:{file:'character-atlas.png',width:208,height:104,originX:92*WORLD_SCALE,originY:88*WORLD_SCALE},
      classic:{file:'character-classic-atlas.png',width:128,height:64,originX:57,originY:54}
    };
    for (const [styleName,style] of Object.entries(pack.styles)) {
      const sheet=style.sheet=new Image();
      style.ready=false;style.columns=pack.columns;style.key=costumeName+':'+styleName;
      sheet.onload=()=>{style.ready=sheet.naturalWidth===style.width*pack.columns && sheet.naturalHeight===style.height*pack.rows;};
      sheet.src='assets/'+pack.folder+'/'+style.file;
    }
  }
  function getRenderStyle() { return renderStyle; }
  function setRenderStyle(value) {
    // Presentation changes never select/restart a stream or advance its clock.
    renderStyle=value==='classic'?'classic':'detailed';
    return renderStyle;
  }
  function getCostume() { return costume; }
  function setCostume(value) {
    // Queue the choice even during initial loading. draw() uses the complete
    // original set until both alternate sizes are ready, then changes at once.
    costume=value==='alternate'?'alternate':'original';
    return costume;
  }
  function toggleCostume() { return setCostume(costume==='original'?'alternate':'original'); }
  function isCostumeReady(value) {
    const pack=costumes[value];
    return !!pack && Object.values(pack.styles).every(style=>style.ready);
  }

  function stateFor(player) {
    if (!players.has(player)) players.set(player,{controller:new window.StairAnimation.Controller(player),frame:-1});
    return players.get(player);
  }
  function reset(game) {
    players.set(game.player,{controller:new window.StairAnimation.Controller(game.player),frame:game.frame});
  }
  function tick(game,input) {
    const state=stateFor(game.player);
    if (game.state!=='playing' || state.frame===game.frame) return;
    state.controller.tick(game.player,game.events,input);
    state.frame=game.frame;
  }
  function snapshot(player) { return stateFor(player).controller.snapshot(); }
  function reactToHit(game) {
    // Contact is resolved after movement and AI. Replace this frame's artwork
    // immediately, without advancing the normal animation clock twice.
    stateFor(game.player).controller.reactToHit(game.player);
  }
  function cellFor(pose) {
    // Controller sheet/row/column fields retain their logical mappings so ROM
    // clock/state behavior stays independent of how the artwork is packed.
    if(pose.sheet==='idle')return [0,52,53,54][pose.column];
    if(pose.sheet==='combat')return pose.atlasRow*COLUMNS+pose.column;
    return movementRowBase[pose.atlasRow]+pose.column;
  }
  function tintFor(style,cell,color) {
    const key=style.key+':'+cell+':'+color;
    if (!outlines.has(key)) {
      const canvas=document.createElement('canvas');
      canvas.width=style.width; canvas.height=style.height;
      const ctx=canvas.getContext('2d');
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(style.sheet,(cell%style.columns)*style.width,Math.floor(cell/style.columns)*style.height,
        style.width,style.height,0,0,style.width,style.height);
      ctx.globalCompositeOperation='source-in';
      ctx.fillStyle=color;ctx.fillRect(0,0,style.width,style.height);
      outlines.set(key,canvas);
    }
    return outlines.get(key);
  }
  function classicIdleFrame(style,cell) {
    if (!classicIdleFrames.has(cell)) {
      const canvas=document.createElement('canvas');
      canvas.width=style.width;canvas.height=style.height;
      const ctx=canvas.getContext('2d');
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(style.sheet,(cell%COLUMNS)*style.width,Math.floor(cell/COLUMNS)*style.height,
        style.width,style.height,0,0,style.width,style.height);
      if (cell===52) {
        // The native second breath darkens the ear/fringe and widens the chest
        // highlight. Reuse frame one's existing pixels one row lower, following
        // the breathing motion. These patches change only seven opaque pixels.
        ctx.drawImage(style.sheet,56,21,1,1,56,22,1,1);
        ctx.drawImage(style.sheet,55,22,1,1,55,23,1,1);
        ctx.drawImage(style.sheet,58,23,1,2,58,24,1,2);
        ctx.drawImage(style.sheet,56,30,3,3,56,31,3,3);
      }
      // Clear the sprite copy, never the gameplay canvas, so scenery remains
      // visible through the cutouts on any background and in either facing.
      for (const [px,py] of classicIdleCutouts[cell]) ctx.clearRect(px,py,1,1);
      classicIdleFrames.set(cell,canvas);
    }
    return classicIdleFrames.get(cell);
  }
  function draw(ctx,player) {
    const activeCostume=costume==='alternate'&&isCostumeReady('alternate')?'alternate':'original';
    const pack=costumes[activeCostume],style=pack.styles[renderStyle];
    if (!style.ready) return false;
    const pose=snapshot(player),canonicalCell=cellFor(pose),cell=pack.cells?pack.cells[canonicalCell]:canonicalCell;
    const x=-style.originX,y=-style.originY+pose.offsetY;
    ctx.imageSmoothingEnabled=false;
    if (pose.outlineColor) {
      const tinted=tintFor(style,cell,pose.outlineColor);
      // Both styles keep the original one-WORLD-pixel outline width.
      // A one-source-pixel dilation would make the detailed effect too thin.
      // The unchanged opaque base below covers the overlapping tinted center.
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        ctx.drawImage(tinted,x+dx,y+dy,128,64);
      }
    }
    // All 56 poses use their selected pack's shared origin. Never mix native
    // and detailed frames within a style or resample the approved source atlases.
    if (activeCostume==='original' && renderStyle==='classic' && classicIdleCutouts[cell])
      ctx.drawImage(classicIdleFrame(style,cell),x,y,128,64);
    else ctx.drawImage(style.sheet,(cell%style.columns)*style.width,Math.floor(cell/style.columns)*style.height,
      style.width,style.height,x,y,128,64);
    return true;
  }
  window.StairCharacter={name:'White Wolf',reset,tick,snapshot,reactToHit,draw,getRenderStyle,setRenderStyle,getCostume,setCostume,toggleCostume,isCostumeReady};
})();
