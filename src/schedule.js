// Weekly session schedule, Philippine time (UTC+8, no daylight saving).
// The admin sets a weekly default; each session row keeps a snapshot of its own times.
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const OFFSET = 8 * 60 * MIN;
const DAY_MIN = 24 * 60;

export const PLAYERS_PER_COURT = 4;
export const MAX_GUESTS = 3;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Times are minutes after midnight. Days are 0 = Sunday … 6 = Saturday.
// Default: Monday 7:30–9:30 PM; registration opens Wednesday 10:00 AM, closes Monday 12:00 PM.
export const DEFAULT_SCHEDULE = { day: 1, start: 1170, end: 1290, opensDay: 3, opensTime: 600, closesDay: 1, closesTime: 720 };

// How many days before the session a weekday falls (0 = the session day itself).
const daysBefore = (sessionDay, d) => (sessionDay - d + 7) % 7;

// Registration window as minutes relative to the session day's midnight (opens is usually negative).
export function offsets(s) {
  return {
    opens: -daysBefore(s.day, s.opensDay) * DAY_MIN + s.opensTime,
    closes: -daysBefore(s.day, s.closesDay) * DAY_MIN + s.closesTime,
  };
}

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Registration must open before it closes, and close no later than the session starts.
export function validSchedule(s) {
  if (!s || !isInt(s.day, 0, 6) || !isInt(s.opensDay, 0, 6) || !isInt(s.closesDay, 0, 6)) return false;
  if (![s.start, s.end, s.opensTime, s.closesTime].every((m) => isInt(m, 0, DAY_MIN - 1))) return false;
  const o = offsets(s);
  return s.start < s.end && o.opens < o.closes && o.closes <= s.start;
}

// 'HH:MM' (from <input type="time">) → minutes, or null.
export function parseTime(v) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// Minutes → 'HH:MM' for <input type="time">.
export const timeValue = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// Minutes → '7:30 PM'.
export function formatTime(min) {
  const h = Math.floor(min / 60);
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Absolute times (ms) for a session row: { date, start_min, end_min, opens_offset, closes_offset }.
export function timing(row) {
  const base = Date.parse(row.date + 'T00:00:00Z') - OFFSET;
  const at = (min) => base + min * MIN;
  return {
    date: row.date,
    opensAt: at(row.opens_offset),
    closesAt: at(row.closes_offset),
    startsAt: at(row.start_min),
    endsAt: at(row.end_min),
  };
}

// The next session date on the schedule's weekday, today included.
export function nextSessionDate(nowMs, day) {
  const today = Math.floor((nowMs + OFFSET) / DAY) * DAY;
  const weekday = new Date(today).getUTCDay();
  return new Date(today + ((day - weekday + 7) % 7) * DAY).toISOString().slice(0, 10);
}

// 'upcoming' | 'open' | 'closed' | 'cancelled'
export function eventStatus(t, cancelled, nowMs) {
  if (cancelled) return 'cancelled';
  if (nowMs < t.opensAt) return 'upcoming';
  if (nowMs < t.closesAt) return 'open';
  return 'closed';
}

// Time left until a moment, rounded down: "2 days, 4 hours", "3 hours, 5 min", "12 min". null if past.
export function timeUntil(ms, nowMs) {
  const mins = Math.floor((ms - nowMs) / MIN);
  if (mins < 1) return null;
  const d = Math.floor(mins / DAY_MIN);
  const h = Math.floor((mins % DAY_MIN) / 60);
  const m = mins % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (d) return h ? `${unit(d, 'day')}, ${unit(h, 'hour')}` : unit(d, 'day');
  if (h) return m ? `${unit(h, 'hour')}, ${m} min` : unit(h, 'hour');
  return `${m} min`;
}

// The Monday that starts the calendar week (Mon–Sun) containing 'YYYY-MM-DD'.
export function weekOf(date) {
  const d = Date.parse(date + 'T00:00:00Z');
  const weekday = new Date(d).getUTCDay();
  return new Date(d - ((weekday + 6) % 7) * DAY).toISOString().slice(0, 10);
}

export const weekdayOf = (date) => WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];

// "Mon 3 Nov 2026, 7:30 PM" in Manila time.
export function formatManila(ms) {
  const d = new Date(ms + OFFSET);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// 'YYYY-MM-DD' → "Mon 2 Nov 2026" (day first, matching formatManila).
export function formatDate(date) {
  return formatManila(Date.parse(date + 'T00:00:00Z') - OFFSET).split(',')[0];
}

// Today's date in Manila as 'YYYY-MM-DD'.
export function manilaDate(nowMs) {
  return new Date(nowMs + OFFSET).toISOString().slice(0, 10);
}
