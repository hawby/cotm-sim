(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StairGargoyle = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Ordinary Gargoyle, USA ROM 08049CB0–0804A680. All speeds are pixels/tick.
  const CONSTANTS = Object.freeze({
    activationForward: 96, activationAbove: 40, activationBelow: 16,
    takeoffOriginShift: -16, takeoffTicks: 30,
    takeoffVX: 0.375, takeoffVY: -0.75, flightVX: 0.75,
    targetStandingOffsetY: -14, targetCrouchingOffsetY: -7,
    spearVX: 2, spearVY: 2, spearOffsetX: 12, spearOffsetY: 4,
    throwUpdate: 25, recoverUpdate: 43, angleRatioIndexMin: 343,
  });
  const STREAMS = Object.freeze({
    statue: { offset: 0, ticks: [1], sprites: [0] },
    armed: { offset: 2, ticks: [10, 10, 10, 10], sprites: [5, 10, 15, 10] },
    unarmed: { offset: 7, ticks: [10, 10, 10, 10], sprites: [20, 23, 26, 23] },
    throw: { offset: 12, ticks: [8, 10, 6, 10, 8], sprites: [29, 34, 39, 44, 23] },
  });

  function selectAnimation(e, name) {
    const stream = STREAMS[name];
    e.animation = name;
    e.animationOffset = stream.offset;
    e.animationIndex = 0;
    e.animationAge = 0;
    e.spriteId = stream.sprites[0];
  }

  // Enemy VM 08010D50/08010DF8 starts at age 0; subsequent records at age 1.
  // The extra initial update is deliberate and also affects the throw timer.
  function animate(e) {
    const stream = STREAMS[e.animation];
    if (++e.animationAge <= stream.ticks[e.animationIndex]) return 0;
    e.animationAge = 1;
    e.animationIndex = (e.animationIndex + 1) % stream.ticks.length;
    e.spriteId = stream.sprites[e.animationIndex];
    const index = e.animationIndex;
    if (e.animation === 'armed' || e.animation === 'unarmed') {
      e.y += index === 0 || index === 3 ? 1 : -1;
      return index === 0 ? 1 : 0;
    }
    if (e.animation === 'throw') {
      if (index > 0) e.y += index <= 2 ? -1 : 1;
      return index === 3 ? 2 : index === 0 ? 1 : 0;
    }
    return 0;
  }

  function setState(e, state) {
    e.state = state;
    e.stateAge = 0;
    e.renderOffsetY = state === 'statue' ? -12 : 0;
  }

  function create(options) {
    const o = options || {};
    const airborne = !!o.airborne;
    const facing = o.facing < 0 ? -1 : 1;
    const e = {
      id: o.id, type: 'gargoyle', x: o.x || 0, y: o.y || 0, facing,
      vx: airborne ? facing * CONSTANTS.flightVX : 0, vy: 0,
      state: airborne ? 'fly' : 'statue', age: 0, stateAge: 0,
      renderOffsetY: airborne ? 0 : -12,
      hasThrown: false, hasSpear: true,
    };
    selectAnimation(e, airborne ? 'armed' : 'statue');
    return e;
  }

  function targetY(player) {
    // Global player+1750 is feet plus defense-box center, including in the air.
    return player.y + (Number.isFinite(player.targetOffsetY) ? player.targetOffsetY :
      player.crouching ? CONSTANTS.targetCrouchingOffsetY : CONSTANTS.targetStandingOffsetY);
  }

  function canThrow(e, player) {
    const dx = (player.x - e.x) * e.facing;
    const dy = targetY(player) - e.y;
    if (dx <= 0 || dy <= 0) return false;
    // Exact acceptance band from the ROM atan lookup (080C4290): index 342
    // gives 0x17FE, index 343 gives 0x180C. Mirror symmetry removes atan.
    let small = Math.min(Math.trunc(dx * 65536), Math.trunc(dy * 65536));
    let large = Math.max(Math.trunc(dx * 65536), Math.trunc(dy * 65536));
    while (small >= 0x800000) {
      small = Math.floor(small / 2);
      large = Math.floor(large / 2);
    }
    return large > 0 && Math.floor(small * 512 / large) >= CONSTANTS.angleRatioIndexMin;
  }

  function step(e, context) {
    const spawned = [];
    const player = context && context.player;
    e.age += 1;
    e.stateAge += 1;
    if (e.state === 'statue') {
      if (!player) return spawned;
      const dx = (player.x - e.x) * e.facing;
      const dy = targetY(player) - e.y;
      if (dx > 0 && dx < CONSTANTS.activationForward && dy > -CONSTANTS.activationAbove && dy < CONSTANTS.activationBelow) {
        e.y += CONSTANTS.takeoffOriginShift;
        e.vx = e.facing * CONSTANTS.takeoffVX;
        e.vy = CONSTANTS.takeoffVY;
        selectAnimation(e, 'armed');
        setState(e, 'takeoff');
      }
      return spawned;
    }

    e.x += e.vx;
    e.y += e.vy;
    const event = animate(e);
    if (e.state === 'takeoff') {
      if (e.stateAge === CONSTANTS.takeoffTicks) {
        e.vx = e.facing * CONSTANTS.flightVX;
        e.vy = 0;
        setState(e, 'fly');
      }
    } else if (e.state === 'fly') {
      if (event === 1 && !e.hasThrown && player && canThrow(e, player)) {
        e.hasThrown = true;
        selectAnimation(e, 'throw');
        setState(e, 'throw');
      }
    } else if (e.state === 'throw') {
      if (event === 2) {
        e.hasSpear = false;
        spawned.push({
          id: String(e.id == null ? 'gargoyle' : e.id) + '-spear',
          type: 'gargoyleShot', kind: 'spear',
          x: e.x + e.facing * CONSTANTS.spearOffsetX, y: e.y + CONSTANTS.spearOffsetY,
          vx: e.facing * CONSTANTS.spearVX, vy: CONSTANTS.spearVY,
          facing: e.facing, age: 0, spriteId: 48,
        });
      } else if (event === 1) {
        selectAnimation(e, 'unarmed');
        setState(e, 'fly');
      }
    }
    return spawned;
  }

  return { create, step, CONSTANTS };
});
