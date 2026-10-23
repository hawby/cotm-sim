(function(root) {
  'use strict';
  // Numerical movement samples verified by executing CotM USA 08028F90/08029020.
  // The ROM's counter visits 0..81 even though the sine divisor is 80.
  const WAVE_FIXED = Object.freeze([
    1048576,1045360,1035760,1019440,997152,968752,934432,894384,
    847936,797120,741440,681232,616848,547328,475744,401264,
    324320,245408,163392,81936,0,-81936,-163392,-245408,
    -324320,-401264,-475744,-547328,-616848,-681232,-741440,-797120,
    -847936,-894384,-934432,-968752,-997152,-1019440,-1035760,-1045360,
    -1048576,-1045360,-1035760,-1019440,-997152,-968752,-934432,-894384,
    -847936,-797120,-741440,-681232,-616848,-547328,-475744,-401264,
    -324320,-245408,-163392,-81936,0,81936,163392,245408,
    324320,401264,475744,547328,616848,681232,741440,797120,
    847936,894384,934432,968752,997152,1019440,1035760,1045360,
    1048576,1045360
  ]);
  const CONSTANTS = Object.freeze({
    hz:16777216/280896,
    speed:0.75, speedFixed:49152, amplitude:16,
    waveDivisorTicks:80, wavePeriodTicks:82,
    spawnDelayMin:180, spawnDelayRange:141, spawnDelayMax:320,
    spawnLimit:4, spawnLeftOffset:-15.5, spawnRightOffset:256.5,
    spawnVerticalRange:10, spawnAnchorVerticalLimit:90,
    spawnAnchorNearHorizontal:24
  });

  // x/y are the spawn anchor in native pixels. y is the wave's centerline;
  // the first simulation step displays centerline+16, as in the original init.
  function create({id, x, y, facing=1, phase=0}) {
    const direction=facing < 0 ? -1 : 1;
    return {
      id, type:'medusaHead', x, y, facing:direction,
      state:'wave', age:0, phase:((Math.trunc(phase)%82)+82)%82,
      xFixed:Math.round(x*65536), baseYFixed:Math.round(y*65536),
      yFixed:Math.round(y*65536), vxFixed:direction*CONSTANTS.speedFixed,
      vx:direction*CONSTANTS.speed
    };
  }
  function step(entity, context) {
    // Once initialized, the ROM flight has no target tracking or tile collision.
    entity.xFixed += entity.vxFixed;
    entity.yFixed = entity.baseYFixed + WAVE_FIXED[entity.phase];
    entity.x = entity.xFixed/65536;
    entity.y = entity.yFixed/65536;
    entity.phase = (entity.phase+1)%CONSTANTS.wavePeriodTicks;
    entity.age++;
    return entity;
  }
  const api={create,step,CONSTANTS};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.StairMedusa=api;
})(typeof window!=='undefined' ? window : globalThis);
