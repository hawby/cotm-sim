(function (root) {
  'use strict';
  const LEVEL=root.StairLevel || (typeof require==='function' ? require('./level.js') : null);
  const PHYSICS = Object.freeze({
    // USA ROM table 0x080E03A0; pixel units are 16.16 fixed point.
    hz: 16777216 / 280896, walkSpeed: 1.0, runSpeed: 2.0,
    jumpSpeed: 6.0, doubleJumpSpeed: 4.75, gravity: 0.25,
    releaseGravity: 0.75, terminalSpeed: 8.0,
    doubleTapFrames: 15, ledgeGraceFrames: 6,
    bodyWidth: 8, bodyHeight: 30, airBodyHeight: 18, crouchBodyHeight: 14,
    flightRise: 128, cameraAnchor: 112
  });
  // Normal whip rows17/18/19. These are action durations, not damage windows.
  const ATTACK_TICKS=Object.freeze({standing:38,crouch:44,air:38});
  // Normal damage wrappers and physics table, decoded in research/combat/.
  const HIT=Object.freeze({flinchTicks:8,recoveryTicks:40,knockbackSpeed:2,
    knockbackRise:4,protectionTicks:60});
  function surface(platform, x) {
    if(platform.profile) return platform.profile[Math.max(0,Math.min(platform.profile.length-1,Math.floor(x)-platform.bounds[0]))]+platform.profileOffset;
    if (platform.id < 0) return platform.y;
    if (platform.side === 'left') return platform.y - Math.max(0, Math.min(32, (128 - x) / 2));
    return platform.y - Math.max(0, Math.min(32, (x - 128) / 2));
  }
  function bounds(platform) { return platform.bounds || (platform.id < 0 ? [32,224] : platform.side === 'left' ? [32,160] : [96,224]); }
  function bottom(platform) { return platform.bottom ?? platform.y+16; }
  // Equivalent to the ordinary movement branch of ROM routine 0x0806B104.
  // It detects each button's press edge, not a change in net direction. A fresh
  // opposite press can start a ground dash; any fresh press in air cancels it.
  function updateHorizontal(p, input, previous, c) {
    const pressed = (input.left && !previous.left) || (input.right && !previous.right);
    if (pressed) {
      p.running = p.grounded && p.tapTimer <= c.doubleTapFrames;
      p.tapTimer = 0;
    }
    p.tapTimer=(p.tapTimer+1)|0;
    const dir = input.right ? 1 : input.left ? -1 : 0;
    p.vx = dir * (p.running ? c.runSpeed : c.walkSpeed);
    if (dir) p.facing = dir;
    else p.running = false;
  }
  class Game {
    constructor(options = {}) {
      this.best = options.best || 0;
      this.physics = {...PHYSICS, ...(options.physics || {})};
      this.reset();
    }
    reset() {
      this.frame = 0; this.state = 'title'; this.seed = 1969;
      this.cameraY = -8; this.cameraX = 0; this.height = 0; this.flight = 0; this.maxFlight = 0; this.jumps = 0; this.elapsed = 0;
      this.platforms = []; this.enemies = []; this.effects = []; this.particles = []; this.floaters = []; this.whipHits = [];
      this.events = []; this.previous = {}; this.playerProtectionFrame=-1; this.breakables=null;
      this.player = {x:56,y:104,vx:0,vy:0,facing:1,grounded:true,running:false,crouching:false,attack:false,attackKind:null,attackAge:0,attackFacing:1,hurt:false,hurtPhase:null,hurtAge:0,hurtRow:43,invincible:0,jumpsUsed:0,platformId:0,tapTimer:100,airborneFrames:0,jumpReleased:false,doubleJumpFlash:0};
      this.generated = -1; this.ensurePlatforms();
    }
    start() { this.reset(); this.state = 'playing'; }
    ensurePlatforms() {
      const target = Math.max(8, Math.ceil((136 - this.cameraY + 180) / this.physics.flightRise));
      for (let id = this.generated + 1; id <= target; id++) {
        this.platforms.push(LEVEL.platform(id));
      }
      this.generated = Math.max(this.generated,target);
      // Keep a wide band below the camera so falls remain traversable. Recreate lower
      // flights when needed; memory stays bounded even after a very long ascent.
      const low = Math.max(0,Math.floor((136-this.cameraY-250)/this.physics.flightRise));
      this.platforms = this.platforms.filter(p=>p.id>=low && p.id<=target);
      const first = this.platforms.length ? this.platforms[0].id : target + 1;
      for(let id=first-1;id>=low;id--) this.platforms.unshift(LEVEL.platform(id));
      if(low===0) {
        const entrance=LEVEL.platform(-1),wall=this.breakables?.wall;
        if(wall?.broken) {
          // The cleared metatile exposes the next intact row as a flat floor.
          // Preserve the original entrance profile and extend only this recess.
          const floor=wall.y+wall.height-1;
          entrance.bounds=[entrance.bounds[0],wall.x+wall.width];
          entrance.profile=[...entrance.profile,...Array(wall.width).fill(floor-entrance.profileOffset)];
        }
        this.platforms.unshift(entrance);
      }
      this.generated = target;
    }
    emit(type,extra={}) { this.events.push({type,...extra}); }
    hitPlayer(attacker) {
      const p=this.player;
      if(this.state!=='playing'||p.hurt||p.invincible>0||this.playerProtectionFrame===this.frame)return false;
      const fromRight=attacker.x>p.x,front=(p.facing===1)===fromRight;
      // Enemy bodies use a light ground flinch. The original trident (0x27)
      // knocks back in every stance; airborne body contact also knocks back.
      const knockback=!p.grounded||attacker.type==='gargoyleShot';
      p.hurt=true;p.hurtAge=0;p.hurtPhase=knockback?'air':'flinch';
      p.hurtRow=knockback?43:(p.crouching?33:31)+(front?0:1);
      p.attack=false;p.attackKind=null;p.attackAge=0;p.running=false;p.doubleJumpFlash=0;
      if(knockback) {
        p.facing=fromRight?1:-1;p.vx=-p.facing*HIT.knockbackSpeed;p.vy=-HIT.knockbackRise;
        p.grounded=false;p.platformId=null;p.crouching=false;
        p.jumpsUsed=0;p.airborneFrames=0;p.jumpReleased=false;
      } else {p.vx=0;p.vy=0;}
      this.emit('hurt',{source:attacker.id,knockback});
      return true;
    }
    finishHit(input) {
      const p=this.player;
      p.hurt=false;p.hurtPhase=null;p.hurtAge=0;p.vx=0;
      p.crouching=p.grounded&&!!input.down;
      // The ROM installs60 then decrements in that same completion update.
      p.invincible=HIT.protectionTicks-1;
      this.emit('hurtEnd');
    }
    step(input={}) {
      this.events = [];
      if(this.state !== 'playing') return;
      const p=this.player, c=this.physics;
      this.frame++; this.elapsed++;
      p.doubleJumpFlash=Math.max(0,p.doubleJumpFlash-1);
      // Contacts are resolved after movement in this port. Retain the original
      // pre-decrement eligibility through that pass, including counter1→0.
      if(p.invincible>0)this.playerProtectionFrame=this.frame;
      p.invincible=Math.max(0,p.invincible-1);
      const oldX=p.x, oldY=p.y, wasGrounded=p.grounded, wasCrouching=p.crouching, wasAttacking=p.attack;
      const wasHurt=p.hurt;
      const oldPlatform=p.platformId;
      const attackWrapperKind=p.attackKind;
      const jumpPressed=!!input.jump&&!this.previous.jump;
      const attackPressed=!!input.attack&&!this.previous.attack;
      if(wasAttacking)p.attackAge++;
      p.crouching = wasHurt ? p.crouching : wasAttacking ? p.attackKind==='crouch' && p.grounded : !!input.down && p.grounded;
      let launched=false;
      const attack=kind=>{
        p.attack=true;p.attackKind=kind;p.attackAge=0;p.attackFacing=p.facing;
        p.crouching=kind==='crouch';
        if(kind!=='air')p.vx=0;
        this.emit('attack',{kind});
      };
      const jump = () => {
        const second=p.jumpsUsed===1;
        p.vy=-(second?c.doubleJumpSpeed:c.jumpSpeed);
        p.jumpsUsed=second?2:1; p.jumpReleased=false;
        p.grounded=false; p.platformId=null; p.crouching=false; launched=true;
        this.jumps++; this.emit(second?'doubleJump':'jump');
        if(second)p.doubleJumpFlash=12;
      };
      if (wasHurt) {
        p.hurtAge++;
        if(p.hurtPhase==='air')p.vy=Math.min(c.terminalSpeed,p.vy+c.gravity);
        else {p.vx=0;p.vy=0;}
      } else if (wasGrounded) {
        // Ground state wrappers check jump before horizontal input and skip that
        // handler on launch. Thus a second tap plus jump misses the dash window,
        // and this first jump frame retains the preceding horizontal velocity.
        if(wasAttacking) {p.vx=0;p.facing=p.attackFacing;}
        // Normal attack is checked before jump, movement, and newly pressed
        // down. A crouching actor can turn before selecting its low attack.
        else if(attackPressed) {
          if(wasCrouching && (input.left||input.right))p.facing=input.left?-1:1;
          attack(wasCrouching?'crouch':'standing');
        }
        else if (jumpPressed && !p.crouching) jump();
        else if (p.crouching) { p.vx=0; p.running=false;if(input.left||input.right)p.facing=input.left?-1:1; }
        else updateHorizontal(p,input,this.previous,c);
      } else {
        // Air wrapper 0x08062BF8: grace timer, release latch, gravity,
        // horizontal input, new jump, then movement/collision, in that order.
        p.airborneFrames++;
        if(p.airborneFrames>c.ledgeGraceFrames && p.jumpsUsed===0) p.jumpsUsed=1;
        if(!input.jump) p.jumpReleased=true;
        if(p.vy<0 && p.jumpReleased) p.vy+=c.releaseGravity;
        p.vy=Math.min(c.terminalSpeed,p.vy+c.gravity);
        updateHorizontal(p,input,this.previous,c);
        if(!wasAttacking && attackPressed)attack('air');
        else if(!wasAttacking && jumpPressed && p.jumpsUsed<2) jump();
      }
      const h=p.crouching?c.crouchBodyHeight:p.hurtPhase==='recover'?c.airBodyHeight:p.grounded?c.bodyHeight:c.airBodyHeight, half=c.bodyWidth/2;
      const recess=this.breakables?.wall;
      const fitsRecess=recess?.broken&&p.y-h>=recess.y&&p.y<=recess.y+recess.height-1;
      p.x = Math.max(36,Math.min(fitsRecess?recess.x+recess.width-half:220,p.x+p.vx));
      // Block vertical ends of masonry, while allowing the sloped top to carry feet.
      for(const plat of this.platforms) {
        if(plat.id<0 || (wasGrounded&&plat.id===oldPlatform)) continue;
        const [left,right]=bounds(plat), underside=bottom(plat);
        if(p.y-h>=underside-0.01) continue;
        if(p.vx>0 && oldX+half<=left+0.01 && p.x+half>left && p.y>surface(plat,left)+0.01) p.x=left-half;
        if(p.vx<0 && oldX-half>=right-0.01 && p.x-half<right && p.y>surface(plat,right)+0.01) p.x=right+half;
      }
      p.grounded=false;
      if(wasGrounded && !launched && p.vy===0) {
        const plat=this.platforms.find(v=>v.id===oldPlatform);
        if(plat) {
          const [l,r]=bounds(plat);
          if(p.x+half>l && p.x-half<r) { p.y=surface(plat,Math.max(l,Math.min(r,p.x))); p.grounded=true; }
        }
      }
      if(!p.grounded) {
        p.platformId=null;
        const proposedY=p.y+p.vy;
        if(p.vy<0) {
          let ceiling=-Infinity;
          if(recess?.broken&&p.x+half>recess.x&&p.y-h>=recess.y&&proposedY-h<recess.y)
            ceiling=recess.y;
          for(const plat of this.platforms) {
            const [l,r]=bounds(plat), underside=bottom(plat);
            if(plat.id>=0 && p.x+half>l+0.5 && p.x-half<r-0.5 && p.y-h>=underside-0.01 && proposedY-h<underside) ceiling=Math.max(ceiling,underside);
          }
          if(ceiling>-Infinity) {p.y=ceiling+h; p.vy=0; this.emit('head');}
          else p.y=proposedY;
        } else {
          let landing=null,landingY=Infinity;
          for(const plat of this.platforms) {
            const [l,r]=bounds(plat);
            // Support the same foot width used by side collision. Without this,
            // a descending toe could enter a lip before the center crossed it.
            if(p.x+half<=l || p.x-half>=r) continue;
            const top=surface(plat,Math.max(l,Math.min(r,p.x)));
            // Compare the old surface too: a descending slope may move under the foot.
            const oldTop=surface(plat,Math.max(l,Math.min(r,oldX)));
            if(oldY<=Math.max(top,oldTop)+0.1 && proposedY>=top && top<landingY) {landing=plat;landingY=top;}
          }
          if(landing) {
            p.y=landingY; p.vy=0; p.grounded=true; p.platformId=landing.id;
            p.jumpsUsed=0; p.airborneFrames=0; p.jumpReleased=false;
            this.flight=landing.id; this.maxFlight=Math.max(this.maxFlight,this.flight);
            this.emit('land',{hurtLanding:wasHurt,attackLanding:wasAttacking||p.attack});
          } else p.y=proposedY;
        }
      }
      // The air attack's landing helper changes artwork without restarting the
      // animation VM. A grounded attack that loses support likewise continues.
      if(p.attack) {
        if(p.grounded && p.attackKind==='air') {p.attackKind='standing';p.attackFacing=p.facing;p.vx=0;}
        else if(!p.grounded && p.attackKind==='standing') {p.attackKind='air';p.jumpsUsed=Math.max(1,p.jumpsUsed);}
        if(p.attackAge>=ATTACK_TICKS[p.attackKind]) {
          const kind=p.attackKind;p.attack=false;p.attackKind=null;
          p.crouching=p.grounded && kind==='crouch';
          this.emit('attackEnd',{kind,animation:attackWrapperKind==='air'?'fall':attackWrapperKind==='crouch'?'crouchHold':'idle'});
        }
      }
      if(wasHurt) {
        if(p.hurtPhase==='air'&&p.grounded) {
          p.vx=0;p.vy=0;p.hurtPhase='recover';p.hurtAge=0;
        } else if((p.hurtPhase==='flinch'&&p.hurtAge>=HIT.flinchTicks) ||
                  (p.hurtPhase==='recover'&&p.hurtAge>=HIT.recoveryTicks)) {
          this.finishHit(input);
        }
      }
      this.height=Math.max(0,Math.floor((104-p.y)/8));
      const oldBest=this.best; this.best=Math.max(this.best,this.height);
      if(this.best>oldBest) this.emit('record');
      // Follow in both directions: missing a jump costs altitude, never ends the run.
      this.cameraY=Math.min(LEVEL.cameraMaxY,p.y-c.cameraAnchor);
      this.cameraX=Math.max(0,Math.min(LEVEL.cameraMaxX,p.x-120));
      this.ensurePlatforms();
      for(const bit of this.particles) {bit.x+=bit.vx;bit.y+=bit.vy;bit.vy+=0.06;bit.life--;}
      this.particles=this.particles.filter(bit=>bit.life>0);
      this.previous={...input};
    }
    burst(x,y,n,color) {
      for(let i=0;i<n;i++)this.particles.push({x,y,vx:(i-(n-1)/2)*0.22,vy:-0.2-(i%3)*0.13,life:12+i%5,color});
    }
  }
  const exports={Game,PHYSICS,ATTACK_TICKS,HIT,surface,bounds,bottom,updateHorizontal};
  if(typeof module!=='undefined'&&module.exports) module.exports=exports;
  root.StairEngine=exports;
})(typeof window!=='undefined'?window:globalThis);
