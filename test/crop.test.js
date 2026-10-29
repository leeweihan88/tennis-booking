import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initial, clamp, zoomAt, cropRect, minScale, MAX_ZOOM } from '../public/crop-v1.js';

const VIEW = 300;
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('initial: landscape photo fills the view and is centred', () => {
  const s = initial(3000, 2000, VIEW);
  assert.ok(close(s.s, 300 / 2000));
  assert.ok(close(s.y, 0));
  assert.ok(close(s.x, (300 - 3000 * s.s) / 2));
  const r = cropRect(s, VIEW);
  assert.ok(close(r.size, 2000) && close(r.sx, 500) && close(r.sy, 0), JSON.stringify(r));
});

test('clamp: the photo can never leave a gap inside the circle', () => {
  const s = initial(3000, 2000, VIEW);
  const tooFarRight = clamp({ ...s, x: 50 }, VIEW);
  assert.equal(tooFarRight.x, 0);
  const tooFarLeft = clamp({ ...s, x: -10000 }, VIEW);
  assert.ok(close(tooFarLeft.x, VIEW - 3000 * s.s));
  assert.equal(clamp({ ...s, y: 20 }, VIEW).y, 0);
});

test('zoomAt: limited between cover and 4x, keeps the pinch point still', () => {
  const s = initial(1000, 1000, VIEW);
  const s0 = minScale(1000, 1000, VIEW);
  assert.ok(close(zoomAt(s, VIEW, s0 / 2, 150, 150).s, s0));
  assert.ok(close(zoomAt(s, VIEW, s0 * 100, 150, 150).s, s0 * MAX_ZOOM));
  // Zoom 2x about the centre: the image point under the centre stays under it.
  const z = zoomAt(s, VIEW, s0 * 2, 150, 150);
  assert.ok(close((150 - z.x) / z.s, (150 - s.x) / s.s));
  const r = cropRect(z, VIEW);
  assert.ok(close(r.size, 500) && close(r.sx, 250) && close(r.sy, 250), JSON.stringify(r));
});

test('cropRect stays inside the photo after any pan', () => {
  let s = zoomAt(initial(1200, 800, VIEW), VIEW, minScale(1200, 800, VIEW) * 3, 0, 0);
  for (const [dx, dy] of [[-9999, -9999], [9999, 9999], [123, -45]]) {
    s = clamp({ ...s, x: s.x + dx, y: s.y + dy }, VIEW);
    const r = cropRect(s, VIEW);
    assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.size <= 1200 + 1e-9 && r.sy + r.size <= 800 + 1e-9, JSON.stringify(r));
  }
});
