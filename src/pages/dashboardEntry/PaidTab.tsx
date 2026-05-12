import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  PaidStatsResponse,
  PaidSubscription,
  bucketOfBillingReason,
} from '../../api/getUserInfo/paid';
import {
  StatsResponse,
  User,
  UserAnalytics,
  UserPollData,
} from '../../api/getUserInfo/stats';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Two paid subscriptions are treated as a single "continuous paid period"
// when their gap is at most this many days.
const CONTINUITY_GAP_DAYS = 10;

// "Day N" retention is computed as cumulative — active at least once in
// the half-open window (Day 0, Day 0+N].
const RETENTION_DAYS = [1, 7, 30, 60] as const;
const RETENTION_LINE_MAX = 60;

// Renewal window: a new paid span must start within this many days after a
// span ends to count as a renewal. Also serves as the observation cutoff —
// spans ending within the last RENEWAL_WINDOW_DAYS are "still maturing".
const RENEWAL_WINDOW_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// One merged paid period for a user. `subs` are the underlying records that
// fed this span (in chronological order); useful for tooltip / debugging.
type PaidSpan = {
  start: number; // ms epoch
  end: number;   // ms epoch
  subs: PaidSubscription[];
};

type PaidUserRow = {
  user_id: string;
  email: string | null;
  username: string | null;
  identity: string | null;
  country: string | null;
  nationality: string | null;
  signupAt: number | null;        // ms epoch
  firstPaidAt: number;            // ms epoch (always defined for a paid user)
  signupToFirstPaidDays: number | null;
  totalPaidDays: number;          // sum of span durations (days)
  totalPaidSpans: number;
  isCurrentlyPaid: boolean;
  hasOneOff: boolean;             // any paid sub was one-off-payment
  hasInvite: boolean;             // user also has invite-bucket subs
  hasManual: boolean;             // user also has manual-bucket subs
  tierMix: string;                // "pro" | "trial_pro" | "pro+trial_pro"
  spans: PaidSpan[];
  // from user_analytics
  initialUsedFunction: string | null;
  mostUsedFunctions: Array<{ count: number; function: string }> | null;
  // from user_poll_data
  loginIp: unknown;
  acquisitionSources: unknown;
};

type SidebarUserRow = {
  user_id: string;
  email: string | null;
  username: string | null;
  count: number;                  // number of subs in that bucket
  latestAt: number;               // ms epoch of most recent sub start
};

// ---------------------------------------------------------------------------
// Helpers — pure functions, no side effects.
// ---------------------------------------------------------------------------

const parseTs = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

// For a single user's PAID-bucket subscriptions, build merged spans by
// folding consecutive subs whose gap is <= CONTINUITY_GAP_DAYS. A sub with
// no expires_at degenerates to a 0-duration "purchase event" which still
// participates in continuity merging via its start timestamp.
function buildPaidSpans(paidSubs: PaidSubscription[]): PaidSpan[] {
  const gapMs = CONTINUITY_GAP_DAYS * DAY_MS;
  const items = paidSubs
    .map((s) => {
      const start = parseTs(s.started_at);
      if (start == null) return null;
      const end = parseTs(s.expires_at) ?? start;
      return { start, end: Math.max(start, end), sub: s };
    })
    .filter((x): x is { start: number; end: number; sub: PaidSubscription } => x !== null)
    .sort((a, b) => a.start - b.start);

  const spans: PaidSpan[] = [];
  for (const item of items) {
    const cur = spans[spans.length - 1];
    if (cur && item.start - cur.end <= gapMs) {
      cur.end = Math.max(cur.end, item.end);
      cur.subs.push(item.sub);
    } else {
      spans.push({ start: item.start, end: item.end, subs: [item.sub] });
    }
  }
  return spans;
}

