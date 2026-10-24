(function(){
  'use strict';
  const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
  let savedBest=0;
  try{savedBest=Number(localStorage.getItem('abyssal-stairway-best')||0)||0;}catch{}
  const game=new StairEngine.Game({best:savedBest});
  const enemyWorld=new StairEnemies.World();
  StairCharacter.reset(game);
  window.StairPlayerEffects?.reset(game);
  if(window.StairBreakables)window.StairBreakables.reset(game);
  if(window.StairEnemyName)window.StairEnemyName.reset(game);
  const keys={},touch={},pad={};
  const audio=StairAudio.createPlayer();
  let accumulator=0,lastTime=0,sound=true,saveTimer=0;
  const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',Space:'jump',KeyX:'jump',KeyZ:'attack',KeyC:'attack'};
  const soundPaths={off:'M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6',on:'M11 5 6 9H3v6h3l5 4zM15 8c3 2 3 6 0 8m3-11c5 3 5 11 0 14'};
  // Retain the existing saved preference; it now controls the whole scene.
  const characterStyleKey='abyssal-stairway-character-style';
  const costumeKey='abyssal-stairway-character-costume';
  const costumeCode=['up','up','down','down','left','right','left','right'];
  function codeReader(){
    let recent=[];
    return {
      push(direction){
        recent.push(direction);
        if(recent.length>costumeCode.length)recent.shift();
        if(recent.length!==costumeCode.length||!costumeCode.every((value,i)=>value===recent[i]))return false;
        recent=[];return true;
      },
      reset(){recent=[];}
    };
  }
  const keyboardCode=codeReader(),controllerCode=codeReader();
  let codeController=null,previousCodeDirections=[],previousCodeButtons=[];
  function setCharacterCostume(costume,remember=true){
    const selected=StairCharacter.setCostume(costume);
    if(remember)try{localStorage.setItem(costumeKey,selected);}catch{}
    if(game.state==='playing')canvas.focus({preventScroll:true});
  }
  function toggleCostume(){
    setCharacterCostume(StairCharacter.getCostume()==='alternate'?'original':'alternate');
    window.StairCostumeEffects?.trigger(game,StairCharacter.getCostume());
  }
  function setCharacterStyle(style,remember=true){
    const selected=StairCharacter.setRenderStyle(style);
    if(remember)try{localStorage.setItem(characterStyleKey,selected);}catch{}
    if(game.state==='playing')canvas.focus({preventScroll:true});
  }
  let savedCharacterStyle='detailed';
  try{savedCharacterStyle=localStorage.getItem(characterStyleKey)||'detailed';}catch{}
  setCharacterStyle(savedCharacterStyle,false);
  let savedCostume='original';
  try{savedCostume=localStorage.getItem(costumeKey)||'original';}catch{}
  setCharacterCostume(savedCostume,false);
  function initSound(){audio.unlock();}
  function clearInput(){for(const obj of[keys,touch,pad])for(const key of Object.keys(obj))delete obj[key];document.querySelectorAll('[data-key]').forEach(el=>el.classList.remove('active'));keyboardCode.reset();controllerCode.reset();codeController=null;previousCodeDirections=[];previousCodeButtons=[];}
  function start(){initSound();game.start();enemyWorld.reset();StairCombat.reset(game);StairCharacter.reset(game);window.StairPlayerEffects?.reset(game);window.StairCostumeEffects?.reset(game);if(window.StairBreakables)window.StairBreakables.reset(game);if(window.StairEnemyName)window.StairEnemyName.reset(game);audio.reset();audio.setState('playing');hideOverlay();canvas.focus({preventScroll:true});accumulator=0;}
  function hideOverlay(){$('overlay').hidden=true;$('pause').setAttribute('aria-label','Pause game');}
  function pause(){
    if(game.state==='title')return;
    if(game.state==='paused'){initSound();game.state='playing';hideOverlay();canvas.focus({preventScroll:true});}
    else{game.state='paused';clearInput();$('overlay').hidden=false;$('overlay-title').textContent='Paused';$('begin').textContent='Resume';$('overlay-hint').textContent='Enter or Esc to resume';$('pause').setAttribute('aria-label','Resume game');}
    accumulator=0;
    audio.setState(game.state);
  }
  function act(){if(game.state==='title')start();else if(game.state==='paused')pause();}
  $('begin').addEventListener('click',act);$('pause').addEventListener('click',pause);
  $('restart').addEventListener('click',()=>{clearInput();start();});
  function syncSound(){audio.setEnabled(sound);$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Turn music and sound off':'Turn music and sound on');$('sound').querySelector('path').setAttribute('d',sound?soundPaths.on:soundPaths.off);}
  syncSound();
  $('sound').addEventListener('click',()=>{sound=!sound;initSound();syncSound();});
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{$('fullscreen').title='Fullscreen unavailable in this browser';}}
  $('fullscreen').addEventListener('click',fullscreen);
  document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
  $('crt').addEventListener('click',()=>{const on=$('scanlines').hidden;$('scanlines').hidden=!on;$('crt').setAttribute('aria-pressed',String(on));$('crt').textContent='Scanlines: '+(on?'on':'off');});
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if(event.code==='ArrowUp')event.preventDefault();
    if(!event.repeat&&keyboardCode.push({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.code]))toggleCostume();
    if(keyMap[event.code]){if(event.target.tagName==='BUTTON'&&event.code==='Space')return;event.preventDefault();keys[event.code]=true;}
    if(event.repeat)return;
    if(event.code==='Enter'&&event.target.tagName!=='BUTTON'){event.preventDefault();act();}
    if(event.code==='Escape'||event.code==='KeyP'){event.preventDefault();pause();}
    if(event.code==='KeyF'){event.preventDefault();fullscreen();}
    if(event.code==='KeyR'){event.preventDefault();setCharacterStyle(StairCharacter.getRenderStyle()==='detailed'?'classic':'detailed');}
  });
  document.addEventListener('keyup',event=>{delete keys[event.code];});
  window.addEventListener('blur',()=>{clearInput();if(game.state==='playing')pause();});
  document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){clearInput();if(game.state==='playing')pause();}});
  document.querySelectorAll('[data-key]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touch[button.dataset.key]=true;button.classList.add('active');initSound();});
    const up=()=>{touch[button.dataset.key]=false;button.classList.remove('active');};
    button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  let previousStart=false;
  function readInput(){
    const input={left:false,right:false,down:false,jump:false,attack:false};
    for(const code in keys)if(keys[code])input[keyMap[code]]=true;
    for(const key in touch)if(touch[key])input[key]=true;
    const gp=navigator.getGamepads?.();
    const controller=gp&&Array.from(gp).find(Boolean);
    if(controller){
      const identity=String(controller.index??0)+':'+(controller.id||'gamepad');
      const buttons=controller.buttons.map(button=>!!button?.pressed);
      const directions=[!!controller.buttons[12]?.pressed||controller.axes[1]<-.5,
        !!controller.buttons[13]?.pressed||controller.axes[1]>.5,
        !!controller.buttons[14]?.pressed||controller.axes[0]<-.5,
        !!controller.buttons[15]?.pressed||controller.axes[0]>.5];
      if(identity!==codeController){
        // A newly connected or refocused pad starts from its current held
        // buttons. Only subsequent press edges count toward the code.
        codeController=identity;controllerCode.reset();
      }else{
        const pressed=directions.map((down,i)=>down&&!previousCodeDirections[i]?i:-1).filter(i=>i>=0);
        const otherPress=buttons.some((down,i)=>down&&!previousCodeButtons[i]&&(i<12||i>15));
        if(pressed.length>1||otherPress)controllerCode.reset();
        else if(pressed.length===1&&controllerCode.push(['up','down','left','right'][pressed[0]]))toggleCostume();
      }
      previousCodeDirections=directions;
      previousCodeButtons=buttons;
    }else{codeController=null;previousCodeDirections=[];previousCodeButtons=[];controllerCode.reset();}
    if(controller){input.left ||=controller.buttons[14]?.pressed||controller.axes[0]<-.5;input.right ||=controller.buttons[15]?.pressed||controller.axes[0]>.5;input.down ||=controller.buttons[13]?.pressed||controller.axes[1]>.5;input.jump ||=controller.buttons[0]?.pressed;input.attack ||=controller.buttons[1]?.pressed||controller.buttons[5]?.pressed;const pressed=controller.buttons[9]?.pressed;if(pressed&&!previousStart){if(game.state==='title')start();else pause();}previousStart=pressed;}
    else previousStart=false;
    return input;
  }
  function persist(){try{localStorage.setItem('abyssal-stairway-best',String(game.best));}catch{}}
  window.addEventListener('pagehide',persist);
  function loop(time){
    const dt=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;
    const input=readInput();
    if(game.state==='playing'){
      accumulator+=dt;
      while(accumulator>=1/game.physics.hz){
        const beforePlayer={x:game.player.x,y:game.player.y};
        game.step(input);StairCharacter.tick(game,input);
        window.StairPlayerEffects?.step(game,StairCharacter.snapshot(game.player),beforePlayer);
        game.enemies=enemyWorld.step(game,StairCharacter.snapshot(game.player));
        const combat=StairCombat.step(game,StairCharacter.snapshot(game.player));
        if(combat.playerHit)StairCharacter.reactToHit(game);
        if(window.StairBreakables)window.StairBreakables.step(game,StairCharacter.snapshot(game.player));
        if(window.StairEnemyName)window.StairEnemyName.tick(game);
        accumulator-=1/game.physics.hz;
        audio.tick(game,StairCharacter.snapshot(game.player));
      }
    }else accumulator=0;
    // Cosmetic costume transitions also play while the simulation is paused
    // or on the title screen, where the secret input remains available.
    if(!document.hidden)window.StairCostumeEffects?.advance(game,dt);
    StairDisplay.fitCanvas(canvas,window.devicePixelRatio);
    StairRenderer.draw(ctx,game);saveTimer+=dt;if(saveTimer>3){persist();saveTimer=0;}
    requestAnimationFrame(loop);
  }
  // Exposed read-only snapshot for local diagnostics; physics itself is independently testable.
  window.stairwaySnapshot=()=>({state:game.state,player:{...game.player},animation:StairCharacter.snapshot(game.player),enemies:game.enemies.filter(enemy=>!enemy.dead).map(enemy=>({...enemy})),effects:game.effects.map(effect=>({...effect})),height:game.height,best:game.best,flight:game.flight,platformCount:game.platforms.length,physics:{...game.physics}});
  window.stairwayAudioSnapshot=()=>audio.status();
  window.stairwayEnemyNameSnapshot=()=>window.StairEnemyName?.snapshot(game)||null;
  window.stairwayBreakablesSnapshot=()=>window.StairBreakables?.snapshot(game)||null;
  window.stairwayCostumeEffectSnapshot=()=>window.StairCostumeEffects?.snapshot(game)||null;
  window.stairwayPlayerEffectsSnapshot=()=>window.StairPlayerEffects?.snapshot(game)||[];
  requestAnimationFrame(loop);
})();
