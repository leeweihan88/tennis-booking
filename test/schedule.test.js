import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentEvent, eventStatus, formatManila } from '../src/schedule.js';

// Manila wall-clock time → UTC ms.
const manila = (s) => Date.parse(s + '+08:00');

test('Monday 2026-11-02 session times', () => {
  const ev = currentEvent(manila('2026-10-29T12:00:00')); // Thursday
  assert.equal(ev.date, '2026-11-02');
  assert.equal(ev.opensAt, manila('2026-10-28T10:00:00')); // Wednesday 10 AM
  assert.equal(ev.closesAt, manila('2026-11-02T12:00:00')); // Monday noon
  assert.equal(ev.startsAt, manila('2026-11-02T19:30:00'));
  assert.equal(ev.endsAt, manila('2026-11-02T21:30:00'));
});

test('status transitions around open and close', () => {
  const at = (s) => { const t = manila(s); return eventStatus(currentEvent(t), 0, t); };
  assert.equal(at('2026-10-28T09:59:59'), 'upcoming');
  assert.equal(at('2026-10-28T10:00:00'), 'open');
  assert.equal(at('2026-11-02T11:59:59'), 'open');
  assert.equal(at('2026-11-02T12:00:00'), 'closed');
  assert.equal(at('2026-11-02T21:29:59'), 'closed');
});

test('after the session ends, the next Monday is shown', () => {
  assert.equal(currentEvent(manila('2026-11-02T21:29:59')).date, '2026-11-02');
  assert.equal(currentEvent(manila('2026-11-02T21:30:00')).date, '2026-11-09');
  assert.equal(currentEvent(manila('2026-11-03T08:00:00')).date, '2026-11-09'); // Tuesday
  assert.equal(currentEvent(manila('2026-11-08T23:59:00')).date, '2026-11-09'); // Sunday
});

test('Manila day boundary differs from UTC', () => {
  // Monday 00:30 Manila is still Sunday in UTC.
  assert.equal(currentEvent(manila('2026-11-02T00:30:00')).date, '2026-11-02');
});

test('cancelled overrides everything', () => {
  const t = manila('2026-10-30T10:00:00');
  assert.equal(eventStatus(currentEvent(t), 1, t), 'cancelled');
});

test('formatManila', () => {
  assert.equal(formatManila(manila('2026-11-02T19:30:00')), 'Mon 2 Nov 2026, 7:30 PM');
  assert.equal(formatManila(manila('2026-10-28T10:00:00')), 'Wed 28 Oct 2026, 10:00 AM');
  assert.equal(formatManila(manila('2026-11-02T12:00:00')), 'Mon 2 Nov 2026, 12:00 PM');
});
