import { useEffect, useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceArea,
} from 'recharts';
import { ResponsivePie } from '@nivo/pie';
import {
  getStats,
  StatsResponse,
  UserAnalytics,
  UserPollData,
} from '../../api/getUserInfo/stats';
import { getPaidStats, PaidStatsResponse } from '../../api/getUserInfo/paid';
import PaidTab from './PaidTab';
import './DashboardEntry.css';

type TimeRange = '12h' | '1d' | '7d' | '30d';
type DashboardTab =
  | 'general'
  | 'retention'
  | 'analytics'
  | 'pollData'
  | 'topUsers'
  | 'paid';
type MauMode = 'rolling' | 'month' | 'endDate';

// Categorical color palette used by all pie / ranking charts. Order chosen so
// the first few slots already contrast well; further entries cycle through.
const CATEGORICAL_COLORS = [
  '#4285f4',
  '#fb8c00',
  '#34a853',
  '#ea4335',
  '#a142f4',
  '#00acc1',
  '#f4b400',
  '#5e35b1',
  '#43a047',
  '#9aa0a6',
];

// Maximum bars to show in a ranking chart before collapsing the rest into "Other".
const RANKING_MAX_BARS = 10;

// Cumulative retention chart spans Day 1 through Day MAX_RETENTION_DAY.
const MAX_RETENTION_DAY = 30;
const KEY_RETENTION_DAYS = [1, 7, 30] as const;

// Timezone handling. We deliberately use a numeric offset (no IANA / DST
// awareness) so that any tz can be plugged in. Every date helper below takes
// the offset as an explicit parameter so the helpers stay pure and testable.
const HOUR_MS = 60 * 60 * 1000;
const getBrowserOffsetMs = (): number =>
  -new Date().getTimezoneOffset() * 60 * 1000;

const formatGmtLabel = (offsetMs: number): string => {
  const totalMinutes = Math.round(offsetMs / (60 * 1000));
  const sign = totalMinutes >= 0 ? '+' : '−';
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0
    ? `GMT${sign}${h}`
    : `GMT${sign}${h}:${String(m).padStart(2, '0')}`;
};

const BROWSER_OFFSET_MS = getBrowserOffsetMs();
type TimezoneOption = { key: string; label: string; offsetMs: number };
const TIMEZONE_OPTIONS: TimezoneOption[] = [
  {
    key: 'auto',
    label: `Auto · ${formatGmtLabel(BROWSER_OFFSET_MS)}`,
    offsetMs: BROWSER_OFFSET_MS,
  },
  { key: 'utc', label: 'UTC', offsetMs: 0 },
  { key: 'la', label: 'GMT−8 · Los Angeles', offsetMs: -8 * HOUR_MS },
  { key: 'nyc', label: 'GMT−5 · New York', offsetMs: -5 * HOUR_MS },
  { key: 'london', label: 'GMT+0 · London', offsetMs: 0 },
  { key: 'berlin', label: 'GMT+1 · Berlin', offsetMs: 1 * HOUR_MS },
  { key: 'delhi', label: 'GMT+5:30 · Delhi', offsetMs: 5.5 * HOUR_MS },
  { key: 'beijing', label: 'GMT+8 · Beijing', offsetMs: 8 * HOUR_MS },
  { key: 'tokyo', label: 'GMT+9 · Tokyo', offsetMs: 9 * HOUR_MS },
];

// Meaningful events that count as a "return". Extend this list as the backend
// exposes more event types. Currently only `send_message` events are derivable
// from the existing API (each row in `conversation_history` is treated as one
// send_message event).
const MEANINGFUL_EVENT_TYPES = [
  'send_message',
  'generate_cheatsheet',
  'start_deep_learn_session',
  'connect_canvas',
  'upload_file',
] as const;
type MeaningfulEventType = (typeof MEANINGFUL_EVENT_TYPES)[number];

// Time-bucketing trick: shift a UTC timestamp by +offsetMs, then read its UTC
// components — they will reflect the local calendar in the selected timezone.

// "Now" as a Date whose UTC components match the selected tz.
const getTzNow = (offsetMs: number): Date => new Date(Date.now() + offsetMs);

// Parse a UTC ISO string into a Date shifted into the selected tz.
const parseInTz = (utcString: string, offsetMs: number): Date =>
  new Date(new Date(utcString).getTime() + offsetMs);

// Returns the YYYY-MM-DD calendar day in the selected tz for a UTC ISO string.
const toTzDateKey = (utcString: string, offsetMs: number): string =>
  new Date(new Date(utcString).getTime() + offsetMs).toISOString().slice(0, 10);

// "Today" YYYY-MM-DD in the selected tz.
const todayTzKey = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString().slice(0, 10);

