(function(root){
  'use strict';
  // Encoded local clips avoid fetch/file-origin restrictions. The browser only
  // decodes audio extracted ahead of time; it never loads the ROM or emulator.
  class Player {
    constructor(assets={},options={}) {
      this.assets=assets;this.options=options;this.context=null;this.loading=null;
      this.buffers=new Map();this.errors=[];this.voices=new Set();this.groups=new Map();
      this.enabled=false;this.state='title';this.ready=false;
      this.music=null;this.musicOffset=0;this.musicStartedAt=0;this.lastFrame=-1;this.previous=null;
    }
    unlock() {
      if(!this.context) {
        const Context=this.options.AudioContext||root.AudioContext||root.webkitAudioContext;
        if(!Context)return Promise.resolve(false);
        try {
          this.context=new Context();this.gain=this.context.createGain();
          this.gain.gain.value=this.enabled?0.65:0;this.gain.connect(this.context.destination);
          const decode=this.options.decodeBase64||((text)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0)));
          this.loading=Promise.all(Object.entries(this.assets.clips||{}).map(async([id,clip])=>{
            try {
              const bytes=decode(clip.data);
              const buffer=await this.context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
              this.buffers.set(id,buffer);
            } catch(error) {this.errors.push({id,message:String(error.message||error)});}
          })).then(()=>{this.ready=true;this.syncMusic();return true;});
        } catch(error) {this.errors.push({id:'context',message:String(error.message||error)});return Promise.resolve(false);}
      }
      // This is called directly by Begin/Sound/touch user gestures. A rejected
      // autoplay resume must not become an unhandled promise or queue old cues.
      try {
        const resumed=this.context.resume();
        if(resumed?.then)resumed.then(()=>this.syncMusic()).catch(error=>this.errors.push({id:'resume',message:String(error.message||error)}));
      } catch(error) {this.errors.push({id:'resume',message:String(error.message||error)});}
      return this.loading||Promise.resolve(false);
    }
    setEnabled(enabled) {
      this.enabled=!!enabled;
      if(this.gain)this.gain.gain.value=this.enabled?0.65:0;
      if(!this.enabled){this.stopMusic(true);this.stopVoices();}
      this.syncMusic();
    }
    setState(state) {
      this.state=state;
      if(state!=='playing'){this.stopMusic(true);this.stopVoices(state!=='paused');}
      this.syncMusic();
    }
    reset() {
      this.stopMusic(false);this.stopVoices();this.musicOffset=0;this.lastFrame=-1;this.previous=null;
      this.syncMusic();
    }
    normalizeOffset(seconds) {
      const meta=this.assets.music;
      if(!meta)return 0;
      const end=meta.loopEnd,start=meta.loopStart||0;
      return end>start&&seconds>=end?start+(seconds-start)%(end-start):Math.max(0,seconds);
    }
    stopMusic(retainPosition) {
      if(!this.music)return;
      if(retainPosition)this.musicOffset=this.normalizeOffset(this.musicOffset+this.context.currentTime-this.musicStartedAt);
      const source=this.music;this.music=null;source.onended=null;
      try{source.stop();}catch{}source.disconnect();
    }
    syncMusic() {
      if(this.music||!this.enabled||this.state!=='playing'||!this.ready||!this.context||this.context.state!=='running')return;
      const meta=this.assets.music,buffer=meta&&this.buffers.get(meta.clip);
      if(!buffer)return;
      const source=this.context.createBufferSource();source.buffer=buffer;
      source.loop=true;source.loopStart=meta.loopStart||0;source.loopEnd=meta.loopEnd||buffer.duration;
      source.connect(this.gain);this.musicOffset=this.normalizeOffset(this.musicOffset);
      this.musicStartedAt=this.context.currentTime;this.music=source;
      source.start(0,this.musicOffset);
    }
    stopVoices(clearGroups=true) {
      for(const voice of this.voices){voice.onended=null;try{voice.stop();}catch{}voice.disconnect();}
      this.voices.clear();
      if(clearGroups)this.groups.clear();
      else for(const group of this.groups.values())group.source=null;
    }
    play(id) {
      if(!id||!this.enabled||this.state!=='playing'||!this.ready||!this.context||this.context.state!=='running')return false;
      const buffer=this.buffers.get(id);if(!buffer)return false;
      const meta=this.assets.clips[id],previous=meta.group===undefined?null:this.groups.get(meta.group);
      if(previous) {
        if(previous.priority>(meta.priority||0))return false;
        if(previous.source){const old=previous.source;old.onended=null;old.stop();old.disconnect();this.voices.delete(old);}
      }
      if(this.voices.size>=24){const oldest=this.voices.values().next().value;oldest.onended=null;oldest.stop();oldest.disconnect();this.voices.delete(oldest);const group=this.groups.get(oldest.group);if(group?.source===oldest)group.source=null;}
      const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);
      source.priority=meta.priority||0;
      source.group=meta.group;
      // The original mplay slot can remain busy after its audible PCM ends.
      // Measured driver status, not WAV length, controls priority expiration.
      if(meta.group!==undefined)this.groups.set(meta.group,{source,priority:source.priority,
        until:meta.driverActiveTicks===undefined?Infinity:this.lastFrame+meta.driverActiveTicks});
      this.voices.add(source);source.onended=()=>{
        this.voices.delete(source);source.disconnect();
        const group=this.groups.get(meta.group);
        if(group?.source===source){group.source=null;if(group.until===Infinity||group.until<=this.lastFrame)this.groups.delete(meta.group);}
      };source.start();return true;
    }
    tick(game,pose) {
      if(game.state!=='playing'||game.frame===this.lastFrame)return;
      this.lastFrame=game.frame;
      for(const [id,group] of this.groups)if(group.until<=game.frame)this.groups.delete(id);
      for(const id of cues(game,pose,this.assets.cues||{},this.previous))this.play(id);
      this.previous={grounded:!!game.player?.grounded,romRow:pose?.romRow,runTicks:pose?.runTicks};
    }
    status() {
      return {enabled:this.enabled,state:this.state,ready:this.ready,loaded:this.buffers.size,
        musicPlaying:!!this.music,activeEffects:this.voices.size,errors:this.errors.slice()};
    }
  }
  // ROM-derived event mapping is packed with the clips. Missing/silent actions
  // remain silent; no synthetic confirmation tones or replacement effects.
  function cues(game,pose,config,previous) {
    const result=[];
    // Run wrapper 08063626 plays its footstep before incrementing +0x60 and
    // before processing jump/attack/input. Air time pauses that local counter.
    if(config.run&&previous?.grounded&&previous.romRow===8&&previous.runTicks%16===0)
      result.push(config.run);
    for(const event of game.events||[]) {
      if(event.type==='land'&&event.hurtLanding)continue;
      for(const cue of config.events?.[event.type]||[]) {
        if(cue.when&&Object.entries(cue.when).some(([key,value])=>event[key]!==value))continue;
        const clip=cue.clip||(cue.cycle&&cue.cycle[game.frame%cue.cycle.length]);
        if(clip)result.push(clip);
      }
    }
    return result;
  }
  const api={Player,cues,createPlayer:()=>new Player(root.StairAudioAssets||{})};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairAudio=api;
})(typeof window!=='undefined'?window:globalThis);
