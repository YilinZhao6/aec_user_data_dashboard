// Period-over-period ("环比") helpers: this window vs the one right before it.
//
// Pure functions, no React — the unit tests in tests/ import this file
// directly. All times are "shifted" milliseconds (real time + the selected
// timezone offset), the same space the dashboard's charts bucket in, so a
// calendar day is [k·DAY, (k+1)·DAY).

export const DAY_MS = 24 * 60 * 60 * 1000;

export type MsWindow = { startMs: number; endMs: number };

/**
 * The window of the same length immediately before `window`.
 *
 * `spanMs` is the nominal length of the period (7 days for "last 7 days"),
 * not `endMs - startMs`: a period that ends *now* is still filling, and
 * shifting both ends by the nominal span cuts the previous period at the same
 * moment of its last day — so "today so far" is compared with "that day up to
 * the same hour", not with a whole finished day.
 */
export function previousWindow(window: MsWindow, spanMs: number): MsWindow {
  return { startMs: window.startMs - spanMs, endMs: window.endMs - spanMs };
}

/**
 * A window of whole calendar days `startKey`..`endKey` (YYYY-MM-DD, inclusive),
 * cut at `nowMs` when it reaches into the future, plus its nominal span.
 * Null when either end is missing or the range is backwards.
 */
export function dayKeyWindow(
  startKey: string | null | undefined,
  endKey: string | null | undefined,
  nowMs: number,
): (MsWindow & { spanMs: number }) | null {
  if (!startKey || !endKey) return null;
  const startMs = Date.parse(`${startKey}T00:00:00Z`);
  const endDayMs = Date.parse(`${endKey}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endDayMs) || endDayMs < startMs) return null;
  const days = Math.round((endDayMs - startMs) / DAY_MS) + 1;
  return {
    startMs,
    endMs: Math.min(endDayMs + DAY_MS - 1, nowMs),
    spanMs: days * DAY_MS,
  };
}

/** Number of timestamps inside the window, both ends inclusive. */
export function countInWindow(timesMs: readonly number[], window: MsWindow): number {
  let n = 0;
  for (const t of timesMs) if (t >= window.startMs && t <= window.endMs) n += 1;
  return n;
}

/**
 * Average of the per-calendar-day distinct active users over the days the
 * window touches — the same per-day count the DAU bars draw, averaged.
 * Days with nobody active count as zero rather than being skipped.
 */
export function averageDailyActive(
  events: readonly { userId: string; t: number }[],
  window: MsWindow,
): number {
  if (window.endMs < window.startMs) return 0;
  const firstDay = Math.floor(window.startMs / DAY_MS);
  const lastDay = Math.floor(window.endMs / DAY_MS);
  const perDay = new Map<number, Set<string>>();
  for (const e of events) {
    if (e.t < window.startMs || e.t > window.endMs) continue;
    const day = Math.floor(e.t / DAY_MS);
    let set = perDay.get(day);
    if (!set) { set = new Set(); perDay.set(day, set); }
    set.add(e.userId);
  }
  let sum = 0;
  for (const set of perDay.values()) sum += set.size;
  return sum / (lastDay - firstDay + 1);
}

/** Distinct users with at least one event inside the window. */
export function distinctActive(
  events: readonly { userId: string; t: number }[],
  window: MsWindow,
): number {
  const users = new Set<string>();
  for (const e of events) if (e.t >= window.startMs && e.t <= window.endMs) users.add(e.userId);
  return users.size;
}

/**
 * Percentage change from `previous` to `current`, or null when it has no
 * meaning: a previous value of zero (or missing) would read as ∞% and says
 * nothing, so the UI shows "—" instead.
 */
export function pctChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** "▲ 12.3%" / "▼ 8.1%" / "0.0%" / "—". */
export function formatPctChange(pct: number | null): string {
  if (pct == null) return '—';
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded).toFixed(1)}%`;
}

/** "10-31→11-06" for a window, dropping the year to stay short. */
export function formatWindowDays(window: MsWindow): string {
  const day = (ms: number) => new Date(ms).toISOString().slice(5, 10);
  return `${day(window.startMs)}→${day(window.endMs)}`;
}
