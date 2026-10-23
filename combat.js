(function (root) {
  'use strict';

  // Normal-whip collision records from USA ROM 080DF598. The setter at
  // 08086D58 switches to a short overhead box, then the extended box, then
  // disables it. Ages are the same fixed simulation clock as animation.js.
  const ATTACKS=Object.freeze({
    standing:Object.freeze({start:13,extended:15,end:27,early:Object.freeze([20,6,26,-26]),reach:Object.freeze([32,3,35,-20])}),
    crouch:Object.freeze({start:19,extended:21,end:33,early:Object.freeze([20,6,26,-16]),reach:Object.freeze([30,3,33,-10])}),
    air:Object.freeze({start:13,extended:15,end:27,early:Object.freeze([20,6,26,-27]),reach:Object.freeze([32,3,35,-21])})
  });
  const DEATH_TICKS=Object.freeze({small:32,medium:36});
  const DEFENSE=Object.freeze({standing:Object.freeze([4,14,0,-14]),crouch:Object.freeze([4,7,0,-7]),air:Object.freeze([4,10,0,-14])});
  const ENEMY_BODY=Object.freeze({medusaHead:Object.freeze([6,5,0,0]),gargoyle:Object.freeze([3,14,0,0])});
  const lastSteps=new WeakMap();

  function box(x,y,record,facing=1) {
    const [halfWidth,halfHeight,offsetX,offsetY]=record;
    const centerX=x+offsetX*facing,centerY=y+offsetY;
    return {left:centerX-halfWidth,right:centerX+halfWidth,top:centerY-halfHeight,bottom:centerY+halfHeight};
  }
  function overlap(a,b) {
    return !!a&&!!b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  }
  function playerBox(game,pose) {
    const p=game.player;
    const installed=installedAttack(game);
    if(installed)return box(p.x,p.y,DEFENSE[installed.collisionKind]);
    // Keep the crouch defense box during lowering/rising artwork, matching the
    // original box setter; jump defense is distinct from terrain probes.
    const crouched=p.attackKind==='crouch'||p.crouching||[4,5,6,18].includes(pose?.romRow);
    return box(p.x,p.y,DEFENSE[crouched?'crouch':p.grounded?'standing':'air']);
  }
  function attackBox(game) {
    const p=game.player,attack=ATTACKS[p.attackKind],age=p.attackAge;
    if(!p.attack||p.hurt||!attack||!Number.isFinite(age)||age<attack.start||age>=attack.end)return null;
    const installed=installedAttack(game),shape=ATTACKS[installed?.collisionKind||p.attackKind];
    return box(p.x,p.y,age<attack.extended?shape.early:shape.reach,p.facing<0?-1:1);
  }
  function installedAttack(game) {
    const state=lastSteps.get(game),p=game.player;
    return p.attack&&state?.player===p&&state.frame===game.frame&&state.attackAge===p.attackAge&&state.attackKind===p.attackKind?state:null;
  }
  function collisionState(game,previous) {
    const p=game.player,kind=p.attackKind,attack=ATTACKS[kind],age=p.attackAge;
    const continuous=p.attack&&previous?.attacking&&previous.player===p&&age>=previous.attackAge&&age<=previous.attackAge+1;
    let collisionKind=continuous?previous.collisionKind:kind;
    if(p.attack&&attack) {
      // A landing/lost-support tick still executes the wrapper entered before
      // movement. Stream-pointer swaps do not replace the installed collision
      // record. Reinstall only while next-record gates 5/6/10 (6/7/11 low) are
      // current; the extended/off gate records each last three ticks.
      const wrapperKind=continuous?previous.attackKind:kind;
      if((age>=attack.start&&age<attack.extended)||
         (age>=attack.extended&&age<attack.extended+3)||
         (age>=attack.end&&age<attack.end+3))collisionKind=wrapperKind;
    }
    return {player:p,frame:game.frame,attacking:!!p.attack,attackAge:age,attackKind:kind,collisionKind};
  }
  function enemyBox(enemy) {
    const record=ENEMY_BODY[enemy?.type];
    if(!record||enemy.dead)return null;
    return box(enemy.x,enemy.y,record);
  }
  function enemyBoxes(enemy) {
    if(!enemy||enemy.dead)return [];
    const body=enemyBox(enemy);
    if(body)return [body];
    if(enemy.type!=='gargoyleShot'||enemy.kind!=='spear')return [];
    // Three 6x6 ROM probes follow the diagonal shaft. The raw offsets are
    // mirrored for rightward flight (08014668), unlike player-facing flags.
    const facing=enemy.facing<0?-1:1;
    return [[3,3,8,8],[3,3,0,0],[3,3,-8,-8]].map(record=>box(enemy.x,enemy.y,record,facing));
  }
  function reset(game) {
    lastSteps.delete(game);
    game.effects=[];
  }
  function step(game,pose) {
    const result={kills:0,playerHit:false};
    if(game.state!=='playing')return result;
    const previous=lastSteps.get(game);
    if(previous?.player===game.player&&previous.frame===game.frame)return result;
    lastSteps.set(game,collisionState(game,previous));
    if(!Array.isArray(game.effects))game.effects=[];

    // Advance existing flames first: a newly killed enemy starts at age 0 and
    // receives every source animation frame before its effect is removed.
    game.effects=game.effects.filter(effect=>{
      if(effect.type!=='enemyDeath')return true;
      effect.age++;
      return effect.age<DEATH_TICKS[effect.kind];
    });
    const strike=attackBox(game),enemies=game.enemies||[];
    if(strike)for(const enemy of enemies) {
      if(!overlap(strike,enemyBox(enemy)))continue;
      enemy.dead=true;
      const small=enemy.type==='medusaHead';
      const effect={type:'enemyDeath',kind:small?'small':'medium',x:enemy.x,y:enemy.y+(small?5:16),age:0};
      game.effects.push(effect);
      if(typeof game.emit==='function')game.emit('enemyDeath',{enemyId:enemy.id,enemyType:enemy.type,x:effect.x,y:effect.y});
      result.kills++;
    }

    // Resolve the strike before contact. A foe killed on this tick cannot hit
    // back, and multiple overlaps produce at most one accepted player reaction.
    const p=game.player;
    if(p.hurt||p.invincible||typeof game.hitPlayer!=='function')return result;
    const defense=playerBox(game,pose);
    for(const enemy of enemies) {
      if(!enemyBoxes(enemy).some(candidate=>overlap(defense,candidate)))continue;
      if(game.hitPlayer(enemy)!==true)continue;
      if(enemy.type==='gargoyleShot')enemy.dead=true;
      result.playerHit=true;
      break;
    }
    return result;
  }

  const api={step,reset,attackBox,playerBox,enemyBox,enemyBoxes,overlap,ATTACKS,DEFENSE,ENEMY_BODY,DEATH_TICKS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairCombat=api;
})(typeof window!=='undefined'?window:globalThis);
