// Weekly Monday session, Philippine time (UTC+8, no daylight saving).
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const OFFSET = 8 * HOUR;

export const PLAYERS_PER_COURT = 4;
export const MAX_GUESTS = 3;

// Times are hours after Monday 00:00 Manila. Registration opens Wednesday 10:00 (5 days earlier).
const OPENS = -5 * 24 + 10;
const CLOSES = 12;
const STARTS = 19.5;
const ENDS = 21.5;

// The Monday session that has not yet ended, as of nowMs.
export function currentEvent(nowMs) {
  const local = nowMs + OFFSET;
  const today = Math.floor(local / DAY) * DAY;
  const weekday = new Date(today).getUTCDay(); // 0 = Sunday, 1 = Monday
  let monday = today + ((1 - weekday + 7) % 7) * DAY;
  if (local >= monday + ENDS * HOUR) monday += 7 * DAY;
  return eventForMonday(new Date(monday).toISOString().slice(0, 10));
}

export function eventForMonday(date) {
  const monday = Date.parse(date + 'T00:00:00Z') - OFFSET;
  return {
    date,
    opensAt: monday + OPENS * HOUR,
    closesAt: monday + CLOSES * HOUR,
    startsAt: monday + STARTS * HOUR,
    endsAt: monday + ENDS * HOUR,
  };
}

// 'upcoming' | 'open' | 'closed' | 'cancelled'
export function eventStatus(ev, cancelled, nowMs) {
  if (cancelled) return 'cancelled';
  if (nowMs < ev.opensAt) return 'upcoming';
  if (nowMs < ev.closesAt) return 'open';
  return 'closed';
}

// "Mon 3 Nov 2026, 7:30 PM" in Manila time.
export function formatManila(ms) {
  const d = new Date(ms + OFFSET);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// Today's date in Manila as 'YYYY-MM-DD'.
export function manilaDate(nowMs) {
  return new Date(nowMs + OFFSET).toISOString().slice(0, 10);
}