const addDays = (dateKey: string, days: number): string => {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Number of whole calendar days between two YYYY-MM-DD keys (toKey - fromKey).
const daysBetweenDateKeys = (fromKey: string, toKey: string): number => {
  const from = new Date(fromKey + 'T00:00:00Z').getTime();
  const to = new Date(toKey + 'T00:00:00Z').getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
};

type MeaningfulEvent = {
  user_id: string;
  event_type: MeaningfulEventType;
  created_at: string;
};

// Adapts the current API surface into a flat stream of meaningful events.
// The set of allowed event types is controlled by MEANINGFUL_EVENT_TYPES; any
// future event sources (cheatsheet generations, deep-learn sessions, canvas
// connects, uploads) can be appended here once the backend exposes them.
const collectMeaningfulEvents = (stats: StatsResponse): MeaningfulEvent[] => {
  const allowed = new Set<string>(MEANINGFUL_EVENT_TYPES);
  const events: MeaningfulEvent[] = [];
  if (allowed.has('send_message')) {
    for (const c of stats.conversation_history || []) {
      events.push({
        user_id: c.user_id,
        event_type: 'send_message',
        created_at: c.created_at,
      });
    }
  }
  return events;
};

// Format a UTC ISO string as "YYYY-MM-DD HH:mm" in the selected tz.
// We avoid Intl tz APIs here because they require IANA names; offsets work for any tz.
const formatDateTime = (utcString: string, offsetMs: number): string => {
  const d = new Date(new Date(utcString).getTime() + offsetMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${mi}`;
};

const formatRatio = (ratio: number, mau: number): string =>
  mau > 0 ? ratio.toFixed(3) : '—';

type RetentionPoint = {
  day: number;        // 1..MAX_RETENTION_DAY
  ratePct: number;    // return rate as 0..100
  returned: number;   // numerator
  eligible: number;   // denominator
  hasData: boolean;   // eligible > 0
  mature: boolean;    // at least one user in cohort has had enough time
};

function SignupRangeFilter({
  start,
  end,
  minDate,
  maxDate,
  onChange,
  onReset,
}: {
  start: string;
  end: string;
  minDate?: string;
  maxDate?: string;
  onChange: (next: { start: string; end: string }) => void;
  onReset: () => void;
}) {
  return (
    <div className="signup-range-filter">
      <label className="signup-range-label">
        <span>Signup from</span>
        <input
          type="date"
          value={start}
          min={minDate}
          max={end || maxDate}
          onChange={(e) => onChange({ start: e.target.value, end })}
        />
      </label>
      <label className="signup-range-label">
        <span>to</span>
        <input
          type="date"
          value={end}
          min={start || minDate}
          max={maxDate}
          onChange={(e) => onChange({ start, end: e.target.value })}
        />
      </label>
      <button type="button" className="signup-range-reset" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div className="time-range-selector">
      {(['12h', '1d', '7d', '30d'] as TimeRange[]).map((range) => (
        <button
          key={range}
          className={`time-range-btn ${value === range ? 'active' : ''}`}
          onClick={() => onChange(range)}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

function RetentionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RetentionPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '12px',
        color: '#333333',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Day {p.day}</div>
      {!p.mature ? (
        <div style={{ color: '#999999' }}>
          Data not available · no cohort user has reached this day yet
        </div>
      ) : p.hasData ? (
        <>
          <div>
            Return rate: <strong>{p.ratePct.toFixed(1)}%</strong>
          </div>
          <div style={{ color: '#666666', marginTop: 2 }}>
            {p.returned} / {p.eligible} eligible users active on this day
          </div>
        </>
      ) : (
        <div style={{ color: '#999999' }}>No eligible users yet</div>
      )}
    </div>
  );
}

function CumulativeRetentionChart({ data }: { data: RetentionPoint[] }) {
  const keyDaySet = new Set<number>(KEY_RETENTION_DAYS);
  const isKeyIndex = (index: number) =>
    index >= 0 &&
    index < data.length &&
    keyDaySet.has(data[index].day) &&
    data[index].mature;

  // Mature days = days for which at least one cohort user has had enough time.
  // The first immature day starts the "data not available" shaded region.
  let firstImmatureDay: number | null = null;
  for (const p of data) {
    if (!p.mature) {
      firstImmatureDay = p.day;
      break;
    }
  }

  // Build a parallel series that only carries values on mature days, so the
  // line itself does not extend into the shaded region.
  const lineData = data.map((p) => ({
    ...p,
    matureRatePct: p.mature ? p.ratePct : null,
  }));

  const renderDot = (props: {
    cx?: number;
    cy?: number;
    index?: number;
    payload?: RetentionPoint;
  }) => {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null || index == null) return <g />;
    if (!payload || !payload.mature) return <g />;
    if (isKeyIndex(index)) {
      return (
        <circle
          key={`dot-${index}`}
          cx={cx}
          cy={cy}
          r={5.5}
          fill="#1a1a1a"
          stroke="#ffffff"
          strokeWidth={2}
        />
      );
    }
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill="#bbbbbb"
      />
    );
  };

  const renderKeyDayLabel = (props: {
    x?: number;
    y?: number;
    value?: number;
    index?: number;
  }) => {
    const { x, y, value, index } = props;
    if (x == null || y == null || value == null || index == null) return <g />;
    if (!isKeyIndex(index)) return <g />;
    return (
      <text
        x={x}
        y={Number(y) - 12}
        fill="#1a1a1a"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
      >
        {Number(value).toFixed(1)}%
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart
        data={lineData}
        margin={{ top: 28, right: 24, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="day"
          type="number"
          domain={[1, MAX_RETENTION_DAY]}
          ticks={[1, 7, 14, 21, 30]}
          tickFormatter={(v: number) => `D${v}`}
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
        />
        <Tooltip content={<RetentionTooltip />} />
        {firstImmatureDay !== null && (
          <ReferenceArea
            x1={firstImmatureDay}
            x2={MAX_RETENTION_DAY}
            y1={0}
            y2={100}
            fill="#999999"
            fillOpacity={0.12}
            stroke="#cccccc"
            strokeOpacity={0.5}
            strokeDasharray="4 4"
            label={{
              value: 'Data not available',
              fill: '#888888',
              fontSize: 12,
              position: 'insideTop',
            }}
            ifOverflow="extendDomain"
          />
        )}
        <Line
          type="monotone"
          dataKey="matureRatePct"
          stroke="#333333"
          strokeWidth={2}
          dot={renderDot}
          activeDot={{ r: 5, fill: '#1a1a1a' }}
          isAnimationActive={false}
          connectNulls={false}
        >
          <LabelList content={renderKeyDayLabel} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatLineChart({
  data,
  dataKey,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="time"
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
        />
        <YAxis
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#333333', marginBottom: '4px' }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke="#333333"
          strokeWidth={2}
          dot={{ fill: '#333333', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Stacked bar chart in Google-style: blue (new) at the bottom, orange
// (returning) stacked on top. Used by both "Active Users" and "Conversations"
// when their mode is `bar`. The bucket total is rendered on top of each bar.
function StackedBarChart({
  data,
  newKey,
  returningKey,
  totalKey,
  newLabel,
  returningLabel,
}: {
  data: Array<Record<string, string | number>>;
  newKey: string;
  returningKey: string;
  totalKey: string;
  newLabel: string;
  returningLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 24, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="time"
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
        />
        <YAxis
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#333333', marginBottom: '4px' }}
          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          iconType="square"
        />
        <Bar
          dataKey={newKey}
          stackId="a"
          fill="#4285f4"
          name={newLabel}
          isAnimationActive={false}
        />
        <Bar
          dataKey={returningKey}
          stackId="a"
          fill="#fb8c00"
          name={returningLabel}
          isAnimationActive={false}
        >
          <LabelList
            dataKey={totalKey}
            position="top"
            fill="#333333"
            fontSize={11}
            fontWeight={500}
            formatter={(value: number | string) =>
              typeof value === 'number' && value > 0 ? value : ''
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

type CountEntry = { name: string; value: number };

// Tally `key -> count` from a list, dropping null/empty keys, then sort
// descending by count. Used as the input to every pie / ranking chart below.
function aggregateCounts<T>(
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

// Aggregate per-user `most_used_function` arrays into a single ranking by
// summing each function's count across all users.
function aggregateMostUsedFunctions(rows: readonly UserAnalytics[]): CountEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const list = row.most_used_function;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item.function !== 'string') continue;
      const fn = item.function.trim();
      if (!fn) continue;
      const inc = typeof item.count === 'number' && Number.isFinite(item.count)
        ? item.count
        : 0;
      if (inc <= 0) continue;
      counts.set(fn, (counts.get(fn) ?? 0) + inc);
    }
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// `user_acquisition_sources` is jsonb of unknown shape (could be
// `["google", "friend"]`, `{primary: "google"}`, or a bare string), so we
// walk the value defensively and pull out every string leaf.
function extractStringLeaves(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractStringLeaves);
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(
      extractStringLeaves,
    );
  }
  return [];
}

// Aggregate a jsonb column into a count ranking. Each user contributes their
// distinct string leaves so a user listing the same IP twice doesn't double-count.
function aggregateJsonbColumn<T>(
  rows: readonly T[],
  pick: (row: T) => unknown,
): CountEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const leaves = new Set(extractStringLeaves(pick(row)));
    for (const leaf of leaves) {
      counts.set(leaf, (counts.get(leaf) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// For each value of `primary`, return the top-N values of `secondary` by row
// count, sorted descending. Used to power hover-breakdowns like "Top 5
// countries per identity" on ranking charts.
function topBreakdownByCategory<T>(
  rows: readonly T[],
  primary: (row: T) => string | null | undefined,
  secondary: (row: T) => string | null | undefined,
  topN: number = 5,
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
    if (!inner) {
      inner = new Map();
      buckets.set(p, inner);
    }
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

// Trim a long ranking down to the top N entries plus a synthetic "Other" bucket
// summing the long tail. Keeps charts legible without losing volume.
function withOtherBucket(
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

// Pull the `country` field out of a single login_ip jsonb value. The column
// is documented as a single object like
//   { isp, city, region, country, latitude, timezone, longitude, country_code }
// but we also tolerate arrays of such objects in case the schema ever changes.
function extractLoginIpCountries(value: unknown): string[] {
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

// Bar-chart palette used by the nivo pie. Mirrors CATEGORICAL_COLORS but is
// a regular array so nivo's `colors={...}` prop can cycle through it.
const PIE_COLORS = CATEGORICAL_COLORS;

// Donut chart rendered with nivo. Accepts the full ranking; if it's longer
// than `topN` we keep the top slices and merge the rest into a single "Other"
// slice so the visual stays readable. The legend below shows topN entries
// (plus Other) with their absolute count and percent share.
function CountPieChart({
  data,
  topN = 15,
  height = 460,
}: {
  data: CountEntry[];
  topN?: number;
  height?: number;
}) {
  if (data.length === 0) {
    return <div className="empty-state">No data available</div>;
  }
  const total = data.reduce((sum, e) => sum + e.value, 0);
  // sliced = top entries (sorted desc) + optional "Other (N)" bucket.
  const sliced: CountEntry[] = (() => {
    if (data.length <= topN) return data;
    const head = data.slice(0, topN);
    const tail = data.slice(topN);
    const otherTotal = tail.reduce((s, e) => s + e.value, 0);
    if (otherTotal <= 0) return head;
    return [...head, { name: `Other (${tail.length})`, value: otherTotal }];
  })();

  // Nivo wants `id` to be unique. Names from the source already are, so we
  // map 1:1.
  const pieData = sliced.map((e) => ({
    id: e.name,
    label: e.name,
    value: e.value,
  }));

  const colorFor = (idx: number) => PIE_COLORS[idx % PIE_COLORS.length];
  const formatPct = (value: number) =>
    total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';

  return (
    <div className="pie-chart-block">
      <div className="pie-chart-canvas" style={{ height }}>
        <ResponsivePie
          data={pieData}
          margin={{ top: 24, right: 24, bottom: 24, left: 24 }}
          innerRadius={0.55}
          padAngle={0.6}
          cornerRadius={3}
          activeOuterRadiusOffset={10}
          colors={pieData.map((_, i) => colorFor(i))}
          borderWidth={2}
          borderColor="#ffffff"
          enableArcLinkLabels={true}
          arcLinkLabelsSkipAngle={12}
          arcLinkLabelsTextColor="#333333"
          arcLinkLabelsThickness={1.5}
          arcLinkLabelsColor={{ from: 'color' }}
          arcLinkLabel={(d) => `${d.id}`}
          arcLabelsSkipAngle={14}
          arcLabelsTextColor="#ffffff"
          arcLabel={(d) => formatPct(d.value)}
          valueFormat={(v) => `${v} (${formatPct(v)})`}
          theme={{
            tooltip: {
              container: {
                background: '#ffffff',
                color: '#333333',
                fontSize: 12,
                border: '1px solid #e5e5e5',
                borderRadius: 8,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
              },
            },
            labels: {
              text: { fontSize: 12, fontWeight: 600 },
            },
          }}
          animate={false}
        />
      </div>
      <ul className="pie-legend">
        {sliced.map((entry, idx) => (
          <li key={entry.name} className="pie-legend-item">
            <span
              className="pie-legend-swatch"
              style={{ backgroundColor: colorFor(idx) }}
            />
            <span className="pie-legend-name" title={entry.name}>
              {entry.name}
            </span>
            <span className="pie-legend-value">
              {entry.value} · {formatPct(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RankingMode = 'count' | 'percent';

// One named breakdown group attached to a ranking. `data` maps the bar's
// `name` (e.g. "student") to its top-N rows (e.g. top countries among
// students). Multiple groups can be passed — they render stacked in the
// tooltip with a divider between each.
type BreakdownGroup = {
  label: string;
  data: Record<string, CountEntry[]>;
};

// Custom recharts tooltip: shows count + percent for the hovered bar, and any
// number of optional secondary breakdowns (e.g. "Top 5 countries", "Top 5
// nationalities") stacked beneath. Empty groups for the hovered bar are
// silently skipped so synthetic "Other (N)" bars stay clean.
function RankingTooltipContent({
  active,
  payload,
  total,
  valueLabel,
  breakdownGroups,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CountEntry }>;
  total: number;
  valueLabel: string;
  breakdownGroups?: BreakdownGroup[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const raw = datum.value;
  const pct = total > 0 ? (raw / total) * 100 : 0;
  const visibleGroups = (breakdownGroups ?? [])
    .map((g) => ({ label: g.label, rows: g.data[datum.name] ?? [] }))
    .filter((g) => g.rows.length > 0);
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        fontSize: 12,
        padding: '8px 10px',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
        minWidth: 200,
        maxWidth: 320,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#222' }}>
        {datum.name}
      </div>
      <div style={{ color: '#333' }}>
        {valueLabel}: <strong>{raw}</strong> ({pct.toFixed(1)}%)
      </div>
      {visibleGroups.map((group) => {
        const groupTotal = group.rows.reduce((s, e) => s + e.value, 0);
        return (
          <div
            key={group.label}
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid #eee',
            }}
          >
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
              {group.label}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {group.rows.map((b) => {
                const bPct =
                  groupTotal > 0 ? (b.value / groupTotal) * 100 : 0;
                return (
                  <li
                    key={b.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      color: '#333',
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={b.name}
                    >
                      {b.name}
                    </span>
                    <span style={{ color: '#666', flexShrink: 0 }}>
                      {b.value} · {bPct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RankingBarChart({
  data,
  mode = 'count',
  valueLabel = 'Count',
  breakdownGroups,
}: {
  data: CountEntry[];
  mode?: RankingMode;
  valueLabel?: string;
  // Optional per-bar secondary breakdowns (e.g. top-5 countries + top-5
  // nationalities for each identity). Each group renders as its own
  // labelled section inside the tooltip when the hovered bar's `name`
  // appears in that group's data.
  breakdownGroups?: BreakdownGroup[];
}) {
  if (data.length === 0) {
    return <div className="empty-state">No data available</div>;
  }
  // Horizontal bar height scales with row count so dense rankings stay readable.
  const height = Math.max(220, data.length * 36 + 40);
  const total = data.reduce((sum, e) => sum + e.value, 0);
  const isPercent = mode === 'percent' && total > 0;
  // Inject a `display` field used by the bar; keeps `value` as the raw count
  // so the tooltip can show both count and percent regardless of mode.
  const chartData = data.map((e) => ({
    ...e,
    display: isPercent ? (e.value / total) * 100 : e.value,
  }));
  const formatBarValue = (v: number) =>
    isPercent ? `${v.toFixed(1)}%` : String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 64, bottom: 8, left: 16 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
        <XAxis
          type="number"
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#666666' }}
          allowDecimals={isPercent}
          domain={isPercent ? [0, 'auto'] : undefined}
          tickFormatter={(v: number) =>
            isPercent ? `${Number(v).toFixed(0)}%` : String(v)
          }
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#666666"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#333333' }}
          width={140}
          interval={0}
        />
        <Tooltip
          content={
            <RankingTooltipContent
              total={total}
              valueLabel={valueLabel}
              breakdownGroups={breakdownGroups}
            />
          }
          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
        />
        <Bar dataKey="display" fill="#4285f4" isAnimationActive={false}>
          <LabelList
            dataKey="display"
            position="right"
            fill="#333333"
            fontSize={11}
            fontWeight={500}
            formatter={(v: number | string) =>
              typeof v === 'number' ? formatBarValue(v) : String(v)
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Wraps a ranking bar chart with: title/subtitle, a "N data points · M categories"
// counter, and a Count / Percentage toggle. Each section keeps its own toggle
// state so users can flip individual rankings independently.
function RankingSection({
  title,
  subtitle,
  data,
  valueLabel = 'Count',
  pointLabel = 'data points',
  breakdownGroups,
}: {
  title: string;
  subtitle?: string;
  data: CountEntry[];
  valueLabel?: string;
  pointLabel?: string;
  // Optional per-bar secondary breakdowns rendered inside the tooltip.
  // Pass multiple groups (e.g. countries + nationalities) to stack them.
  breakdownGroups?: BreakdownGroup[];
}) {
  const [mode, setMode] = useState<RankingMode>('count');
  const total = data.reduce((sum, e) => sum + e.value, 0);
  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title-group">
          <h2>{title}</h2>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
          <p className="section-meta">
            <strong>{total.toLocaleString()}</strong> {pointLabel} ·{' '}
            <strong>{data.length}</strong> categor
            {data.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="stat-segmented">
          <button
            type="button"
            className={`stat-segmented-btn ${mode === 'count' ? 'active' : ''}`}
            onClick={() => setMode('count')}
          >
            Count
          </button>
          <button
            type="button"
            className={`stat-segmented-btn ${mode === 'percent' ? 'active' : ''}`}
            onClick={() => setMode('percent')}
          >
            Percentage
          </button>
        </div>
      </div>
      <div className="chart-container">
        <RankingBarChart
          data={data}
          mode={mode}
          valueLabel={valueLabel}
          breakdownGroups={breakdownGroups}
        />
      </div>
    </div>
  );
}

export default function DashboardEntry() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  // Paid-tab data is fetched in parallel with the main stats. Failures are
  // non-fatal (rest of the dashboard still works) and surfaced inline only
  // when the user opens the Paid tab.
  const [paidStats, setPaidStats] = useState<PaidStatsResponse | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('general');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [growthMode, setGrowthMode] = useState<'net' | 'total'>('net');
  const [activeUsersMode, setActiveUsersMode] = useState<'line' | 'bar'>('line');
  const [conversationsMode, setConversationsMode] = useState<'line' | 'bar'>('line');
  const [signupRange, setSignupRange] = useState<{ start: string; end: string }>(
    { start: '', end: '' }
  );
  const [retentionMode, setRetentionMode] = useState<'exact' | 'rolling'>('exact');

  // Timezone: defaults to "auto" (browser-detected). All calendar-day math goes
  // through tzOffsetMs so changing this rebins everything consistently.
  const [tzKey, setTzKey] = useState<string>('auto');
  const tzOffsetMs = useMemo<number>(
    () =>
      TIMEZONE_OPTIONS.find((o) => o.key === tzKey)?.offsetMs ??
      BROWSER_OFFSET_MS,
    [tzKey],
  );

  // DAU is computed for a single calendar day, defaulting to "today" in the
  // browser-detected tz (the dashboard's initial timezone).
  const [dauDate, setDauDate] = useState<string>(() =>
    todayTzKey(BROWSER_OFFSET_MS),
  );

  // MAU window can be chosen in three modes:
  //   - rolling : last 30 days ending today
  //   - month   : a specific calendar month (YYYY-MM)
  //   - endDate : 30 days ending at a chosen date (inclusive)
  const [mauMode, setMauMode] = useState<MauMode>('rolling');
  const [mauMonth, setMauMonth] = useState<string>(() =>
    todayTzKey(BROWSER_OFFSET_MS).slice(0, 7),
  );
  const [mauEndDate, setMauEndDate] = useState<string>(() =>
    todayTzKey(BROWSER_OFFSET_MS),
  );

  // Top-users window. Defaults to the last 30 days in the browser tz; the
  // bounds get clamped against the actual data extent once stats arrive.
  const [topUsersRange, setTopUsersRange] = useState<{
    start: string;
    end: string;
  }>(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS);
    return { start: addDays(end, -29), end };
  });
  const [topUsersMode, setTopUsersMode] = useState<RankingMode>('count');

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        setLoading(true);
        // Fetch /stats and /paid in parallel. The Paid tab needs both
        // (paid for subscriptions, stats for emails / analytics / activity).
        // We tolerate the paid endpoint failing — the rest of the dashboard
        // still renders; the Paid tab will surface its own error.
        const [statsResult, paidResult] = await Promise.allSettled([
          getStats(),
          getPaidStats(),
        ]);
        if (cancelled) return;

        if (statsResult.status === 'fulfilled') {
          setStats(statsResult.value);
          setError(null);
        } else {
          setError(
            statsResult.reason instanceof Error
              ? statsResult.reason.message
              : 'Failed to fetch stats',
          );
        }

        if (paidResult.status === 'fulfilled') {
          setPaidStats(paidResult.value);
          setPaidError(null);
        } else {
          setPaidError(
            paidResult.reason instanceof Error
              ? paidResult.reason.message
              : 'Failed to fetch paid stats',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // user_id -> Set of calendar days (in selected tz) the user had any conversation on.
  // Treated as the activity-event source for DAU/MAU/retention.
  const userActivityDays = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!stats) return map;
    for (const conv of stats.conversation_history || []) {
      const day = toTzDateKey(conv.created_at, tzOffsetMs);
      let set = map.get(conv.user_id);
      if (!set) {
        set = new Set();
        map.set(conv.user_id, set);
      }
      set.add(day);
    }
    return map;
  }, [stats, tzOffsetMs]);

  // Resolve the selected MAU window into a concrete inclusive [start, end] range
  // plus a human label. All three modes collapse into the same downstream logic.
  const mauWindow = useMemo<{ start: string; end: string; label: string }>(() => {
    if (mauMode === 'rolling') {
      const today = todayTzKey(tzOffsetMs);
      return { start: addDays(today, -29), end: today, label: 'Last 30 days' };
    }
    if (mauMode === 'month') {
      const [y, m] = mauMonth.split('-').map(Number);
      if (!y || !m) {
        const today = todayTzKey(tzOffsetMs);
        return { start: today, end: today, label: 'Invalid month' };
      }
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return {
        start,
        end,
        label: `${y}-${String(m).padStart(2, '0')}`,
      };
    }
    const end = mauEndDate || todayTzKey(tzOffsetMs);
    return {
      start: addDays(end, -29),
      end,
      label: `30 days ending ${end}`,
    };
  }, [mauMode, mauMonth, mauEndDate, tzOffsetMs]);

  // DAU for the selected day: unique users with any conversation on that day,
  // plus the number of users who signed up on that day.
  const dauStats = useMemo(() => {
    if (!stats) return { activeUsers: 0, newSignups: 0 };
    const day = dauDate;
    const activeSet = new Set<string>();
    for (const c of stats.conversation_history || []) {
      if (toTzDateKey(c.created_at, tzOffsetMs) === day) activeSet.add(c.user_id);
    }
    let newSignups = 0;
    for (const u of stats.all_users_timeline || []) {
      if (toTzDateKey(u.created_at, tzOffsetMs) === day) newSignups += 1;
    }
    return { activeUsers: activeSet.size, newSignups };
  }, [stats, dauDate, tzOffsetMs]);

  // MAU over the resolved window plus signup count in the same window.
  const mauStats = useMemo(() => {
    if (!stats) return { activeUsers: 0, newSignups: 0 };
    const { start, end } = mauWindow;
    const activeSet = new Set<string>();
    for (const c of stats.conversation_history || []) {
      const day = toTzDateKey(c.created_at, tzOffsetMs);
      if (day >= start && day <= end) activeSet.add(c.user_id);
    }
    let newSignups = 0;
    for (const u of stats.all_users_timeline || []) {
      const day = toTzDateKey(u.created_at, tzOffsetMs);
      if (day >= start && day <= end) newSignups += 1;
    }
    return { activeUsers: activeSet.size, newSignups };
  }, [stats, mauWindow, tzOffsetMs]);

  const dauMauRatio =
    mauStats.activeUsers > 0
      ? dauStats.activeUsers / mauStats.activeUsers
      : 0;

  // Min / max signup day actually present in the data, used as date-picker bounds.
  const signupBounds = useMemo<{ min: string; max: string } | null>(() => {
    if (!stats?.all_users_timeline?.length) return null;
    let min: string | null = null;
    let max: string | null = null;
    for (const u of stats.all_users_timeline) {
      const d = toTzDateKey(u.created_at, tzOffsetMs);
      if (min === null || d < min) min = d;
      if (max === null || d > max) max = d;
    }
    return min && max ? { min, max } : null;
  }, [stats, tzOffsetMs]);

  // Day-N retention restricted to the selected signup cohort.
  //
  // exact   – returned(N) = active on EXACTLY Day N after signup
  // rolling – returned(N) = active on Day N or any later day (ever returned
  //           after reaching N days since signup)
  //
  // eligible(N) = cohort users whose signup is at least N days ago.
  // mature(N)   = at least one cohort user has been observed long enough.
  const cumulativeRetention = useMemo<RetentionPoint[]>(() => {
    if (!stats) return [];
    const today = todayTzKey(tzOffsetMs);
    const start = signupRange.start || null;
    const end = signupRange.end || null;

    const signupDayByUser = new Map<string, string>();
    for (const u of stats.all_users_timeline || []) {
      const day = toTzDateKey(u.created_at, tzOffsetMs);
      if (start && day < start) continue;
      if (end && day > end) continue;
      if (!signupDayByUser.has(u.user_id)) signupDayByUser.set(u.user_id, day);
    }

    // For each cohort user, collect "days since signup" for every activity.
    // Day 0 is excluded. For rolling we only need the MAX diff (furthest return).
    const activeOnDayByUser = new Map<string, Set<number>>();
    for (const e of collectMeaningfulEvents(stats)) {
      const signupDay = signupDayByUser.get(e.user_id);
      if (!signupDay) continue;
      const diff = daysBetweenDateKeys(
        signupDay,
        toTzDateKey(e.created_at, tzOffsetMs),
      );
      if (diff < 1) continue;
      let set = activeOnDayByUser.get(e.user_id);
      if (!set) {
        set = new Set();
        activeOnDayByUser.set(e.user_id, set);
      }
      set.add(diff);
    }

    const users: Array<{ userId: string; daysSinceSignup: number }> = [];
    let maxDaysSinceSignup = -1;
    for (const [userId, signupDay] of signupDayByUser) {
      const daysSinceSignup = daysBetweenDateKeys(signupDay, today);
      users.push({ userId, daysSinceSignup });
      if (daysSinceSignup > maxDaysSinceSignup) maxDaysSinceSignup = daysSinceSignup;
    }

    const points: RetentionPoint[] = [];
    for (let n = 1; n <= MAX_RETENTION_DAY; n++) {
      let eligible = 0;
      let returned = 0;
      for (const u of users) {
        if (u.daysSinceSignup < n) continue;
        eligible += 1;
        const days = activeOnDayByUser.get(u.userId);
        if (!days) continue;
        if (retentionMode === 'exact') {
          if (days.has(n)) returned += 1;
        } else {
          // Rolling: any activity on day >= n counts
          let hit = false;
          for (const d of days) {
            if (d >= n) { hit = true; break; }
          }
          if (hit) returned += 1;
        }
      }
      points.push({
        day: n,
        ratePct: eligible > 0 ? (returned / eligible) * 100 : 0,
        returned,
        eligible,
        hasData: eligible > 0,
        mature: maxDaysSinceSignup >= n,
      });
    }
    return points;
  }, [stats, signupRange, retentionMode, tzOffsetMs]);

  const retentionAt = (n: number): RetentionPoint =>
    cumulativeRetention[n - 1] ?? {
      day: n,
      ratePct: 0,
      returned: 0,
      eligible: 0,
      hasData: false,
      mature: false,
    };

  // Time-bucketed series powering all three line charts.
  const chartData = useMemo(() => {
    type ActiveUserPoint = {
      time: string;
      activeUsers: number;
      newUsers: number;
      returningUsers: number;
    };
    type ConversationPoint = {
      time: string;
      conversations: number;
      newUserConversations: number;
      returningUserConversations: number;
    };
    const empty = {
      userChart: [] as Array<{ time: string; users: number }>,
      userTotalChart: [] as Array<{ time: string; users: number }>,
      conversationChart: [] as ConversationPoint[],
      activeUserChart: [] as ActiveUserPoint[],
    };
    if (!stats) return empty;

    const now = getTzNow(tzOffsetMs);
    let startTime: Date;
    let intervalMs: number;
    let formatLabel: (date: Date) => string;

    // `date` is already tz-shifted; UTC components = local components.
    const formatHourLabel = (date: Date) => {
      const h = String(date.getUTCHours()).padStart(2, '0');
      const m = String(date.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    };
    const formatDayLabel = (date: Date) => {
      const mo = date.getUTCMonth() + 1;
      const d = date.getUTCDate();
      return `${mo}/${d}`;
    };

    switch (timeRange) {
      case '12h':
        startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        intervalMs = 60 * 60 * 1000;
        formatLabel = formatHourLabel;
        break;
      case '1d':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        intervalMs = 2 * 60 * 60 * 1000;
        formatLabel = formatHourLabel;
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        intervalMs = 24 * 60 * 60 * 1000;
        formatLabel = formatDayLabel;
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        intervalMs = 24 * 60 * 60 * 1000;
        formatLabel = formatDayLabel;
        break;
    }

    const bucketKey = (t: number) => Math.floor(t / intervalMs) * intervalMs;

    type Bucket = {
      label: string;
      users: number;
      conversations: number;
      newUserConversations: number;
      returningUserConversations: number;
      newActiveUsers: Set<string>;
      returningActiveUsers: Set<string>;
    };
    const buckets = new Map<number, Bucket>();

    let cursor = new Date(startTime);
    while (cursor <= now) {
      const key = bucketKey(cursor.getTime());
      if (!buckets.has(key)) {
        buckets.set(key, {
          label: formatLabel(cursor),
          users: 0,
          conversations: 0,
          newUserConversations: 0,
          returningUserConversations: 0,
          newActiveUsers: new Set(),
          returningActiveUsers: new Set(),
        });
      }
      cursor = new Date(cursor.getTime() + intervalMs);
    }

    // user_id -> signup timestamp (already shifted to selected tz). Used to
    // classify each conversation as "new user" (signup falls in same bucket
    // as the conversation) or "returning user" (signup is older).
    const userSignupTime = new Map<string, number>();
    let baseTotal = 0;
    for (const user of stats.all_users_timeline || []) {
      const d = parseInTz(user.created_at, tzOffsetMs);
      if (!userSignupTime.has(user.user_id)) {
        userSignupTime.set(user.user_id, d.getTime());
      }
      if (d < startTime) {
        baseTotal += 1;
        continue;
      }
      if (d > now) continue;
      const b = buckets.get(bucketKey(d.getTime()));
      if (b) b.users += 1;
    }

    for (const conv of stats.conversation_history || []) {
      const d = parseInTz(conv.created_at, tzOffsetMs);
      if (d < startTime || d > now) continue;
      const bKey = bucketKey(d.getTime());
      const b = buckets.get(bKey);
      if (!b) continue;
      b.conversations += 1;

      const signupTs = userSignupTime.get(conv.user_id);
      const isNewInBucket =
        signupTs != null && signupTs >= bKey && signupTs < bKey + intervalMs;
      if (isNewInBucket) {
        b.newUserConversations += 1;
        b.newActiveUsers.add(conv.user_id);
      } else {
        b.returningUserConversations += 1;
        b.returningActiveUsers.add(conv.user_id);
      }
    }

    const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
    let runningTotal = baseTotal;
    const userTotalChart: Array<{ time: string; users: number }> = [];
    for (const [, b] of sorted) {
      runningTotal += b.users;
      userTotalChart.push({ time: b.label, users: runningTotal });
    }
    return {
      userChart: sorted.map(([, b]) => ({ time: b.label, users: b.users })),
      userTotalChart,
      conversationChart: sorted.map(([, b]) => ({
        time: b.label,
        conversations: b.conversations,
        newUserConversations: b.newUserConversations,
        returningUserConversations: b.returningUserConversations,
      })),
      activeUserChart: sorted.map(([, b]) => ({
        time: b.label,
        activeUsers: b.newActiveUsers.size + b.returningActiveUsers.size,
        newUsers: b.newActiveUsers.size,
        returningUsers: b.returningActiveUsers.size,
      })),
    };
  }, [stats, timeRange, tzOffsetMs]);

  // Pre-compute every aggregation the Analytics tab renders, so the heavy
  // map work only runs when stats actually change.
  const analyticsData = useMemo(() => {
    const rows: UserAnalytics[] = stats?.user_analytics ?? [];
    return {
      rows,
      country: aggregateCounts(rows, (r) => r.country),
      nationality: aggregateCounts(rows, (r) => r.nationality),
      identity: withOtherBucket(aggregateCounts(rows, (r) => r.identity)),
      initialUsedFunction: withOtherBucket(
        aggregateCounts(rows, (r) => r.initial_used_function),
      ),
      mostUsedFunction: withOtherBucket(aggregateMostUsedFunctions(rows)),
      // Per-bar hover breakdowns: top-5 countries AND top-5 nationalities
      // among users with each identity / initial-used-function. Looked up
      // by bar `name` in the ranking tooltip; the synthetic "Other (N)"
      // bucket has no entry so its tooltip just shows the standard
      // count + percent.
      identityCountries: topBreakdownByCategory(
        rows,
        (r) => r.identity,
        (r) => r.country,
      ),
      identityNationalities: topBreakdownByCategory(
        rows,
        (r) => r.identity,
        (r) => r.nationality,
      ),
      initialUsedFunctionCountries: topBreakdownByCategory(
        rows,
        (r) => r.initial_used_function,
        (r) => r.country,
      ),
      initialUsedFunctionNationalities: topBreakdownByCategory(
        rows,
        (r) => r.initial_used_function,
        (r) => r.nationality,
      ),
    };
  }, [stats]);

  // Same shape for the Poll Data tab. login_ip is a single jsonb object per
  // user; we only care about its `country` field for the ranking.
  const pollData = useMemo(() => {
    const rows: UserPollData[] = stats?.user_poll_data ?? [];
    const loginCountries = (() => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const seen = new Set(extractLoginIpCountries(row.login_ip));
        for (const c of seen) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    })();
    return {
      rows,
      acquisitionSources: withOtherBucket(
        aggregateJsonbColumn(rows, (r) => r.user_acquisition_sources),
      ),
      loginCountries: withOtherBucket(loginCountries),
    };
  }, [stats]);

  // Min / max conversation day in the data, used as date-picker bounds for
  // the Top Users window.
  const conversationBounds = useMemo<{ min: string; max: string } | null>(() => {
    if (!stats?.conversation_history?.length) return null;
    let min: string | null = null;
    let max: string | null = null;
    for (const c of stats.conversation_history) {
      const d = toTzDateKey(c.created_at, tzOffsetMs);
      if (min === null || d < min) min = d;
      if (max === null || d > max) max = d;
    }
    return min && max ? { min, max } : null;
  }, [stats, tzOffsetMs]);

  // Top users by conversation count inside [start, end]. Each user becomes a
  // ranking row with a friendly label (email/username if known, else a short
  // user_id) and an `Other` bucket collapses the long tail beyond top 20.
  const topUsers = useMemo(() => {
    const empty = { data: [] as CountEntry[], totalConversations: 0, activeUsers: 0 };
    if (!stats) return empty;
    const { start, end } = topUsersRange;

    // Friendly label lookup: email > username > truncated id.
    // Prefer all_users_basic (covers every user); fall back to latest_users
    // for older backends that don't return all_users_basic yet. Existing
    // entries are never overwritten so the "best" label wins.
    const labelByUser = new Map<string, string>();
    const addLabel = (uid: string, label: string | null | undefined) => {
      if (!uid) return;
      const trimmed = label?.trim();
      if (!trimmed) return;
      if (!labelByUser.has(uid)) labelByUser.set(uid, trimmed);
    };
    for (const u of stats.all_users_basic || []) {
      addLabel(u.user_id, u.email || u.username);
    }
    for (const u of stats.latest_users || []) {
      addLabel(u.user_id, u.email || u.username);
    }
    const friendly = (uid: string): string =>
      labelByUser.get(uid) ?? `${uid.slice(0, 8)}…`;

    const counts = new Map<string, number>();
    let totalConversations = 0;
    for (const c of stats.conversation_history || []) {
      const day = toTzDateKey(c.created_at, tzOffsetMs);
      if (start && day < start) continue;
      if (end && day > end) continue;
      counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
      totalConversations += 1;
    }

    const ranked: CountEntry[] = Array.from(counts.entries())
      .map(([uid, value]) => ({ name: friendly(uid), value }))
      .sort((a, b) => b.value - a.value);

    return {
      data: withOtherBucket(ranked, 20),
      totalConversations,
      activeUsers: counts.size,
    };
  }, [stats, topUsersRange, tzOffsetMs]);

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">
          <h3>Error Loading Dashboard</h3>
          <p>{error}</p>
          <div className="error-tips">
            <p>
              <strong>Please check:</strong>
            </p>
            <ul>
              <li>
                Your backend server is running on{' '}
                <code>http://localhost:8000</code>
              </li>
              <li>
                The API endpoint path is correct (check browser console for the
                full URL)
              </li>
              <li>
                You have restarted the Vite dev server after creating/updating{' '}
                <code>.env</code>
              </li>
              <li>CORS is enabled on your backend if needed</li>
            </ul>
            <p>Check the browser console (F12) for more details.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const conversationCount = (stats.conversation_history || []).length;
  const activeUserChartTitle =
    timeRange === '7d' || timeRange === '30d'
      ? 'Daily Active Users'
      : 'Active Users';

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-header-row">
          <h1>Hyperknow User Dashboard</h1>
          <label className="timezone-selector">
            <span>Timezone</span>
            <select
              value={tzKey}
              onChange={(e) => setTzKey(e.target.value)}
            >
              {TIMEZONE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'retention' ? 'active' : ''}`}
            onClick={() => setActiveTab('retention')}
          >
            Retention
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            User Analytics
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'pollData' ? 'active' : ''}`}
            onClick={() => setActiveTab('pollData')}
          >
            User Poll Data
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'topUsers' ? 'active' : ''}`}
            onClick={() => setActiveTab('topUsers')}
          >
            Top Users
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'paid' ? 'active' : ''}`}
            onClick={() => setActiveTab('paid')}
          >
            Paid
          </button>
        </div>
      </div>

      {activeTab === 'general' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Users</div>
              <div className="stat-value">{stats.total_users}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Conversations</div>
              <div className="stat-value">{conversationCount}</div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title-with-toggle">
                <h2>User Growth</h2>
                <div className="stat-segmented">
                  <button
                    type="button"
                    className={`stat-segmented-btn ${growthMode === 'net' ? 'active' : ''}`}
                    onClick={() => setGrowthMode('net')}
                  >
                    Net growth
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn ${growthMode === 'total' ? 'active' : ''}`}
                    onClick={() => setGrowthMode('total')}
                  >
                    Total
                  </button>
                </div>
              </div>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
            <div className="chart-container">
              <StatLineChart
                data={
                  growthMode === 'total'
                    ? chartData.userTotalChart
                    : chartData.userChart
                }
                dataKey="users"
              />
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title-with-toggle">
                <h2>{activeUserChartTitle}</h2>
                <div className="stat-segmented">
                  <button
                    type="button"
                    className={`stat-segmented-btn ${activeUsersMode === 'line' ? 'active' : ''}`}
                    onClick={() => setActiveUsersMode('line')}
                  >
                    Line
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn ${activeUsersMode === 'bar' ? 'active' : ''}`}
                    onClick={() => setActiveUsersMode('bar')}
                  >
                    Bar · New vs Returning
                  </button>
                </div>
              </div>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
            <div className="chart-container">
              {activeUsersMode === 'bar' ? (
                <StackedBarChart
                  data={chartData.activeUserChart}
                  newKey="newUsers"
                  returningKey="returningUsers"
                  totalKey="activeUsers"
                  newLabel="New users (signed up this bucket)"
                  returningLabel="Returning users"
                />
              ) : (
                <StatLineChart
                  data={chartData.activeUserChart}
                  dataKey="activeUsers"
                />
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title-with-toggle">
                <h2>Conversation Activity</h2>
                <div className="stat-segmented">
                  <button
                    type="button"
                    className={`stat-segmented-btn ${conversationsMode === 'line' ? 'active' : ''}`}
                    onClick={() => setConversationsMode('line')}
                  >
                    Line
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn ${conversationsMode === 'bar' ? 'active' : ''}`}
                    onClick={() => setConversationsMode('bar')}
                  >
                    Bar · New vs Returning
                  </button>
                </div>
              </div>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
            <div className="chart-container">
              {conversationsMode === 'bar' ? (
                <StackedBarChart
                  data={chartData.conversationChart}
                  newKey="newUserConversations"
                  returningKey="returningUserConversations"
                  totalKey="conversations"
                  newLabel="Conversations by new users"
                  returningLabel="Conversations by returning users"
                />
              ) : (
                <StatLineChart
                  data={chartData.conversationChart}
                  dataKey="conversations"
                />
              )}
            </div>
          </div>

          <div className="section">
            <h2>Latest Users</h2>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Username</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.latest_users.slice(0, 10).map((user) => (
                    <tr key={user.user_id}>
                      <td>{user.email}</td>
                      <td>{user.username || '-'}</td>
                      <td>{formatDateTime(user.created_at, tzOffsetMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {activeTab === 'retention' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">DAU</div>
              <div className="stat-card-control">
                <input
                  type="date"
                  value={dauDate}
                  onChange={(e) => setDauDate(e.target.value)}
                />
              </div>
              <div className="stat-value">{dauStats.activeUsers}</div>
              <div className="stat-sub">
                Unique users with conversations on {dauDate}
                <br />
                {dauStats.newSignups} new signup
                {dauStats.newSignups === 1 ? '' : 's'} on this day
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">MAU</div>
              <div className="stat-card-control">
                <div className="stat-segmented">
                  <button
                    type="button"
                    className={`stat-segmented-btn ${mauMode === 'rolling' ? 'active' : ''}`}
                    onClick={() => setMauMode('rolling')}
                  >
                    Last 30d
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn ${mauMode === 'month' ? 'active' : ''}`}
                    onClick={() => setMauMode('month')}
                  >
                    Month
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn ${mauMode === 'endDate' ? 'active' : ''}`}
                    onClick={() => setMauMode('endDate')}
                  >
                    End date
                  </button>
                </div>
                {mauMode === 'month' && (
                  <input
                    type="month"
                    value={mauMonth}
                    onChange={(e) => setMauMonth(e.target.value)}
                  />
                )}
                {mauMode === 'endDate' && (
                  <input
                    type="date"
                    value={mauEndDate}
                    onChange={(e) => setMauEndDate(e.target.value)}
                  />
                )}
              </div>
              <div className="stat-value">{mauStats.activeUsers}</div>
              <div className="stat-sub">
                {mauWindow.label} · {mauWindow.start} → {mauWindow.end}
                <br />
                {mauStats.newSignups} new signup
                {mauStats.newSignups === 1 ? '' : 's'} in this period
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">DAU : MAU</div>
              <div className="stat-value">
                {formatRatio(dauMauRatio, mauStats.activeUsers)}
              </div>
              <div className="stat-sub">
                Stickiness · 1.0 means used every day
              </div>
            </div>
          </div>

          <div className="stats-grid">
            {KEY_RETENTION_DAYS.map((day) => {
              const p = retentionAt(day);
              const showValue = p.hasData && p.mature;
              const modeLabel = retentionMode === 'exact' ? 'Exact' : 'Rolling';
              return (
                <div className="stat-card" key={`retention-${day}`}>
                  <div className="stat-label">D{day} {modeLabel}</div>
                  <div className="stat-value">
                    {showValue ? `${p.ratePct.toFixed(1)}%` : '—'}
                  </div>
                  <div className="stat-sub">
                    {p.mature
                      ? `${p.returned} / ${p.eligible} eligible users`
                      : 'No cohort user has reached this day yet'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title-group">
                <h2>Day-N Return Retention</h2>
                <p className="section-subtitle">
                  {retentionMode === 'exact'
                    ? '精确日留存（Exact-day）：第 N 天当天是否有活动。'
                    : '滚动留存（Rolling）：第 N 天及之后是否有过任意活动。'}
                  {' '}Eligible = signed up at least N full days ago.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="stat-segmented">
                  <button
                    type="button"
                    className={`stat-segmented-btn${retentionMode === 'exact' ? ' active' : ''}`}
                    onClick={() => setRetentionMode('exact')}
                  >
                    Exact-day
                  </button>
                  <button
                    type="button"
                    className={`stat-segmented-btn${retentionMode === 'rolling' ? ' active' : ''}`}
                    onClick={() => setRetentionMode('rolling')}
                  >
                    Rolling
                  </button>
                </div>
                <SignupRangeFilter
                  start={signupRange.start}
                  end={signupRange.end}
                  minDate={signupBounds?.min}
                  maxDate={signupBounds?.max}
                  onChange={setSignupRange}
                  onReset={() => setSignupRange({ start: '', end: '' })}
                />
              </div>
            </div>
            <div className="chart-container">
              <CumulativeRetentionChart data={cumulativeRetention} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <>
          <div className="chart-grid-2">
            <div className="section">
              <h2>使用地区 · Country</h2>
              <p className="section-subtitle">
                From <code>user_analytics.country</code> ·{' '}
                {analyticsData.country.reduce((s, e) => s + e.value, 0)} users
                across {analyticsData.country.length} countries
              </p>
              <div className="chart-container">
                <CountPieChart data={analyticsData.country} />
              </div>
            </div>
            <div className="section">
              <h2>Nationality 国籍</h2>
              <p className="section-subtitle">
                From <code>user_analytics.nationality</code> ·{' '}
                {analyticsData.nationality.reduce((s, e) => s + e.value, 0)}{' '}
                users across {analyticsData.nationality.length} nationalities
              </p>
              <div className="chart-container">
                <CountPieChart data={analyticsData.nationality} />
              </div>
            </div>
          </div>

          <RankingSection
            title="Identity 身份排名"
            subtitle="Number of users per identity, sorted high-to-low. Hover a bar to see the top 5 countries and nationalities for that identity."
            data={analyticsData.identity}
            valueLabel="Users"
            pointLabel="users"
            breakdownGroups={[
              {
                label: 'Top 5 countries',
                data: analyticsData.identityCountries,
              },
              {
                label: 'Top 5 nationalities',
                data: analyticsData.identityNationalities,
              },
            ]}
          />

          <RankingSection
            title="Initial Used Function 初始使用功能排名"
            subtitle="Number of users whose first action used each function. Hover a bar to see the top 5 countries and nationalities for that function."
            data={analyticsData.initialUsedFunction}
            valueLabel="Users"
            pointLabel="users"
            breakdownGroups={[
              {
                label: 'Top 5 countries',
                data: analyticsData.initialUsedFunctionCountries,
              },
              {
                label: 'Top 5 nationalities',
                data: analyticsData.initialUsedFunctionNationalities,
              },
            ]}
          />

          <RankingSection
            title="Most Used Function 最常使用功能排名"
            subtitle="Total invocation count per function, summed across all users."
            data={analyticsData.mostUsedFunction}
            valueLabel="Invocations"
            pointLabel="invocations"
          />
        </>
      )}

      {activeTab === 'pollData' && (
        <>
          <RankingSection
            title="User Acquisition Sources 获客来源"
            subtitle="How many users mention each acquisition source (deduped per user)."
            data={pollData.acquisitionSources}
            valueLabel="Users"
            pointLabel="user mentions"
          />

          <RankingSection
            title="Login Country 登录国家排名"
            subtitle="Country resolved from user_poll_data.login_ip.country (one country per user)."
            data={pollData.loginCountries}
            valueLabel="Users"
            pointLabel="users"
          />
        </>
      )}

      {activeTab === 'topUsers' && (
        <div className="section">
          <div className="section-header">
            <div className="section-title-group">
              <h2>Top Users by Conversations 用户对话数排名</h2>
              <p className="section-subtitle">
                Most active users (by conversation count) inside the selected
                window. Email shown when known, otherwise a truncated user_id.
              </p>
              <p className="section-meta">
                <strong>{topUsers.totalConversations.toLocaleString()}</strong>{' '}
                conversations · <strong>{topUsers.activeUsers}</strong> active
                user{topUsers.activeUsers === 1 ? '' : 's'} ·{' '}
                <strong>{topUsersRange.start}</strong> →{' '}
                <strong>{topUsersRange.end}</strong>
              </p>
            </div>
            <div className="top-users-controls">
              <SignupRangeFilter
                start={topUsersRange.start}
                end={topUsersRange.end}
                minDate={conversationBounds?.min}
                maxDate={conversationBounds?.max}
                onChange={setTopUsersRange}
                onReset={() => {
                  const end =
                    conversationBounds?.max ?? todayTzKey(tzOffsetMs);
                  setTopUsersRange({ start: addDays(end, -29), end });
                }}
              />
              <div className="stat-segmented">
                <button
                  type="button"
                  className={`stat-segmented-btn ${topUsersMode === 'count' ? 'active' : ''}`}
                  onClick={() => setTopUsersMode('count')}
                >
                  Count
                </button>
                <button
                  type="button"
                  className={`stat-segmented-btn ${topUsersMode === 'percent' ? 'active' : ''}`}
                  onClick={() => setTopUsersMode('percent')}
                >
                  Percentage
                </button>
              </div>
            </div>
          </div>
          <div className="chart-container">
            <RankingBarChart
              data={topUsers.data}
              mode={topUsersMode}
              valueLabel="Conversations"
            />
          </div>
        </div>
      )}

      {activeTab === 'paid' && (
        paidStats ? (
          <PaidTab
            stats={stats}
            paidStats={paidStats}
            tzOffsetMs={tzOffsetMs}
          />
        ) : (
          <div className="section">
            <div className="empty-state" style={{ height: 160 }}>
              {paidError
                ? `Failed to load paid stats: ${paidError}`
                : 'Loading paid stats…'}
            </div>
          </div>
        )
      )}
    </div>
  );
}
