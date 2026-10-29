import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingSeries, chartPoints } from '../src/chart.js';

test('ratingSeries walks back from the current rating', () => {
  assert.deepEqual(ratingSeries(2.65, [0.15]), [2.5, 2.65]);
  assert.deepEqual(ratingSeries(2.5, [0.15, -0.15, 0.075, -0.075]), [2.5, 2.65, 2.5, 2.575, 2.5]);
  assert.deepEqual(ratingSeries(3, []), [3]);
});

test('chartPoints: inside the box, oldest left, higher rating higher up', () => {
  const { points, lo, hi } = chartPoints([2.5, 2.65, 2.35], { width: 100, height: 50, pad: 5 });
  assert.equal(points.length, 3);
  assert.deepEqual(points.map((p) => p[0]), [5, 50, 95]);
  for (const [, y] of points) assert.ok(y >= 5 && y <= 45);
  assert.ok(points[1][1] < points[0][1] && points[2][1] > points[0][1], 'y grows downward');
  assert.ok(lo <= 2.35 && hi >= 2.65);
});

test('chartPoints keeps the last 30 and stays within 0–7', () => {
  const series = Array.from({ length: 50 }, (_, i) => i % 2 ? 6.9 : 0.1);
  const { points, lo, hi } = chartPoints(series);
  assert.equal(points.length, 30);
  assert.equal(lo, 0);
  assert.equal(hi, 7);
  assert.deepEqual(chartPoints([4]).points.length, 1);
});