// YYYY-MM key for a UTC ms timestamp shifted into the selected tz.
const toMonthKey = (tsMs: number, offsetMs: number): string => {
  const d = new Date(tsMs + offsetMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// YYYY-MM-DD key for a UTC ms timestamp shifted into the selected tz.
const toDayKey = (tsMs: number, offsetMs: number): string =>
  new Date(tsMs + offsetMs).toISOString().slice(0, 10);

const formatMonthKey = (key: string): string => key; // already display-friendly

const formatDateOnly = (tsMs: number, offsetMs: number): string =>
  toDayKey(tsMs, offsetMs);

const monthsFromDays = (days: number): string => {
  if (days < 30) return `${days.toFixed(0)}d`;
  return `${(days / 30).toFixed(1)}m`;
};

const formatDaysHuman = (days: number | null): string => {
  if (days == null) return '—';
  if (days < 0) return '—';
  if (days < 1) return '<1d';
  return `${Math.round(days)}d`;
};

// ---------------------------------------------------------------------------
// Sortable column logic
// ---------------------------------------------------------------------------

type SortMode =
  | 'first_paid_desc'
  | 'first_paid_asc'
  | 'total_days_desc'
  | 'total_days_asc'
  | 'signup_to_paid_asc'
  | 'signup_to_paid_desc';

const SORT_LABELS: Record<SortMode, string> = {
  first_paid_desc: '首次付费时间 ↓ (最新)',
  first_paid_asc: '首次付费时间 ↑ (最早)',
  total_days_desc: '累计付费时长 ↓ (最长)',
  total_days_asc: '累计付费时长 ↑ (最短)',
  signup_to_paid_asc: '注册→首次付费 ↑ (最快)',
  signup_to_paid_desc: '注册→首次付费 ↓ (最慢)',
};

function sortPaidUsers(rows: PaidUserRow[], mode: SortMode): PaidUserRow[] {
  const arr = [...rows];
  // null-safe comparator: nulls sink to the bottom regardless of direction.
  const nullLast = (
    a: number | null,
    b: number | null,
    dir: 'asc' | 'desc',
  ): number => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return dir === 'asc' ? a - b : b - a;
  };
  switch (mode) {
    case 'first_paid_desc':
      arr.sort((a, b) => b.firstPaidAt - a.firstPaidAt);
      break;
    case 'first_paid_asc':
      arr.sort((a, b) => a.firstPaidAt - b.firstPaidAt);
      break;
    case 'total_days_desc':
      arr.sort((a, b) => b.totalPaidDays - a.totalPaidDays);
      break;
    case 'total_days_asc':
      arr.sort((a, b) => a.totalPaidDays - b.totalPaidDays);
      break;
    case 'signup_to_paid_asc':
      arr.sort((a, b) =>
        nullLast(a.signupToFirstPaidDays, b.signupToFirstPaidDays, 'asc'),
      );
      break;
    case 'signup_to_paid_desc':
      arr.sort((a, b) =>
        nullLast(a.signupToFirstPaidDays, b.signupToFirstPaidDays, 'desc'),
      );
      break;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function MonthlyRenewalChart({
  data,
}: {
  data: Array<{ month: string; eligible: number; renewed: number; ratePct: number; maturing: boolean }>;
}) {
  if (data.length === 0) {
    return <div className="empty-state">No renewal data yet</div>;
  }

  // Find contiguous ranges of maturing months to shade as ReferenceArea blocks
  const maturingRanges: Array<{ x1: string; x2: string }> = [];
  let rangeStart: string | null = null;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.maturing && rangeStart === null) rangeStart = d.month;
    if ((!d.maturing || i === data.length - 1) && rangeStart !== null) {
      maturingRanges.push({
        x1: rangeStart,
        x2: d.maturing ? d.month : data[i - 1].month,
      });
      rangeStart = null;
    }
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={data}
        margin={{ top: 16, right: 24, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="month"
          stroke="#666666"
          style={{ fontSize: 12 }}
          tick={{ fill: '#666666' }}
        />
        <YAxis
          domain={[0, 100]}
          stroke="#666666"
          style={{ fontSize: 12 }}
          tick={{ fill: '#666666' }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e5e5',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, name: string, item: { payload?: { eligible: number; renewed: number; maturing: boolean } }) => {
            if (name === 'Renewal rate') {
              const p = item?.payload;
              const suffix = p?.maturing ? ' ⏳ 观察中' : '';
              return [
                `${value.toFixed(1)}% (${p?.renewed ?? 0}/${p?.eligible ?? 0})${suffix}`,
                name,
              ];
            }
            return [String(value), name];
          }}
        />
        <Legend />
        {maturingRanges.map((r) => (
          <ReferenceArea
            key={`${r.x1}-${r.x2}`}
            x1={r.x1}
            x2={r.x2}
            fill="#f0f0f0"
            fillOpacity={0.7}
            label={{ value: '观察中', position: 'insideTop', fontSize: 11, fill: '#aaa' }}
          />
        ))}
        <Line
          type="monotone"
          dataKey="ratePct"
          name="Renewal rate"
          stroke="#4285f4"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: { maturing: boolean } };
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={payload.maturing ? '#aaa' : '#4285f4'}
                stroke={payload.maturing ? '#aaa' : '#4285f4'}
              />
            );
          }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Granularity options for the paid-rate chart
const GRANULARITY_OPTIONS = [
  { label: '1d', days: 1 },
  { label: '3d', days: 3 },
  { label: '7d', days: 7 },
] as const;
type GranularityDays = typeof GRANULARITY_OPTIONS[number]['days'];

type PaidRateBucket = {
  bucket: string;
  signups: number;
  // broad: all paid records (one-off + initial_subscription + renewal)
  oneoff: number;
  subscription: number; // initial_subscription + renewal
  total: number;
  paidRatePct: number;
  oneoffRatePct: number;
  subscriptionRatePct: number;
  // strict: first-time only (initial_subscription + first one-off per user, no repeats)
  strictTotal: number;
  strictRatePct: number;
  // Constant across all buckets; used to render a flat reference line
  avgPaidRatePct: number;
  avgStrictRatePct: number;
};

function PaidRateChart({
  data,
  maxPct,
  view,
}: {
  data: PaidRateBucket[];
  maxPct: number;
  view: 'broad' | 'strict';
}) {
  if (data.length === 0) {
    return <div className="empty-state">No signup data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="bucket" stroke="#666" style={{ fontSize: 11 }} tick={{ fill: '#666' }} />
        <YAxis
          domain={[0, maxPct]}
          stroke="#666"
          style={{ fontSize: 12 }}
          tick={{ fill: '#666' }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as PaidRateBucket;
            if (view === 'strict') {
              return (
                <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
                  <div style={{ color: '#666', marginBottom: 4 }}>注册用户：{d.signups}</div>
                  <div style={{ color: '#34a853', marginBottom: 4 }}>
                    首次付费率：{d.strictRatePct.toFixed(1)}%（{d.strictTotal} 人）
                  </div>
                  <div style={{ color: '#aaa', borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
                    区间平均：{d.avgStrictRatePct.toFixed(1)}%
                  </div>
                </div>
              );
            }
            return (
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
                <div style={{ color: '#666', marginBottom: 4 }}>注册用户：{d.signups}</div>
                <div style={{ color: '#ea4335', marginBottom: 2 }}>
                  总付费率：{d.paidRatePct.toFixed(1)}%（{d.total} 人）
                </div>
                <div style={{ color: '#fbbc04', marginBottom: 2, paddingLeft: 10 }}>
                  └ One-off：{d.oneoffRatePct.toFixed(1)}%（{d.oneoff} 人）
                </div>
                <div style={{ color: '#4285f4', marginBottom: 4, paddingLeft: 10 }}>
                  └ Subscription：{d.subscriptionRatePct.toFixed(1)}%（{d.subscription} 人）
                </div>
                <div style={{ color: '#aaa', borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
                  区间平均付费率：{d.avgPaidRatePct.toFixed(1)}%
                </div>
              </div>
            );
          }}
        />
        <Legend />
        {view === 'strict' ? (
          <>
            <Line
              type="monotone"
              dataKey="avgStrictRatePct"
              name="平均首次付费率"
              stroke="#34a853"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
              legendType="plainline"
            />
            <Line
              type="monotone"
              dataKey="strictRatePct"
              name="首次付费率"
              stroke="#34a853"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </>
        ) : (
          <>
            <Line
              type="monotone"
              dataKey="avgPaidRatePct"
              name="平均付费率"
              stroke="#ea4335"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
              legendType="plainline"
            />
            <Line
              type="monotone"
              dataKey="paidRatePct"
              name="总付费率"
              stroke="#ea4335"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="oneoffRatePct"
              name="One-off 付费率"
              stroke="#fbbc04"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="subscriptionRatePct"
              name="Subscription 付费率"
              stroke="#4285f4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RetentionLineChart({
  data,
}: {
  data: Array<{ day: number; ratePct: number; eligible: number; returned: number; mature: boolean }>;
}) {
  if (data.length === 0) {
    return <div className="empty-state">No retention data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={data}
        margin={{ top: 16, right: 24, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="day"
          stroke="#666666"
          style={{ fontSize: 12 }}
          tick={{ fill: '#666666' }}
          tickFormatter={(v) => `D${v}`}
        />
        <YAxis
          domain={[0, 100]}
          stroke="#666666"
          style={{ fontSize: 12 }}
          tick={{ fill: '#666666' }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e5e5',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, _name: string, item: { payload?: { eligible: number; returned: number; mature: boolean } }) => {
            const p = item?.payload;
            const suffix = p?.mature ? '' : ' (immature)';
            return [
              `${value.toFixed(1)}% (${p?.returned ?? 0}/${p?.eligible ?? 0})${suffix}`,
              `By Day`,
            ];
          }}
          labelFormatter={(label) => `Day ${label}`}
        />
        <Line
          type="monotone"
          dataKey="ratePct"
          stroke="#4285f4"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16',
];

// Pie chart + legend showing top N slices with an "Other" bucket
function GeoBreakdownPie({ data, title }: { data: [string, number][]; title: string }) {
  const total = data.reduce((s, [, c]) => s + c, 0);
  const TOP = 8;
  const slices: { name: string; value: number }[] = [];
  let otherSum = 0;
  data.forEach(([name, count], i) => {
    if (i < TOP) slices.push({ name, value: count });
    else otherSum += count;
  });
  if (otherSum > 0) slices.push({ name: 'Other', value: otherSum });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{title}</div>
      <PieChart width={180} height={180}>
        <Pie
          data={slices}
          cx={90}
          cy={85}
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const entry = payload[0];
            const name = entry.name as string;
            const value = entry.value as number;
            return (
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{name}</div>
                <div>{value} ({total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)</div>
              </div>
            );
          }}
        />
      </PieChart>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', maxWidth: 200 }}>
        {slices.map((s, i) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#444' }}>{s.name}</span>
            <span style={{ color: '#888', flexShrink: 0 }}>
              {total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


function PaidUsersTable({
  rows,
  tzOffsetMs,
}: {
  rows: PaidUserRow[];
  tzOffsetMs: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (uid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };
  if (rows.length === 0) {
    return <div className="empty-state">No paid users yet</div>;
  }
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>User</th>
            <th>Identity</th>
            <th>Country</th>
            <th>Tier</th>
            <th>First paid</th>
            <th title="Days from signup to first paid subscription">
              Signup → paid
            </th>
            <th title="Sum of all merged paid spans (days, with months in parens)">
              Total paid
            </th>
            <th>Spans</th>
            <th>Status</th>
            <th>Tags</th>
            <th title="Initial used function">Init Fn</th>
            <th title="Top used functions">Top Fns</th>
            <th title="User acquisition source">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const isOpen = expanded.has(u.user_id);
            const label =
              u.email?.trim() ||
              u.username?.trim() ||
              `${u.user_id.slice(0, 8)}…`;
            return (
              <PaidUserTableRow
                key={u.user_id}
                row={u}
                label={label}
                isOpen={isOpen}
                onToggle={() => toggle(u.user_id)}
                tzOffsetMs={tzOffsetMs}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaidUserTableRow({
  row,
  label,
  isOpen,
  onToggle,
  tzOffsetMs,
}: {
  row: PaidUserRow;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  tzOffsetMs: number;
}) {
  return (
    <>
      <tr>
        <td>
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse row' : 'Expand row'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              color: '#666',
              padding: 0,
              width: 20,
              height: 20,
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        </td>
        <td
          style={{
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${label} · ${row.user_id}`}
        >
          {label}
        </td>
        <td>{row.identity || '—'}</td>
        <td>
          {row.country || '—'}
          {row.nationality && row.nationality !== row.country && (
            <span style={{ color: '#999', fontSize: 11 }}>
              {' '}
              · {row.nationality}
            </span>
          )}
        </td>
        <td>{row.tierMix}</td>
        <td>{formatDateOnly(row.firstPaidAt, tzOffsetMs)}</td>
        <td>{formatDaysHuman(row.signupToFirstPaidDays)}</td>
        <td>
          {row.totalPaidDays.toFixed(0)}d
          <span style={{ color: '#999', fontSize: 11 }}>
            {' '}
            ({monthsFromDays(row.totalPaidDays)})
          </span>
        </td>
        <td>{row.totalPaidSpans}</td>
        <td>
          {row.isCurrentlyPaid ? (
            <span style={{ color: '#0a7c2a', fontWeight: 500 }}>Active</span>
          ) : (
            <span style={{ color: '#999' }}>Churned</span>
          )}
        </td>
        <td>
          <RowTags row={row} />
        </td>
        {/* Init Fn */}
        <td style={{ fontSize: 11, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={row.initialUsedFunction ?? undefined}>
          {row.initialUsedFunction ?? '—'}
        </td>
        {/* Top Fns */}
        <td style={{ fontSize: 11, color: '#555', maxWidth: 160 }}>
          {row.mostUsedFunctions && row.mostUsedFunctions.length > 0
            ? [...row.mostUsedFunctions]
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .map((f) => f.function)
                .join(' · ')
            : '—'}
        </td>
        {/* Source */}
        <td style={{ fontSize: 11, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.acquisitionSources == null
            ? '—'
            : Array.isArray(row.acquisitionSources)
              ? (row.acquisitionSources as string[]).join(', ')
              : typeof row.acquisitionSources === 'string'
                ? row.acquisitionSources
                : JSON.stringify(row.acquisitionSources)}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td></td>
          <td colSpan={13} style={{ background: '#fafafa', padding: '12px 20px' }}>
            {/* Meta info row */}
            <div style={{ fontSize: 12, color: '#666', marginBottom: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>
                Signup: {row.signupAt != null ? formatDateOnly(row.signupAt, tzOffsetMs) : '—'}
              </span>
              <span>
                user_id: <code style={{ fontFamily: 'Monaco, monospace' }}>{row.user_id}</code>
              </span>
            </div>

            {/* Login IP only */}
            <div style={{ fontSize: 12, marginBottom: 12 }}>
              {row.loginIp != null ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ color: '#888', whiteSpace: 'nowrap' }}>Login IP：</span>
                  <span
                    style={{
                      color: '#333',
                      fontFamily: 'Monaco, monospace',
                      fontSize: 11,
                      maxWidth: 420,
                      maxHeight: 80,
                      overflowY: 'auto',
                      overflowX: 'auto',
                      display: 'inline-block',
                      background: '#f5f5f5',
                      padding: '2px 6px',
                      borderRadius: 3,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {typeof row.loginIp === 'string'
                      ? row.loginIp
                      : JSON.stringify(row.loginIp, null, 2)}
                  </span>
                </div>
              ) : (
                <span style={{ color: '#bbb' }}>No login IP data</span>
              )}
            </div>

            {/* Paid spans table */}
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Span</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Start</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>End</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Days</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Subs (billing_reason)</th>
                </tr>
              </thead>
              <tbody>
                {row.spans.map((span, i) => {
                  const days = (span.end - span.start) / DAY_MS;
                  return (
                    <tr key={i}>
                      <td style={{ padding: '4px 8px' }}>{i + 1}</td>
                      <td style={{ padding: '4px 8px' }}>{formatDateOnly(span.start, tzOffsetMs)}</td>
                      <td style={{ padding: '4px 8px' }}>{formatDateOnly(span.end, tzOffsetMs)}</td>
                      <td style={{ padding: '4px 8px' }}>{days.toFixed(0)}</td>
                      <td style={{ padding: '4px 8px', color: '#555' }}>
                        {span.subs.map((s) => `${s.tier}/${s.billing_reason ?? '—'}`).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function RowTags({ row }: { row: PaidUserRow }) {
  const tags: Array<{ label: string; color: string; bg: string }> = [];
  if (row.hasOneOff)
    tags.push({ label: 'one-off', color: '#5b21b6', bg: '#ede9fe' });
  if (row.hasInvite)
    tags.push({ label: 'invite', color: '#0e7490', bg: '#cffafe' });
  if (row.hasManual)
    tags.push({ label: 'manual', color: '#9a3412', bg: '#fed7aa' });
  if (tags.length === 0) return <span style={{ color: '#bbb' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map((t) => (
        <span
          key={t.label}
          style={{
            background: t.bg,
            color: t.color,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {t.label}
        </span>
      ))}
    </span>
  );
}

function SidebarBucket({
  title,
  description,
  rows,
  tzOffsetMs,
}: {
  title: string;
  description: string;
  rows: SidebarUserRow[];
  tzOffsetMs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="chart-container"
      style={{ padding: 20, marginBottom: 16 }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {description}
          </div>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: '#1a1a1a',
            lineHeight: 1,
          }}
        >
          {rows.length}
        </div>
      </div>
      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: '#4285f4',
            fontSize: 12,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Hide users ▴' : 'Show users ▾'}
        </button>
      )}
      {expanded && (
        <ul
          style={{
            listStyle: 'none',
            margin: '12px 0 0 0',
            padding: 0,
            maxHeight: 240,
            overflowY: 'auto',
            borderTop: '1px solid #f0f0f0',
            paddingTop: 8,
          }}
        >
          {rows.map((u) => {
            const label =
              u.email?.trim() ||
              u.username?.trim() ||
              `${u.user_id.slice(0, 8)}…`;
            return (
              <li
                key={u.user_id}
                style={{
                  fontSize: 12,
                  padding: '4px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  color: '#333',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                  title={`${label} · ${u.user_id}`}
                >
                  {label}
                </span>
                <span style={{ color: '#999', flexShrink: 0 }}>
                  {u.count}× · {formatDateOnly(u.latestAt, tzOffsetMs)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent payments list (one-off / renewal / initial_subscription)
// ---------------------------------------------------------------------------

type RecentPaymentRow = {
  id: string;
  user_id: string;
  email: string | null;
  username: string | null;
  tier: string;
  billing_reason: string;
  startedAt: number;
};

const RECENT_LIST_LIMIT = 25;

function RecentPaymentsList({
  title,
  description,
  rows,
  tzOffsetMs,
}: {
  title: string;
  description: string;
  rows: RecentPaymentRow[];
  tzOffsetMs: number;
}) {
  return (
    <div className="chart-container" style={{ padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>
          {title}
          <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>
            ({rows.length})
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          {description}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state" style={{ height: 80 }}>
          暂无记录
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            maxHeight: 320,
            overflowY: 'auto',
            borderTop: '1px solid #f0f0f0',
          }}
        >
          {rows.map((r) => {
            const label =
              r.email?.trim() ||
              r.username?.trim() ||
              `${r.user_id.slice(0, 8)}…`;
            return (
              <li
                key={r.id}
                style={{
                  fontSize: 12,
                  padding: '8px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  color: '#333',
                  borderBottom: '1px solid #f5f5f5',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                  title={`${label} · ${r.user_id}`}
                >
                  {label}
                </span>
                <span style={{ color: '#888', flexShrink: 0 }}>
                  {r.tier} · {formatDateOnly(r.startedAt, tzOffsetMs)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PaidTab({
  stats,
  paidStats,
  tzOffsetMs,
}: {
  stats: StatsResponse;
  paidStats: PaidStatsResponse;
  tzOffsetMs: number;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('first_paid_desc');
  const [paidRateGranularity, setPaidRateGranularity] = useState<GranularityDays>(1);
  const [retentionMode, setRetentionMode] = useState<'exact' | 'rolling'>('exact');
  // broad = all paid events incl. renewals; strict = first-time only, no repeat one-offs
  const [paidRateView, setPaidRateView] = useState<'broad' | 'strict'>('broad');

  // Default: last 30 days up to today (computed once at mount using prop tzOffsetMs).
  const [paidRateStartDate, setPaidRateStartDate] = useState<string>(() =>
    toDayKey(Date.now() - 30 * DAY_MS, tzOffsetMs),
  );
  const [paidRateEndDate, setPaidRateEndDate] = useState<string>(() =>
    toDayKey(Date.now(), tzOffsetMs),
  );

  // ----- Index lookups -------------------------------------------------------
  const userBasicById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of stats.all_users_basic ?? []) m.set(u.user_id, u);
    // fall back to all_users_timeline for created_at on older backends
    for (const u of stats.all_users_timeline ?? []) {
      if (!m.has(u.user_id)) {
        m.set(u.user_id, {
          user_id: u.user_id,
          email: null,
          username: null,
          created_at: u.created_at,
        });
      }
    }
    return m;
  }, [stats]);

  const analyticsByUser = useMemo(() => {
    const m = new Map<string, UserAnalytics>();
    for (const a of stats.user_analytics ?? []) m.set(a.user_id, a);
    return m;
  }, [stats]);

  const pollDataByUser = useMemo(() => {
    const m = new Map<string, UserPollData>();
    for (const p of stats.user_poll_data ?? []) m.set(p.user_id, p);
    return m;
  }, [stats]);

  // user_id -> Set of YYYY-MM-DD days they had any conversation activity on.
  const activeDaysByUser = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of stats.conversation_history ?? []) {
      const ts = parseTs(c.created_at);
      if (ts == null) continue;
      const day = toDayKey(ts, tzOffsetMs);
      let set = m.get(c.user_id);
      if (!set) {
        set = new Set();
        m.set(c.user_id, set);
      }
      set.add(day);
    }
    return m;
  }, [stats, tzOffsetMs]);

  // ----- Bucket the subscriptions ------------------------------------------
  const bucketed = useMemo(() => {
    const paid: PaidSubscription[] = [];
    const invite: PaidSubscription[] = [];
    const manual: PaidSubscription[] = [];
    const other: PaidSubscription[] = [];
    for (const s of paidStats.subscriptions ?? []) {
      const b = bucketOfBillingReason(s.billing_reason);
      if (b === 'paid') paid.push(s);
      else if (b === 'invite') invite.push(s);
      else if (b === 'manual') manual.push(s);
      else other.push(s);
    }
    return { paid, invite, manual, other };
  }, [paidStats]);

  // ----- Build per-user paid rows -----------------------------------------
  const paidUsers = useMemo<PaidUserRow[]>(() => {
    // group subs by user
    const byUser = new Map<string, PaidSubscription[]>();
    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const arr = byUser.get(s.user_id) ?? [];
      arr.push(s);
      byUser.set(s.user_id, arr);
    }

    // who else has invite / manual? used for tag flags
    const inviteUsers = new Set(bucketed.invite.map((s) => s.user_id));
    const manualUsers = new Set(bucketed.manual.map((s) => s.user_id));

    const now = Date.now();
    const rows: PaidUserRow[] = [];
    for (const [uid, subs] of byUser) {
      const spans = buildPaidSpans(subs);
      if (spans.length === 0) continue;

      const firstPaidAt = spans[0].start;
      const totalPaidMs = spans.reduce((s, sp) => s + (sp.end - sp.start), 0);
      const totalPaidDays = totalPaidMs / DAY_MS;
      const isCurrentlyPaid = spans.some(
        (sp) => sp.start <= now && now <= sp.end,
      );

      const basic = userBasicById.get(uid);
      const signupAt = parseTs(basic?.created_at);
      const signupToFirstPaidDays =
        signupAt != null ? (firstPaidAt - signupAt) / DAY_MS : null;

      const analytics = analyticsByUser.get(uid);
      const poll = pollDataByUser.get(uid);
      const tiers = new Set(subs.map((s) => s.tier));
      const tierMix = Array.from(tiers).sort().join('+') || '—';
      const hasOneOff = subs.some((s) => s.billing_reason === 'one-off-payment');

      rows.push({
        user_id: uid,
        email: basic?.email ?? null,
        username: basic?.username ?? null,
        identity: analytics?.identity ?? null,
        country: analytics?.country ?? null,
        nationality: analytics?.nationality ?? null,
        signupAt,
        firstPaidAt,
        signupToFirstPaidDays,
        totalPaidDays,
        totalPaidSpans: spans.length,
        isCurrentlyPaid,
        hasOneOff,
        hasInvite: inviteUsers.has(uid),
        hasManual: manualUsers.has(uid),
        tierMix,
        spans,
        initialUsedFunction: analytics?.initial_used_function ?? null,
        mostUsedFunctions: analytics?.most_used_function ?? null,
        loginIp: poll?.login_ip ?? null,
        acquisitionSources: poll?.user_acquisition_sources ?? null,
      });
    }
    return rows;
  }, [bucketed, userBasicById, analyticsByUser, pollDataByUser]);

  // ----- Overview metrics --------------------------------------------------
  const overview = useMemo(() => {
    const totalPaidUsers = paidUsers.length;
    const currentlyActive = paidUsers.filter((u) => u.isCurrentlyPaid).length;
    const churned = totalPaidUsers - currentlyActive;
    const onlyOneOff = paidUsers.filter(
      (u) => u.hasOneOff && u.totalPaidSpans <= 1,
    ).length;
    return { totalPaidUsers, currentlyActive, churned, onlyOneOff };
  }, [paidUsers]);

  // ----- Sidebar buckets (invite / manual) --------------------------------
  const inviteUsers = useMemo<SidebarUserRow[]>(() => {
    return aggregateSidebar(bucketed.invite, userBasicById);
  }, [bucketed.invite, userBasicById]);

  const manualUsers = useMemo<SidebarUserRow[]>(() => {
    return aggregateSidebar(bucketed.manual, userBasicById);
  }, [bucketed.manual, userBasicById]);

  // ----- Monthly renewal rate ---------------------------------------------
  // Operates on raw subscription records (not merged spans) so that naturally
  // back-to-back renewal records aren't collapsed away before we can check them.
  //
  // For every paid sub record:
  //   - expires_at = when this sub ended
  //   - If expires_at <= now - RENEWAL_WINDOW_DAYS  →  eligible
  //     Renewed = any OTHER paid sub for the same user has started_at in
  //               (expires_at, expires_at + RENEWAL_WINDOW_DAYS]
  //   - If expires_at > now - RENEWAL_WINDOW_DAYS   →  still maturing (shown grey)
  //
  // We bucket by the month of expires_at.
  const monthlyRenewalSeries = useMemo(() => {
    const now = Date.now();
    const matureThreshold = now - RENEWAL_WINDOW_DAYS * DAY_MS;

    // Build a map: user_id → sorted list of paid sub start times
    const startsByUser = new Map<string, number[]>();
    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const t = parseTs(s.started_at) ?? parseTs(s.created_at);
      if (t == null) continue;
      const arr = startsByUser.get(s.user_id) ?? [];
      arr.push(t);
      startsByUser.set(s.user_id, arr);
    }
    // Sort each user's starts once
    for (const arr of startsByUser.values()) arr.sort((a, b) => a - b);

    type MonthBucket = { eligible: number; renewed: number; hasMaturing: boolean };
    const buckets = new Map<string, MonthBucket>();
    const ensureBucket = (key: string): MonthBucket => {
      let b = buckets.get(key);
      if (!b) { b = { eligible: 0, renewed: 0, hasMaturing: false }; buckets.set(key, b); }
      return b;
    };

    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const expiresAt = parseTs(s.expires_at);
      if (expiresAt == null) continue;

      const monthKey = toMonthKey(expiresAt, tzOffsetMs);
      const bucket = ensureBucket(monthKey);

      if (expiresAt > matureThreshold) {
        bucket.hasMaturing = true;
        continue;
      }

      bucket.eligible += 1;

      // Renewed = any start for this user in (expiresAt, expiresAt + window]
      const starts = startsByUser.get(s.user_id) ?? [];
      const windowEnd = expiresAt + RENEWAL_WINDOW_DAYS * DAY_MS;
      const renewed = starts.some((t) => t > expiresAt && t <= windowEnd);
      if (renewed) bucket.renewed += 1;
    }

    return Array.from(buckets.entries())
      .map(([month, b]) => ({
        month: formatMonthKey(month),
        eligible: b.eligible,
        renewed: b.renewed,
        ratePct: b.eligible > 0 ? (b.renewed / b.eligible) * 100 : 0,
        maturing: b.hasMaturing,
      }))
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }, [bucketed.paid, tzOffsetMs]);

  // ----- Retention (D1 – D60) ---------------------------------------------
  // Day 0 = first paid sub start.
  //
  // exact   – returned(N) = active on EXACTLY Day N after first paid
  // rolling – returned(N) = active on ANY day >= Day N after first paid
  //
  // eligible(N) = paid users whose first paid is at least N days ago.
  const retentionLine = useMemo(() => {
    const now = Date.now();
    type Pt = { day: number; ratePct: number; eligible: number; returned: number; mature: boolean };
    const points: Pt[] = [];

    for (let n = 1; n <= RETENTION_LINE_MAX; n++) {
      let eligible = 0;
      let returned = 0;
      for (const u of paidUsers) {
        const daysSinceFirstPaid = (now - u.firstPaidAt) / DAY_MS;
        if (daysSinceFirstPaid < n) continue;
        eligible += 1;
        const days = activeDaysByUser.get(u.user_id);
        if (!days) continue;

        if (retentionMode === 'exact') {
          // Active on precisely Day N
          const exactDayKey = toDayKey(u.firstPaidAt + n * DAY_MS, tzOffsetMs);
          if (days.has(exactDayKey)) returned += 1;
        } else {
          // Rolling: active on any day from Day N onward
          let hit = false;
          for (const dayKey of days) {
            const diffMs =
              new Date(dayKey).getTime() - tzOffsetMs - u.firstPaidAt;
            if (diffMs >= n * DAY_MS) {
              hit = true;
              break;
            }
          }
          if (hit) returned += 1;
        }
      }
      points.push({
        day: n,
        ratePct: eligible > 0 ? (returned / eligible) * 100 : 0,
        eligible,
        returned,
        mature: eligible > 0,
      });
    }
    return points;
  }, [paidUsers, activeDaysByUser, retentionMode, tzOffsetMs]);

  const retentionKeyDays = useMemo(() => {
    const map = new Map<number, { ratePct: number; eligible: number; returned: number }>();
    for (const p of retentionLine) map.set(p.day, p);
    return RETENTION_DAYS.map((n) => ({
      day: n,
      ...(map.get(n) ?? { ratePct: 0, eligible: 0, returned: 0 }),
    }));
  }, [retentionLine]);

  // ----- Paid rate series ---------------------------------------------------
  // Denominator: new signups per bucket (all_users_timeline, one entry per user).
  //
  // Broad numerator  : all paid events — one-off + initial_subscription + renewal.
  // Strict numerator : first-time payers only — initial_subscription records +
  //                    the FIRST one-off-payment per user (repeat one-offs excluded).
  const paidRateSeries = useMemo(() => {
    const bucketMs = paidRateGranularity * DAY_MS;
    const now = Date.now();

    // New signups — use all_users_timeline (deduplicated source, one row per user).
    const signupTimes: number[] = [];
    for (const u of stats.all_users_timeline ?? []) {
      const t = parseTs(u.created_at);
      if (t != null) signupTimes.push(t);
    }

    // Broad: all paid events
    const oneoffTimes: number[] = [];        // all one-off records
    const subscriptionTimes: number[] = [];  // initial_subscription + renewal

    // Strict: first-time only
    // - initial_subscription records (one per user per first sub)
    // - only the EARLIEST one-off-payment per user
    const strictInitialTimes: number[] = [];
    const firstOneoffByUser = new Map<string, number>(); // user_id -> earliest one-off ts

    for (const s of bucketed.paid) {
      const t = parseTs(s.started_at) ?? parseTs(s.created_at);
      if (t == null || !s.user_id) continue;

      if (s.billing_reason === 'one-off-payment') {
        oneoffTimes.push(t);
        const prev = firstOneoffByUser.get(s.user_id);
        if (prev == null || t < prev) firstOneoffByUser.set(s.user_id, t);
      } else if (s.billing_reason === 'initial_subscription') {
        subscriptionTimes.push(t);
        strictInitialTimes.push(t);
      } else {
        // renewal and any other sub types
        subscriptionTimes.push(t);
      }
    }
    const strictOneoffTimes = Array.from(firstOneoffByUser.values());

    // Shift every UTC timestamp into the selected timezone so that bucket
    // boundaries align with local calendar days (same trick as DashboardEntry).
    const shift = (t: number) => t + tzOffsetMs;

    const shiftedSignups = signupTimes.map(shift);
    const shiftedOneoff = oneoffTimes.map(shift);
    const shiftedSubscription = subscriptionTimes.map(shift);
    const shiftedStrictInitial = strictInitialTimes.map(shift);
    const shiftedStrictOneoff = strictOneoffTimes.map(shift);

    const allShifted = [...shiftedSignups, ...shiftedOneoff, ...shiftedSubscription];
    if (allShifted.length === 0) return { series: [], maxPct: 10 };

    // Resolve visible window. Date picker values are YYYY-MM-DD local strings;
    // parseTs returns UTC midnight, so we add tzOffsetMs to get local midnight.
    const dataMin = Math.min(...allShifted);
    const shiftedNow = shift(now);
    const userStart = paidRateStartDate
      ? (parseTs(paidRateStartDate) ?? dataMin - tzOffsetMs) + tzOffsetMs
      : dataMin;
    const userEnd = paidRateEndDate
      ? (parseTs(paidRateEndDate) ?? now) + tzOffsetMs + DAY_MS - 1
      : shiftedNow;
    const rangeStart = Math.max(dataMin, userStart);
    const rangeEnd = Math.min(shiftedNow, userEnd);
    if (rangeEnd < rangeStart) return { series: [], maxPct: 10 };

    const minT = Math.floor(rangeStart / bucketMs) * bucketMs;
    const lastBucketStart = Math.floor(rangeEnd / bucketMs) * bucketMs;
    const bucketCount = Math.floor((lastBucketStart - minT) / bucketMs) + 1;
    if (bucketCount <= 0) return { series: [], maxPct: 10 };

    type Bucket = {
      signups: number;
      oneoff: number;
      subscription: number;
      strictTotal: number;
    };
    const buckets: Bucket[] = Array.from({ length: bucketCount }, () => ({
      signups: 0, oneoff: 0, subscription: 0, strictTotal: 0,
    }));

    const idx = (t: number) => Math.floor((t - minT) / bucketMs);
    const inRange = (t: number) => t >= rangeStart && t <= rangeEnd;

    for (const t of shiftedSignups)       if (inRange(t)) buckets[idx(t)].signups += 1;
    for (const t of shiftedOneoff)        if (inRange(t)) buckets[idx(t)].oneoff += 1;
    for (const t of shiftedSubscription)  if (inRange(t)) buckets[idx(t)].subscription += 1;
    for (const t of shiftedStrictInitial) if (inRange(t)) buckets[idx(t)].strictTotal += 1;
    for (const t of shiftedStrictOneoff)  if (inRange(t)) buckets[idx(t)].strictTotal += 1;

    let globalMax = 0;
    let totalSignups = 0;
    let totalPaid = 0;
    let totalStrict = 0;
    const rawSeries = buckets.map((b, i) => {
      // bucketStart is already tz-shifted; strip the offset back out for toDayKey
      // (toDayKey internally adds tzOffsetMs, so we pass the raw UTC value).
      const bucketStart = minT + i * bucketMs - tzOffsetMs;
      const label = toDayKey(bucketStart, tzOffsetMs);
      const total = b.oneoff + b.subscription;
      const base = b.signups > 0 ? b.signups : 1;
      const paidRatePct = (total / base) * 100;
      const oneoffRatePct = (b.oneoff / base) * 100;
      const subscriptionRatePct = (b.subscription / base) * 100;
      const strictRatePct = (b.strictTotal / base) * 100;
      globalMax = Math.max(globalMax, paidRatePct, strictRatePct);
      totalSignups += b.signups;
      totalPaid += total;
      totalStrict += b.strictTotal;
      return {
        bucket: label,
        signups: b.signups,
        oneoff: b.oneoff,
        subscription: b.subscription,
        total,
        paidRatePct,
        oneoffRatePct,
        subscriptionRatePct,
        strictTotal: b.strictTotal,
        strictRatePct,
      };
    });

    const avgPaidRatePct = totalSignups > 0 ? (totalPaid / totalSignups) * 100 : 0;
    const avgStrictRatePct = totalSignups > 0 ? (totalStrict / totalSignups) * 100 : 0;
    const series = rawSeries.map((r) => ({ ...r, avgPaidRatePct, avgStrictRatePct }));
    const maxPct = Math.max(10, Math.ceil(Math.max(globalMax, avgPaidRatePct) + 5));
    return { series, maxPct };
  }, [stats, bucketed.paid, paidRateGranularity, paidRateStartDate, paidRateEndDate, tzOffsetMs]);

  // ----- Recent payments lists (one-off / renewal / initial subscription) -
  const recentPayments = useMemo(() => {
    const oneoff: RecentPaymentRow[] = [];
    const renewal: RecentPaymentRow[] = [];
    const initial: RecentPaymentRow[] = [];

    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const t = parseTs(s.started_at) ?? parseTs(s.created_at);
      if (t == null) continue;
      const basic = userBasicById.get(s.user_id);
      const row: RecentPaymentRow = {
        id: s.id,
        user_id: s.user_id,
        email: basic?.email ?? null,
        username: basic?.username ?? null,
        tier: s.tier,
        billing_reason: s.billing_reason ?? '—',
        startedAt: t,
      };
      if (s.billing_reason === 'one-off-payment') oneoff.push(row);
      else if (s.billing_reason === 'renewal') renewal.push(row);
      else if (s.billing_reason === 'initial_subscription') initial.push(row);
    }

    const byNewest = (a: RecentPaymentRow, b: RecentPaymentRow) => b.startedAt - a.startedAt;
    return {
      oneoff: oneoff.sort(byNewest).slice(0, RECENT_LIST_LIMIT),
      renewal: renewal.sort(byNewest).slice(0, RECENT_LIST_LIMIT),
      initial: initial.sort(byNewest).slice(0, RECENT_LIST_LIMIT),
    };
  }, [bucketed.paid, userBasicById]);

  // ----- Filtered + sorted users for table --------------------------------
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'churned'>('all');
  const [showOverviewGeo, setShowOverviewGeo] = useState(false);
  const [showPaidGeoBreakdown, setShowPaidGeoBreakdown] = useState(false);
  const [showRenewalGeoBreakdown, setShowRenewalGeoBreakdown] = useState(false);

  // Country/nationality breakdown for all paid users
  const paidGeoBreakdown = useMemo(() => {
    const countryCount = new Map<string, number>();
    const nationalityCount = new Map<string, number>();
    const identityCount = new Map<string, number>();
    for (const u of paidUsers) {
      const c = u.country ?? 'Unknown';
      countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
      const n = u.nationality ?? 'Unknown';
      nationalityCount.set(n, (nationalityCount.get(n) ?? 0) + 1);
      const id = u.identity ?? 'Unknown';
      identityCount.set(id, (identityCount.get(id) ?? 0) + 1);
    }
    const sortDesc = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return {
      country: sortDesc(countryCount),
      nationality: sortDesc(nationalityCount),
      identity: sortDesc(identityCount),
    };
  }, [paidUsers]);

  // Country/nationality breakdown for renewed vs. not-renewed (mature subs only)
  const renewalGeoBreakdown = useMemo(() => {
    const now = Date.now();
    const matureThreshold = now - RENEWAL_WINDOW_DAYS * DAY_MS;
    const startsByUser = new Map<string, number[]>();
    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const t = parseTs(s.started_at) ?? parseTs(s.created_at);
      if (t == null) continue;
      const arr = startsByUser.get(s.user_id) ?? [];
      arr.push(t);
      startsByUser.set(s.user_id, arr);
    }
    for (const arr of startsByUser.values()) arr.sort((a, b) => a - b);

    // user_id -> analytics for country/nationality
    const renewed = new Map<string, { country: string; nationality: string }>();
    const notRenewed = new Map<string, { country: string; nationality: string }>();

    for (const s of bucketed.paid) {
      if (!s.user_id) continue;
      const expiresAt = parseTs(s.expires_at);
      if (expiresAt == null || expiresAt > matureThreshold) continue;
      const analytics = analyticsByUser.get(s.user_id);
      const geo = {
        country: analytics?.country ?? 'Unknown',
        nationality: analytics?.nationality ?? 'Unknown',
      };
      const starts = startsByUser.get(s.user_id) ?? [];
      const windowEnd = expiresAt + RENEWAL_WINDOW_DAYS * DAY_MS;
      const didRenew = starts.some((t) => t > expiresAt && t <= windowEnd);
      if (didRenew) renewed.set(s.user_id, geo);
      else notRenewed.set(s.user_id, geo);
    }

    const toCounts = (m: Map<string, { country: string; nationality: string }>) => {
      const country = new Map<string, number>();
      const nationality = new Map<string, number>();
      for (const geo of m.values()) {
        country.set(geo.country, (country.get(geo.country) ?? 0) + 1);
        nationality.set(geo.nationality, (nationality.get(geo.nationality) ?? 0) + 1);
      }
      const sortDesc = (mp: Map<string, number>) =>
        Array.from(mp.entries()).sort((a, b) => b[1] - a[1]);
      return { country: sortDesc(country), nationality: sortDesc(nationality) };
    };
    return { renewed: toCounts(renewed), notRenewed: toCounts(notRenewed) };
  }, [bucketed.paid, analyticsByUser]);

  const sortedPaidUsers = useMemo(() => {
    const filtered = userFilter === 'all'
      ? paidUsers
      : paidUsers.filter((u) =>
          userFilter === 'active' ? u.isCurrentlyPaid : !u.isCurrentlyPaid,
        );
    return sortPaidUsers(filtered, sortMode);
  }, [paidUsers, sortMode, userFilter]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (paidUsers.length === 0 && inviteUsers.length === 0 && manualUsers.length === 0) {
    return (
      <div className="section">
        <div className="empty-state" style={{ height: 160 }}>
          No paid / invite / manual subscriptions found in{' '}
          <code>{paidStats.table_name}</code> yet.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Section 1: Overview */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>付费用户总览</h2>
            <p className="section-subtitle">
              Only <code>initial_subscription</code> · <code>renewal</code> ·{' '}
              <code>one-off-payment</code> count as paid. Two paid subs within{' '}
              {CONTINUITY_GAP_DAYS} days collapse into one continuous span.
              Renewal window: {RENEWAL_WINDOW_DAYS} days.
              Source table: <code>{paidStats.table_name}</code>.
            </p>
          </div>
          <button
            type="button"
            className={`stat-segmented-btn${showOverviewGeo ? ' active' : ''}`}
            onClick={() => setShowOverviewGeo((v) => !v)}
          >
            地区 / 国籍 / 身份分布
          </button>
        </div>
        <div className="stats-grid">
          <StatCard
            label="付费用户总数"
            value={overview.totalPaidUsers}
            sub="Distinct users with at least one paid subscription"
          />
          <StatCard
            label="当前活跃付费"
            value={overview.currentlyActive}
            sub="Currently inside an unexpired paid span"
          />
          <StatCard
            label="已流失"
            value={overview.churned}
            sub="Was paid before but no active span right now"
          />
          <StatCard
            label="仅一次性付费"
            value={overview.onlyOneOff}
            sub="Only one-off-payment, single span"
          />
        </div>
        {showOverviewGeo && (
          <div style={{ marginTop: 16, padding: '16px 20px', background: '#fafafa', borderRadius: 8, display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
            <GeoBreakdownPie data={paidGeoBreakdown.country} title="使用地区分布" />
            <GeoBreakdownPie data={paidGeoBreakdown.nationality} title="国籍分布" />
            <GeoBreakdownPie data={paidGeoBreakdown.identity} title="身份分布" />
          </div>
        )}
      </div>

      {/* Sidebar: invite / manual */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>旁路 · Invite & Manual</h2>
            <p className="section-subtitle">
              Excluded from paid metrics above. Tracked separately so they
              can't inflate revenue / retention numbers.
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <SidebarBucket
            title="邀请奖励用户"
            description="invite_code_grant + invitation_credit_grant"
            rows={inviteUsers}
            tzOffsetMs={tzOffsetMs}
          />
          <SidebarBucket
            title="手动添加用户"
            description="manual_addition (operations / scripts)"
            rows={manualUsers}
            tzOffsetMs={tzOffsetMs}
          />
        </div>
      </div>

      {/* Section 2: Paid rate over time */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>新付费率趋势</h2>
            <p className="section-subtitle">
              {paidRateView === 'broad'
                ? '宽口径：all paid events（one-off + initial_subscription + renewal）/ 新注册用户数。'
                : '严格口径：首次付费用户（initial_subscription + 每人首个 one-off，不含重复）/ 新注册用户数。'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>时段：</span>
              <input
                type="date"
                value={paidRateStartDate}
                onChange={(e) => setPaidRateStartDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  border: '1px solid #e5e5e5',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: '#333',
                  background: '#fff',
                }}
              />
              <span style={{ color: '#999', fontSize: 12 }}>→</span>
              <input
                type="date"
                value={paidRateEndDate}
                onChange={(e) => setPaidRateEndDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  border: '1px solid #e5e5e5',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: '#333',
                  background: '#fff',
                }}
              />
              {(paidRateStartDate || paidRateEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setPaidRateStartDate('');
                    setPaidRateEndDate('');
                  }}
                  style={{
                    padding: '5px 8px',
                    border: '1px solid #e5e5e5',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: '#fff',
                    color: '#666',
                    fontFamily: 'inherit',
                  }}
                >
                  清除
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>粒度：</span>
              {GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setPaidRateGranularity(opt.days)}
                  style={{
                    padding: '5px 10px',
                    border: '1px solid #e5e5e5',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: paidRateGranularity === opt.days ? '#1a1a1a' : '#fff',
                    color: paidRateGranularity === opt.days ? '#fff' : '#333',
                    fontFamily: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="stat-segmented">
              <button
                type="button"
                className={`stat-segmented-btn${paidRateView === 'broad' ? ' active' : ''}`}
                onClick={() => setPaidRateView('broad')}
              >
                宽口径
              </button>
              <button
                type="button"
                className={`stat-segmented-btn${paidRateView === 'strict' ? ' active' : ''}`}
                onClick={() => setPaidRateView('strict')}
              >
                严格口径
              </button>
            </div>
          </div>
        </div>
        <div className="chart-container">
          <PaidRateChart data={paidRateSeries.series} maxPct={paidRateSeries.maxPct} view={paidRateView} />
        </div>
      </div>

      {/* Section 3: Recent payments (newest first, top 25) */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>最新付费记录</h2>
            <p className="section-subtitle">
              按 <code>started_at</code> 倒序，每类最多显示前 {RECENT_LIST_LIMIT} 条。
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <RecentPaymentsList
            title="One-off 付费"
            description="billing_reason = one-off-payment"
            rows={recentPayments.oneoff}
            tzOffsetMs={tzOffsetMs}
          />
          <RecentPaymentsList
            title="首次订阅"
            description="billing_reason = initial_subscription"
            rows={recentPayments.initial}
            tzOffsetMs={tzOffsetMs}
          />
          <RecentPaymentsList
            title="续订"
            description="billing_reason = renewal"
            rows={recentPayments.renewal}
            tzOffsetMs={tzOffsetMs}
          />
        </div>
      </div>

      {/* Section 4: Monthly renewal rate */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>月度续费率</h2>
            <p className="section-subtitle">
              每月结束付费的 span 中，有多少在 {RENEWAL_WINDOW_DAYS} 天内开启了新的 span（续费成功）。
              最近 {RENEWAL_WINDOW_DAYS} 天内结束的 span 为观察中（灰色点），不计入正式分母。
            </p>
          </div>
          <button
            type="button"
            className={`stat-segmented-btn${showRenewalGeoBreakdown ? ' active' : ''}`}
            onClick={() => setShowRenewalGeoBreakdown((v) => !v)}
            style={{ marginLeft: 'auto' }}
          >
            地区/国籍分布
          </button>
        </div>
        <div className="chart-container">
          <MonthlyRenewalChart data={monthlyRenewalSeries} />
        </div>
        {showRenewalGeoBreakdown && (
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 32 }}>
            {(['renewed', 'notRenewed'] as const).map((group) => {
              const data = renewalGeoBreakdown[group];
              const countryTotal = data.country.reduce((s, [, c]) => s + c, 0);
              const color = group === 'renewed' ? '#0a7c2a' : '#c00';
              const label = group === 'renewed' ? '✓ 续费用户' : '✗ 未续费用户';
              return (
                <div key={group} style={{ background: '#fafafa', borderRadius: 8, padding: '12px 16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color }}>
                    {label}
                    <span style={{ fontWeight: 400, color: '#888', marginLeft: 6, fontSize: 12 }}>
                      ({countryTotal} subs)
                    </span>
                  </h4>
                  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                    <GeoBreakdownPie data={data.country} title="使用地区" />
                    <GeoBreakdownPie data={data.nationality} title="国籍" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 5: Retention */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>付费用户留存率</h2>
            <p className="section-subtitle">
              {retentionMode === 'exact'
                ? '精确日留存（Exact-day）：Day 0 = 首次付费日，Day N = 第 N 天当天是否有对话活动。'
                : '滚动留存（Rolling）：Day 0 = 首次付费日，Day N = 第 N 天及之后是否有过任意对话活动。'}
            </p>
          </div>
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
        </div>
        <div className="stats-grid">
          {retentionKeyDays.map((p) => (
            <StatCard
              key={p.day}
              label={`D${p.day} ${retentionMode === 'exact' ? 'Exact' : 'Rolling'}`}
              value={p.eligible > 0 ? `${p.ratePct.toFixed(1)}%` : '—'}
              sub={`${p.returned} / ${p.eligible} eligible users`}
            />
          ))}
        </div>
        <div className="chart-container" style={{ marginTop: 16 }}>
          <RetentionLineChart data={retentionLine} />
        </div>
      </div>

      {/* Section 6: Paid users list */}
      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>付费用户列表</h2>
            <p className="section-subtitle">
              {sortedPaidUsers.length.toLocaleString()} / {paidUsers.length.toLocaleString()} users
              · expand a row to see the underlying span / subscription records.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="stat-segmented">
              {(['all', 'active', 'churned'] as const).map((f) => {
                const count =
                  f === 'all' ? paidUsers.length
                  : f === 'active' ? paidUsers.filter((u) => u.isCurrentlyPaid).length
                  : paidUsers.filter((u) => !u.isCurrentlyPaid).length;
                const label = f === 'all' ? `全部 (${count})` : f === 'active' ? `活跃 (${count})` : `已流失 (${count})`;
                return (
                  <button
                    key={f}
                    type="button"
                    className={`stat-segmented-btn${userFilter === f ? ' active' : ''}`}
                    onClick={() => setUserFilter(f)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{
                padding: '6px 10px',
                border: '1px solid #e5e5e5',
                borderRadius: 6,
                fontSize: 13,
                background: '#fff',
                fontFamily: 'inherit',
              }}
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`stat-segmented-btn${showPaidGeoBreakdown ? ' active' : ''}`}
              onClick={() => setShowPaidGeoBreakdown((v) => !v)}
            >
              地区/国籍分布
            </button>
          </div>
        </div>
        {showPaidGeoBreakdown && (
          <div style={{ marginBottom: 16, padding: '16px 20px', background: '#fafafa', borderRadius: 8, display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
            <GeoBreakdownPie data={paidGeoBreakdown.country} title="使用地区分布" />
            <GeoBreakdownPie data={paidGeoBreakdown.nationality} title="国籍分布" />
          </div>
        )}
        <PaidUsersTable rows={sortedPaidUsers} tzOffsetMs={tzOffsetMs} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers used inside the component (kept at bottom for readability)
// ---------------------------------------------------------------------------

function aggregateSidebar(
  subs: PaidSubscription[],
  userBasicById: Map<string, User>,
): SidebarUserRow[] {
  const byUser = new Map<string, { count: number; latestAt: number }>();
  for (const s of subs) {
    if (!s.user_id) continue;
    const ts = parseTs(s.started_at) ?? parseTs(s.created_at) ?? 0;
    const cur = byUser.get(s.user_id);
    if (cur) {
      cur.count += 1;
      cur.latestAt = Math.max(cur.latestAt, ts);
    } else {
      byUser.set(s.user_id, { count: 1, latestAt: ts });
    }
  }
  const rows: SidebarUserRow[] = [];
  for (const [uid, agg] of byUser) {
    const basic = userBasicById.get(uid);
    rows.push({
      user_id: uid,
      email: basic?.email ?? null,
      username: basic?.username ?? null,
      count: agg.count,
      latestAt: agg.latestAt,
    });
  }
  return rows.sort((a, b) => b.latestAt - a.latestAt);
}
