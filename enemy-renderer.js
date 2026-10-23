(function () {
  'use strict';

  // Fallback shapes while native custom sprites load. The sprite hook receives
  // the AI actor origin; renderOffsetY adjusts only the old placeholder shapes.
  const INK='#101a25', SHADOW='#3d4859', STONE='#6f7b89', LIGHT='#a7b2b7';
  function rect(ctx,x,y,w,h,color) {
    ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
  }
  function line(ctx,x0,y0,x1,y1,color,width=1) {
    let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,error=dx+dy;
    const shift=Math.floor(width/2);ctx.fillStyle=color;
    for (;;) {
      ctx.fillRect(x0-shift,y0-shift,width,width);
      if(x0===x1&&y0===y1)break;
      const twice=2*error;
      if(twice>=dy){error+=dy;x0+=sx;}
      if(twice<=dx){error+=dx;y0+=sy;}
    }
  }
  // Scanline filling keeps diagonal wing edges on whole native pixels.
  function polygon(ctx,points,color) {
    const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
    ctx.fillStyle=color;
    for(let y=minY;y<maxY;y++) {
      const cuts=[],scan=y+.5;
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))
          cuts.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i+1<cuts.length;i+=2) {
        const left=Math.ceil(cuts[i]-.5),right=Math.ceil(cuts[i+1]-.5);
        ctx.fillRect(left,y,right-left,1);
      }
    }
  }
  function animationFrame(enemy,frame) {
    if(Number.isFinite(enemy.animFrame))return Math.floor(enemy.animFrame);
    if(Number.isFinite(enemy.animationIndex))return Math.floor(enemy.animationIndex);
    return Math.floor((Number.isFinite(enemy.age)?enemy.age:frame||0)/6);
  }
  function gargoyle(ctx,enemy,frame) {
    const state=String(enemy.state||'').toLowerCase();
    const perched=/statue|perch|idle|stand|rest|wait|sleep|dormant/.test(state);
    const attacking=/attack|throw|shoot|fire|windup|spit|cast/.test(state);
    const phase=((animationFrame(enemy,frame)%4)+4)%4;
    const wingY=perched?-5:[-12,-7,1,-7][phase];
    const wingX=perched?-8:-12;
    // Far wing and tail stay behind the torso.
    polygon(ctx,[[1,-3],[8,wingY+2],[11,wingY+4],[8,4],[3,2]],INK);
    polygon(ctx,[[2,-2],[8,wingY+4],[8,2],[4,1]],SHADOW);
    line(ctx,-3,5,-7,10,INK,3);line(ctx,-7,10,-11,9,INK,2);
    line(ctx,-4,5,-7,9,STONE);line(ctx,-7,9,-10,9,STONE);
    // Batlike near wing, with two ribs and a scalloped lower edge.
    polygon(ctx,[[-2,-3],[wingX,wingY],[-11,6],[-7,3],[-6,7],[-3,3]],INK);
    polygon(ctx,[[-3,-2],[wingX+1,wingY+2],[-9,3],[-6,1],[-5,4]],'#505f76');
    line(ctx,-3,-2,wingX+1,wingY+1,STONE);
    line(ctx,-4,-1,-9,3,'#7c899c');
    line(ctx,-4,0,-5,4,STONE);
    // Haunches and talons share a stable center, even while the wings flap.
    const kneeY=perched?9:7,footY=perched?12:10;
    line(ctx,-2,4,-5,kneeY,INK,5);line(ctx,2,4,5,kneeY,INK,5);
    line(ctx,-2,4,-5,kneeY,STONE,3);line(ctx,2,4,5,kneeY,SHADOW,3);
    line(ctx,-5,kneeY,-4,footY,INK,3);line(ctx,5,kneeY,4,footY,INK,3);
    rect(ctx,-5,footY,5,2,INK);rect(ctx,3,footY,5,2,INK);
    rect(ctx,-4,footY,4,1,LIGHT);rect(ctx,4,footY,4,1,LIGHT);
    ctx.save();if(perched)ctx.translate(0,3);
    rect(ctx,-4,-5,9,12,INK);rect(ctx,-3,-4,7,9,STONE);
    rect(ctx,-3,-3,2,7,LIGHT);rect(ctx,2,-2,2,7,SHADOW);
    rect(ctx,-1,1,3,1,'#a0abb2');rect(ctx,-1,3,2,1,SHADOW);
    // One reaching forearm reads as a firing pose without moving the entity.
    const handX=attacking?9:5,handY=attacking?-3:5;
    line(ctx,2,-3,handX,handY,INK,4);line(ctx,2,-3,handX,handY,STONE,2);
    rect(ctx,handX-1,handY,3,2,LIGHT);
    rect(ctx,-2,-10,8,7,INK);rect(ctx,-1,-9,6,5,STONE);
    rect(ctx,-1,-9,2,3,LIGHT);rect(ctx,4,-8,4,4,INK);
    rect(ctx,4,-7,3,2,STONE);rect(ctx,3,-8,2,1,'#e5b477');
    line(ctx,-1,-10,-3,-13,INK,2);line(ctx,3,-10,4,-12,INK,2);
    rect(ctx,-2,-12,1,3,LIGHT);rect(ctx,4,-12,1,2,LIGHT);
    if(attacking) {rect(ctx,5,-5,3,2,INK);rect(ctx,6,-5,2,1,'#d48b60');}
    else rect(ctx,5,-4,2,1,SHADOW);
    ctx.restore();
  }
  function medusaHead(ctx,enemy,frame) {
    const phase=((animationFrame(enemy,frame)%4)+4)%4,shift=phase===1?1:phase===3?-1:0;
    const TEAL='#568f91',MINT='#8cc0b5',PURPLE='#665580';
    // Coils and tiny snake heads give a readable silhouette at native scale.
    line(ctx,-2,-4,-7,-7+shift,INK,3);line(ctx,-7,-7+shift,-9,-3+shift,INK,3);
    line(ctx,-2,-4,-7,-7+shift,TEAL);line(ctx,-7,-7+shift,-9,-3+shift,MINT);
    line(ctx,0,-5,2,-8-shift,INK,3);line(ctx,2,-8-shift,6,-7-shift,INK,3);
    line(ctx,0,-5,2,-8-shift,TEAL);line(ctx,2,-8-shift,6,-7-shift,MINT);
    line(ctx,-4,-1,-8,2,INK,4);line(ctx,-8,2,-6,6+shift,INK,3);
    line(ctx,-4,-1,-8,2,PURPLE,2);line(ctx,-8,2,-6,6+shift,'#9681ad');
    line(ctx,-3,4,-1,8,INK,3);line(ctx,-1,8,3,6-shift,INK,3);
    line(ctx,-3,4,-1,8,TEAL);line(ctx,-1,8,3,6-shift,MINT);
    rect(ctx,-10,-4+shift,3,2,TEAL);rect(ctx,-9,-4+shift,1,1,'#e5cb8c');
    rect(ctx,5,-8-shift,3,2,TEAL);rect(ctx,7,-8-shift,1,1,'#e5cb8c');
    rect(ctx,-5,-5,9,11,INK);rect(ctx,-4,-4,7,9,PURPLE);
    rect(ctx,-1,-4,5,8,INK);rect(ctx,-1,-3,4,6,'#9eb7b0');
    rect(ctx,-1,-3,2,4,'#c0ccc0');rect(ctx,3,-1,3,3,INK);
    rect(ctx,3,0,2,1,'#b1c7bc');rect(ctx,1,-2,3,1,'#1b2931');
    rect(ctx,2,-2,1,1,'#f0c084');rect(ctx,2,3,2,1,'#6f526c');
    rect(ctx,-4,-4,2,6,TEAL);rect(ctx,-4,-4,1,5,MINT);
    rect(ctx,-3,3,2,2,'#827096');
  }
  function gargoyleShot(ctx,enemy,frame) {
    if(enemy.kind==='spear') {
      line(ctx,-7,-7,5,5,INK,3);
      line(ctx,-6,-6,4,4,'#a89b79');
      polygon(ctx,[[2,6],[6,2],[8,8]],INK);
      polygon(ctx,[[4,6],[6,4],[7,7]],'#d3dbce');
      line(ctx,-7,-5,-5,-7,'#838da1');
      return;
    }
    const pulse=((animationFrame(enemy,frame)%2)+2)%2;
    rect(ctx,-8-pulse,-1,5,2,'#753c43');
    rect(ctx,-5,-2,7,5,'#733747');rect(ctx,-3,-3,6,7,'#9c4b42');
    rect(ctx,-3,-2,7,5,'#e48a4c');rect(ctx,-2,-2,5,4,'#f3bf68');
    rect(ctx,0,-1,3,3,'#f8e6a5');rect(ctx,-6-pulse,-1,3,1,'#d17b4e');
    rect(ctx,-8+pulse,2,2,1,'#b96546');
  }
  const placeholders={gargoyle,medusaHead,gargoyleShot};
  function draw(ctx,enemies,cameraY,frame) {
    if(!enemies)return;
    const camera=Math.round(cameraY||0);
    for(const enemy of enemies) {
      if(!enemy||enemy.dead||!Number.isFinite(enemy.x)||!Number.isFinite(enemy.y))continue;
      const y=Math.round(enemy.y-camera);
      if(y < -32 || y > 192)continue;
      ctx.save();ctx.imageSmoothingEnabled=false;
      ctx.translate(Math.round(enemy.x),y);ctx.scale(enemy.facing===-1?-1:1,1);
      let handled=false;
      if(window.StairEnemySprites&&typeof window.StairEnemySprites.draw==='function') {
        ctx.save();handled=window.StairEnemySprites.draw(ctx,enemy,frame)===true;ctx.restore();
      }
      if(!handled&&placeholders[enemy.type]) {
        if(Number.isFinite(enemy.renderOffsetY))ctx.translate(0,Math.round(enemy.renderOffsetY));
        placeholders[enemy.type](ctx,enemy,frame);
      }
      ctx.restore();
    }
  }
  window.StairEnemyRenderer={draw};
})();
