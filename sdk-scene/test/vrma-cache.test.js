import assert from 'node:assert/strict';
import test from 'node:test';

import { createVrmaCache } from '../components/avatar-presentation/vrma-cache.js';

test('loads each complete VRMA URL once and reuses the parsed result', async () => {
  const calls = [];
  const parsed = { name: 'idle' };
  const cache = createVrmaCache(async (url) => {
    calls.push(url);
    return parsed;
  });

  assert.equal(await cache.getOrLoad('/idle.vrma?v=1'), parsed);
  assert.equal(await cache.getOrLoad('/idle.vrma?v=1'), parsed);
  assert.deepEqual(calls, ['/idle.vrma?v=1']);
});

test('deduplicates callers while a VRMA load is pending', async () => {
  let resolveLoad;
  let calls = 0;
  const cache = createVrmaCache(() => {
    calls += 1;
    return new Promise((resolve) => { resolveLoad = resolve; });
  });

  const first = cache.getOrLoad('/walk.vrma?v=1');
  const second = cache.getOrLoad('/walk.vrma?v=1');
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveLoad({ name: 'walk' });
  assert.equal(await first, await second);
});

test('evicts rejected loads so a later request can retry', async () => {
  let calls = 0;
  const cache = createVrmaCache(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary failure');
    return { name: 'run' };
  });

  await assert.rejects(() => cache.getOrLoad('/run.vrma?v=1'), /temporary failure/);
  assert.deepEqual(await cache.getOrLoad('/run.vrma?v=1'), { name: 'run' });
  assert.equal(calls, 2);
});

test('treats versioned URLs as separate assets and clear forces a reload', async () => {
  let calls = 0;
  const cache = createVrmaCache(async (url) => ({ url, call: ++calls }));

  const versionOne = await cache.getOrLoad('/jump.vrma?v=1');
  const versionTwo = await cache.getOrLoad('/jump.vrma?v=2');
  assert.notEqual(versionOne, versionTwo);
  cache.clear();
  assert.notEqual(await cache.getOrLoad('/jump.vrma?v=1'), versionOne);
  assert.equal(calls, 3);
});