(function (root) {
  'use strict';
  const Combat=root.StairCombat || (typeof require==='function' ? require('./combat.js') : null);
  const Engine=root.StairEngine || (typeof require==='function' ? require('./engine.js') : null);
  const GRAVITY=0x16c1/65536;
  const WALL=Object.freeze({x:224,y:201,width:32,height:32});
  const ITEM=Object.freeze({id:43,name:'Spiced Meat',life:600,gravity:GRAVITY,initialVy:2});
  // Native records at 08454780..0845482C. Rocks retain their final frame;
  // dust disappears when the original finite animation finishes.
  const SEQUENCES=Object.freeze({
    dust5:Object.freeze([[105,3],[106,3],[107,3],[109,4],[113,3],[117,3]]),
    dust6:Object.freeze([[105,3],[106,3],[107,4],[121,4],[123,3]]),
    rock0:Object.freeze([[136,3],[137,4],[138,5],[139,6],[140,7],[141,7],[139,7],[140,7],[139,7],[141,7]]),
    rock1:Object.freeze([[138,3],[139,4],[140,4],[142,5],[143,6],[144,5],[142,5],[143,6],[144,5],[142,5],[143,6],[144,5]])
  });
  function reset(game) {
    game.breakables={player:game.player,lastFrame:-1,
      wall:{...WALL,broken:false,breakFrame:null,burstAge:0},item:null,effects:[],collected:0,
      seed:((game.seed??1969)^0x6b8b4567)>>>0};
    return game.breakables;
  }
  function randomInt(state,range) {
    // Independent seeded stream: debris cannot change enemy encounters.
    state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;
    return Math.floor(state.seed/0x100000000*range);
  }
  function inRange(game,x,y) {
    const dx=x-(game.cameraX||0),dy=y-(game.cameraY||0);
    return dx>=-65&&dx<=305&&dy>=-65&&dy<=289;
  }
  function sprite(kind,age) {
    const sequence=SEQUENCES[kind];
    let end=0;
    for(const [id,ticks] of sequence) {end+=ticks;if(age<end)return id;}
    return kind.startsWith('rock')?sequence[sequence.length-1][0]:null;
  }
  function advanceEffects(game,state) {
    state.effects=state.effects.filter(effect=>{
      // Original ordinary rock mode culls before movement; it has no floor
      // collision and keeps falling after its final animation record.
      if(effect.kind.startsWith('rock')&&!inRange(game,effect.x,effect.y))return false;
      effect.age++;
      effect.x+=effect.vx;effect.y+=effect.vy;
      if(effect.kind.startsWith('rock'))effect.vy+=GRAVITY;
      effect.spriteId=sprite(effect.kind,effect.age);
      return effect.spriteId!==null;
    });
  }
  function emit(game,type,extra) {
    if(typeof game.emit==='function')game.emit(type,extra);
    else {if(!Array.isArray(game.events))game.events=[];game.events.push({type,...extra});}
  }
  function wallBox(wall) {
    return {left:wall.x+4,right:wall.x+28,top:wall.y+4,bottom:wall.y+28};
  }
  function itemBox(item) {
    return {left:item.x-6,right:item.x+6,top:item.y-14,bottom:item.y-2};
  }
  function contact(a,b) {
    if(!a||!b)return false;
    // 08016324 prepares integer actor origins before applying the collider's
    // integer offsets. At these visible base contacts the common integer
    // camera translation cancels, leaving floor(world origin). Preserve the
    // original strict integer overlap without changing general enemy combat.
    const pixels=box=>({left:Math.floor(box.left),right:Math.floor(box.right),
      top:Math.floor(box.top),bottom:Math.floor(box.bottom)});
    return Combat.overlap(pixels(a),pixels(b));
  }
  function floorBelow(game,state,item) {
    let floor=Infinity;
    // The base wall's floor remains even when camera-based platform caching
    // removes the entrance from game.platforms during an ascent.
    if(state.wall.broken&&item.x>=state.wall.x&&item.x<state.wall.x+state.wall.width) {
      const y=state.wall.y+state.wall.height-0.5;
      if(y>=item.y-0.5)floor=y;
    }
    for(const platform of game.platforms||[]) {
      const [left,right]=Engine.bounds(platform);
      if(item.x<left||item.x>=right)continue;
      const y=Engine.surface(platform,item.x)+0.5;
      if(y>=item.y-0.5&&y<floor)floor=y;
    }
    return floor;
  }
  function advanceItem(game,state,pose) {
    const item=state.item;
    if(!item)return false;
    const active=inRange(game,item.x,item.y);
    // Collection uses the player's body, never the whip. It is checked before
    // movement and before expiration; there is no artificial pickup delay.
    if(active&&contact(Combat.playerBox(game,pose),itemBox(item))) {
      state.collected=Math.min(99,state.collected+1);
      state.item=null;
      emit(game,'itemPickup',{id:ITEM.id,itemId:ITEM.id,name:ITEM.name,category:1,soundId:0x77,x:item.x,y:item.y});
      return true;
    }
    item.age++;item.remaining--;
    if(item.remaining<0) {state.item=null;return false;}
    item.visible=active&&(item.remaining>=120||(game.frame&1)===0);
    const floor=floorBelow(game,state,item),nextY=item.y+item.vy;
    if(item.vy>=0&&nextY>=floor) {
      item.y=floor;item.vy=0;item.grounded=true;
    } else {
      item.y=nextY;item.vy+=GRAVITY;item.grounded=false;
    }
    return false;
  }
  function burst(state,frame) {
    const wall=state.wall;
    const x=wall.x+16+(randomInt(state,0x180000)-0xc0000)/65536;
    const y=wall.y+16+(randomInt(state,0x180000)-0xc0000)/65536;
    // The ROM consumes the velocity draw on both dust and rock updates.
    const vy=0.5-randomInt(state,0x20000)/65536;
    const rock=(frame&1)!==0,variant=Math.floor(frame/2)%2;
    const kind=rock?'rock'+variant:'dust'+(5+variant);
    state.effects.push({kind,x,y,vx:rock?(frame%5-2)*0.5:0,vy:rock?vy:0,
      age:0,spriteId:sprite(kind,0)});
    wall.burstAge++;
  }
  function step(game,pose) {
    const result={wallBroken:false,itemCollected:false};
    if(!game.breakables||game.breakables.player!==game.player)reset(game);
    const state=game.breakables;
    if(game.state!=='playing'||state.lastFrame===game.frame)return result;
    state.lastFrame=game.frame;
    advanceEffects(game,state);
    result.itemCollected=advanceItem(game,state,pose);
    const wall=state.wall;
    if(!wall.broken&&inRange(game,wall.x,wall.y)&&contact(Combat.attackBox(game),wallBox(wall))) {
      wall.broken=true;wall.breakFrame=game.frame;
      // This is the requested custom wall reward, created through the original
      // generic item's position/velocity convention rather than a launch arc.
      state.item={itemId:ITEM.id,x:wall.x+16,y:wall.y+16,vx:0,vy:ITEM.initialVy,
        age:0,remaining:ITEM.life,visible:true,grounded:false};
      emit(game,'wallBreak',{id:'base-right',soundId:0x70,x:wall.x+16,y:wall.y+16});
      if(typeof game.ensurePlatforms==='function')game.ensurePlatforms();
      result.wallBroken=true;
    }
    if(wall.broken&&wall.burstAge<11)burst(state,game.frame);
    return result;
  }
  function snapshot(game) {
    const state=game.breakables;
    if(!state||state.player!==game.player)return null;
    return {wall:{...state.wall},item:state.item?{...state.item}:null,
      effects:state.effects.map(effect=>({...effect})),collected:state.collected};
  }
  const api={reset,step,snapshot,wallBox,itemBox,SEQUENCES,ITEM,WALL};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairBreakables=api;
})(typeof window!=='undefined'?window:globalThis);
