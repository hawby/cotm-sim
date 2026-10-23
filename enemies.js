(function (root) {
  'use strict';
  const Medusa=typeof module!=='undefined' && module.exports ? require('./enemies/medusa-head.js') : root.StairMedusa;
  const Gargoyle=typeof module!=='undefined' && module.exports ? require('./enemies/gargoyle.js') : root.StairGargoyle;
  const LIMITS=Object.freeze({gargoyles:2,projectiles:12,entities:20});
  const SPAWNING=Object.freeze({
    gargoyleDelay:60,gargoyleAnchorX:128,gargoyleBottomAnchorY:40,gargoyleAnchorSpacing:128,
    gargoyleActivationX:120,gargoyleActivationY:80,
    gargoyleLeftX:-23.5,gargoyleRightX:264.5,
    gargoyleTopY:32.5,gargoyleHeightRange:96,
    enemyCullLeft:65,enemyCullRight:305,enemyCullTop:65,enemyCullBottom:289,
    horizontalCullMargin:96
  });
  const targetOffset=(player,pose)=>pose ? ([4,5,6,18,33,34].includes(pose.romRow) ? -7 : -14) : player.crouching ? -7 : -14;

  class World {
    constructor(options={}) { this.initialSeed=(options.seed??1969)>>>0;this.reset(); }
    reset() {
      this.entities=[];this.nextId=1;
      this.seed=this.initialSeed;this.lastFrame=-1;this.medusaTimer=this.nextMedusaDelay();
      // A separate stream leaves Medusa encounter randomness unchanged.
      this.gargoyleSeed=(this.initialSeed^0x9e3779b9)>>>0;
      this.gargoyleSpawners=new Map();
    }
    random() {
      // Reproducible encounters for this new endless layout; no shared player RNG.
      this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      return this.seed/0x100000000;
    }
    nextMedusaDelay() {
      return Medusa.CONSTANTS.spawnDelayMin+Math.floor(this.random()*Medusa.CONSTANTS.spawnDelayRange);
    }
    randomGargoyle() {
      this.gargoyleSeed=(Math.imul(this.gargoyleSeed,1664525)+1013904223)>>>0;
      return this.gargoyleSeed/0x100000000;
    }
    spawnMedusa(game,playerPose) {
      // Original spawners select the side nearest their authored anchor (random
      // within 24px). This endless room uses one anchor at the stairway center.
      const anchorX=128,p=game.player,cameraX=game.cameraX||0;
      const fromLeft=Math.abs(p.x-anchorX)<24 ? this.random()<.5 : anchorX<p.x;
      const x=Math.trunc(cameraX+(fromLeft ? -15.5 : 256.5));
      const y=Math.trunc(p.y+targetOffset(p,playerPose)+(Math.floor(this.random()*0x140001)-0xA0000)/65536);
      this.entities.push(Medusa.create({id:'medusa-'+this.nextId++,x,y,facing:fromLeft ? 1 : -1}));
    }
    spawnGargoyle(game) {
      // Original stairway generator 080494B8: screen-relative entry and height,
      // from the opposite side when the player is outside the middle third.
      const cameraX=game.cameraX||0,screenX=game.player.x-Math.floor(cameraX+.5);
      const fromLeft=screenX>160 || (screenX>=80 && this.randomGargoyle()>=.5);
      const x=cameraX+(fromLeft ? SPAWNING.gargoyleLeftX : SPAWNING.gargoyleRightX);
      const y=(game.cameraY||0)+SPAWNING.gargoyleTopY+Math.floor(this.randomGargoyle()*SPAWNING.gargoyleHeightRange);
      this.entities.push(Gargoyle.create({id:'gargoyle-'+this.nextId++,x,y,
        facing:fromLeft ? 1 : -1,airborne:true}));
    }
    stepGargoyleSpawners(game,playerPose) {
      // Authored anchors repeat every stair flight. Extend them upward with the
      // endless terrain; retain only eligible timers (outside resets to 1).
      const p=game.player,active=new Map();
      if(Math.abs(p.x-SPAWNING.gargoyleAnchorX)<=SPAWNING.gargoyleActivationX) {
        const centerY=p.y+targetOffset(p,playerPose);
        const first=Math.max(0,Math.ceil((SPAWNING.gargoyleBottomAnchorY-centerY-SPAWNING.gargoyleActivationY)/SPAWNING.gargoyleAnchorSpacing));
        const last=Math.floor((SPAWNING.gargoyleBottomAnchorY-centerY+SPAWNING.gargoyleActivationY)/SPAWNING.gargoyleAnchorSpacing);
        let count=this.entities.filter(e=>e.type==='gargoyle').length;
        // Preserve the original room object's top-to-bottom update order.
        for(let index=last;index>=first;index--) {
          let timer=this.gargoyleSpawners.get(index)??1;
          if(count<LIMITS.gargoyles && --timer===0) {
            this.spawnGargoyle(game);count++;timer=SPAWNING.gargoyleDelay;
          }
          active.set(index,timer);
        }
      }
      this.gargoyleSpawners=active;
    }
    step(game,playerPose) {
      if (game.state!=='playing' || game.frame===this.lastFrame) return this.entities;
      this.lastFrame=game.frame;
      const cam=game.cameraY,cameraX=game.cameraX||0;
      // Both original enemy wrappers cull before moving. Release their
      // population slots before updating this port's room generators.
      this.entities=this.entities.filter(e=>{
        if(e.dead)return false;
        if(e.type==='medusaHead'||e.type==='gargoyle')
          return e.x>=cameraX-SPAWNING.enemyCullLeft && e.x<=cameraX+SPAWNING.enemyCullRight &&
            e.y>=cam-SPAWNING.enemyCullTop && e.y<=cam+SPAWNING.enemyCullBottom;
        return e.x>=cameraX-SPAWNING.horizontalCullMargin && e.x<=cameraX+240+SPAWNING.horizontalCullMargin && e.y>=cam-112 && e.y<=cam+256;
      });
      const p=game.player;
      // AI sees a snapshot, never the mutable player. The separate combat pass
      // resolves whip strikes and contact after these movement updates.
      const targetOffsetY=targetOffset(p,playerPose);
      const context={player:Object.freeze({x:p.x,y:p.y,grounded:p.grounded,crouching:p.crouching,targetOffsetY}),
        bounds:{left:32,right:224}};
      const projectiles=[];
      for (const enemy of this.entities) {
        if (enemy.type==='medusaHead') Medusa.step(enemy,context);
        else if (enemy.type==='gargoyle') {
          const spawned=Gargoyle.step(enemy,context)||[];
          for (const shot of spawned) projectiles.push({...shot,id:'spear-'+this.nextId++});
        } else if (enemy.type==='gargoyleShot') {
          enemy.x+=enemy.vx;enemy.y+=enemy.vy;enemy.age++;
        }
      }
      const shotCount=this.entities.filter(e=>e.type==='gargoyleShot').length;
      this.entities.push(...projectiles.slice(0,Math.max(0,LIMITS.projectiles-shotCount)));
      if (--this.medusaTimer<=0) {
        if (this.entities.filter(e=>e.type==='medusaHead').length<Medusa.CONSTANTS.spawnLimit) this.spawnMedusa(game,playerPose);
        this.medusaTimer=this.nextMedusaDelay();
      }
      this.stepGargoyleSpawners(game,playerPose);
      return this.entities;
    }
  }
  const api={World,LIMITS,SPAWNING};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.StairEnemies=api;
})(typeof window!=='undefined' ? window : globalThis);
