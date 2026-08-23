import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMotionState,
  resolveAnimationIntent,
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
    velocity: { x: 1 }
  }), {
    locomotion: 'run',
    airbornePhase: 'rising',
    justJumped: true,
    justLanded: false,
    speed: 4.5
  });

  assert.deepEqual(normalizeMotionState({ locomotion: 'slide', speed: -2 }), {
    locomotion: 'idle',
    airbornePhase: 'grounded',
    justJumped: false,
    justLanded: false,
    speed: 0
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
