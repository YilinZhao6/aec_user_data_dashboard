// Shared types, constants, and pure-function helpers used across all dashboard
// tab components. No React imports here — this file must stay side-effect free.

export const HOUR_MS = 60 * 60 * 1000;
export const MAX_RETENTION_DAY = 30;
export const KEY_RETENTION_DAYS = [1, 7, 30] as const;
export const RANKING_MAX_BARS = 10;
export const CATEGORICAL_COLORS = [
  '#4285f4', '#fb8c00', '#34a853', '#ea4335', '#a142f4',
  '#00acc1', '#f4b400', '#5e35b1', '#43a047', '#9aa0a6',
];

export type TimeRange = '12h' | '1d' | '7d' | '30d';
export type RankingMode = 'count' | 'percent';
export type MauMode = 'rolling' | 'month' | 'endDate';
export type CountEntry = { name: string; value: number };
export type RetentionPoint = {
  day: number;
  ratePct: number;
  returned: number;
  eligible: number;
  hasData: boolean;
  mature: boolean;
};
export type BreakdownGroup = {
  label: string;
  data: Record<string, CountEntry[]>;
};
export type TimezoneOption = { key: string; label: string; offsetMs: number };

export const getBrowserOffsetMs = (): number =>
  -new Date().getTimezoneOffset() * 60 * 1000;

export const BROWSER_OFFSET_MS = getBrowserOffsetMs();

export const formatGmtLabel = (offsetMs: number): string => {
  const totalMinutes = Math.round(offsetMs / (60 * 1000));
  const sign = totalMinutes >= 0 ? '+' : '−';
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0
    ? `GMT${sign}${h}`
    : `GMT${sign}${h}:${String(m).padStart(2, '0')}`;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { key: 'auto', label: `Auto · ${formatGmtLabel(BROWSER_OFFSET_MS)}`, offsetMs: BROWSER_OFFSET_MS },
  { key: 'utc', label: 'UTC', offsetMs: 0 },
  { key: 'la', label: 'GMT−8 · Los Angeles', offsetMs: -8 * HOUR_MS },
  { key: 'nyc', label: 'GMT−5 · New York', offsetMs: -5 * HOUR_MS },
  { key: 'london', label: 'GMT+0 · London', offsetMs: 0 },
  { key: 'berlin', label: 'GMT+1 · Berlin', offsetMs: 1 * HOUR_MS },
  { key: 'delhi', label: 'GMT+5:30 · Delhi', offsetMs: 5.5 * HOUR_MS },
  { key: 'beijing', label: 'GMT+8 · Beijing', offsetMs: 8 * HOUR_MS },
  { key: 'tokyo', label: 'GMT+9 · Tokyo', offsetMs: 9 * HOUR_MS },
];

export const getTzNow = (offsetMs: number): Date => new Date(Date.now() + offsetMs);

export const parseInTz = (utcString: string, offsetMs: number): Date =>
  new Date(new Date(utcString).getTime() + offsetMs);

export const toTzDateKey = (utcString: string, offsetMs: number): string =>
  new Date(new Date(utcString).getTime() + offsetMs).toISOString().slice(0, 10);

export const todayTzKey = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString().slice(0, 10);

export const addDays = (dateKey: string, days: number): string => {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const daysBetweenDateKeys = (fromKey: string, toKey: string): number => {
  const from = new Date(fromKey + 'T00:00:00Z').getTime();
  const to = new Date(toKey + 'T00:00:00Z').getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
};

export const formatDateTime = (utcString: string, offsetMs: number): string => {
  const d = new Date(new Date(utcString).getTime() + offsetMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${mi}`;
};

export const formatRatio = (ratio: number, mau: number): string =>
  mau > 0 ? ratio.toFixed(3) : '—';

export function aggregateCounts<T>(
  items: readonly T[],
  keyFn: (item: T) => string | null | undefined,
): CountEntry[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const raw = keyFn(item);
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function aggregateMostUsedFunctions(
  rows: readonly import('../../api/getUserInfo/stats').UserAnalytics[],
): CountEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const list = row.most_used_function;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item.function !== 'string') continue;
      const fn = item.function.trim();
      if (!fn) continue;
      const inc = typeof item.count === 'number' && Number.isFinite(item.count)
        ? item.count : 0;
      if (inc <= 0) continue;
      counts.set(fn, (counts.get(fn) ?? 0) + inc);
    }
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function extractStringLeaves(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(extractStringLeaves);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(extractStringLeaves);
  }
  return [];
}

export function aggregateJsonbColumn<T>(
  rows: readonly T[],
  pick: (row: T) => unknown,
): CountEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const leaves = new Set(extractStringLeaves(pick(row)));
    for (const leaf of leaves) counts.set(leaf, (counts.get(leaf) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function topBreakdownByCategory<T>(
  rows: readonly T[],
  primary: (row: T) => string | null | undefined,
  secondary: (row: T) => string | null | undefined,
  topN = 5,
): Record<string, CountEntry[]> {
  const buckets = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const pRaw = primary(row);
    if (pRaw == null) continue;
    const p = String(pRaw).trim();
    if (!p) continue;
    const sRaw = secondary(row);
    if (sRaw == null) continue;
    const s = String(sRaw).trim();
    if (!s) continue;
    let inner = buckets.get(p);
    if (!inner) { inner = new Map(); buckets.set(p, inner); }
    inner.set(s, (inner.get(s) ?? 0) + 1);
  }
  const out: Record<string, CountEntry[]> = {};
  for (const [p, inner] of buckets) {
    out[p] = Array.from(inner.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }
  return out;
}

export function withOtherBucket(
  data: CountEntry[],
  maxBars: number = RANKING_MAX_BARS,
): CountEntry[] {
  if (data.length <= maxBars) return data;
  const head = data.slice(0, maxBars);
  const tail = data.slice(maxBars);
  const otherTotal = tail.reduce((sum, e) => sum + e.value, 0);
  if (otherTotal <= 0) return head;
  return [...head, { name: `Other (${tail.length})`, value: otherTotal }];
}

export function extractLoginIpCountries(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(extractLoginIpCountries);
  if (typeof value === 'object') {
    const country = (value as Record<string, unknown>).country;
    if (typeof country === 'string') {
      const trimmed = country.trim();
      if (trimmed) return [trimmed];
    }
  }
  return [];
}

export type MeaningfulEventType =
  | 'send_message'
  | 'generate_cheatsheet'
  | 'start_deep_learn_session'
  | 'connect_canvas'
  | 'upload_file';

export type MeaningfulEvent = {
  user_id: string;
  event_type: MeaningfulEventType;
  created_at: string;
};

export function collectMeaningfulEvents(
  stats: import('../../api/getUserInfo/stats').StatsResponse,
): MeaningfulEvent[] {
  const events: MeaningfulEvent[] = [];
  for (const c of stats.conversation_history || []) {
    events.push({ user_id: c.user_id, event_type: 'send_message', created_at: c.created_at });
  }
  return events;
}
