import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMotionState,
  resolveAnimationIntent,
  resolveGazeBoneYaws,
  resolveLocomotionBlend,
  resolveWalkAnimationTimeScale,
  resolveTransientIntent
} from '../components/avatar-presentation/avatar-motion.js';

const allAnimations = {
  idle: true,
  walk: true,
  run: true,
  jump_start: true,
  jump_up: true,
  jump_loop: true,
  jump_down: true
};

test('normalizes motion state without leaking gameplay data', () => {
  assert.deepEqual(normalizeMotionState({
    locomotion: 'run',
    airbornePhase: 'rising',
    justJumped: true,
    justLanded: 1,
    speed: 4.5,
    gazeLockYaw: Math.PI * 2,
    velocity: { x: 1 }
  }), {
    locomotion: 'run',
    airbornePhase: 'rising',
    justJumped: true,
    justLanded: false,
    speed: 4.5,
    locomotionProgress: 0,
    gazeLockYaw: Math.PI
  });

  assert.deepEqual(normalizeMotionState({ locomotion: 'slide', speed: -2 }), {
    locomotion: 'idle',
    airbornePhase: 'grounded',
    justJumped: false,
    justLanded: false,
    speed: 0,
    locomotionProgress: 0,
    gazeLockYaw: 0
  });
});

test('blends walk into run with ease-in during the second half of locomotion acceleration', () => {
  assert.deepEqual(resolveLocomotionBlend({ locomotion: 'walk', speed: 1.6, locomotionProgress: 0 }, allAnimations), { walk: 1, run: 0 });
  assert.deepEqual(resolveLocomotionBlend({ locomotion: 'run', speed: 3.2, locomotionProgress: 0.5 }, allAnimations), { walk: 1, run: 0 });
  const midpointBlend = resolveLocomotionBlend({ locomotion: 'run', speed: 4, locomotionProgress: 0.75 }, allAnimations);
  assert.ok(Math.abs(midpointBlend.walk - 0.75) < 0.000001);
  assert.ok(Math.abs(midpointBlend.run - 0.25) < 0.000001);
  assert.deepEqual(resolveLocomotionBlend({ locomotion: 'run', speed: 4.8, locomotionProgress: 1 }, allAnimations), { walk: 0, run: 1 });
  assert.deepEqual(resolveLocomotionBlend({ locomotion: 'run', speed: 4.8, locomotionProgress: 1 }, { idle: true, walk: true }), { walk: 1, run: 0 });
});

test('increases walk animation speed across locomotion acceleration', () => {
  assert.equal(resolveWalkAnimationTimeScale({ locomotionProgress: 0 }), 1);
  assert.equal(resolveWalkAnimationTimeScale({ locomotionProgress: 0.5 }), 1.075);
  assert.equal(resolveWalkAnimationTimeScale({ locomotionProgress: 1 }), 1.15);
  assert.equal(resolveWalkAnimationTimeScale({ locomotionProgress: 1 }, 1.3), 1.3);
});

test('distributes total gaze-lock yaw across head, neck, and chest', () => {
  const pureStrafe = resolveGazeBoneYaws({ gazeLockYaw: Math.PI / 3 });
  assert.ok(Math.abs(pureStrafe.head - Math.PI / 6) < 0.000001);
  assert.ok(Math.abs(pureStrafe.neck - Math.PI / 10) < 0.000001);
  assert.ok(Math.abs(pureStrafe.chest - Math.PI / 15) < 0.000001);
  const forwardStrafe = resolveGazeBoneYaws({ gazeLockYaw: -Math.PI * 2 / 9 });
  assert.ok(Math.abs(forwardStrafe.head + Math.PI / 9) < 0.000001);
  assert.ok(Math.abs(forwardStrafe.neck + Math.PI / 15) < 0.000001);
  assert.ok(Math.abs(forwardStrafe.chest + Math.PI * 2 / 45) < 0.000001);
  assert.deepEqual(resolveGazeBoneYaws({ gazeLockYaw: Number.NaN }), {
    head: 0,
    neck: 0,
    chest: 0
  });
});

test('falls back from run to walk and idle based on capabilities', () => {
  const running = { locomotion: 'run', speed: 4 };
  assert.equal(resolveAnimationIntent(running, allAnimations), 'run');
  assert.equal(resolveAnimationIntent(running, { idle: true, walk: true }), 'walk');
  assert.equal(resolveAnimationIntent(running, { idle: true }), 'idle');
  assert.equal(resolveAnimationIntent(running, {}), null);
});

test('uses physics phases for stationary and directional jumps', () => {
  assert.equal(resolveAnimationIntent({
    locomotion: 'idle',
    airbornePhase: 'rising',
    justJumped: true
  }, allAnimations), 'jump_up');

  assert.equal(resolveAnimationIntent({
    locomotion: 'walk',
    airbornePhase: 'rising',
    justJumped: true,
    speed: 2
  }, allAnimations), 'jump_up');

  assert.equal(resolveAnimationIntent({
    locomotion: 'idle',
    airbornePhase: 'falling'
  }, allAnimations), 'jump_loop');
});

test('keeps jump start out of phase-driven jumps', () => {
  assert.equal(resolveTransientIntent(null, {
    locomotion: 'idle',
    airbornePhase: 'rising',
    justJumped: true
  }, allAnimations), null);

  assert.equal(resolveAnimationIntent({
    locomotion: 'idle',
    airbornePhase: 'rising',
    justJumped: true
  }, allAnimations), 'jump_up');
});

test('moving landing resumes locomotion while standing landing uses jump down', () => {
  assert.equal(resolveAnimationIntent({
    locomotion: 'idle',
    justLanded: true
  }, allAnimations), 'jump_down');

  assert.equal(resolveAnimationIntent({
    locomotion: 'walk',
    justLanded: true,
    speed: 2
  }, allAnimations), 'walk');
});

test('replaces a stale landing transient when another jump begins', () => {
  assert.equal(resolveTransientIntent('jump_down', {
    locomotion: 'idle',
    airbornePhase: 'rising',
    justJumped: true
  }, allAnimations), null);

  assert.equal(resolveTransientIntent('jump_down', {
    locomotion: 'idle',
    airbornePhase: 'rising'
  }, { ...allAnimations, jump_start: false }), null);
});
