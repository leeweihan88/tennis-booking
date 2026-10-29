import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCHEDULE, offsets, validSchedule, parseTime, timeValue, formatTime, timing, nextSessionDate,
  eventStatus, weekOf, weekdayOf, formatDate, formatManila,
} from '../src/schedule.js';

// Manila wall-clock time → UTC ms.
const manila = (s) => Date.parse(s + '+08:00');
const rowFor = (date, s = DEFAULT_SCHEDULE) => {
  const o = offsets(s);
  return { date, start_min: s.start, end_min: s.end, opens_offset: o.opens, closes_offset: o.closes };
};

test('default schedule reproduces the original Monday times', () => {
  const o = offsets(DEFAULT_SCHEDULE);
  assert.deepEqual(o, { opens: -5 * 1440 + 600, closes: 720 });
  const t = timing(rowFor('2026-11-02'));
  assert.equal(t.opensAt, manila('2026-10-28T10:00:00')); // Wednesday 10 AM
  assert.equal(t.closesAt, manila('2026-11-02T12:00:00')); // Monday noon
  assert.equal(t.startsAt, manila('2026-11-02T19:30:00'));
  assert.equal(t.endsAt, manila('2026-11-02T21:30:00'));
});

test('status transitions around open and close', () => {
  const t = timing(rowFor('2026-11-02'));
  const at = (s) => eventStatus(t, 0, manila(s));
  assert.equal(at('2026-10-28T09:59:59'), 'upcoming');
  assert.equal(at('2026-10-28T10:00:00'), 'open');
  assert.equal(at('2026-11-02T11:59:59'), 'open');
  assert.equal(at('2026-11-02T12:00:00'), 'closed');
  assert.equal(eventStatus(t, 1, manila('2026-10-30T10:00:00')), 'cancelled');
});

test('nextSessionDate: today counts; uses Manila days', () => {
  assert.equal(nextSessionDate(manila('2026-10-29T12:00:00'), 1), '2026-11-02'); // Thu → Mon
  assert.equal(nextSessionDate(manila('2026-11-02T23:59:00'), 1), '2026-11-02'); // session day itself
  assert.equal(nextSessionDate(manila('2026-11-03T00:00:00'), 1), '2026-11-09'); // day after
  assert.equal(nextSessionDate(manila('2026-11-02T00:30:00'), 1), '2026-11-02'); // still Sunday in UTC
  assert.equal(nextSessionDate(manila('2026-10-29T12:00:00'), 5), '2026-10-30'); // Friday sessions
});

test('validSchedule', () => {
  assert.ok(validSchedule(DEFAULT_SCHEDULE));
  assert.ok(validSchedule({ ...DEFAULT_SCHEDULE, day: 5, opensDay: 1, closesDay: 5, closesTime: 1080, start: 1140 }));
  assert.ok(!validSchedule({ ...DEFAULT_SCHEDULE, end: 1170 }), 'end must be after start');
  assert.ok(!validSchedule({ ...DEFAULT_SCHEDULE, closesTime: 1200 }), 'must close by the start');
  assert.ok(!validSchedule({ ...DEFAULT_SCHEDULE, opensDay: 1, opensTime: 800 }), 'must open before it closes');
  assert.ok(!validSchedule({ ...DEFAULT_SCHEDULE, day: 7 }));
  assert.ok(!validSchedule({ ...DEFAULT_SCHEDULE, start: 19.5 }));
  assert.ok(!validSchedule(null));
});

test('time helpers', () => {
  assert.equal(parseTime('19:30'), 1170);
  assert.equal(parseTime('00:00'), 0);
  for (const bad of ['24:00', '7:30', '19:60', '', null, '19:30:00']) assert.equal(parseTime(bad), null, String(bad));
  assert.equal(timeValue(1170), '19:30');
  assert.equal(timeValue(5), '00:05');
  assert.equal(formatTime(1170), '7:30 PM');
  assert.equal(formatTime(720), '12:00 PM');
  assert.equal(formatTime(0), '12:00 AM');
});

test('weekOf: Monday that starts the week', () => {
  assert.equal(weekOf('2026-11-02'), '2026-11-02');
  assert.equal(weekOf('2026-11-08'), '2026-11-02'); // Sunday
  assert.equal(weekOf('2026-11-03'), '2026-11-02');
  assert.equal(weekOf('2026-11-09'), '2026-11-09');
});

test('formatting', () => {
  assert.equal(weekdayOf('2026-11-02'), 'Monday');
  assert.equal(formatDate('2026-11-02'), 'Mon 2 Nov 2026');
  assert.equal(formatDate('2026-12-31'), 'Thu 31 Dec 2026');
  assert.equal(formatManila(manila('2026-11-02T19:30:00')), 'Mon 2 Nov 2026, 7:30 PM');
});

test('timeUntil', async () => {
  const { timeUntil } = await import('../src/schedule.js');
  const now = manila('2026-10-29T12:00:00');
  assert.equal(timeUntil(manila('2026-11-02T12:00:00'), now), '4 days');
  assert.equal(timeUntil(manila('2026-10-31T16:30:00'), now), '2 days, 4 hours');
  assert.equal(timeUntil(manila('2026-10-30T13:00:00'), now), '1 day, 1 hour');
  assert.equal(timeUntil(manila('2026-10-29T15:05:00'), now), '3 hours, 5 min');
  assert.equal(timeUntil(manila('2026-10-29T13:00:00'), now), '1 hour');
  assert.equal(timeUntil(manila('2026-10-29T12:12:30'), now), '12 min');
  assert.equal(timeUntil(manila('2026-10-29T12:00:30'), now), null);
  assert.equal(timeUntil(manila('2026-10-29T11:00:00'), now), null);
});
