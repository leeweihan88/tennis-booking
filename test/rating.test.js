import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expected, ratingDeltas, startingRating } from '../src/rating.js';

const p = (id, rating, rated_matches = 0) => ({ id, rating, rated_matches });

test('expected score is symmetric', () => {
  assert.equal(expected(3, 3), 0.5);
  assert.ok(Math.abs(expected(4, 3) + expected(3, 4) - 1) < 1e-12);
  assert.ok(expected(4, 3) > 0.9);
});

test('singles: equal players move ±0.15 while provisional', () => {
  const d = ratingDeltas([p(1, 3)], [p(2, 3)], 1);
  assert.deepEqual(d, [{ id: 1, delta: 0.15 }, { id: 2, delta: -0.15 }]);
});

test('upset moves more than expected win', () => {
  const upset = ratingDeltas([p(1, 2)], [p(2, 3)], 1)[0].delta;
  const expectedWin = ratingDeltas([p(1, 3)], [p(2, 2)], 1)[0].delta;
  assert.ok(upset > expectedWin);
});

test('doubles uses team averages; established players move slower', () => {
  const d = ratingDeltas([p(1, 3, 20), p(2, 3)], [p(3, 3), p(4, 3)], 2);
  assert.equal(d.length, 4);
  assert.equal(d[0].delta, -0.075);
  assert.equal(d[1].delta, -0.15);
  assert.equal(d[2].delta, 0.15);
});

test('starting rating spans 1.0 to 4.0', () => {
  assert.equal(startingRating([0, 0, 0, 0]), 1);
  assert.equal(startingRating([3, 3, 3, 3]), 4);
  assert.equal(startingRating([1, 2, 1, 2]), 2.5);
});
