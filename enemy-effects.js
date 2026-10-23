(function () {
  'use strict';
  // Original CotM generic death sprites, with the ROM's non-looping clocks.
  // The actor stays fixed; the authored sprite offsets make the flame rise.
  const sequences={
    small:{file:'death-small.png',ids:[0,1,2,4,5,6],ticks:[4,4,6,6,6,6]},
    medium:{file:'death-medium.png',ids:[0,1,2,4,7,11,14],ticks:[4,4,4,6,6,6,6]}
  };
  for(const sequence of Object.values(sequences)) {
    sequence.total=sequence.ticks.reduce((sum,ticks)=>sum+ticks,0);
    sequence.image=new Image();sequence.ready=false;
    sequence.image.onload=()=>{
      sequence.ready=sequence.image.naturalWidth===256&&sequence.image.naturalHeight===128;
    };
    sequence.image.src='assets/enemies/'+sequence.file;
  }
  function duration(kind) {return sequences[kind]?.total||0;}
  function snapshot(effect) {
    if(effect.type!=='enemyDeath')return null;
    const sequence=sequences[effect.kind];
    if(!sequence)return null;
    const age=Math.max(0,Math.floor(effect.age||0));
    let end=0;
    for(let index=0;index<sequence.ticks.length;index++) {
      end+=sequence.ticks[index];
      if(age<end)return {kind:effect.kind,index,spriteId:sequence.ids[index],
        source:[index%4*64,Math.floor(index/4)*64,64,64],origin:[32,56]};
    }
    return null;
  }
  function draw(ctx,effect) {
    const pose=snapshot(effect);
    if(!pose||!sequences[pose.kind].ready)return false;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sequences[pose.kind].image,...pose.source,-32,-56,64,64);
    ctx.restore();
    return true;
  }
  window.StairEnemyEffects={draw,snapshot,duration,
    ready:()=>Object.values(sequences).every(sequence=>sequence.ready)};
})();
