import { format, subDays } from "date-fns";

/*
 * Every date the app shows is in the household's timezone, never the device's.
 *
 * The server already works that way: the container's TZ (Asia/Manila, see AGENTS.md)
 * decides month boundaries, "paid this month" and the daily chart. The client used to
 * format in whatever timezone the phone was set to, so a phone abroad rendered
 * different day groups and times than the server had, failing hydration, and grouped
 * entries under days the totals did not count them in. Formatting in one named zone
 * on both sides makes the server HTML and the first client render identical.
 */

type ZonedParts = { year: string; month: string; day: string; hour: string; minute: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar and clock fields of an instant as seen in `timeZone`, to the minute. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // hourCycle h23 rather than hour12: false, which some engines render as "24" at midnight.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** The calendar day an instant falls on in `timeZone`, as `yyyy-MM-dd`. */
export function dayKey(date: Date, timeZone: string) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/**
 * A `yyyy-MM-dd` day as a Date that formats back to that same day on any device.
 * Noon keeps it clear of a midnight that a timezone offset could push it across.
 */
export function calendarDay(key: string) {
  return new Date(`${key}T12:00:00`);
}

/** Wall-clock time in `timeZone`, like "11:34 PM". Assembled by hand rather than taken
 *  from Intl, whose separator before AM/PM differs between Node and browser ICU builds. */
export function clockTime(date: Date, timeZone: string) {
  const { hour, minute } = zonedParts(date, timeZone);
  const hours = Number(hour);
  return `${hours % 12 || 12}:${minute} ${hours < 12 ? "AM" : "PM"}`;
}

/** A short date in `timeZone`, like "Sep 27". */
export function shortDate(date: Date, timeZone: string) {
  return format(calendarDay(dayKey(date, timeZone)), "MMM d");
}

/** An instant as a `datetime-local` input shows it: `timeZone`'s wall-clock time to the minute. */
export function toLocalInput(date: Date, timeZone: string) {
  const { year, month, day, hour, minute } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * `days` household days before `now`, at the household's current wall-clock time, as a
 * `datetime-local` value: what the form's Today and Yesterday buttons pick.
 *
 * Pure calendar arithmetic on the household day. Subtracting a day from the instant
 * instead (date-fns' subDays) works in the *device's* calendar, and on the day the
 * device changes for daylight saving that day is 23 or 25 hours long, so near household
 * midnight "Yesterday" landed on today or on two days ago.
 */
export function daysAgoInput(now: Date, days: number, timeZone: string) {
  const current = toLocalInput(now, timeZone);
  const day = format(subDays(calendarDay(current.slice(0, 10)), days), "yyyy-MM-dd");
  return `${day}${current.slice(10)}`;
}

/** How far `timeZone`'s wall clock runs ahead of UTC at a given instant, in ms. */
function offsetAt(instant: number, timeZone: string) {
  const { year, month, day, hour, minute } = zonedParts(new Date(instant), timeZone);
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return wall - Math.floor(instant / 60_000) * 60_000;
}

/**
 * The reverse of `toLocalInput`, for sending: a `datetime-local` value read as wall-clock
 * time in `timeZone` and pinned to an exact instant (UTC ISO), so the server never reads
 * it in a timezone of its own.
 *
 * The offset is read at a first guess and again at the result. The two only differ
 * across a daylight-saving change; Asia/Manila has none, but nothing here assumes that.
 *
 * An unparseable value (a cleared date field) is passed through untouched, so the
 * server's own validation still answers with a message rather than this throwing.
 */
export function toInstant(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return value;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(guess, timeZone)).toISOString();
}
