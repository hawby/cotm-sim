(function (root) {
  'use strict';
  // USA ROM table 0x080DEA88. Durations are animation updates at GBA refresh,
  // not milliseconds. See research/animation/ for the original VM verification.
  const SEQUENCES = {
    idle:        {row:0,  ids:[0,1],           ticks:[30,30],                loop:true,  sheet:'idle', atlasRow:0, columns:[0,1], prefix:'idle', poses:[1,2]},
    settledIdle: {row:1,  ids:[0,1],           ticks:[69,485],               loop:true,  sheet:'idle', atlasRow:0, columns:[2,3], prefix:'idle', poses:[3,4]},
    crouchEnter: {row:4,  ids:[0,1,2],         ticks:[3,4,12],               loop:false, sheet:'combat', cells:[20,21,22], prefix:'crouch', poses:[1,2,3], crouch:true},
    crouchHold:  {row:5,  ids:[0],             ticks:[4095],                 loop:true,  sheet:'combat', cells:[23], prefix:'crouch', poses:[4], crouch:true},
    crouchExit:  {row:6,  ids:[0,1,2],         ticks:[3,4,4],                loop:false, sheet:'combat', cells:[22,21,20], prefix:'crouch', poses:[3,2,1]},
    walk:        {row:7,  ids:[0,1,0,2],       ticks:[12,12,12,12],          loop:true,  atlasRow:1, columns:[0,1,2,3], prefix:'walk', poses:[1,2,3,4]},
    dash:        {row:8,  ids:[0,1,2,3],       ticks:[9,9,9,9],              loop:true,  atlasRow:3, columns:[0,1,2,3], prefix:'dash', poses:[1,2,3,4]},
    dashStop:    {row:9,  ids:[0,1,2,3,4,5],   ticks:[9,8,7,7,8,6],          loop:false, atlasRow:4, columns:[0,1,2,3,4,5], prefix:'dash-stop', poses:[1,2,3,4,5,6]},
    jump:        {row:10, ids:[0,1,2,3,4],     ticks:[7,7,7,7,4095],         loop:false, atlasRow:2, columns:[0,1,2,3,4], prefix:'jump', poses:[1,2,3,4,5]},
    // Missing double-jump variations use the closest available jump art.
    // The last three original poses match jump 3/4/5; jump 4 sits one pixel up.
    doubleJump:  {row:12, ids:[0,1,2,3,4,5,6], ticks:[2,4,3,7,7,7,4095],     loop:false, atlasRow:2, columns:[1,0,0,1,2,3,4], prefix:'jump', poses:[2,1,1,2,3,4,5], offsets:[0,0,0,0,0,-1,0], outlines:['#bdbdce','#ffffff','#bdbdce']},
    fall:        {row:16, ids:[0],            ticks:[4095],                 loop:false, atlasRow:2, columns:[4], prefix:'jump', poses:[5]},
    // The supplied hit art has one recoil pose. The simulation ends the hurt
    // state; the original long pose hold is never used as a stun duration.
    hit:         {row:43, ids:[0],            ticks:[4095],                 loop:false, sheet:'combat', cells:[55], prefix:'hit', poses:[1]},
    whipStanding:{row:17, ids:[0,2,5,8,35,11,15,11,15,19,23], ticks:[4,3,3,3,2,3,3,3,3,3,8], loop:false,
      sheet:'combat', cells:[24,25,26,27,28,29,30,29,30,31,32], prefix:'whip-standing', poses:[1,2,3,4,5,6,7,6,7,8,9]},
    whipCrouch:  {row:18, ids:[0,1,3,5,7,8,10,13,10,13,16,19], ticks:[6,4,3,3,3,2,3,3,3,3,3,8], loop:false,
      sheet:'combat', cells:[33,34,35,36,37,38,39,40,39,40,41,42], prefix:'whip-crouch', poses:[1,2,3,4,5,6,7,8,7,8,9,10], crouch:true},
    whipAir:     {row:19, ids:[24,26,29,32,38,41,45,41,45,49,53], ticks:[4,3,3,3,2,3,3,3,3,3,8], loop:false,
      sheet:'combat', cells:[43,44,45,46,47,48,49,48,49,50,51], prefix:'whip-jump', poses:[1,2,3,4,5,6,7,6,7,8,9]}
  };

  class Stream {
    constructor(name) {
      if (!SEQUENCES[name]) throw new Error('Unknown animation: ' + name);
      this.name=name; this.index=0; this.remaining=1; this.active=true;
      this.age=-1; this.started=false;this.displayName=name;
    }
    advance() {
      if (!this.active) return;
      this.age++;
      if (--this.remaining > 0) return;
      const sequence=SEQUENCES[this.name];
      if (!this.started) this.started=true;
      else if (this.index + 1 < sequence.ticks.length) this.index++;
      else if (sequence.loop) this.index=0;
      else { this.active=false; return; }
      this.remaining=sequence.ticks[this.index];
      this.displayName=this.name;
    }
  }

  class Controller {
    constructor(player) {
      this.stream=new Stream('idle'); this.mode='idle';
      this.runTicks=0; this.idleTicks=0;
      this.previous={grounded:player.grounded}; this.previousInput={};
    }
    select(name, mode, restart=false) {
      if (restart || this.stream.name !== name) this.stream=new Stream(name);
      this.mode=mode;
      if (name==='idle') this.idleTicks=0;
    }
    reactToHit(player) {
      if(!player.hurt)return;
      this.select('hit','hurt',true);this.hurtRow=player.hurtRow;
      this.stream.advance();
    }
    tick(player, events=[], input={}) {
      this.movementEffect=null;
      const wasGrounded=this.previous.grounded;
      const jumped=events.some(event=>event.type==='jump');
      const doubled=events.some(event=>event.type==='doubleJump');
      const landed=events.some(event=>event.type==='land');
      const pressed=(input.left && !this.previousInput.left) || (input.right && !this.previousInput.right);
      const moving=Math.abs(player.vx)>0;
      let updates=1;

      if(player.hurt) {
        if(this.mode!=='hurt')this.reactToHit(player);
        else this.stream.advance();
        this.hurtRow=player.hurtRow;
        this.previous={grounded:player.grounded};this.previousInput={...input};
        return this.snapshot();
      }
      if(this.mode==='hurt') {
        const name=player.grounded?(player.crouching?'crouchHold':'idle'):'fall';
        this.select(name,player.grounded?(player.crouching?'crouch':'idle'):'air',true);
        this.stream.advance();
        this.previous={grounded:player.grounded};this.previousInput={...input};
        return this.snapshot();
      }

      // Action age belongs to the simulation so movement locks and the visible
      // attack cannot drift apart. Landing swaps standing/air artwork while
      // preserving the original 38-tick stream position (ROM 0x08086240).
      if(player.attack) {
        if(this.mode==='dash' && wasGrounded)this.runTicks++;
        const name=player.attackKind==='crouch'?'whipCrouch':player.attackKind==='air'?'whipAir':'whipStanding';
        const age=Math.max(0,player.attackAge|0);
        if(this.stream.name!==name && this.mode==='attack' &&
          ['whipStanding','whipAir'].includes(this.stream.name) && ['whipStanding','whipAir'].includes(name) && this.stream.age<=age) {
          // The ROM swaps the stream pointer, not the currently displayed
          // sprite. A landing mid-record keeps its air pose until the next
          // record loads from the standing stream.
          this.stream.name=name;
        } else if(this.stream.name!==name || this.stream.age>age)this.select(name,'attack',true);
        this.mode='attack';
        while(this.stream.age<age&&this.stream.active)this.stream.advance();
        this.previous={grounded:player.grounded};this.previousInput={...input};
        return this.snapshot();
      }
      if(this.mode==='attack') {
        const ended=events.find(event=>event.type==='attackEnd');
        const name=ended?.animation || (player.grounded?(player.crouching?'crouchHold':'idle'):'fall');
        this.select(name,name==='fall'?'air':name==='crouchHold'?'crouch':'idle',true);
        this.stream.advance();
        this.previous={grounded:player.grounded};this.previousInput={...input};
        return this.snapshot();
      }

      // The run wrapper increments before its jump/input checks. Air time pauses
      // this counter; a running landing preserves it. Re-triggering resets only
      // the counter, not the already-playing dash animation.
      if (this.mode==='dash' && wasGrounded) this.runTicks++;
      if (wasGrounded && player.running && pressed && !jumped && !doubled) this.runTicks=0;
      if (this.mode==='idle' && ++this.idleTicks===300 && this.stream.name==='idle') this.select('settledIdle','idle');

      // Ground helpers create their dust before movement/collision can select
      // a falling pose. Keep that event even when a dash steps off a ledge.
      if(wasGrounded&&!jumped&&!doubled&&!landed&&!player.crouching) {
        if((this.mode==='idle'||this.mode==='walk')&&moving&&player.running)this.movementEffect=3;
        else if(this.mode==='dash'&&(!player.running||!moving)&&this.runTicks>31)this.movementEffect=4;
      }

      if (landed) {
        if (player.running) this.select('dash','dash',true);
        else if (input.down) { this.select('crouchHold','crouch',true); updates=2; }
        else { this.select('idle','idle',true); updates=2; }
      } else if (doubled) this.select('doubleJump','air',true);
      else if (jumped) this.select('jump','air',true);
      else if (!player.grounded) {
        if (wasGrounded || this.mode!=='air') this.select('fall','air',true);
        // No apex/falling switch: the selected ROM stream keeps playing.
      } else if (player.crouching) {
        if (this.mode!=='crouch') this.select('crouchEnter','crouch',true);
      } else if (this.mode==='crouch') this.select('crouchExit','idle',true);
      else if (this.mode==='dash' && (!player.running || !moving)) {
        this.select(this.runTicks>31 ? 'dashStop' : 'idle','idle',true);
      } else if (moving) {
        const name=player.running ? 'dash' : 'walk';
        if (this.mode!==name) this.select(name,name,true);
      } else if (this.mode==='walk' || this.mode==='air') this.select('idle','idle',true);

      for (let i=0;i<updates;i++) this.stream.advance();
      if (!this.stream.active) {
        if (this.stream.name==='dashStop' || this.stream.name==='crouchExit') {
          this.select('idle','idle',true); this.stream.advance();
        } else if (this.stream.name==='crouchEnter') {
          this.select('crouchHold','crouch',true); this.stream.advance();
        }
      }
      this.previous={grounded:player.grounded}; this.previousInput={...input};
      return this.snapshot();
    }
    snapshot() {
      const stream=this.stream, sequence=SEQUENCES[stream.displayName];
      const cell=sequence.cells?.[stream.index];
      return {
        name:stream.name, displayName:stream.displayName, romRow:this.mode==='hurt'?this.hurtRow:SEQUENCES[stream.name].row, index:stream.index,
        spriteId:sequence.ids[stream.index], atlasRow:cell===undefined?sequence.atlasRow:Math.floor(cell/8),
        column:cell===undefined?sequence.columns[stream.index]:cell%8, offsetY:sequence.offsets?.[stream.index] || 0,
        sheet:sequence.sheet||'movement',
        frameId:sequence.prefix?sequence.prefix+'-'+String(sequence.poses[stream.index]).padStart(2,'0'):null,
        outlineColor:sequence.outlines?.[stream.index] || null,
        crouching:!!sequence.crouch, age:stream.age, remaining:stream.remaining,
        active:stream.active, runTicks:this.runTicks, movementEffect:this.movementEffect||null
      };
    }
  }
  const api={Stream,Controller,SEQUENCES};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.StairAnimation=api;
})(typeof window!=='undefined' ? window : globalThis);
