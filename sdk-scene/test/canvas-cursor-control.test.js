import assert from 'node:assert/strict';
import test from 'node:test';

import { installCanvasCursorControl } from '../runtime/canvas-cursor-control.js';

test('click-to-move uses pointer and camera rotation uses grab', () => {
  const element = { style: { cursor: '' } };
  const cursor = installCanvasCursorControl({ element });

  cursor.setClickToMoveActive(true);
  assert.equal(element.style.cursor, 'pointer');

  cursor.setCameraRotating(true);
  assert.equal(element.style.cursor, 'grab');

  cursor.setCameraRotating(false);
  assert.equal(element.style.cursor, 'pointer');
});

test('deactivation and disposal restore the cursor from before installation', () => {
  const element = { style: { cursor: 'crosshair' } };
  const cursor = installCanvasCursorControl({ element });

  cursor.setClickToMoveActive(true);
  cursor.setClickToMoveActive(false);
  assert.equal(element.style.cursor, 'crosshair');

  cursor.setClickToMoveActive(true);
  cursor.dispose();
  assert.equal(element.style.cursor, 'crosshair');
});