import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, colourIndex, COLOURS, avatarPath, resizePhoto, MAX_UPLOAD_BYTES } from '../src/avatar.js';

test('initials: first and last word, or first two letters', () => {
  assert.equal(initials('Wesley Lee'), 'WL');
  assert.equal(initials('wesley lee'), 'WL');
  assert.equal(initials('Maria'), 'MA');
  assert.equal(initials('Ana Maria de la Cruz'), 'AC');
  assert.equal(initials('Wesley (Wes) Lee'), 'WL');
  assert.equal(initials('  José  Ñuñez '), 'JÑ');
  assert.equal(initials('X'), 'X');
  assert.equal(initials('123'), '?');
});

test('colourIndex is stable and in range', () => {
  assert.equal(colourIndex('Wesley Lee'), colourIndex('wesley lee'));
  for (const n of ['A', 'Maria', 'Wesley Lee', 'Zed']) {
    const i = colourIndex(n);
    assert.ok(Number.isInteger(i) && i >= 0 && i < COLOURS);
  }
});

test('avatarPath only when a photo exists', () => {
  assert.equal(avatarPath(7, 123), '/avatar?u=7&v=123');
  assert.equal(avatarPath(7, null), null);
});

test('resizePhoto rejects without calling Images when input is invalid', async () => {
  const file = (size) => ({ size, arrayBuffer: async () => new ArrayBuffer(size) });
  assert.deepEqual(await resizePhoto(null, file(10)), { error: 'photo_unavailable' });
  const images = { info: () => { throw new Error('should not be called'); } };
  assert.deepEqual(await resizePhoto(images, null), { error: 'bad_photo' });
  assert.deepEqual(await resizePhoto(images, file(0)), { error: 'bad_photo' });
  assert.deepEqual(await resizePhoto(images, file(MAX_UPLOAD_BYTES + 1)), { error: 'photo_too_big' });
});

test('resizePhoto rejects SVG', async () => {
  const images = { info: async () => ({ format: 'image/svg+xml' }) };
  const file = { size: 10, arrayBuffer: async () => new ArrayBuffer(10) };
  assert.deepEqual(await resizePhoto(images, file), { error: 'bad_photo' });
});
