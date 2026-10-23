(function () {
  'use strict';
  const LEVEL=window.StairLevel, HEIGHT=160;
  const layers={};
  for(const [name,file] of Object.entries({
    background:'abyss-background-repeat.png', foreground:'abyss-foreground-repeat.png',
    baseBackground:'abyss-background-base.png', baseForeground:'abyss-foreground-base-closed.png'
  })) {
    const image=new Image(); const layer=layers[name]={image,ready:false};
    image.onload=()=>{layer.ready=true;}; image.src='assets/level/'+file;
  }
  // Both layers share one integer camera origin. Every source pixel remains one
  // world pixel, with no procedural texture, resampling, or camera-parallax drift.
  function scenery(ctx,cam,foreground) {
    const repeat=layers[foreground?'foreground':'background'];
    const base=layers[foreground?'baseForeground':'baseBackground'];
    if(repeat.ready) {
      const first=Math.floor((cam-LEVEL.repeatOrigin)/LEVEL.repeatHeight);
      for(let band=first;band<=0;band++) {
        const y=LEVEL.repeatOrigin+band*LEVEL.repeatHeight;
        if(y>=cam+HEIGHT)break;
        ctx.drawImage(repeat.image,0,y-cam);
      }
    }
    if(base.ready&&cam+HEIGHT>LEVEL.baseOrigin)
      ctx.drawImage(base.image,0,LEVEL.baseOrigin-cam);
  }
  function rect(ctx, x, y, w, h, color) {
    if (color) ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function line(ctx, x0, y0, x1, y1, color, width) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, error = dx + dy;
    var thick = width || 1, offset = Math.floor(thick / 2);
    ctx.fillStyle = color;
    for (;;) {
      ctx.fillRect(x0 - offset, y0 - offset, thick, thick);
      if (x0 === x1 && y0 === y1) break;
      var twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  }
  function poly(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var p = 1; p < points.length; p++) ctx.lineTo(points[p][0], points[p][1]);
    ctx.closePath(); ctx.fill();
  }

  function hunter(ctx, p, cam, frame) {
    // The short protection window blinks independently of the held hit pose.
    if (p.invincible>0 && Math.floor(p.invincible/4)%2===1) return;
    var x = Math.round(p.x), y = Math.round(p.y - cam);
    if (y < -32 || y > HEIGHT + 36) return;
    var moving = Math.abs(p.vx || 0) > .15 && p.grounded;
    var phase = Math.floor(frame / (p.running ? 4 : 7)) % 4;
    var stride = moving ? [0, 3, 0, -3][phase] : 0;
    var bob = moving && phase % 2 === 1 ? 1 : 0;
    var crouch = p.crouching && p.grounded;
    var airborne = !p.grounded;
    var outline = '#08141c', coat = '#344655', shine = '#80918c';
    ctx.save();ctx.translate(x,y);ctx.scale(p.facing === -1 ? -1 : 1,1);
    if (window.StairCharacter && window.StairCharacter.draw(ctx, p, frame)) {
      ctx.restore();
      return;
    }
    if (p.doubleJumpFlash > 0) {
      var burst = Math.max(0, 12 - Math.min(12, p.doubleJumpFlash));
      var spread = 5 + Math.floor(burst * .8);
      ctx.globalAlpha = Math.max(.15, Math.min(1, p.doubleJumpFlash / 8));
      // A short, wing-like fan marks the second jump without obscuring the feet.
      line(ctx,-3,2 + burst,-spread,-2 + burst,'#c9c7a0');
      line(ctx,3,2 + burst,spread,-2 + burst,'#c9c7a0');
      line(ctx,-4,4 + burst,-spread - 2,2 + burst,'#819487');
      line(ctx,4,4 + burst,spread + 2,2 + burst,'#819487');
      rect(ctx,-spread - 2,-3 + burst,1,2,'#f5e4b6');
      rect(ctx,spread + 2,-3 + burst,1,2,'#f5e4b6');
      rect(ctx,-1,5 + burst,2,1,'#e4dab0');
      ctx.globalAlpha = 1;
    }
    if (crouch) {
      line(ctx,-2,-7,-6,-2,outline,4);line(ctx,-6,-2,-3,-1,outline,3);
      line(ctx,2,-7,6,-3,outline,4);line(ctx,6,-3,6,0,outline,3);
      line(ctx,-2,-7,-6,-2,coat,2);line(ctx,2,-7,6,-3,coat,2);
      rect(ctx,-6,-1,5,1,shine);rect(ctx,4,0,5,1,shine);
    } else {
      var backKnee = airborne ? -5 : -1 + stride;
      var backFoot = airborne ? -8 : -2 + stride * 1.6;
      var frontKnee = airborne ? 3 : 2 - stride;
      var frontFoot = airborne ? 1 : 3 - stride * 1.6;
      line(ctx,-1,-10,backKnee,-5,outline,4);line(ctx,backKnee,-5,backFoot,-1,outline,3);
      line(ctx,2,-10,frontKnee,-5,outline,4);line(ctx,frontKnee,-5,frontFoot,-1,outline,3);
      line(ctx,-1,-10,backKnee,-5,'#263846',2);line(ctx,backKnee,-5,backFoot,-1,'#465766',1);
      line(ctx,2,-10,frontKnee,-5,coat,2);line(ctx,frontKnee,-5,frontFoot,-1,shine,1);
      rect(ctx,backFoot,-1,4,2,outline);rect(ctx,frontFoot,-1,4,2,outline);
      rect(ctx,frontFoot,0,4,1,'#b0b6a2');rect(ctx,backFoot,0,3,1,'#5b6d6d');
    }
    var shift = crouch ? 7 : bob;
    ctx.translate(0,shift);
    // Split copper coat tails flutter opposite the hunter's movement.
    var tail = airborne ? -8 : moving ? -7 - (phase % 2) : -5;
    poly(ctx,[[-4,-15],[-1,-14],[-3,-7],[tail,-2],[tail - 2,-3],[-6,-9]],outline);
    line(ctx,-4,-14,-5,-7,'#aa6848',3);line(ctx,-5,-7,tail,-3,'#9b583b',2);
    line(ctx,-5,-12,tail - 1,-3,'#d49c65');
    line(ctx,-2,-13,-2,-5,'#6d4035',2);
    // Back arm and shoulder.
    var armBack = -4 - stride;
    line(ctx,-3,-17,armBack,-12,outline,4);line(ctx,armBack,-12,-3,-10,outline,3);
    line(ctx,-3,-17,armBack,-12,'#42545e',2);rect(ctx,-4,-11,2,2,'#bcb39a');
    rect(ctx,-4,-18,7,9,outline);
    rect(ctx,-3,-17,5,7,coat);
    rect(ctx,-3,-17,5,1,'#6b7f82');
    rect(ctx,-2,-15,2,5,'#526775');
    rect(ctx,1,-16,2,6,'#273946');
    rect(ctx,-3,-10,7,2,'#101e25');rect(ctx,-2,-10,5,1,'#a6966a');rect(ctx,1,-10,1,2,'#e1ce93');
    // High collar, tan skin, swept hair, and a single bronze clasp.
    rect(ctx,-2,-20,6,3,outline);rect(ctx,-1,-19,3,2,'#995840');
    rect(ctx,-1,-24,5,5,outline);rect(ctx,0,-24,3,1,'#85908a');
    rect(ctx,-1,-23,5,2,'#302f32');rect(ctx,1,-22,3,3,'#c3bda5');
    rect(ctx,4,-22,1,2,'#d5ceb0');rect(ctx,3,-22,1,1,'#2c393c');
    rect(ctx,0,-22,1,2,'#4d4a43');rect(ctx,1,-19,2,1,'#8a8e7c');
    rect(ctx,-3,-19,2,1,'#d3ad74');

    var frontElbow = moving ? 4 + stride : 4;
    line(ctx,2,-17,frontElbow,-13,outline,4);line(ctx,frontElbow,-13,4,-10,outline,3);
    line(ctx,2,-17,frontElbow,-13,shine,2);line(ctx,frontElbow,-13,4,-10,coat,1);
    rect(ctx,3,-11,2,2,'#d4c9aa');
    ctx.restore();
  }

  function drawScene(ctx, game) {
    ctx.save();ctx.imageSmoothingEnabled=false;
    const displayScale=ctx.canvas.width/240;
    ctx.setTransform(displayScale,0,0,displayScale,0,0);ctx.globalAlpha=1;
    const cameraX=Math.max(0,Math.min(LEVEL.cameraMaxX,Math.round(game.cameraX||0)));
    const cam=Math.round(game.cameraY||0);
    ctx.fillStyle='#000000';ctx.fillRect(0,0,240,HEIGHT);
    ctx.save();ctx.translate(-cameraX,0);
    // Room 2:0 uses OBJ priority 2 over foreground BG priority 2 (OBJ wins
    // ties). Flying enemies remain visible over the masonry at screen edges.
    scenery(ctx,cam,false);
    const wall=game.breakables?.wall;
    if(wall?.broken) {
      // Reveal the original background beneath exactly one removed metatile.
      ctx.save();ctx.beginPath();ctx.rect(cameraX,0,240,HEIGHT);
      ctx.rect(wall.x,wall.y-cam,wall.width,wall.height);ctx.clip('evenodd');
      scenery(ctx,cam,true);ctx.restore();
    } else scenery(ctx,cam,true);
    if(window.StairBreakableRenderer)window.StairBreakableRenderer.drawWall(ctx,game,cam);
    if(window.StairFlames)window.StairFlames.draw(ctx,game,cam);
    if(window.StairBreakableRenderer)window.StairBreakableRenderer.drawObjects(ctx,game,cam);
    if(window.StairEnemyRenderer)window.StairEnemyRenderer.draw(ctx,game.enemies||[],cam,game.frame||0);
    if(window.StairEnemyEffects)for(const effect of game.effects||[]) {
      ctx.save();ctx.translate(Math.round(effect.x),Math.round(effect.y-cam));
      window.StairEnemyEffects.draw(ctx,effect);ctx.restore();
    }
    if(window.StairPlayerEffects)window.StairPlayerEffects.draw(ctx,game,cam);
    if(game.player)hunter(ctx,game.player,cam,game.frame||0);
    if(window.StairCostumeEffects)window.StairCostumeEffects.draw(ctx,game,cam);
    for(const p of game.particles||[]) {
      ctx.globalAlpha=Math.max(.12,Math.min(1,(p.life||0)/12));
      rect(ctx,p.x,p.y-cam,p.size||1,p.size||1,p.color||'#d6c99b');
    }
    ctx.globalAlpha=1;
    ctx.restore();
    if(window.StairEnemyName)window.StairEnemyName.draw(ctx,game);
    ctx.restore();
  }
  let softCanvas=null,softContext=null;
  function draw(ctx,game) {
    const style=window.StairCharacter?.getRenderStyle?.()||'detailed';
    ctx.save();ctx.globalCompositeOperation='source-over';
    if(style==='classic') {
      if(!softCanvas) {
        softCanvas=document.createElement('canvas');
        softCanvas.width=240;softCanvas.height=HEIGHT;
        softContext=softCanvas.getContext('2d',{alpha:false});
      }
      // One native scene pass keeps tiles, actors, effects and the HUD on the
      // same pixel grid. Filtering only the completed image avoids atlas bleed,
      // separate-layer seams, and differently softened overlapping sprites.
      drawScene(softContext,game);
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(softCanvas,0,0,ctx.canvas.width,ctx.canvas.height);
      // Retain the pixel structure while gently softening its edges. The
      // authored native character/enemy sets still supply the Classic poses.
      ctx.globalAlpha=.35;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
      ctx.drawImage(softCanvas,0,0,ctx.canvas.width,ctx.canvas.height);
    } else drawScene(ctx,game);
    ctx.restore();
  }
  window.StairRenderer={draw,drawScene};
})();
