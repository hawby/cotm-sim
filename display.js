(function(root){
  'use strict';
  const WIDTH=240,HEIGHT=160,MIN_SCALE=4,MAX_SCALE=8;
  function fitCanvas(canvas,dpr=1) {
    const rect=canvas.getBoundingClientRect();
    const density=Number.isFinite(dpr)&&dpr>0?dpr:1;
    const width=Number.isFinite(rect.width)&&rect.width>0?rect.width:0;
    const height=Number.isFinite(rect.height)&&rect.height>0?rect.height:0;
    // The world stays 240x160. A larger presentation buffer retains the finer
    // idle artwork while keeping native scenery pixels on an integer grid.
    const scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,Math.ceil(Math.max(width/WIDTH,height/HEIGHT)*density)));
    const targetWidth=WIDTH*scale,targetHeight=HEIGHT*scale;
    // Assigning either canvas dimension clears its pixels and context state.
    // Leave both alone between real changes; the renderer sets its own transform.
    if(canvas.width!==targetWidth)canvas.width=targetWidth;
    if(canvas.height!==targetHeight)canvas.height=targetHeight;
    return scale;
  }
  const api={fitCanvas};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StairDisplay=api;
})(typeof window!=='undefined'?window:globalThis);
