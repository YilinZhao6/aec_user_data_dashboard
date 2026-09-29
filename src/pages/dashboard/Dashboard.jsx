import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import landAtlas from 'world-atlas/land-110m.json'
import { useDashboardData, formatCount, formatPct } from './dashboardData'
import {
  DataTable,
  DateRange,
  ExpandButton,
  InfoTip,
  InlineField,
  MenuField,
  Metrics,
  PanelHeading,
  Segmented,
  SkeletonBlock,
  SkeletonMetrics,
  ToolbarMenu,
} from '../../components/ui'
import { formatDateTime } from '../../components/format'
import { SiteNav } from '../../components/SiteNav'
import { API_BASE_URL } from '../../api/client'
import DashboardLineChart from './DashboardLineChart'
import DashboardStackedBars from './DashboardStackedBars'
import DashboardPieChart from './DashboardPieChart'
import CohortTable from './CohortTable'
import FunnelPanel from './FunnelPanel'
import BillingView from './BillingView'
import {
  ACTIVATION_WINDOW_HOURS,
  GROWTH_BENCHMARKS,
  RENEWAL_EARLY_DAYS,
  RENEWAL_WINDOW_DAYS,
  buildActivityIndex,
  buildChannelPerformance,
  buildDailyActives,
  buildPaidCohorts,
  buildRenewal,
  buildRetentionCohorts,
  normalizeSelfReportedSource,
} from './growthMetrics'
import {
  TIMEZONE_OPTIONS,
  BROWSER_OFFSET_MS,
  MAX_RETENTION_DAY,
  KEY_RETENTION_DAYS,
  addDays,
  aggregateCounts,
  aggregateJsonbColumn,
  aggregateMostUsedFunctions,
  classifyUserOrigin,
  collectMeaningfulEvents,
  daysBetweenDateKeys,
  extractLoginIpCountries,
  extractStringLeaves,
  getTzNow,
  parseInTz,
  todayTzKey,
  toTzDateKey,
  topBreakdownByCategory,
  USER_ORIGIN_LABELS,
  withOtherBucket,
} from '../../utils/dashboardUtils'
import { bucketOfBillingReason, isOneOffReason } from '../../api/getUserInfo/paid'
import { featureLabel, featureRank } from '../../api/getUserInfo/paidInsights'
import { DAY_MS, buildPaidSpans, dateOnly, parseTs } from './paidSpans'
import { UserLink } from '../../components/UserDetail'
import '../../styles/dashboard.css'

// `adminOnly` tabs are removed from the nav entirely for every other role,
// mirroring the original DashboardEntry gating. `growthOnly` tabs are the
// growth views: open to the admin and growth roles, hidden from `general`.
//
// User Queries used to live here as an admin-only tab. It moved to /queries,
// where it is the "Agent Queries" sub-tab alongside course generation — same
// endpoint, same on-demand load, now open to every role.
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'retention', label: 'Retention', growthOnly: true },
  { id: 'analytics', label: 'User Analytics' },
  { id: 'topUsers', label: 'Top Users' },
  { id: 'paid', label: 'Paid' },
  { id: 'utmTracking', label: 'UTM Tracking' },
  { id: 'channels', label: 'Channels', growthOnly: true },
  { id: 'errorLogs', label: 'Error Logs', adminOnly: true },
]

function countByKey(rows, keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyFn(row) ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

function testCaseName(detail) {
  const names = detail && typeof detail === 'object' ? detail.names : null
  return typeof names === 'string' ? names : 'unknown'
}

const TIME_RANGES = ['12h', '1d', '7d', '30d']
const GROWTH_GRANULARITIES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
// Users whose signup carried other UTM keys but not this one. Kept as a
// visible bucket so the per-field shares still add up to the tracked total.
const UTM_UNSET = '(not set)'
// Surfaced as metric cards; content / term are long-tail and stay in the table.
const UTM_TOP_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign']
const UTM_LABELS = {
  utm_source: 'Source',
  utm_medium: 'Medium',
  utm_campaign: 'Campaign',
  utm_content: 'Content',
  utm_term: 'Term',
}
const COUNTRY_COORDS = {
  australia: [-25.2744, 133.7751],
  austria: [47.5162, 14.5501],
  belgium: [50.5039, 4.4699],
  brazil: [-14.235, -51.9253],
  canada: [56.1304, -106.3468],
  china: [35.8617, 104.1954],
  'chinese mainland': [35.8617, 104.1954],
  denmark: [56.2639, 9.5018],
  france: [46.2276, 2.2137],
  germany: [51.1657, 10.4515],
  'hong kong': [22.3193, 114.1694],
  india: [20.5937, 78.9629],
  indonesia: [-0.7893, 113.9213],
  ireland: [53.1424, -7.6921],
  italy: [41.8719, 12.5674],
  japan: [36.2048, 138.2529],
  malaysia: [4.2105, 101.9758],
  mexico: [23.6345, -102.5528],
  netherlands: [52.1326, 5.2913],
  'new zealand': [-40.9006, 174.886],
  norway: [60.472, 8.4689],
  philippines: [12.8797, 121.774],
  singapore: [1.3521, 103.8198],
  'south africa': [-30.5595, 22.9375],
  'south korea': [35.9078, 127.7669],
  spain: [40.4637, -3.7492],
  sweden: [60.1282, 18.6435],
  switzerland: [46.8182, 8.2275],
  taiwan: [23.6978, 120.9605],
  thailand: [15.87, 100.9925],
  turkey: [38.9637, 35.2433],
  'united arab emirates': [23.4241, 53.8478],
  'united kingdom': [55.3781, -3.436],
  uk: [55.3781, -3.436],
  'united states': [37.0902, -95.7129],
  usa: [37.0902, -95.7129],
  vietnam: [14.0583, 108.2772],
}
const COUNTRY_FLAGS = {
  australia: '🇦🇺',
  austria: '🇦🇹',
  belgium: '🇧🇪',
  brazil: '🇧🇷',
  canada: '🇨🇦',
  china: '🇨🇳',
  'chinese mainland': '🇨🇳',
  denmark: '🇩🇰',
  ethiopia: '🇪🇹',
  france: '🇫🇷',
  germany: '🇩🇪',
  'hong kong': '🇭🇰',
  india: '🇮🇳',
  indonesia: '🇮🇩',
  ireland: '🇮🇪',
  italy: '🇮🇹',
  japan: '🇯🇵',
  malaysia: '🇲🇾',
  mexico: '🇲🇽',
  netherlands: '🇳🇱',
  'new zealand': '🇳🇿',
  norway: '🇳🇴',
  philippines: '🇵🇭',
  singapore: '🇸🇬',
  'south africa': '🇿🇦',
  'south korea': '🇰🇷',
  spain: '🇪🇸',
  'sri lanka': '🇱🇰',
  sweden: '🇸🇪',
  switzerland: '🇨🇭',
  taiwan: '🇹🇼',
  thailand: '🇹🇭',
  turkey: '🇹🇷',
  'united arab emirates': '🇦🇪',
  'united kingdom': '🇬🇧',
  uk: '🇬🇧',
  'united states': '🇺🇸',
  usa: '🇺🇸',
  vietnam: '🇻🇳',
}
// Where "recent" ends when active users are split by account age — the same
// 7-day line the Retention tab's DAU composition draws.
const RECENT_ACCOUNT_DAYS = 7
const PAID_RETENTION_DAYS = [1, 7, 30, 60]
const PAID_RETENTION_LINE_MAX = 60
const RECENT_LIST_LIMIT = 25
// How far back the Latest Users list goes for a role that may not see user
// totals. Without the cap, paging to the end of "全部" is a head count.
const LATEST_USERS_LIMIT = 200
const LATEST_USERS_PAGE_SIZE = 20
const PAID_USERS_PAGE_SIZE = 20

// Minimum users behind an initial-function bucket before its conversion rate
// is ranked — small buckets produce meaningless 100%s.
const FEATURE_MIN_SAMPLE = 20

// Same guard for the demographic dimensions of the paid profile. Lower than
// the feature threshold because countries and identities are long-tailed —
// at 20 the table would be three rows and an apology.
const PROFILE_MIN_SAMPLE = 10

// A user with no value for a demographic attribute still exists, so they get
// their own bucket instead of quietly leaving the denominator.
const UNKNOWN_SEGMENT = '未知'

// The paid profile answers two questions per dimension: who the payers are
// (share of payers) and who converts best (paid rate + index vs baseline).
const PAID_PROFILE_DIMENSIONS = [
  {
    value: 'mostUsedFunction',
    label: '最常用功能',
    column: 'Function',
    minSample: FEATURE_MIN_SAMPLE,
    note: 'user_analytics.most_used_function — 生命周期口径，含付费之后的使用，所以这是相关性，不是「用了就会付费」。一个用户计入他用过的每个功能，因此 Share of payers 合计会超过 100%。',
  },
  {
    value: 'identity',
    label: '身份',
    column: 'Identity',
    minSample: PROFILE_MIN_SAMPLE,
    note: 'user_analytics.identity — 哪类身份的用户更愿意付费。',
  },
  {
    value: 'country',
    label: '使用地区',
    column: 'Country',
    minSample: PROFILE_MIN_SAMPLE,
    note: 'user_analytics.country — 用户实际所在地区。',
  },
  {
    value: 'nationality',
    label: '国籍',
    column: 'Nationality',
    minSample: PROFILE_MIN_SAMPLE,
    note: 'user_analytics.nationality — 用户国籍。',
  },
  {
    value: 'origin',
    label: '用户构成',
    column: 'Segment',
    minSample: PROFILE_MIN_SAMPLE,
    note: '国籍 + 使用地区综合判断：中国大陆 / 海外华人·留学生 / 纯外国人（分类本身不完全准确，仅供参考）。',
  },
]

// `initial_used_function` contains placeholder strings as well as real values:
// 175 rows literally say "null". Left alone that becomes its own bucket, and
// because it is small it lands at the top of the conversion ranking with a
// nonsense lift. Treat the placeholders as missing, like an absent value.
// (Deliberately does NOT touch `other:none` / `other:unknown` — those are the
// classifier's own outputs, not serialization artifacts.)
const MISSING_FUNCTION_NAMES = new Set(['null', 'undefined', 'none', 'nan', 'n/a', '-'])

const normalizeFunctionName = (raw) => {
  const value = (raw ?? '').trim()
  return value && !MISSING_FUNCTION_NAMES.has(value.toLowerCase()) ? value : ''
}

// Paid rates can sit well below 1%, where one decimal renders as a flat
// "0.0%" and hides the difference between buckets.
const ratePct = (pct) => (pct > 0 && pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`)
const IGNORED_TOP_USER_PREFIXES = ['test10086']
const WORLD_SIZE = [1000, 460]
const WORLD_PROJECTION = geoNaturalEarth1().fitSize(WORLD_SIZE, { type: 'Sphere' })
const WORLD_PATH = geoPath(WORLD_PROJECTION)
const WORLD_LAND = feature(landAtlas, landAtlas.objects.land).features
const WORLD_GRATICULE = geoGraticule().step([40, 30])()
const OVERVIEW_PRESETS = [
  { value: 'pastTwoMonths', label: 'Past 2 months' },
  { value: 'pastMonth', label: 'Past month' },
  { value: 'lastQuarter', label: 'Last quarter' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'thisMonthToDate', label: 'This month to date' },
  { value: 'yearToDate', label: 'Year to date' },
]

function Bars({ bars, stacked = false }) {
  const max = Math.max(1, ...bars.map((b) => b.value))

  return (
    <div className="sample4-bars">
      {bars.map((bar) => (
        <div key={bar.label} className="sample4-bar" title={bar.caption}>
          <em>{bar.display}</em>
          <span className={stacked ? 'sample4-bar-stack' : ''} style={{ height: `${Math.max(4, (bar.value / max) * 100)}%` }}>
            {stacked && (
              <>
                <i style={{ height: `${bar.value > 0 ? (bar.primary / bar.value) * 100 : 0}%` }} />
                <b style={{ height: `${bar.value > 0 ? (bar.secondary / bar.value) * 100 : 0}%` }} />
              </>
            )}
          </span>
          <small>{bar.label}</small>
        </div>
      ))}
    </div>
  )
}

function Ranking({ entries, total, mode = 'count' }) {
  if (entries.length === 0) {
    return <p className="sample4-note">No data in this range.</p>
  }
  const max = Math.max(...entries.map((e) => (mode === 'percent' && total > 0 ? (e.value / total) * 100 : e.value)))

  return (
    <ul className="sample4-ranking">
      {entries.map((entry) => {
        const displayValue = mode === 'percent' && total > 0 ? (entry.value / total) * 100 : entry.value
        return (
          <li key={entry.name}>
            <span className="sample4-ranking-label" title={entry.name}>{entry.name}</span>
            <span className="sample4-ranking-track">
              <i style={{ width: `${(displayValue / max) * 100}%` }} />
            </span>
            <span className="sample4-ranking-value">
              {mode === 'percent' ? `${displayValue.toFixed(1)}%` : formatCount(entry.value)}
              {mode === 'count' && total > 0 && <small>{formatPct(entry.value / total, 0)}</small>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Intro({ actions }) {
  return actions ? <section className="sample4-intro-actions">{actions}</section> : null
}

function TimeRangeSelector({ value, onChange }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={TIME_RANGES.map((range) => ({ value: range, label: range }))}
    />
  )
}

// `lockedMode` pins the display mode and drops the toggle — used to keep the
// `general` role on percentages so absolute counts never surface.
function RankingPanel({ eyebrow, title, entries, total, defaultMode = 'count', lockedMode, actions, scrollRows = false, className }) {
  const [mode, setMode] = useState(defaultMode)
  const effectiveMode = lockedMode ?? mode
  return (
    <article className={className ? `sample4-panel ${className}` : 'sample4-panel'}>
      <PanelHeading
        eyebrow={eyebrow}
        title={title}
        actions={actions ?? (lockedMode ? null : (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'count', label: 'Count' },
              { value: 'percent', label: 'Percentage' },
            ]}
          />
        ))}
      />
      <div className={scrollRows ? 'sample4-ranking-scroll' : undefined}>
        <Ranking entries={entries} total={total} mode={effectiveMode} />
      </div>
    </article>
  )
}

// `hideCounts` keeps the `general` role on percentages — same rule as the
// ranking panels, applied to the map's note, tooltip and legend.
function WorldMapPanel({ entries, hideCounts = false }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  const max = Math.max(1, ...entries.map((entry) => entry.value))
  const points = entries
    .map((entry) => {
      const normalized = entry.name.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').trim()
      const coords = COUNTRY_COORDS[normalized]
      if (!coords) return null
      const [lat, lon] = coords
      const projected = WORLD_PROJECTION([lon, lat])
      if (!projected) return null
      return {
        ...entry,
        normalized,
        x: projected[0],
        y: projected[1],
        radius: 5 + (entry.value / max) * 18,
      }
    })
    .filter(Boolean)
  const topPoints = points.slice(0, 6)

  return (
    <article className="sample4-panel sample4-full sample4-world-panel">
      <PanelHeading
        eyebrow="Global Map"
        title="Users by country"
        note={hideCounts
          ? `${formatCount(points.length)} countries mapped`
          : `${formatCount(points.length)} countries mapped · ${formatCount(total)} analyzed users`}
      />
      <div className="sample4-world-map-wrap">
        <div className="sample4-world-map-stage">
          <svg className="sample4-world-map" viewBox={`0 0 ${WORLD_SIZE[0]} ${WORLD_SIZE[1]}`} role="img" aria-label="World map showing user countries">
            <defs>
              <filter id="sample4-map-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path className="sample4-world-sphere" d={WORLD_PATH({ type: 'Sphere' }) ?? undefined} />
            <path className="sample4-world-graticule" d={WORLD_PATH(WORLD_GRATICULE) ?? undefined} />
            <g className="sample4-world-land">
              {WORLD_LAND.map((land, index) => (
                <path key={index} d={WORLD_PATH(land) ?? undefined} />
              ))}
            </g>
            <g>
              {points.map((point) => (
                <g
                  key={point.name}
                  className="sample4-world-point"
                  filter="url(#sample4-map-glow)"
                  onPointerEnter={() => setHoveredPoint(point)}
                  onPointerLeave={() => setHoveredPoint(null)}
                >
                  <circle cx={point.x} cy={point.y} r={point.radius} />
                  <circle cx={point.x} cy={point.y} r={Math.max(3, point.radius * 0.34)} />
                </g>
              ))}
            </g>
          </svg>
          {hoveredPoint && (
            <div
              className={`sample4-world-tooltip${hoveredPoint.y < 90 ? ' below' : ''}`}
              style={{
                left: `${(hoveredPoint.x / WORLD_SIZE[0]) * 100}%`,
                top: `${(hoveredPoint.y / WORLD_SIZE[1]) * 100}%`,
                transform: hoveredPoint.y < 90 ? 'translate(-50%, 14px)' : undefined,
              }}
            >
              <div>
                <span>{COUNTRY_FLAGS[hoveredPoint.normalized] ?? '🌐'}</span>
                <strong>{hoveredPoint.name}</strong>
              </div>
              {hideCounts
                ? <p><b>{formatPct(hoveredPoint.value / total, 1)}</b> of analyzed users</p>
                : <>
                    <p><b>{formatCount(hoveredPoint.value)}</b> signups</p>
                    <small>{formatPct(hoveredPoint.value / total, 1)} of analyzed users</small>
                  </>}
            </div>
          )}
        </div>
        <div className="sample4-world-legend">
          {topPoints.map((point) => (
            <div key={point.name}>
              <span>{point.name}</span>
              <strong>{hideCounts ? formatPct(point.value / total, 1) : formatCount(point.value)}</strong>
              {!hideCounts && <small>{formatPct(point.value / total, 0)}</small>}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

const labelUser = (userId, labels) => labels.get(userId) ?? `${userId.slice(0, 8)}…`
const isIgnoredTopUser = (userId, labels) => {
  const label = labelUser(userId, labels).toLowerCase()
  return IGNORED_TOP_USER_PREFIXES.some((prefix) => label.startsWith(prefix))
}
const sourceString = (value) => {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'string') return value || '—'
  const leaves = extractStringLeaves(value)
  return leaves.length ? leaves.join(', ') : JSON.stringify(value)
}
const fieldValue = (user, field) => {
  const value = user.utm_data?.[field]
  return value ? String(value) : ''
}

function buildUserLabels(stats) {
  const labels = new Map()
  const add = (user) => {
    const label = user?.email?.trim() || user?.username?.trim()
    if (user?.user_id && label && !labels.has(user.user_id)) labels.set(user.user_id, label)
  }
  for (const user of stats?.all_users_basic ?? []) add(user)
  for (const user of stats?.latest_users ?? []) add(user)
  return labels
}

const HOUR_LABEL = (date) => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
const DAY_LABEL = (date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
const MONTH_LABEL = (date) => `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`

/**
 * The time window the General tab's charts are drawn over, plus the bucket
 * size that window implies (hourly on 12h/1d, daily on 7d/30d).
 *
 * Shared so User Growth and the activity charts always cover exactly the same
 * period — they sit under one date picker, and drifting apart would be a bug
 * nobody would notice until the numbers stopped adding up.
 */
function resolveWindow(timeRange, tzOffsetMs, customRange) {
  const now = getTzNow(tzOffsetMs)

  if (customRange.start && customRange.end) {
    const startTime = new Date(`${customRange.start}T00:00:00Z`)
    const endTime = new Date(`${customRange.end}T23:59:59Z`)
    const spanMs = endTime.getTime() - startTime.getTime()
    const hourly = spanMs <= DAY_MS
    return {
      startTime,
      endTime,
      intervalMs: hourly ? 60 * 60 * 1000 : DAY_MS,
      formatLabel: hourly ? HOUR_LABEL : DAY_LABEL,
    }
  }
  if (timeRange === '12h') {
    return { startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), endTime: now, intervalMs: 60 * 60 * 1000, formatLabel: HOUR_LABEL }
  }
  if (timeRange === '1d') {
    return { startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), endTime: now, intervalMs: 2 * 60 * 60 * 1000, formatLabel: HOUR_LABEL }
  }
  // Day buckets start at midnight. "Now minus 7×24h" used to start the window
  // mid-day, so the first day only counted the hours after this moment and
  // read low — and the window showed 8 days, the first and last both partial.
  // Now it is the last N calendar days, today included (and still filling).
  const days = timeRange === '7d' ? 7 : 30
  const todayStart = Math.floor(now.getTime() / DAY_MS) * DAY_MS
  return {
    startTime: new Date(todayStart - (days - 1) * DAY_MS),
    endTime: now,
    intervalMs: DAY_MS,
    formatLabel: DAY_LABEL,
  }
}

/**
 * Signups per bucket, on User Growth's own granularity.
 *
 * Separate from buildChartData for two reasons: growth is the only chart with
 * a granularity control, and it reads only `all_users_timeline` — re-running
 * the (40k-row) conversation loop to re-bucket signups would be pure waste.
 *
 * 'day' means whatever the selected window implies, so 12h stays hourly.
 * 'month' is a calendar month, not 30 days, hence the date-keyed bucketing.
 */
function buildGrowthChart(stats, timeRange, tzOffsetMs, customRange, granularity) {
  if (!stats) return { net: [], total: [] }
  const { startTime, endTime, intervalMs, formatLabel } = resolveWindow(timeRange, tzOffsetMs, customRange)
  const startMs = startTime.getTime()
  const endMs = endTime.getTime()

  const monthStart = (t) => {
    const d = new Date(t)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  }
  const nextMonth = (t) => {
    const d = new Date(t)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }

  // Buckets are seeded across the whole window so quiet periods render as
  // zeroes rather than vanishing from the axis.
  const keys = []
  let keyOf
  let labelOf
  if (granularity === 'month') {
    keyOf = monthStart
    labelOf = (key) => MONTH_LABEL(new Date(key))
    for (let cursor = monthStart(startMs); cursor <= endMs; cursor = nextMonth(cursor)) keys.push(cursor)
  } else {
    const span = granularity === 'week' ? 7 * DAY_MS : intervalMs
    // Weeks are anchored to the window start, so the first bucket is always a
    // full week of the selected range rather than a stub ending on Sunday.
    const origin = granularity === 'week' ? startMs : 0
    keyOf = (t) => origin + Math.floor((t - origin) / span) * span
    labelOf = (key) => (granularity === 'week' ? DAY_LABEL(new Date(key)) : formatLabel(new Date(key)))
    for (let cursor = keyOf(startMs); cursor <= endMs; cursor += span) keys.push(cursor)
  }

  const counts = new Map(keys.map((key) => [key, 0]))
  let baseTotal = 0
  for (const user of stats.all_users_timeline ?? []) {
    const t = parseInTz(user.created_at, tzOffsetMs).getTime()
    if (t < startMs) {
      baseTotal += 1
      continue
    }
    if (t > endMs) continue
    const key = keyOf(t)
    if (counts.has(key)) counts.set(key, counts.get(key) + 1)
  }

  let runningTotal = baseTotal
  const net = []
  const total = []
  for (const key of keys) {
    const time = labelOf(key)
    const users = counts.get(key) ?? 0
    net.push({ time, users })
    runningTotal += users
    total.push({ time, users: runningTotal })
  }
  return { net, total }
}

function buildChartData(stats, timeRange, tzOffsetMs, customRange = { start: '', end: '' }) {
  const empty = { conversationChart: [], activeUserChart: [] }
  if (!stats) return empty
  const { startTime, endTime, intervalMs, formatLabel } = resolveWindow(timeRange, tzOffsetMs, customRange)

  const bucketKey = (t) => Math.floor(t / intervalMs) * intervalMs
  const buckets = new Map()
  let cursor = new Date(startTime)
  while (cursor <= endTime) {
    const key = bucketKey(cursor.getTime())
    if (!buckets.has(key)) {
      buckets.set(key, {
        time: formatLabel(cursor),
        conversations: 0,
        newUserConversations: 0,
        returningUserConversations: 0,
        chatConversations: 0,
        courseGenerations: 0,
        newActiveUsers: new Set(),
        returningActiveUsers: new Set(),
        // Returning users whose account is at most 7 days old at the start of
        // the bucket — the rest of `returningActiveUsers` is the older pool.
        recentReturningUsers: new Set(),
        signups: 0,
      })
    }
    cursor = new Date(cursor.getTime() + intervalMs)
  }

  const signupTimeByUser = new Map()
  for (const user of stats.all_users_timeline ?? []) {
    const t = parseInTz(user.created_at, tzOffsetMs).getTime()
    if (signupTimeByUser.has(user.user_id)) continue
    signupTimeByUser.set(user.user_id, t)
    // Same buckets as the activity counts, so the signup line can sit on top
    // of the active-user bars without the two drifting apart.
    if (t >= startTime.getTime() && t <= endTime.getTime()) {
      const bucket = buckets.get(bucketKey(t))
      if (bucket) bucket.signups += 1
    }
  }

  // Chat conversations and course generation runs are both "a user asked for
  // something", so they land in the same buckets and only differ by which
  // per-kind counter they bump.
  const addEvent = (userId, createdAt, kind) => {
    const d = parseInTz(createdAt, tzOffsetMs)
    if (d < startTime || d > endTime) return
    const key = bucketKey(d.getTime())
    const bucket = buckets.get(key)
    if (!bucket) return
    bucket.conversations += 1
    bucket[kind] += 1
    const signupTs = signupTimeByUser.get(userId)
    const isNewInBucket = signupTs != null && signupTs >= key && signupTs < key + intervalMs
    if (isNewInBucket) {
      bucket.newUserConversations += 1
      bucket.newActiveUsers.add(userId)
    } else {
      bucket.returningUserConversations += 1
      bucket.returningActiveUsers.add(userId)
      // No signup row means the account predates the log, so it is old.
      if (signupTs != null && key - signupTs <= RECENT_ACCOUNT_DAYS * DAY_MS) bucket.recentReturningUsers.add(userId)
    }
  }

  for (const conv of stats.conversation_history ?? []) {
    addEvent(conv.user_id, conv.created_at, 'chatConversations')
  }
  for (const run of stats.course_generation_history ?? []) {
    addEvent(run.user_id, run.created_at, 'courseGenerations')
  }

  const nowShifted = getTzNow(tzOffsetMs).getTime()
  const sorted = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([key, b]) => ({ ...b, key, inProgress: key + intervalMs > nowShifted }))
  return {
    conversationChart: sorted.map((b) => ({
      time: b.time,
      conversations: b.conversations,
      newUserConversations: b.newUserConversations,
      returningUserConversations: b.returningUserConversations,
      chatConversations: b.chatConversations,
      courseGenerations: b.courseGenerations,
    })),
    activeUserChart: sorted.map((b) => ({
      time: b.time,
      activeUsers: b.newActiveUsers.size + b.returningActiveUsers.size,
      newUsers: b.newActiveUsers.size,
      returningUsers: b.returningActiveUsers.size,
      recentReturningUsers: b.recentReturningUsers.size,
      establishedUsers: b.returningActiveUsers.size - b.recentReturningUsers.size,
      signups: b.signups,
      inProgress: b.inProgress,
    })),
  }
}

function quarterWindow(dateKey, offset = 0) {
  const [year, month] = dateKey.split('-').map(Number)
  const currentQuarter = Math.floor((month - 1) / 3)
  const start = new Date(Date.UTC(year, currentQuarter * 3 + offset * 3, 1))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0))
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function buildOverviewWindow(mode, preset, customRange, tzOffsetMs) {
  if (mode === 'allTime') return null
  if (mode === 'custom') {
    return customRange.start && customRange.end ? customRange : null
  }

  const today = todayTzKey(tzOffsetMs)
  if (preset === 'pastTwoMonths') return { start: addDays(today, -59), end: today }
  if (preset === 'pastMonth') return { start: addDays(today, -29), end: today }
  if (preset === 'lastQuarter') return quarterWindow(today, -1)
  if (preset === 'thisQuarter') return { start: quarterWindow(today).start, end: today }
  if (preset === 'thisMonthToDate') return { start: `${today.slice(0, 7)}-01`, end: today }
  if (preset === 'yearToDate') return { start: `${today.slice(0, 4)}-01-01`, end: today }
  return null
}

// Counts course generation runs alongside chats, same as the activity charts.
// Two different meanings of "Conversations" on one page would be worse than
// either definition on its own.
function countOverviewStats(stats, window, tzOffsetMs) {
  if (!stats) return { totalUsers: 0, conversations: 0 }
  const runs = stats.course_generation_history ?? []
  if (!window) {
    return {
      totalUsers: stats.total_users,
      conversations: stats.conversation_history.length + runs.length,
    }
  }
  const inWindow = (stamp) => {
    const day = toTzDateKey(stamp, tzOffsetMs)
    return day >= window.start && day <= window.end
  }
  return {
    totalUsers: (stats.all_users_timeline ?? []).filter((user) => inWindow(user.created_at)).length,
    conversations: (stats.conversation_history ?? []).filter((conversation) => inWindow(conversation.created_at)).length
      + runs.filter((run) => inWindow(run.created_at)).length,
  }
}

function buildAnalytics(stats) {
  const rows = stats?.user_analytics ?? []
  const originCounts = new Map()
  for (const row of rows) {
    const origin = classifyUserOrigin(row.nationality, row.country)
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1)
  }

  return {
    rows,
    country: aggregateCounts(rows, (r) => r.country),
    nationality: aggregateCounts(rows, (r) => r.nationality),
    identity: withOtherBucket(aggregateCounts(rows, (r) => r.identity)),
    initialUsedFunction: withOtherBucket(aggregateCounts(rows, (r) => r.initial_used_function)),
    mostUsedFunction: withOtherBucket(aggregateMostUsedFunctions(rows)),
    identityCountries: topBreakdownByCategory(rows, (r) => r.identity, (r) => r.country),
    identityNationalities: topBreakdownByCategory(rows, (r) => r.identity, (r) => r.nationality),
    initialUsedFunctionCountries: topBreakdownByCategory(rows, (r) => r.initial_used_function, (r) => r.country),
    initialUsedFunctionNationalities: topBreakdownByCategory(rows, (r) => r.initial_used_function, (r) => r.nationality),
    studentBreakdown: Object.entries(USER_ORIGIN_LABELS)
      .map(([origin, name]) => ({ name, value: originCounts.get(origin) ?? 0 }))
      .filter((entry) => entry.value > 0),
  }
}

function buildPollData(stats) {
  const rows = stats?.user_poll_data ?? []
  const countryCounts = new Map()
  for (const row of rows) {
    for (const country of new Set(extractLoginIpCountries(row.login_ip))) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)
    }
  }
  const loginCountries = Array.from(countryCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return {
    rows,
    acquisitionSources: withOtherBucket(aggregateJsonbColumn(rows, (r) => r.user_acquisition_sources)),
    loginCountries: withOtherBucket(loginCountries),
  }
}

function buildRetention(stats, tzOffsetMs, signupRange, retentionMode, dauDate, mauMode, mauMonth, mauEndDate) {
  const today = todayTzKey(tzOffsetMs)
  // One definition of "active" for the whole tab. DAU and MAU used to count
  // chats only while everything else moved on, which left out every user who
  // generated a course without opening a chat.
  const events = stats ? collectMeaningfulEvents(stats) : []
  const dauUsers = new Set()
  for (const c of events) {
    if (toTzDateKey(c.created_at, tzOffsetMs) === dauDate) dauUsers.add(c.user_id)
  }
  const dauSignups = (stats?.all_users_timeline ?? []).filter((u) => toTzDateKey(u.created_at, tzOffsetMs) === dauDate).length

  let mauWindow
  if (mauMode === 'month') {
    const [y, m] = mauMonth.split('-').map(Number)
    const start = y && m ? new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10) : today
    const end = y && m ? new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) : today
    mauWindow = { start, end, label: `${y}-${String(m).padStart(2, '0')}` }
  } else if (mauMode === 'endDate') {
    const end = mauEndDate || today
    mauWindow = { start: addDays(end, -29), end, label: `30 days ending ${end}` }
  } else {
    mauWindow = { start: addDays(today, -29), end: today, label: 'Last 30 days' }
  }

  const mauUsers = new Set()
  for (const c of events) {
    const day = toTzDateKey(c.created_at, tzOffsetMs)
    if (day >= mauWindow.start && day <= mauWindow.end) mauUsers.add(c.user_id)
  }
  const mauSignups = (stats?.all_users_timeline ?? []).filter((u) => {
    const day = toTzDateKey(u.created_at, tzOffsetMs)
    return day >= mauWindow.start && day <= mauWindow.end
  }).length

  let minSignup = null
  let maxSignup = null
  const signupDayByUser = new Map()
  for (const user of stats?.all_users_timeline ?? []) {
    const day = toTzDateKey(user.created_at, tzOffsetMs)
    if (minSignup === null || day < minSignup) minSignup = day
    if (maxSignup === null || day > maxSignup) maxSignup = day
    if (signupRange.start && day < signupRange.start) continue
    if (signupRange.end && day > signupRange.end) continue
    if (!signupDayByUser.has(user.user_id)) signupDayByUser.set(user.user_id, day)
  }

  const activeDaysByUser = new Map()
  for (const event of events) {
    const signupDay = signupDayByUser.get(event.user_id)
    if (!signupDay) continue
    const diff = daysBetweenDateKeys(signupDay, toTzDateKey(event.created_at, tzOffsetMs))
    if (diff < 1) continue
    const days = activeDaysByUser.get(event.user_id) ?? new Set()
    days.add(diff)
    activeDaysByUser.set(event.user_id, days)
  }

  const users = Array.from(signupDayByUser.entries()).map(([userId, signupDay]) => ({
    userId,
    daysSinceSignup: daysBetweenDateKeys(signupDay, today),
  }))
  const maxAge = users.reduce((max, user) => Math.max(max, user.daysSinceSignup), -1)
  const curve = Array.from({ length: MAX_RETENTION_DAY }, (_, index) => {
    const day = index + 1
    let eligible = 0
    let returned = 0
    for (const user of users) {
      // `<=`, not `<`: a user whose day N is TODAY has not finished that day
      // yet. Counting them as eligible booked every one who had not shown up
      // by this morning as lost.
      if (user.daysSinceSignup <= day) continue
      eligible += 1
      const days = activeDaysByUser.get(user.userId)
      if (!days) continue
      if (retentionMode === 'exact') {
        if (days.has(day)) returned += 1
      } else {
        for (const activeDay of days) {
          if (activeDay >= day) {
            returned += 1
            break
          }
        }
      }
    }
    return { day, ratePct: eligible > 0 ? (returned / eligible) * 100 : 0, returned, eligible, mature: maxAge > day, hasData: eligible > 0 }
  })

  return {
    dau: { activeUsers: dauUsers.size, newSignups: dauSignups },
    mau: { activeUsers: mauUsers.size, newSignups: mauSignups, window: mauWindow },
    ratio: mauUsers.size > 0 ? dauUsers.size / mauUsers.size : 0,
    curve,
    signupBounds: minSignup && maxSignup ? { min: minSignup, max: maxSignup } : null,
  }
}

function buildTopUsers(stats, tzOffsetMs, topUsersRange, topK) {
  const labels = buildUserLabels(stats)
  const analyticsByUser = new Map((stats?.user_analytics ?? []).map((a) => [a.user_id, a]))
  const pollByUser = new Map((stats?.user_poll_data ?? []).map((p) => [p.user_id, p]))
  const counts = new Map()
  let totalConversations = 0
  let minDate = null
  let maxDate = null
  for (const conv of stats?.conversation_history ?? []) {
    const day = toTzDateKey(conv.created_at, tzOffsetMs)
    if (minDate === null || day < minDate) minDate = day
    if (maxDate === null || day > maxDate) maxDate = day
    if (isIgnoredTopUser(conv.user_id, labels)) continue
    if (topUsersRange.start && day < topUsersRange.start) continue
    if (topUsersRange.end && day > topUsersRange.end) continue
    counts.set(conv.user_id, (counts.get(conv.user_id) ?? 0) + 1)
    totalConversations += 1
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const ranked = sorted.map(([uid, value]) => ({ name: labelUser(uid, labels), value }))
  const rows = sorted.slice(0, topK).map(([uid, conversations]) => {
    const a = analyticsByUser.get(uid)
    const p = pollByUser.get(uid)
    return {
      user_id: uid,
      label: labelUser(uid, labels),
      conversations,
      identity: a?.identity ?? null,
      country: a?.country ?? null,
      nationality: a?.nationality ?? null,
      initialUsedFunction: a?.initial_used_function ?? null,
      mostUsedFunctions: a?.most_used_function ?? null,
      loginIp: p?.login_ip ?? null,
      acquisitionSources: p?.user_acquisition_sources ?? null,
    }
  })
  return {
    data: withOtherBucket(ranked, topK),
    rows,
    totalConversations,
    activeUsers: counts.size,
    bounds: minDate && maxDate ? { min: minDate, max: maxDate } : null,
  }
}

// ---------------------------------------------------------------------------
// Detailed analysis
//
// The Paid tab splits in two. General analysis is the trend / renewal /
// retention view over every payer. Detailed analysis answers "who are these
// payers, and what were they doing before and after they paid" for ONE
// cohort: the payers whose FIRST payment falls inside its own date range.
//
// That range is deliberately separate from the General view's. General's
// picker scopes a time *series*; this one picks a *cohort* whose whole
// history is then read end to end — sharing one control would have made both
// of them mean something they don't.
// ---------------------------------------------------------------------------

const PAID_USAGE_PHASES = [
  { key: 'before', label: '付费前', note: '首次付费之前的使用' },
  { key: 'after', label: '付费后', note: '首次付费当天及之后' },
  { key: 'overall', label: '全程', note: '整个过程，前后合计' },
]

function buildPaidDetail(paidModel, insights, range, tzOffsetMs) {
  const { start, end } = range
  const cohort = !start && !end
    ? paidModel.paidUsers
    : paidModel.paidUsers.filter((user) => {
      const day = dateOnly(user.firstPaidAt, tzOffsetMs)
      return (!start || day >= start) && (!end || day <= end)
    })

  const countBy = (pick) => Array.from(cohort.reduce((map, user) => {
    const key = pick(user) ?? 'Unknown'
    map.set(key, (map.get(key) ?? 0) + 1)
    return map
  }, new Map()).entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Every event, split at that user's own first payment. Events belonging to
  // someone outside the cohort have no boundary to split on and are skipped.
  const firstPaidByUser = new Map(cohort.map((user) => [user.user_id, user.firstPaidAt]))
  const tallies = { before: new Map(), after: new Map(), overall: new Map() }
  const bump = (phase, feature, userId) => {
    const entry = tallies[phase].get(feature) ?? { events: 0, users: new Set() }
    entry.events += 1
    entry.users.add(userId)
    tallies[phase].set(feature, entry)
  }
  for (const event of insights?.feature_events ?? []) {
    const firstPaidAt = firstPaidByUser.get(event.user_id)
    if (firstPaidAt == null) continue
    const at = parseTs(event.at)
    if (at == null) continue
    bump(at < firstPaidAt ? 'before' : 'after', event.feature, event.user_id)
    bump('overall', event.feature, event.user_id)
  }

  // One shared feature order across the three pies, so the same slice sits in
  // the same place in each and they can be read side by side.
  const usage = Object.fromEntries(PAID_USAGE_PHASES.map(({ key }) => [
    key,
    Array.from(tallies[key].entries())
      .sort((a, b) => featureRank(a[0]) - featureRank(b[0]) || a[0].localeCompare(b[0]))
      .map(([feature, entry]) => ({
        name: featureLabel(feature),
        events: entry.events,
        users: entry.users.size,
      })),
  ]))

  return {
    cohort,
    country: countBy((user) => user.country),
    nationality: countBy((user) => user.nationality),
    usage,
  }
}

function buildPaidModel(stats, paidStats, tzOffsetMs, paidRateGranularity, paidRateRange, paidRetentionMode) {
  const subscriptions = paidStats?.subscriptions ?? []
  const labels = buildUserLabels(stats)
  const basicByUser = new Map()
  for (const user of stats?.all_users_basic ?? []) basicByUser.set(user.user_id, user)
  for (const user of stats?.all_users_timeline ?? []) {
    if (!basicByUser.has(user.user_id)) basicByUser.set(user.user_id, { user_id: user.user_id, created_at: user.created_at })
  }
  const analyticsByUser = new Map((stats?.user_analytics ?? []).map((a) => [a.user_id, a]))
  const pollByUser = new Map((stats?.user_poll_data ?? []).map((p) => [p.user_id, p]))
  const bucketed = { paid: [], invite: [], manual: [], other: [] }
  for (const sub of subscriptions) bucketed[bucketOfBillingReason(sub.billing_reason)].push(sub)

  const byUser = new Map()
  for (const sub of bucketed.paid) {
    if (!sub.user_id) continue
    const list = byUser.get(sub.user_id) ?? []
    list.push(sub)
    byUser.set(sub.user_id, list)
  }
  const inviteUsersSet = new Set(bucketed.invite.map((s) => s.user_id))
  const manualUsersSet = new Set(bucketed.manual.map((s) => s.user_id))
  const now = Date.now()
  const paidUsers = []
  for (const [uid, subs] of byUser) {
    const spans = buildPaidSpans(subs)
    if (spans.length === 0) continue
    const firstPaidAt = spans[0].start
    const totalPaidDays = spans.reduce((sum, span) => sum + (span.end - span.start) / DAY_MS, 0)
    const basic = basicByUser.get(uid)
    const signupAt = parseTs(basic?.created_at)
    const analytics = analyticsByUser.get(uid)
    const poll = pollByUser.get(uid)
    paidUsers.push({
      user_id: uid,
      label: labelUser(uid, labels),
      email: basic?.email ?? null,
      username: basic?.username ?? null,
      identity: analytics?.identity ?? null,
      country: analytics?.country ?? null,
      nationality: analytics?.nationality ?? null,
      signupAt,
      firstPaidAt,
      signupToFirstPaidDays: signupAt != null ? (firstPaidAt - signupAt) / DAY_MS : null,
      totalPaidDays,
      totalPaidSpans: spans.length,
      isCurrentlyPaid: spans.some((span) => span.start <= now && now <= span.end),
      hasOneOff: subs.some((s) => isOneOffReason(s.billing_reason)),
      hasInvite: inviteUsersSet.has(uid),
      hasManual: manualUsersSet.has(uid),
      tierMix: Array.from(new Set(subs.map((s) => s.tier))).sort().join('+') || '—',
      spans,
      initialUsedFunction: analytics?.initial_used_function ?? null,
      mostUsedFunctions: analytics?.most_used_function ?? null,
      loginIp: poll?.login_ip ?? null,
      acquisitionSources: poll?.user_acquisition_sources ?? null,
    })
  }

  const aggregateSidebar = (subs) => {
    const grouped = new Map()
    for (const sub of subs) {
      if (!sub.user_id) continue
      const ts = parseTs(sub.started_at) ?? parseTs(sub.created_at) ?? 0
      const current = grouped.get(sub.user_id) ?? { count: 0, latestAt: 0 }
      current.count += 1
      current.latestAt = Math.max(current.latestAt, ts)
      grouped.set(sub.user_id, current)
    }
    return Array.from(grouped.entries())
      .map(([userId, row]) => ({ user_id: userId, label: labelUser(userId, labels), ...row }))
      .sort((a, b) => b.latestAt - a.latestAt)
  }

  const geo = (() => {
    const count = (pick) => Array.from(paidUsers.reduce((map, user) => {
      const key = pick(user) ?? 'Unknown'
      map.set(key, (map.get(key) ?? 0) + 1)
      return map
    }, new Map()).entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    return {
      country: count((u) => u.country),
      nationality: count((u) => u.nationality),
      identity: count((u) => u.identity),
    }
  })()

  // ---- Pre-payment feature usage -----------------------------------------
  // What did people who eventually paid use *first*?
  //
  // `initial_used_function` is the only feature signal that is unambiguously
  // pre-payment: it records the first function a user ever touched, so for
  // anyone who did not pay on day zero it predates the payment. It is the
  // basis of the conversion table below.
  //
  // `most_used_function` carries no timestamps — only lifetime totals — so it
  // CANNOT be split into before/after payment. It is surfaced separately and
  // labelled as lifetime rather than being passed off as pre-payment usage.
  const analyticsRows = stats?.user_analytics ?? []
  const paidIds = new Set(paidUsers.map((u) => u.user_id))

  const features = (() => {
    const initial = buildSegmentConversion(
      analyticsRows,
      paidIds,
      (row) => {
        const fn = normalizeFunctionName(row.initial_used_function)
        return fn ? [fn] : []
      },
      FEATURE_MIN_SAMPLE,
    )
    const paidAnalytics = analyticsRows.filter((row) => paidIds.has(row.user_id))

    return {
      conversion: initial.ranked,
      belowSample: initial.belowSample,
      analyzedTotal: initial.analyzedTotal,
      analyzedPaid: initial.analyzedPaid,
      // Lifetime, not pre-payment — see the note above.
      paidMostUsed: withOtherBucket(aggregateMostUsedFunctions(paidAnalytics)),
      overallRatePct: initial.overallRatePct,
      paidTotal: paidUsers.length,
    }
  })()

  // ---- Paid profile -------------------------------------------------------
  // Same conversion math as the table above, applied to who the user is
  // (identity, geography) and to lifetime feature usage. A plain distribution
  // of payers mostly restates where the user base already is, so every
  // dimension carries the segment's own paid rate and its index against the
  // baseline alongside its share of payers.
  const profile = (() => {
    const singleValue = (value) => [value?.trim() || UNKNOWN_SEGMENT]
    const keysFor = {
      mostUsedFunction: (row) =>
        Array.isArray(row.most_used_function)
          ? row.most_used_function.map((item) => normalizeFunctionName(item?.function)).filter(Boolean)
          : [],
      identity: (row) => singleValue(row.identity),
      country: (row) => singleValue(row.country),
      nationality: (row) => singleValue(row.nationality),
      origin: (row) => [USER_ORIGIN_LABELS[classifyUserOrigin(row.nationality, row.country)]],
    }
    return Object.fromEntries(
      PAID_PROFILE_DIMENSIONS.map((dimension) => [
        dimension.value,
        buildSegmentConversion(analyticsRows, paidIds, keysFor[dimension.value], dimension.minSample),
      ]),
    )
  })()

  const paidRate = buildPaidRate(stats, bucketed.paid, paidRateGranularity, paidRateRange, tzOffsetMs)
  const renewal = buildRenewal(bucketed.paid, isOneOffReason, tzOffsetMs)
  const firstPaidByUser = new Map(paidUsers.map((user) => [user.user_id, user.firstPaidAt]))
  // Measured, not remembered: this figure is quoted next to the payment
  // trend, and a hard-coded one goes stale the moment the product changes.
  const signupToPaid = (() => {
    const lags = paidUsers.map((u) => u.signupToFirstPaidDays).filter((d) => d != null).sort((a, b) => a - b)
    if (lags.length === 0) return null
    return {
      users: lags.length,
      medianDays: lags[Math.floor((lags.length - 1) / 2)],
      withinDayPct: (lags.filter((d) => d <= 1).length / lags.length) * 100,
      withinWeekPct: (lags.filter((d) => d <= 7).length / lags.length) * 100,
    }
  })()
  const paidRetention = buildPaidRetention(paidUsers, stats, tzOffsetMs, paidRetentionMode)
  const recentPayments = buildRecentPayments(bucketed.paid, labels)

  return {
    paidUsers,
    bucketed,
    inviteUsers: aggregateSidebar(bucketed.invite),
    manualUsers: aggregateSidebar(bucketed.manual),
    overview: {
      totalPaidUsers: paidUsers.length,
      currentlyActive: paidUsers.filter((u) => u.isCurrentlyPaid).length,
      churned: paidUsers.filter((u) => !u.isCurrentlyPaid).length,
      onlyOneOff: paidUsers.filter((u) => u.hasOneOff && u.totalPaidSpans <= 1).length,
    },
    geo,
    features,
    profile,
    paidRate,
    monthlyRenewal: renewal.monthly,
    renewal,
    firstPaidByUser,
    signupToPaid,
    paidRetention,
    recentPayments,
  }
}

/**
 * Segment → conversion table.
 *
 * For every key `keysOf` produces, counts the profiled users in that segment
 * and how many of them paid, then indexes the segment's paid rate against the
 * paid rate of the whole universe. An index > 1 means the segment converts
 * better than average, which is the part worth acting on — a raw share of
 * payers mostly just re-describes the shape of the user base.
 *
 * The universe is users with a `user_analytics` row and at least one key in
 * this dimension; payers without a profile are outside it and the caller says
 * so. `keysOf` may return several keys for one user (they use several
 * features), in which case shares sum past 100% by design.
 *
 * Segments under `minSample` users are held out of `ranked` — one payer out of
 * two users reads as a 50% paid rate — and counted in `belowSample` rather
 * than dropped silently.
 */
function buildSegmentConversion(analyticsRows, paidIds, keysOf, minSample) {
  const usersByKey = new Map()
  const paidByKey = new Map()
  const seenUsers = new Set()
  let analyzedTotal = 0
  let analyzedPaid = 0

  for (const row of analyticsRows) {
    if (!row.user_id || seenUsers.has(row.user_id)) continue
    const keys = Array.from(new Set(keysOf(row).filter(Boolean)))
    if (keys.length === 0) continue
    seenUsers.add(row.user_id)

    const isPaid = paidIds.has(row.user_id)
    analyzedTotal += 1
    if (isPaid) analyzedPaid += 1
    for (const key of keys) {
      usersByKey.set(key, (usersByKey.get(key) ?? 0) + 1)
      if (isPaid) paidByKey.set(key, (paidByKey.get(key) ?? 0) + 1)
    }
  }

  const rows = Array.from(usersByKey.entries()).map(([name, users]) => {
    const paid = paidByKey.get(name) ?? 0
    const paidShare = analyzedPaid > 0 ? paid / analyzedPaid : 0
    const allShare = analyzedTotal > 0 ? users / analyzedTotal : 0
    return {
      name,
      users,
      paid,
      ratePct: users > 0 ? (paid / users) * 100 : 0,
      paidSharePct: paidShare * 100,
      allSharePct: allShare * 100,
      index: allShare > 0 ? paidShare / allShare : null,
    }
  })

  const ranked = rows
    .filter((row) => row.users >= minSample)
    .sort((a, b) => b.ratePct - a.ratePct)

  return {
    rows,
    ranked,
    belowSample: rows.length - ranked.length,
    analyzedTotal,
    analyzedPaid,
    overallRatePct: analyzedTotal > 0 ? (analyzedPaid / analyzedTotal) * 100 : 0,
  }
}

/**
 * Per-bucket payment counts and the first-payment rate against new signups.
 *
 * Every paid record is either a user's first payment or a repeat one, decided
 * by timestamp rather than by `billing_reason`.
 *
 * The label cannot be trusted for this: the backend decides "renewal vs
 * initial" by asking whether the user currently has an unexpired paid row, and
 * Stripe's renewal webhook usually lands at or after the old period ends — so
 * about half of all renewals are stored as `initial_subscription` (522 stored
 * vs 268 genuine at the time of writing). Counting those rows overstated
 * first-time payers by ~38%. A user's earliest paid event is unambiguous,
 * needs no backfill, and stays correct once the backend's labelling is fixed.
 */
function buildPaidRate(stats, paidSubscriptions, granularityDays, range, tzOffsetMs) {
  const bucketMs = granularityDays * DAY_MS
  const shiftedNow = Date.now() + tzOffsetMs
  const signups = (stats?.all_users_timeline ?? []).map((u) => parseTs(u.created_at)).filter((v) => v != null)

  // Walking the events in time order marks the first payment per user without
  // a second pass, and without the tie a `min` comparison would have on two
  // records written at the same instant.
  const events = []
  for (const sub of paidSubscriptions) {
    const t = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (t == null || !sub.user_id) continue
    events.push({ t, userId: sub.user_id, oneoff: isOneOffReason(sub.billing_reason) })
  }
  events.sort((a, b) => a.t - b.t)
  const seenUsers = new Set()
  for (const event of events) {
    event.first = !seenUsers.has(event.userId)
    seenUsers.add(event.userId)
  }

  const all = [...signups, ...events.map((e) => e.t)].map((t) => t + tzOffsetMs)
  if (all.length === 0) return []
  const dataMin = Math.min(...all)
  // Buckets live in shifted space (real time + offset), where the boundary of
  // tz-day D sits at UTC midnight of D — the same convention `toTzDateKey`
  // uses. Parsing the picker's date keys as *browser local* time and adding
  // the selected offset on top moved the whole window by that offset whenever
  // the two differed, which left a half-empty bucket at each end.
  const dayStart = (key) => parseTs(`${key}T00:00:00Z`)
  const userStart = range.start ? dayStart(range.start) ?? dataMin : dataMin
  const userEnd = range.end ? (dayStart(range.end) ?? shiftedNow) + DAY_MS - 1 : shiftedNow
  const rangeStart = Math.max(dataMin, userStart)
  const rangeEnd = Math.min(shiftedNow, userEnd)
  if (rangeEnd < rangeStart) return []
  const minT = Math.floor(rangeStart / bucketMs) * bucketMs
  const lastT = Math.floor(rangeEnd / bucketMs) * bucketMs
  const count = Math.floor((lastT - minT) / bucketMs) + 1
  const buckets = Array.from({ length: count }, () => ({
    signups: 0,
    firstOneoff: 0,
    firstSubscription: 0,
    repeat: 0,
  }))
  const bump = (raw, key) => {
    const t = raw + tzOffsetMs
    if (t < rangeStart || t > rangeEnd) return
    const bucket = buckets[Math.floor((t - minT) / bucketMs)]
    if (bucket) bucket[key] += 1
  }
  for (const t of signups) bump(t, 'signups')
  for (const event of events) {
    if (!event.first) bump(event.t, 'repeat')
    else bump(event.t, event.oneoff ? 'firstOneoff' : 'firstSubscription')
  }

  let totalSignups = 0
  let totalStrict = 0
  const rawSeries = buckets.map((bucket, index) => {
    // No signups in this bucket means the rate is undefined, not enormous:
    // dividing by a forced 1 turned "3 payments, 0 signups" into 300%.
    const base = bucket.signups
    const strictTotal = bucket.firstOneoff + bucket.firstSubscription
    totalSignups += base
    totalStrict += strictTotal
    // Every rate on this chart divides by the same thing — new signups in the
    // bucket — so the parts add up to the whole and can be stacked. Dividing
    // by total payments instead would have made each bar a self-contained pie
    // that says nothing about how much was paid.
    const rate = (value) => (base > 0 ? (value / base) * 100 : 0)
    return {
      time: dateOnly(minT + index * bucketMs - tzOffsetMs, tzOffsetMs),
      signups: base,
      // Raw counts travel with the rates: a percentage axis cannot answer "how
      // many people actually paid", and that is the first thing anyone asks.
      firstOneoff: bucket.firstOneoff,
      firstSubscription: bucket.firstSubscription,
      repeat: bucket.repeat,
      strictTotal,
      total: strictTotal + bucket.repeat,
      strictRatePct: rate(strictTotal),
      firstOneoffRatePct: rate(bucket.firstOneoff),
      firstSubscriptionRatePct: rate(bucket.firstSubscription),
      repeatRatePct: rate(bucket.repeat),
    }
  })
  const avgStrictRatePct = totalSignups > 0 ? (totalStrict / totalSignups) * 100 : 0
  return rawSeries.map((row) => ({ ...row, avgStrictRatePct }))
}

function buildPaidRetention(paidUsers, stats, tzOffsetMs, mode) {
  const activeDaysByUser = new Map()
  for (const conv of stats ? collectMeaningfulEvents(stats) : []) {
    const day = toTzDateKey(conv.created_at, tzOffsetMs)
    const days = activeDaysByUser.get(conv.user_id) ?? new Set()
    days.add(day)
    activeDaysByUser.set(conv.user_id, days)
  }
  const today = todayTzKey(tzOffsetMs)
  const line = Array.from({ length: PAID_RETENTION_LINE_MAX }, (_, index) => {
    const day = index + 1
    let eligible = 0
    let returned = 0
    for (const user of paidUsers) {
      // Day N has to be a finished calendar day, same rule as signup
      // retention — otherwise today's partial activity is scored as a miss.
      if (dateOnly(user.firstPaidAt + day * DAY_MS, tzOffsetMs) >= today) continue
      eligible += 1
      const days = activeDaysByUser.get(user.user_id)
      if (!days) continue
      if (mode === 'exact') {
        if (days.has(dateOnly(user.firstPaidAt + day * DAY_MS, tzOffsetMs))) returned += 1
      } else {
        for (const dayKey of days) {
          const diff = (new Date(`${dayKey}T00:00:00Z`).getTime() - tzOffsetMs - user.firstPaidAt) / DAY_MS
          if (diff >= day) {
            returned += 1
            break
          }
        }
      }
    }
    return { day, eligible, returned, ratePct: eligible > 0 ? (returned / eligible) * 100 : 0 }
  })
  return {
    line,
    keyDays: PAID_RETENTION_DAYS.map((day) => line[day - 1] ?? { day, eligible: 0, returned: 0, ratePct: 0 }),
  }
}

// `initial` / `renewal` are decided by whether this is the user's earliest
// paid row, not by `billing_reason` — see buildPaidRate for why that label
// cannot be trusted. Without this the "首次订阅" list was mostly renewals.
function buildRecentPayments(paidSubscriptions, labels) {
  const groups = { oneoff: [], initial: [], renewal: [] }
  const firstPaidByUser = new Map()
  for (const sub of paidSubscriptions) {
    const t = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (t == null || !sub.user_id) continue
    const prev = firstPaidByUser.get(sub.user_id)
    if (prev == null || t < prev) firstPaidByUser.set(sub.user_id, t)
  }
  for (const sub of paidSubscriptions) {
    const startedAt = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (!sub.user_id || startedAt == null) continue
    const row = { id: sub.id, label: labelUser(sub.user_id, labels), tier: sub.tier, billing_reason: sub.billing_reason ?? '—', startedAt }
    if (isOneOffReason(sub.billing_reason)) groups.oneoff.push(row)
    else if (startedAt === firstPaidByUser.get(sub.user_id)) groups.initial.push(row)
    else groups.renewal.push(row)
  }
  for (const key of Object.keys(groups)) {
    groups[key] = groups[key].sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_LIST_LIMIT)
  }
  return groups
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('general')
  const [analyticsTab, setAnalyticsTab] = useState('ai')
  const [tzKey, setTzKey] = useState('auto')
  const [overviewMode, setOverviewMode] = useState('allTime')
  const [overviewPreset, setOverviewPreset] = useState('pastTwoMonths')
  const [overviewCustomRange, setOverviewCustomRange] = useState({ start: '', end: '' })
  const [timeRange, setTimeRange] = useState('7d')
  const [customTimeRange, setCustomTimeRange] = useState({ start: '', end: '' })
  const [growthMode, setGrowthMode] = useState('net')
  const [growthGranularity, setGrowthGranularity] = useState('day')
  const [showGrowthOverlay, setShowGrowthOverlay] = useState(true)
  const [showDauDetail, setShowDauDetail] = useState(false)
  const [conversationsMode, setConversationsMode] = useState('line')
  const [latestPage, setLatestPage] = useState(0)
  // Latest Users has its own signup-date filter, independent of the charts
  // above. Defaults to the last 7 days.
  const [latestView, setLatestView] = useState('list')
  const [latestRange, setLatestRange] = useState(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS)
    return { start: addDays(end, -6), end }
  })

  const [dauDate, setDauDate] = useState(() => todayTzKey(BROWSER_OFFSET_MS))
  const [mauMode, setMauMode] = useState('rolling')
  const [mauMonth, setMauMonth] = useState(() => todayTzKey(BROWSER_OFFSET_MS).slice(0, 7))
  const [mauEndDate, setMauEndDate] = useState(() => todayTzKey(BROWSER_OFFSET_MS))
  const [signupRange, setSignupRange] = useState({ start: '', end: '' })
  const [retentionMode, setRetentionMode] = useState('exact')

  const [topUsersRange, setTopUsersRange] = useState(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS)
    return { start: addDays(end, -29), end }
  })
  const [topK, setTopK] = useState(20)
  const [topUsersMode, setTopUsersMode] = useState('count')

  // 7d by default: at 1d the numerator is single digits, so both the volume
  // and the rate are mostly noise.
  const [paidRateGranularity, setPaidRateGranularity] = useState(7)
  const [paidRateRange, setPaidRateRange] = useState(() => ({
    start: addDays(todayTzKey(BROWSER_OFFSET_MS), -30),
    end: todayTzKey(BROWSER_OFFSET_MS),
  }))
  // 严格口径 by default: first payments are the growth number. 宽口径 answers
  // a different question (what the payment mix is) and is a deliberate switch.
  const [paidRateView, setPaidRateView] = useState('strict')
  const [paidRetentionMode, setPaidRetentionMode] = useState('exact')
  // General vs Detailed analysis, and Detailed's own cohort range —
  // independent of `paidRateRange`, see buildPaidDetail.
  const [paidView, setPaidView] = useState('general')
  const [paidDetailRange, setPaidDetailRange] = useState({ start: '', end: '' })
  const [paidUsageMetric, setPaidUsageMetric] = useState('events')
  const [paidOtherNoticeHidden, setPaidOtherNoticeHidden] = useState(false)
  const [paidProfileDimension, setPaidProfileDimension] = useState(PAID_PROFILE_DIMENSIONS[0].value)
  const [paidProfileSort, setPaidProfileSort] = useState('rate')
  const [showPaidOverviewGeo, setShowPaidOverviewGeo] = useState(false)
  const [showPaidListGeo, setShowPaidListGeo] = useState(false)
  const [paidFilter, setPaidFilter] = useState('all')
  const [paidSort, setPaidSort] = useState('first_paid_desc')
  const [paidUsersPage, setPaidUsersPage] = useState(0)
  const [expandedSidebar, setExpandedSidebar] = useState(null)

  // Growth views. Cohorts default to the last 30 signup days: long enough to
  // hold a mature D14, short enough that the table is about the current
  // campaign rather than last year's.
  const [cohortGranularity, setCohortGranularity] = useState('day')
  const [cohortRange, setCohortRange] = useState(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS)
    return { start: addDays(end, -30), end }
  })
  const [dauRange, setDauRange] = useState(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS)
    return { start: addDays(end, -29), end }
  })
  const [paidCohortGranularity, setPaidCohortGranularity] = useState('week')
  const [paidCohortRange, setPaidCohortRange] = useState(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS)
    return { start: addDays(end, -90), end }
  })
  const [channelDimension, setChannelDimension] = useState('selfReported')
  const [channelRange, setChannelRange] = useState({ start: '', end: '' })

  const [utmFilters, setUtmFilters] = useState({})
  const [utmBreakdownField, setUtmBreakdownField] = useState('utm_source')
  const [expandedUtmUser, setExpandedUtmUser] = useState(null)

  const [errorLogsSubTab, setErrorLogsSubTab] = useState('clientServer')
  const [errorLogsOnlyErrors, setErrorLogsOnlyErrors] = useState(true)
  const [errorLogsTypeFilter, setErrorLogsTypeFilter] = useState('')
  const [expandedErrorLogId, setExpandedErrorLogId] = useState(null)
  const [traceStatusFilter, setTraceStatusFilter] = useState('non-ok')
  const [expandedTraceId, setExpandedTraceId] = useState(null)
  const [testCaseFilter, setTestCaseFilter] = useState('')
  const [testFailingOnly, setTestFailingOnly] = useState(false)
  const [expandedTestId, setExpandedTestId] = useState(null)

  const { roleLabel, isAdmin, canViewGrowth, canViewGrowthCounts, canViewRevenue, logout } = useAuth()
  const { stats, paid, utm, errorLogsData, loading, error, paidError, utmError, errorLogsError, views, sources } = useDashboardData(activeTab)

  const canOpenTab = (tab) => (tab.adminOnly ? isAdmin : tab.growthOnly ? canViewGrowth : true)
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => (tab.adminOnly ? isAdmin : tab.growthOnly ? canViewGrowth : true)),
    [isAdmin, canViewGrowth],
  )

  // A role change (or a deep link into a hidden tab) must not leave the user
  // parked on a tab they can no longer see.
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab('general')
  }, [visibleTabs, activeTab])

  const tzOffsetMs = useMemo(
    () => TIMEZONE_OPTIONS.find((option) => option.key === tzKey)?.offsetMs ?? BROWSER_OFFSET_MS,
    [tzKey],
  )

  // The feature-usage scan is ~10s and only Detailed reads it, so it starts
  // when someone actually opens that view rather than with the tab.
  const ensurePaidInsights = sources.paidInsights.ensure
  useEffect(() => {
    if (activeTab === 'paid' && paidView === 'detailed') ensurePaidInsights()
  }, [activeTab, paidView, ensurePaidInsights])

  // Same for the two growth endpoints: fetched when their view is opened.
  const ensureBilling = sources.billing.ensure
  const ensureFunnel = sources.funnel.ensure
  useEffect(() => {
    if (activeTab === 'paid' && paidView === 'billing' && canViewRevenue) ensureBilling()
    if (activeTab === 'retention' && canViewGrowth) ensureFunnel()
  }, [activeTab, paidView, canViewRevenue, canViewGrowth, ensureBilling, ensureFunnel])

  // A role that loses the revenue view must not stay parked on it.
  useEffect(() => {
    if (paidView === 'billing' && !canViewRevenue) setPaidView('general')
  }, [paidView, canViewRevenue])

  const userLabels = useMemo(() => buildUserLabels(stats), [stats])
  const chartData = useMemo(
    () => buildChartData(stats, timeRange, tzOffsetMs, customTimeRange),
    [stats, timeRange, tzOffsetMs, customTimeRange],
  )
  const growthChart = useMemo(
    () => buildGrowthChart(stats, timeRange, tzOffsetMs, customTimeRange, growthGranularity),
    [stats, timeRange, tzOffsetMs, customTimeRange, growthGranularity],
  )
  const analytics = useMemo(() => buildAnalytics(stats), [stats])
  const pollData = useMemo(() => buildPollData(stats), [stats])
  const retention = useMemo(
    () => buildRetention(stats, tzOffsetMs, signupRange, retentionMode, dauDate, mauMode, mauMonth, mauEndDate),
    [stats, tzOffsetMs, signupRange, retentionMode, dauDate, mauMode, mauMonth, mauEndDate],
  )
  const topUsers = useMemo(
    () => buildTopUsers(stats, tzOffsetMs, topUsersRange, topK),
    [stats, tzOffsetMs, topUsersRange, topK],
  )
  const paidModel = useMemo(
    () => buildPaidModel(stats, paid, tzOffsetMs, paidRateGranularity, paidRateRange, paidRetentionMode),
    [stats, paid, tzOffsetMs, paidRateGranularity, paidRateRange, paidRetentionMode],
  )
  const paidDetail = useMemo(
    () => buildPaidDetail(paidModel, sources.paidInsights.data, paidDetailRange, tzOffsetMs),
    [paidModel, sources.paidInsights.data, paidDetailRange, tzOffsetMs],
  )
  const activityIndex = useMemo(
    () => buildActivityIndex(stats, stats ? collectMeaningfulEvents(stats) : [], tzOffsetMs),
    [stats, tzOffsetMs],
  )
  const retentionCohorts = useMemo(
    () => buildRetentionCohorts(activityIndex, { granularity: cohortGranularity, range: cohortRange, mode: retentionMode }),
    [activityIndex, cohortGranularity, cohortRange, retentionMode],
  )
  // The last 30 signup days, whatever the table is showing — the "where are
  // we now" figure that the targets are read against.
  const retentionNow = useMemo(() => {
    const end = todayTzKey(tzOffsetMs)
    const options = { range: { start: addDays(end, -30), end }, days: [1, 7, 30] }
    return {
      exact: buildRetentionCohorts(activityIndex, { ...options, mode: 'exact' }).total,
      rolling: buildRetentionCohorts(activityIndex, { ...options, mode: 'rolling' }).total,
    }
  }, [activityIndex, tzOffsetMs])
  const dailyActives = useMemo(() => buildDailyActives(activityIndex, { range: dauRange }), [activityIndex, dauRange])
  const paidCohorts = useMemo(
    () => buildPaidCohorts(activityIndex, paidModel.firstPaidByUser, tzOffsetMs, { granularity: paidCohortGranularity, range: paidCohortRange }),
    [activityIndex, paidModel.firstPaidByUser, tzOffsetMs, paidCohortGranularity, paidCohortRange],
  )

  // The UTM rows are optional for Channels (see TAB_SOURCES), so the tab asks
  // for them itself instead of waiting on them.
  const ensureUtm = sources.utm.ensure
  useEffect(() => {
    if (activeTab === 'channels') ensureUtm()
  }, [activeTab, ensureUtm])

  const channelsByUser = useMemo(() => {
    const map = new Map()
    if (channelDimension === 'selfReported') {
      for (const row of stats?.user_poll_data ?? []) {
        const names = Array.from(new Set(
          extractStringLeaves(row.user_acquisition_sources).map(normalizeSelfReportedSource).filter(Boolean),
        ))
        if (names.length > 0) map.set(row.user_id, names)
      }
    } else {
      for (const user of utm?.users ?? []) {
        const value = fieldValue(user, channelDimension)
        if (value) map.set(user.user_id, [value])
      }
    }
    return map
  }, [stats, utm, channelDimension])
  const channelPerformance = useMemo(
    () => buildChannelPerformance(activityIndex, channelsByUser, paidModel.firstPaidByUser, paidModel.renewal, tzOffsetMs, {
      range: channelRange,
      // UTM covers so few users that the self-reported floor would hide
      // every row.
      minSample: channelDimension === 'selfReported' ? 30 : 5,
    }),
    [activityIndex, channelsByUser, paidModel.firstPaidByUser, paidModel.renewal, tzOffsetMs, channelRange, channelDimension],
  )

  const utmData = useMemo(() => {
    const allUsers = utm?.users ?? []
    const filteredUsers = allUsers.filter((user) =>
      UTM_FIELDS.every((field) => !utmFilters[field] || fieldValue(user, field) === utmFilters[field]),
    )
    const optionsFor = {}
    for (const field of UTM_FIELDS) {
      const base = allUsers.filter((user) =>
        UTM_FIELDS.every((other) => other === field || !utmFilters[other] || fieldValue(user, other) === utmFilters[other]),
      )
      optionsFor[field] = Array.from(new Set(base.map((user) => fieldValue(user, field)).filter(Boolean))).sort()
    }
    // Counts per field over the filtered set, so the tables follow whatever
    // drill-down is active. `aggregateCounts` drops blanks, and silently
    // losing users would make the shares not add up — hence the explicit
    // "(not set)" bucket.
    const breakdowns = {}
    for (const field of UTM_FIELDS) {
      const entries = aggregateCounts(filteredUsers, (user) => fieldValue(user, field) || UTM_UNSET)
      breakdowns[field] = entries
    }
    return { allUsers, filteredUsers, optionsFor, breakdowns }
  }, [utm, utmFilters])

  // Sizes and numerators in the growth views. Admin always; the growth role
  // per ROLE_ACCESS.
  const growthCounts = isAdmin || canViewGrowthCounts

  const renderBody = () => {
    // Belt and braces: the nav already hides these, this catches the render
    // that happens between a role change and the redirect effect.
    const currentTab = tabs.find((tab) => tab.id === activeTab)
    if (currentTab && !canOpenTab(currentTab)) {
      return (
        <div className="sample4-state">
          <strong>Not available for your account</strong>
          <p>This section requires {currentTab.adminOnly ? 'a Founder key' : 'a Growth Internal or Founder key'}.</p>
        </div>
      )
    }

    // `loading` and `error` cover only the endpoints this tab reads, so the
    // UTM tab no longer waits on the 20+ MB stats payload.
    if (loading) {
      return (
        <>
          <SkeletonMetrics count={4} />
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <SkeletonBlock height={280} />
            </article>
          </section>
        </>
      )
    }

    if (error) {
      return (
        <div className="sample4-state error">
          <strong>Could not load dashboard data</strong>
          <p>{error}</p>
          <p>Check that the API at <code>VITE_BASE_URL</code> is reachable and that <code>VITE_ADMIN_API_KEY</code> is current.</p>
        </div>
      )
    }

    if (activeTab === 'general') {
      const pollByUser = new Map((stats.user_poll_data ?? []).map((row) => [row.user_id, row]))
      // Signups inside the Latest Users date filter, newest first. The filter
      // is by signup date in the selected timezone; an open end means "no
      // bound", so Reset shows everyone.
      const latestUsers = (() => {
        const byUser = new Map()
        for (const user of stats.all_users_timeline ?? []) {
          const day = toTzDateKey(user.created_at, tzOffsetMs)
          if (latestRange.start && day < latestRange.start) continue
          if (latestRange.end && day > latestRange.end) continue
          byUser.set(user.user_id, {
            user_id: user.user_id,
            email: userLabels.get(user.user_id) ?? null,
            created_at: user.created_at,
          })
        }
        return Array.from(byUser.values())
          .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      })()
      const listedUsers = growthCounts ? latestUsers : latestUsers.slice(0, LATEST_USERS_LIMIT)
      const totalPages = Math.max(1, Math.ceil(listedUsers.length / LATEST_USERS_PAGE_SIZE))
      const safePage = Math.min(latestPage, totalPages - 1)
      const pageUsers = listedUsers.slice(safePage * LATEST_USERS_PAGE_SIZE, (safePage + 1) * LATEST_USERS_PAGE_SIZE)
      // One slice per user, so each pie adds up to the users in range.
      // Several self-reported sources → "多个来源" rather than counting the
      // person twice; nothing on file → its own slice, never dropped.
      const latestDistribution = (() => {
        const countries = new Map()
        const sources = new Map()
        const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)
        let withSource = 0
        let multiSource = 0
        for (const user of latestUsers) {
          const poll = pollByUser.get(user.user_id)
          bump(countries, extractLoginIpCountries(poll?.login_ip)[0] ?? '未知')
          const names = Array.from(new Set(
            extractStringLeaves(poll?.user_acquisition_sources).map(normalizeSelfReportedSource).filter(Boolean),
          ))
          if (names.length > 0) withSource += 1
          if (names.length > 1) multiSource += 1
          bump(sources, names.length === 0 ? '未填写' : names.length > 1 ? '多个来源' : names[0])
        }
        const toEntries = (map) => Array.from(map.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
        return { country: toEntries(countries), source: toEntries(sources), withSource, multiSource }
      })()
      const latestPreset = (() => {
        const today = todayTzKey(tzOffsetMs)
        if (!latestRange.start && !latestRange.end) return 'all'
        if (latestRange.end !== today) return 'custom'
        if (latestRange.start === today) return 'today'
        if (latestRange.start === addDays(today, -6)) return '7d'
        if (latestRange.start === addDays(today, -29)) return '30d'
        return 'custom'
      })()
      const setLatestFilter = (range) => {
        setLatestPage(0)
        setLatestRange(range)
      }
      const applyLatestPreset = (preset) => {
        const today = todayTzKey(tzOffsetMs)
        if (preset === 'all') setLatestFilter({ start: '', end: '' })
        else if (preset === 'today') setLatestFilter({ start: today, end: today })
        else setLatestFilter({ start: addDays(today, preset === '7d' ? -6 : -29), end: today })
      }
      const dauHasToday = chartData.activeUserChart.some((d) => d.inProgress)
      const newUsersInWindow = growthChart.net.reduce((sum, point) => sum + point.users, 0)
      const overviewWindow = buildOverviewWindow(overviewMode, overviewPreset, overviewCustomRange, tzOffsetMs)
      const overviewStats = countOverviewStats(stats, overviewWindow, tzOffsetMs)
      const overviewNeedsRange = overviewMode !== 'allTime'
      const overviewRangeLabel = overviewWindow ? `${overviewWindow.start} → ${overviewWindow.end}` : 'Select a complete start and end date'
      // `general` never sees cumulative totals, so it always gets the net-growth series.
      const lineData = isAdmin && growthMode === 'total' ? growthChart.total : growthChart.net
      const averageNetGrowth = (!isAdmin || growthMode === 'net') && lineData.length > 0
        ? lineData.reduce((sum, point) => sum + point.users, 0) / lineData.length
        : null
      const renderGeneralTimeControls = () => (
        <>
          <TimeRangeSelector
            value={timeRange}
            onChange={(range) => {
              setCustomTimeRange({ start: '', end: '' })
              setTimeRange(range)
            }}
          />
          <DateRange
            start={customTimeRange.start}
            end={customTimeRange.end}
            onChange={setCustomTimeRange}
            onReset={() => setCustomTimeRange({ start: '', end: '' })}
          />
        </>
      )
      return (
        <>
          <Intro
            eyebrow="General overview"
            headline="A quiet console for growth, activity, and users."
            description="Same operational metrics as the original dashboard, rebuilt in the sample4 layout."
          />
          {/* Absolute volume (total users / conversations) is admin-only. */}
          {isAdmin && (
            <>
              <section className="sample4-overview-controls">
                <Segmented
                  value={overviewMode}
                  onChange={setOverviewMode}
                  options={[
                    { value: 'allTime', label: 'All Time' },
                    { value: 'preset', label: 'Selections' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                {overviewMode === 'preset' && (
                  <label className="sample4-field">
                    <span>Time options</span>
                    <select value={overviewPreset} onChange={(e) => setOverviewPreset(e.target.value)}>
                      {OVERVIEW_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {overviewMode === 'custom' && (
                  <DateRange
                    start={overviewCustomRange.start}
                    end={overviewCustomRange.end}
                    onChange={setOverviewCustomRange}
                    onReset={() => setOverviewCustomRange({ start: '', end: '' })}
                  />
                )}
              </section>
              <Metrics items={[
                {
                  label: 'Total Users',
                  value: overviewNeedsRange && !overviewWindow ? '—' : formatCount(overviewStats.totalUsers),
                  note: overviewNeedsRange ? `Users created in range · ${overviewRangeLabel}` : 'All registered users',
                },
                {
                  label: 'Conversations',
                  value: overviewNeedsRange && !overviewWindow ? '—' : formatCount(overviewStats.conversations),
                  note: overviewNeedsRange ? `Chats + course gens in range · ${overviewRangeLabel}` : 'Chats + course generation runs, all time',
                },
              ]} />
            </>
          )}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="User Growth"
                title="User growth"
                actions={<div className="sample4-heading-actions">{isAdmin && <Segmented value={growthMode} onChange={setGrowthMode} options={[{ value: 'net', label: 'Net growth' }, { value: 'total', label: 'Total' }]} />}{renderGeneralTimeControls()}<ToolbarMenu><MenuField label="Granularity"><Segmented value={growthGranularity} onChange={setGrowthGranularity} options={GROWTH_GRANULARITIES} /></MenuField></ToolbarMenu></div>}
              />
              <DashboardLineChart
                labels={lineData.map((d) => d.time)}
                series={[{ label: growthMode === 'total' ? 'Total users' : 'New users', values: lineData.map((d) => d.users) }]}
                referenceLines={averageNetGrowth === null ? [] : [{ label: 'Average', value: averageNetGrowth }]}
                summary={growthCounts ? { label: 'Total new users in this period', value: formatCount(newUsersInWindow) } : null}
              />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Activity"
                title={(
                  <span className="sample4-title-row">
                    {timeRange === '7d' || timeRange === '30d' ? 'Daily Active Users' : 'Active Users'}
                    <InfoTip label="Daily Active Users 怎么算">
                      <p><strong>活跃用户</strong>：在这一天（或这一小时）里，发起过至少一次<strong>对话</strong>，或者<strong>生成过一门课程</strong>的用户。同一个人做多少次都只算 1 人。只登录、只浏览不算。</p>
                      <p><strong>New</strong>：同一天注册、当天就用了的人。<strong>Returning</strong>：之前注册、这一天回来用的人。两段加起来就是当天的活跃用户数。</p>
                      <p><strong>详细 DAU 构成</strong>：把 Returning 再按账号年龄拆成两段 —— 注册 7 天以内回来的，和注册超过 7 天的老用户。老用户那段有没有随时间变厚，就是老用户池有没有在累积。</p>
                      <p><strong>虚线</strong>（打开 Data of User Growth 后显示）：同一天的新注册人数，也就是 User Growth。它和 New 的差，就是注册了但当天没用的人。</p>
                      <p><strong>今天</strong>那根柱子颜色较浅，因为今天还没过完。</p>
                      <p>这是过渡口径：完成白板讲解、完成练习等学习行为还不在数据里，接入后数字会变。时间按右上角选的时区算。</p>
                    </InfoTip>
                  </span>
                )}
                actions={(
                  <div className="sample4-heading-actions">
                    <label className={showDauDetail ? 'sample4-toggle-pill active' : 'sample4-toggle-pill'}>
                      <input type="checkbox" checked={showDauDetail} onChange={(e) => setShowDauDetail(e.target.checked)} />
                      详细 DAU 构成
                    </label>
                    <label className={showGrowthOverlay ? 'sample4-toggle-pill active' : 'sample4-toggle-pill'}>
                      <input type="checkbox" checked={showGrowthOverlay} onChange={(e) => setShowGrowthOverlay(e.target.checked)} />
                      Data of User Growth
                    </label>
                    {renderGeneralTimeControls()}
                  </div>
                )}
              />
              <DashboardStackedBars
                labels={chartData.activeUserChart.map((d) => d.time)}
                segments={showDauDetail
                  ? [
                    { label: 'Returning · signed up > 7 days ago', values: chartData.activeUserChart.map((d) => d.establishedUsers), variant: 'main' },
                    { label: 'Returning · signed up ≤ 7 days ago', values: chartData.activeUserChart.map((d) => d.recentReturningUsers), variant: 'muted' },
                    { label: 'New users', values: chartData.activeUserChart.map((d) => d.newUsers), variant: 'accent' },
                  ]
                  : [
                    { label: 'Returning users', values: chartData.activeUserChart.map((d) => d.returningUsers), variant: 'main' },
                    { label: 'New users', values: chartData.activeUserChart.map((d) => d.newUsers), variant: 'accent' },
                  ]}
                totalLabel="Active users"
                overlay={showGrowthOverlay ? { label: 'New signups (User Growth)', values: chartData.activeUserChart.map((d) => d.signups) } : null}
                inProgress={new Set(chartData.activeUserChart.flatMap((d, i) => (d.inProgress ? [i] : [])))}
                notes={chartData.activeUserChart.map((d) => (d.inProgress ? '进行中 · 这一段还没结束' : null))}
              />
              {dauHasToday && <p className="sample4-note">浅色的柱子是今天，还没过完。</p>}
            </article>
          </section>
          {isAdmin && (
            <section className="sample4-grid">
              <article className="sample4-panel sample4-full">
                <PanelHeading
                  eyebrow="Conversation Activity"
                  title="Conversation activity"
                  actions={<div className="sample4-heading-actions"><Segmented value={conversationsMode} onChange={setConversationsMode} options={[{ value: 'line', label: 'Line' }, { value: 'bar', label: 'New vs Returning' }, { value: 'kind', label: 'Chat vs Course gen' }]} />{renderGeneralTimeControls()}</div>}
                />
                {/* PanelHeading shows either actions or a note, never both, so
                    the caveat lives here — it matters that this count is not
                    just agent_conversation_history any more. */}
                <p className="sample4-note">Conversations = chat conversations + course generation runs</p>
                {conversationsMode === 'line' && (
                  <DashboardLineChart labels={chartData.conversationChart.map((d) => d.time)} series={[{ label: 'Conversations', values: chartData.conversationChart.map((d) => d.conversations) }]} />
                )}
                {conversationsMode === 'bar' && (
                  <DashboardLineChart
                    labels={chartData.conversationChart.map((d) => d.time)}
                    series={[
                      { label: 'New user conversations', values: chartData.conversationChart.map((d) => d.newUserConversations) },
                      { label: 'Returning user conversations', values: chartData.conversationChart.map((d) => d.returningUserConversations) },
                    ]}
                  />
                )}
                {conversationsMode === 'kind' && (
                  <DashboardLineChart
                    labels={chartData.conversationChart.map((d) => d.time)}
                    series={[
                      { label: 'Chat conversations', values: chartData.conversationChart.map((d) => d.chatConversations) },
                      { label: 'Course generations', values: chartData.conversationChart.map((d) => d.courseGenerations) },
                    ]}
                  />
                )}
              </article>
            </section>
          )}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Latest Users"
                title={(
                  <span className="sample4-title-row">
                    Latest users
                    <Segmented
                      value={latestView}
                      onChange={setLatestView}
                      options={[{ value: 'list', label: '用户列表' }, { value: 'distribution', label: '分布' }]}
                    />
                  </span>
                )}
              />
              <section className="sample4-overview-controls">
                <Segmented
                  value={latestPreset}
                  onChange={applyLatestPreset}
                  options={[
                    { value: 'today', label: '今天' },
                    { value: '7d', label: '近 7 天' },
                    { value: '30d', label: '近 30 天' },
                    { value: 'all', label: '全部' },
                  ]}
                />
                <DateRange
                  start={latestRange.start}
                  end={latestRange.end}
                  maxDate={todayTzKey(tzOffsetMs)}
                  onChange={setLatestFilter}
                  onReset={() => applyLatestPreset('7d')}
                />
                <p className="sample4-note">
                  按注册日期筛选{growthCounts
                    ? ` · ${formatCount(latestUsers.length)} 名新用户`
                    : latestUsers.length > LATEST_USERS_LIMIT ? ` · 列表显示最新 ${LATEST_USERS_LIMIT} 位` : ''}
                </p>
              </section>
              {latestView === 'list' ? (
                <>
                  <div className="sample4-pagination sample4-pagination-row">
                    <button type="button" disabled={safePage === 0} onClick={() => setLatestPage(safePage - 1)}>Prev</button>
                    <span>{listedUsers.length === 0 ? '0 users' : `${safePage * LATEST_USERS_PAGE_SIZE + 1}-${Math.min((safePage + 1) * LATEST_USERS_PAGE_SIZE, listedUsers.length)} of ${listedUsers.length}`} · Page {safePage + 1} / {totalPages}</span>
                    <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setLatestPage(safePage + 1)}>Next</button>
                  </div>
                  <DataTable
                    columns={['Email / Username', 'Login IP Country', 'Acquisition Sources', 'Created At']}
                    empty="No signups in this date range."
                    rows={pageUsers.map((user) => {
                      const poll = pollByUser.get(user.user_id)
                      return [
                        <UserLink
                          key="user"
                          userId={user.user_id}
                          label={user.email || user.user_id.slice(0, 8) + '…'}
                          tzOffsetMs={tzOffsetMs}
                        />,
                        extractLoginIpCountries(poll?.login_ip)[0] ?? '—',
                        sourceString(poll?.user_acquisition_sources),
                        formatDateTime(user.created_at, tzOffsetMs),
                      ]
                    })}
                  />
                </>
              ) : (
                <>
                  <section className="sample4-grid sample4-even">
                    <article className="sample4-panel">
                      <PanelHeading eyebrow="Geography" title="Login IP Country" note="首次登录 IP 所在国家" />
                      <DashboardPieChart entries={latestDistribution.country} hideCounts={!growthCounts} />
                    </article>
                    <article className="sample4-panel">
                      <PanelHeading eyebrow="Acquisition" title="Acquisition Sources" note="注册问卷里自己选的来源" />
                      <DashboardPieChart entries={latestDistribution.source} hideCounts={!growthCounts} />
                    </article>
                  </section>
                  <p className="sample4-note">
                    每人只算一次，两张饼图加起来都是这段时间的全部新用户。
                    {latestUsers.length > 0 && ` ${((latestDistribution.withSource / latestUsers.length) * 100).toFixed(0)}% 的人填了来源问卷`}
                    {latestDistribution.multiSource > 0 && `，其中选了多个来源的归入「多个来源」`}
                    。「未填写」= 没有问卷记录，「未知」= 没有登录 IP 记录。来源是用户自己选的，不是链接追踪。
                  </p>
                </>
              )}
            </article>
          </section>
          <p className="sample4-confidentiality">
            This data is confidential and is complying with NDA and all non-disclosure policies.
          </p>
        </>
      )
    }

    if (activeTab === 'retention') {
      return (
        <>
          <Intro eyebrow="Retention" headline="How many people come back after they sign up." description="DAU, MAU, DAU:MAU, key Day-N retention cards, and exact/rolling cohort controls." />
          <section className="sample4-overview-controls sample4-retention-controls">
            <label className="sample4-field">
              <span>DAU date</span>
              <input type="date" value={dauDate} onChange={(e) => setDauDate(e.target.value)} />
            </label>
            <Segmented
              value={mauMode}
              onChange={setMauMode}
              options={[
                { value: 'rolling', label: 'Last 30d' },
                { value: 'month', label: 'Month' },
                { value: 'endDate', label: 'End date' },
              ]}
            />
            {mauMode === 'month' && (
              <label className="sample4-field">
                <span>MAU month</span>
                <input type="month" value={mauMonth} onChange={(e) => setMauMonth(e.target.value)} />
              </label>
            )}
            {mauMode === 'endDate' && (
              <label className="sample4-field">
                <span>MAU end</span>
                <input type="date" value={mauEndDate} onChange={(e) => setMauEndDate(e.target.value)} />
              </label>
            )}
            <DateRange
              start={signupRange.start}
              end={signupRange.end}
              minDate={retention.signupBounds?.min}
              maxDate={retention.signupBounds?.max}
              onChange={setSignupRange}
              onReset={() => setSignupRange({ start: '', end: '' })}
            />
          </section>
          <div className="sample4-definition">
            <span>「活跃」= 当天有过对话或生成课程</span>
            <InfoTip label="「活跃」怎么定义">
              <p><strong>活跃</strong>：这一天里发起过至少一次<strong>对话</strong>，或者<strong>生成过一门课程</strong>。同一个人做多少次都只算 1 次，只登录、只浏览不算。本页的 DAU、MAU、留存都用这个定义。</p>
              <p><strong>D-N 留存</strong>：注册后第 N 天回来活跃的人 ÷ 已经到达第 N 天的人。只统计第 N 天<strong>已经完整过完</strong>的用户，今天还没过完的不算进分母。</p>
              <p>这是过渡口径，还不是会议里说的 Meaningful Learning Event：完成白板讲解、完成练习、讲解中提问这几类事件还不在数据里，接入后数字会变。</p>
            </InfoTip>
          </div>
          <Metrics items={[
            ...(growthCounts ? [
              { label: 'DAU', value: formatCount(retention.dau.activeUsers), note: `${retention.dau.newSignups} new signups on ${dauDate}` },
              { label: 'MAU', value: formatCount(retention.mau.activeUsers), note: `${retention.mau.window.label} · ${retention.mau.newSignups} new signups` },
            ] : []),
            { label: 'DAU : MAU', value: retention.mau.activeUsers > 0 ? retention.ratio.toFixed(3) : '—', note: 'Stickiness · 1.0 means used every day' },
          ]} />
          <section className="sample4-metrics">
            {KEY_RETENTION_DAYS.map((day) => {
              const point = retention.curve[day - 1]
              return (
                <article key={day} className="sample4-metric">
                  <span>D{day} {retentionMode === 'exact' ? 'Exact' : 'Rolling'}</span>
                  <strong>{point?.mature && point.hasData ? `${point.ratePct.toFixed(1)}%` : '—'}</strong>
                  <p>{!point?.mature ? 'No cohort user has reached this day yet' : growthCounts ? `${formatCount(point.returned)} / ${formatCount(point.eligible)} eligible users` : 'Of users who have reached this day'}</p>
                </article>
              )
            })}
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Where we stand"
                title="留存 · 当前 vs 阶段目标 vs 行业参考"
                note="当前 = 近 30 天注册用户"
              />
              <DataTable
                columns={['指标', '当前 · Exact-day', '当前 · Rolling', '阶段目标', '差距（Exact-day）', '行业 · 日常', '行业 · 开学 / Midterm / Final']}
                rows={GROWTH_BENCHMARKS.retention.map((bench, i) => {
                  const cell = retentionNow.exact.cells[i]
                  const rollingCell = retentionNow.rolling.cells[i]
                  const band = ([lo, hi]) => `${lo}%–${hi}%`
                  const gap = cell?.ratePct != null && bench.target != null ? cell.ratePct - bench.target : null
                  const rate = (c) => (c?.ratePct != null
                    ? `${c.ratePct.toFixed(1)}%${growthCounts ? ` (${formatCount(c.hit)} / ${formatCount(c.eligible)})` : ''}`
                    : '—')
                  return [
                    `D${bench.day} 留存`,
                    rate(cell),
                    rate(rollingCell),
                    bench.target != null ? `≥ ${bench.target}%` : '—',
                    gap == null ? '—' : gap >= 0 ? `已达标 +${gap.toFixed(1)} pt` : `${gap.toFixed(1)} pt`,
                    band(bench.industry),
                    band(bench.peak),
                  ]
                })}
              />
              <p className="sample4-note">
                目标和行业区间来自 2026-09-21 增长会议，仅作方向参考 —— 各家对「活跃」的定义不同。
                差距按 Exact-day 算，这是更严格、也更常见的口径；Rolling 只统计「第 N 天或之后回来过」，总是更高，放在旁边作参考。
                D30 为「—」是因为近 30 天注册的人都还没到第 30 天。
              </p>
            </article>
          </section>
          <FunnelPanel
            resource={sources.funnel}
            activityIndex={activityIndex}
            tzOffsetMs={tzOffsetMs}
            showCounts={growthCounts}
          />
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Day-N Return Retention"
                title="Signup cohort retention"
                actions={(
                  <Segmented
                    value={retentionMode}
                    onChange={setRetentionMode}
                    options={[
                      { value: 'exact', label: 'Exact-day' },
                      { value: 'rolling', label: 'Rolling' },
                    ]}
                  />
                )}
              />
              <p className="sample4-note">
                <strong>Exact-day</strong>：注册后<strong>正好第 N 天当天</strong>回来活跃的比例。
                {' '}<strong>Rolling</strong>：注册后<strong>第 N 天或之后任意一天</strong>回来过的比例，所以总是 ≥ Exact-day。
                {' '}这个切换同时作用于上方的 D1 / D7 / D30 卡片和下方的学习留存 Cohort 表。
              </p>
              <DashboardLineChart
                labels={retention.curve.map((p) => `D${p.day}`)}
                tooltips={retention.curve.map((p) => `Day ${p.day}${growthCounts ? ` · ${formatCount(p.returned)} of ${formatCount(p.eligible)} eligible` : ''}${p.mature ? '' : ' · immature'}`)}
                series={[{ label: 'Retention', values: retention.curve.map((p) => p.mature ? p.ratePct : 0) }]}
                format="percent"
              />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Who is active"
                title="DAU 构成 · 新注册 vs 老用户"
                actions={(
                  <DateRange
                    start={dauRange.start}
                    end={dauRange.end}
                    maxDate={todayTzKey(tzOffsetMs)}
                    onChange={setDauRange}
                    onReset={() => {
                      const end = todayTzKey(tzOffsetMs)
                      setDauRange({ start: addDays(end, -29), end })
                    }}
                  />
                )}
              />
              <p className="sample4-note">
                每天的活跃用户按账号年龄拆成三层。最下面一层是注册超过 7 天还在回来的人 —— 它有没有随时间变厚，
                就是「老用户池有没有在累积」的答案。最后一根柱子是今天，还没过完。
              </p>
              {growthCounts ? (
                <>
                  <p className="sample4-chart-caption">活跃用户数 · 按账号年龄堆叠</p>
                  <DashboardStackedBars
                    labels={dailyActives.map((d) => d.label)}
                    segments={[
                      { label: '老用户（注册 > 7 天）', values: dailyActives.map((d) => d.established) },
                      { label: '近 7 天注册、今天回访', values: dailyActives.map((d) => d.recent) },
                      { label: '当天新注册', values: dailyActives.map((d) => d.fresh) },
                    ]}
                    notes={dailyActives.map((d) => `${d.key}${d.inProgress ? '（进行中）' : ''} · 当天注册 ${formatCount(d.signups)} 人 · 回访占活跃 ${d.returningSharePct == null ? '—' : `${d.returningSharePct.toFixed(0)}%`}`)}
                    totalLabel="DAU"
                  />
                  <p className="sample4-chart-caption">新注册 vs 回访活跃 · 两条线贴得越紧，DAU 越依赖当天获客</p>
                  <DashboardLineChart
                    labels={dailyActives.map((d) => d.label)}
                    tooltips={dailyActives.map((d) => d.key)}
                    series={[
                      { label: '回访活跃用户', values: dailyActives.map((d) => d.recent + d.established) },
                      { label: '当天新注册', values: dailyActives.map((d) => d.signups) },
                    ]}
                    shaded={{ indices: new Set(dailyActives.flatMap((d, i) => (d.inProgress ? [i] : []))), label: '进行中' }}
                  />
                </>
              ) : (
                <>
                  <p className="sample4-chart-caption">活跃用户构成 · 占当天 DAU 的比例</p>
                  <DashboardStackedBars
                    labels={dailyActives.map((d) => d.label)}
                    segments={[
                      { label: '老用户（注册 > 7 天）', values: dailyActives.map((d) => (d.active > 0 ? (d.established / d.active) * 100 : 0)) },
                      { label: '近 7 天注册、今天回访', values: dailyActives.map((d) => (d.active > 0 ? (d.recent / d.active) * 100 : 0)) },
                      { label: '当天新注册', values: dailyActives.map((d) => (d.active > 0 ? (d.fresh / d.active) * 100 : 0)) },
                    ]}
                    totalLabel="合计"
                    format="percent"
                  />
                </>
              )}
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Learning retention cohorts"
                title="学习留存 Cohort · 按注册日期"
                actions={(
                  <div className="sample4-heading-actions">
                    <DateRange
                      start={cohortRange.start}
                      end={cohortRange.end}
                      minDate={retention.signupBounds?.min}
                      maxDate={retention.signupBounds?.max}
                      onChange={setCohortRange}
                      onReset={() => {
                        const end = todayTzKey(tzOffsetMs)
                        setCohortRange({ start: addDays(end, -30), end })
                      }}
                    />
                    <InlineField label="Cohort">
                      <Segmented value={cohortGranularity} onChange={setCohortGranularity} options={[{ value: 'day', label: '按天' }, { value: 'week', label: '按周' }]} />
                    </InlineField>
                  </div>
                )}
              />
              <p className="sample4-note">
                每行是同一{cohortGranularity === 'week' ? '周' : '天'}注册的一批人。激活率 = 注册后 {ACTIVATION_WINDOW_HOURS} 小时内有过一次学习行为；
                D-N = 注册后第 N 天{retentionMode === 'exact' ? '当天' : '或之后任意一天'}回来学习的比例（{retentionMode === 'exact' ? 'Exact-day' : 'Rolling'}，跟随 Signup cohort retention 的切换）。
                「—」表示这一天还没过完；带 * 的格子只覆盖了这批人里已经到达该天的部分。
              </p>
              <CohortTable
                rowHeader={cohortGranularity === 'week' ? '注册周' : '注册日期'}
                sizeHeader="新用户数"
                showCounts={growthCounts}
                columns={[
                  { key: 'activation', label: '激活率', title: `注册后 ${ACTIVATION_WINDOW_HOURS} 小时内有学习行为` },
                  ...retentionCohorts.days.map((day) => ({
                    key: `d${day}`,
                    label: `D${day}`,
                    target: GROWTH_BENCHMARKS.retention.find((bench) => bench.day === day)?.target ?? undefined,
                  })),
                ]}
                rows={retentionCohorts.rows.map((row) => ({ key: row.bucket, label: row.label, size: row.size, cells: [row.activation, ...row.cells] }))}
                total={{ label: '合计', size: retentionCohorts.total.size, cells: [retentionCohorts.total.activation, ...retentionCohorts.total.cells] }}
              />
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'analytics') {
      const countryTotal = analytics.country.reduce((sum, entry) => sum + entry.value, 0)
      const nationalityTotal = analytics.nationality.reduce((sum, entry) => sum + entry.value, 0)
      const analyticsTotal = analytics.rows.length
      const pollTotal = pollData.rows.length
      // Mirrors the original AnalyticsTab `hideCount`: general sees the shape
      // of the distribution, not how many people are in it.
      const rankMode = isAdmin ? undefined : 'percent'
      return (
        <>
          <Intro eyebrow="User Analytics" headline="Where users come from, who they are, and what they use." description={`Derived from ${formatCount(analyticsTotal)} analyzed user profiles.`} />
          <section className="sample4-subtabs">
            <Segmented
              value={analyticsTab}
              onChange={setAnalyticsTab}
              options={[
                { value: 'ai', label: 'AI Analysis' },
                { value: 'factual', label: 'Factual Data' },
              ]}
            />
          </section>
          {analyticsTab === 'ai' ? (
            <>
              <section className="sample4-grid">
                <WorldMapPanel entries={analytics.country} hideCounts={!isAdmin} />
              </section>
              <section className="sample4-grid sample4-even">
                <RankingPanel eyebrow="Country" title="使用地区 · Country" entries={analytics.country} total={countryTotal} scrollRows lockedMode={rankMode} />
                <RankingPanel eyebrow="Nationality" title="Nationality 国籍" entries={analytics.nationality} total={nationalityTotal} lockedMode={rankMode} />
              </section>
              <section className="sample4-grid sample4-even">
                <RankingPanel eyebrow="Student mix" title="中国大陆 / 海外华人 / 纯外国人" entries={analytics.studentBreakdown} total={analytics.studentBreakdown.reduce((s, e) => s + e.value, 0)} lockedMode={rankMode} />
                <RankingPanel eyebrow="Identity" title="Identity 身份排名" entries={analytics.identity} total={analyticsTotal} lockedMode={rankMode} />
              </section>
              <section className="sample4-grid sample4-even">
                <RankingPanel eyebrow="Initial function" title="Initial Used Function 初始使用功能排名" entries={analytics.initialUsedFunction} total={analyticsTotal} lockedMode={rankMode} />
                <RankingPanel eyebrow="Most used function" title="Most Used Function 最常使用功能排名" entries={analytics.mostUsedFunction} total={analytics.mostUsedFunction.reduce((s, e) => s + e.value, 0)} lockedMode={rankMode} />
              </section>
            </>
          ) : (
            <section className="sample4-grid sample4-even">
              <RankingPanel eyebrow="Acquisition" title="User Acquisition Sources 获客来源" entries={pollData.acquisitionSources} total={pollTotal} lockedMode={rankMode} />
              <RankingPanel eyebrow="Geography" title="Login Country 登录国家排名" entries={pollData.loginCountries} total={pollTotal} lockedMode={rankMode} />
            </section>
          )}
        </>
      )
    }

    if (activeTab === 'topUsers') {
      return (
        <>
          <Intro eyebrow="Top Users" headline="The people driving the most conversations." description="Ranked by conversation count inside the selected window." />
          <section className="sample4-overview-controls sample4-top-users-controls">
            <label className="sample4-field">
              <span>Top K</span>
              <input type="number" min="1" max="500" value={topK} onChange={(e) => setTopK(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <DateRange start={topUsersRange.start} end={topUsersRange.end} minDate={topUsers.bounds?.min} maxDate={topUsers.bounds?.max} onChange={setTopUsersRange} onReset={() => {
              const end = topUsers.bounds?.max ?? todayTzKey(tzOffsetMs)
              setTopUsersRange({ start: addDays(end, -29), end })
            }} />
            {isAdmin && <Segmented value={topUsersMode} onChange={setTopUsersMode} options={[{ value: 'count', label: 'Count' }, { value: 'percent', label: 'Percentage' }]} />}
          </section>
          <section className="sample4-grid">
            {/* `general` has no window-totals panel beside this one, so the
                ranking takes the whole row instead of leaving it half empty. */}
            <article className={`sample4-panel${isAdmin ? '' : ' sample4-full'}`}>
              <PanelHeading eyebrow="Ranking" title="Top Users by Conversations 用户对话数排名" />
              <Ranking entries={topUsers.data} total={topUsers.totalConversations} mode={isAdmin ? topUsersMode : 'percent'} />
            </article>
            {/* Window totals are raw volume — admin only. */}
            {isAdmin && (
              <article className="sample4-panel">
                <PanelHeading eyebrow="Window" title="Selected range" />
                <Metrics items={[
                  { label: 'Conversations', value: formatCount(topUsers.totalConversations), note: `${topUsersRange.start} → ${topUsersRange.end}` },
                  { label: 'Active users', value: formatCount(topUsers.activeUsers), note: 'Users with conversations in range' },
                ]} />
              </article>
            )}
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading eyebrow="Details" title={`Top ${topUsers.rows.length} Users Details`} />
              {/* No per-row raw-JSON toggle any more: clicking the user opens
                  the full profile, which shows the same login IP in readable
                  form. One action per row beats two. */}
              <DataTable
                columns={isAdmin
                  ? ['User', 'Identity', 'Country', 'Convs', 'Init Fn', 'Top Fns', 'Source']
                  : ['User', 'Identity', 'Country', 'Init Fn', 'Top Fns', 'Source']}
                rows={topUsers.rows.map((row) => {
                  const topFns = Array.isArray(row.mostUsedFunctions) ? [...row.mostUsedFunctions].sort((a, b) => b.count - a.count).slice(0, 3).map((f) => f.function).join(' · ') : '—'
                  return [
                    <UserLink key="user" userId={row.user_id} label={row.label} tzOffsetMs={tzOffsetMs} />,
                    row.identity ?? '—',
                    row.nationality && row.nationality !== row.country ? `${row.country ?? '—'} · ${row.nationality}` : row.country ?? '—',
                    ...(isAdmin ? [formatCount(row.conversations)] : []),
                    row.initialUsedFunction ?? '—',
                    topFns,
                    sourceString(row.acquisitionSources),
                  ]
                })}
              />
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'paid') {
      if (!paid) return <div className="sample4-state">{paidError ? `Failed to load paid stats: ${paidError}` : 'Loading paid stats…'}</div>
      const paidRateSeries = paidModel.paidRate
      const paidRateLabels = paidRateSeries.map((d) => d.time)
      // 严格口径 — first payments only, one per user ever, against the same
      // bucket's new signups. Two charts: how many, then at what rate.
      const strictVolumeLines = [{ label: '首次付费人数', values: paidRateSeries.map((d) => d.strictTotal) }]
      const strictRateLines = [{ label: '首次付费率', values: paidRateSeries.map((d) => d.strictRatePct) }]
      // The average is one constant, so it belongs on the reference-line layer
      // — dashed and labelled in place, the same treatment User growth gives
      // its average. Drawn as a series it took the leading colour and read as
      // just another metric.
      const strictRateAverage = paidRateSeries.length === 0
        ? []
        : [{ label: '平均首次付费率', value: paidRateSeries[0].avgStrictRatePct }]
      // The signup count behind each point. A rate with no denominator on
      // screen cannot be read, so this goes to every role, not just admins.
      const strictNotes = paidRateSeries.map((d) => (
        `注册 ${formatCount(d.signups)} · 首次付费 ${formatCount(d.strictTotal)} 人`
      ))

      // 宽口径 — every payment event, split by whether it was that user's
      // first. Same denominator as 严格口径 (the bucket's new signups), so the
      // segments stack into the total paid rate instead of being normalised
      // away: bar height IS 总付费率, and each band is the part of it that
      // renewals / first payments account for.
      const repeatSegment = { label: '续费率', values: paidRateSeries.map((d) => d.repeatRatePct), variant: 'muted' }
      const firstVsRepeat = [
        { label: '首次付费率', values: paidRateSeries.map((d) => d.strictRatePct), variant: 'main' },
        repeatSegment,
      ]
      const firstSplitVsRepeat = [
        { label: '首次 · Subscription 率', values: paidRateSeries.map((d) => d.firstSubscriptionRatePct), variant: 'main' },
        { label: '首次 · One-off 率', values: paidRateSeries.map((d) => d.firstOneoffRatePct), variant: 'accent' },
        repeatSegment,
      ]
      const broadNotes = paidRateSeries.map((d) => (
        `注册 ${formatCount(d.signups)} · 付费 ${formatCount(d.total)} 笔`
        + `（首次 ${formatCount(d.strictTotal)} / 续费 ${formatCount(d.repeat)}）`
      ))
      const filteredPaidUsers = paidModel.paidUsers
        .filter((user) => paidFilter === 'all' || (paidFilter === 'active' ? user.isCurrentlyPaid : !user.isCurrentlyPaid))
        .sort((a, b) => {
          const nullLast = (x, y, dir) => x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : dir === 'asc' ? x - y : y - x
          if (paidSort === 'first_paid_asc') return a.firstPaidAt - b.firstPaidAt
          if (paidSort === 'total_days_desc') return b.totalPaidDays - a.totalPaidDays
          if (paidSort === 'total_days_asc') return a.totalPaidDays - b.totalPaidDays
          if (paidSort === 'signup_to_paid_asc') return nullLast(a.signupToFirstPaidDays, b.signupToFirstPaidDays, 'asc')
          if (paidSort === 'signup_to_paid_desc') return nullLast(a.signupToFirstPaidDays, b.signupToFirstPaidDays, 'desc')
          return b.firstPaidAt - a.firstPaidAt
        })
      // Several hundred rows is too many to render at once — page it the same
      // way the General tab pages Latest users. Changing filter or sort resets
      // to the first page; the index is also clamped, so a list that shrinks
      // under the current page lands on its last page instead of an empty one.
      const paidTotalPages = Math.max(1, Math.ceil(filteredPaidUsers.length / PAID_USERS_PAGE_SIZE))
      const paidSafePage = Math.min(paidUsersPage, paidTotalPages - 1)
      const paidPageUsers = filteredPaidUsers.slice(
        paidSafePage * PAID_USERS_PAGE_SIZE,
        (paidSafePage + 1) * PAID_USERS_PAGE_SIZE,
      )
      const sidebarPanel = (key, title, description, rows) => (
        <article className="sample4-panel">
          <PanelHeading eyebrow="Bypass" title={title} actions={<ExpandButton open={expandedSidebar === key} onClick={() => setExpandedSidebar(expandedSidebar === key ? null : key)}>{expandedSidebar === key ? 'Hide users' : 'Show users'}</ExpandButton>} />
          <div className="sample4-callout"><strong>{formatCount(rows.length)}</strong><span>{description}</span></div>
          {expandedSidebar === key && <Ranking entries={rows.map((r) => ({ name: r.label, value: r.count }))} total={rows.reduce((s, r) => s + r.count, 0)} />}
        </article>
      )
      // Names individual users, so only admins get it (see Detailed analysis).
      const recentPaymentsSection = (
        <section className="sample4-grid sample4-even">
          {[
            ['One-off 付费', 'oneoff'],
            ['首次订阅', 'initial'],
            ['续订', 'renewal'],
          ].map(([title, key]) => (
            <article key={key} className="sample4-panel">
              <PanelHeading eyebrow="最新付费记录" title={title} />
              <DataTable columns={['User', 'Tier', 'Started']} rows={paidModel.recentPayments[key].map((row) => [row.label, row.tier, dateOnly(row.startedAt, tzOffsetMs)])} />
            </article>
          ))}
        </section>
      )
      // How long people actually take to pay, measured from the data on
      // screen. Most pay within a day of signing up, so the ratio below is
      // close to a conversion rate — but only the cohort table is one.
      const lagText = (() => {
        const lag = paidModel.signupToPaid
        if (!lag) return ''
        const median = lag.medianDays < 1
          ? `${Math.max(1, Math.round(lag.medianDays * 24))} 小时`
          : `${lag.medianDays.toFixed(1)} 天`
        return `实测注册到首次付费的中位间隔约 ${median}，${lag.withinDayPct.toFixed(0)}% 在 1 天内、${lag.withinWeekPct.toFixed(0)}% 在 7 天内付费。`
      })()
      const notCohortNote = `分子分母不是同一批人，所以这是比值，不是转化率${canViewGrowth ? ' —— 同一批人的转化率看「付费 Cohort」' : ''}。${lagText}`

      const paidCohortSection = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow="Paid conversion cohorts"
              title="付费 Cohort · 按注册日期的累计付费率"
              actions={(
                <div className="sample4-heading-actions">
                  <DateRange
                    start={paidCohortRange.start}
                    end={paidCohortRange.end}
                    maxDate={todayTzKey(tzOffsetMs)}
                    onChange={setPaidCohortRange}
                    onReset={() => {
                      const end = todayTzKey(tzOffsetMs)
                      setPaidCohortRange({ start: addDays(end, -90), end })
                    }}
                  />
                  <InlineField label="Cohort">
                    <Segmented value={paidCohortGranularity} onChange={setPaidCohortGranularity} options={[{ value: 'day', label: '按天' }, { value: 'week', label: '按周' }]} />
                  </InlineField>
                </div>
              )}
            />
            <p className="sample4-note">
              每行是同一{paidCohortGranularity === 'week' ? '周' : '天'}注册的一批人，D-N = 这批人里在注册后 N 天内完成<strong>首次付费</strong>的比例（按人数，不按笔数）。
              分子分母是同一批人，所以这才是付费转化率。只算真实付款，邀请 / 手动 / 合作方赠送不计入。
              「—」表示这一天还没过完；带 * 的格子只覆盖了这批人里已经到达该天的部分，所以合计行不保证从左到右递增。
            </p>
            <CohortTable
              rowHeader={paidCohortGranularity === 'week' ? '注册周' : '注册日期'}
              sizeHeader="注册人数"
              showCounts={growthCounts}
              columns={paidCohorts.days.map((day) => ({ key: `d${day}`, label: day === 0 ? 'D0 付费' : `D${day} 累计付费` }))}
              rows={paidCohorts.rows.map((row) => ({ key: row.bucket, label: row.label, size: row.size, cells: row.cells }))}
              total={{ label: '合计', size: paidCohorts.total.size, cells: paidCohorts.total.cells }}
            />
          </article>
        </section>
      )

      const renewalSection = (
        <>
          {/* Both charts are wide time series — side by side they squeeze the
              x-axis to the point of being unreadable, so each takes its own row. */}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading eyebrow="Monthly renewal" title="月度续费率 · 订阅 vs One-off 复购" />
              <p className="sample4-note">
                订阅续费率只看<strong>订阅</strong>（initial_subscription / renewal / card-upgrade）：一个计费周期到期后，
                在到期前 {RENEWAL_EARLY_DAYS} 天到到期后 {RENEWAL_WINDOW_DAYS} 天之间有没有下一期。
                One-off 是一次性购买，不会自动续费，单独算「到期后有没有再买」，不进续费率的分母。
              </p>
              {/* A month is only counted once every expiry in it has had the
                  full renewal window to land, so the newest month is always
                  short of renewals. Unmarked, that reads as a collapse. */}
              <DashboardLineChart
                labels={paidModel.monthlyRenewal.map((d) => d.time)}
                series={[
                  { label: '订阅续费率', values: paidModel.monthlyRenewal.map((d) => d.ratePct) },
                  { label: 'One-off 复购率', values: paidModel.monthlyRenewal.map((d) => d.oneOffRatePct) },
                ]}
                notes={paidModel.monthlyRenewal.map((d) => (
                  (growthCounts
                    ? `订阅 ${formatCount(d.renewed)} / ${formatCount(d.eligible)} 到期续费 · One-off ${formatCount(d.oneOffRepurchased)} / ${formatCount(d.oneOffEligible)} 复购`
                    : '按到期月份统计')
                  + (d.maturing ? ` · 观察中，未满 ${RENEWAL_WINDOW_DAYS} 天的到期不计入` : '')
                ))}
                shaded={{
                  indices: new Set(paidModel.monthlyRenewal.flatMap((d, index) => (d.maturing ? [index] : []))),
                  label: '观察中',
                }}
                format="percent"
              />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Renewal ladder"
                title="首次 / 第二次 / 第三次续费率"
                note={`行业参考 · 月订阅首次续费率中位约 ${GROWTH_BENCHMARKS.firstRenewal.median}%，较好 ${GROWTH_BENCHMARKS.firstRenewal.good[0]}%–${GROWTH_BENCHMARKS.firstRenewal.good[1]}%+`}
              />
              <p className="sample4-note">
                第 N 次续费率 = 已经付到第 N 期的订阅里，到期后续上第 N+1 期的比例。流失后隔了超过 {RENEWAL_WINDOW_DAYS} 天再回来订阅的，重新从第 1 期算。
                越往后的人越稳定，所以后面几档天然更高 —— 真正决定收入的是第 1 次。
              </p>
              <Metrics items={paidModel.renewal.ladder.map((step) => ({
                label: step.label,
                value: step.ratePct == null ? '—' : `${step.ratePct.toFixed(1)}%`,
                note: step.eligible === 0
                  ? '还没有到期满观察期的订阅'
                  : growthCounts ? `${formatCount(step.renewed)} / ${formatCount(step.eligible)} 期到期后续费` : '到期后续上下一期的比例',
              }))} />
            </article>
          </section>
        </>
      )

      const paidRetentionSection = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading eyebrow="Paid retention" title="付费用户留存率" actions={<Segmented value={paidRetentionMode} onChange={setPaidRetentionMode} options={[{ value: 'exact', label: 'Exact-day' }, { value: 'rolling', label: 'Rolling' }]} />} />
            <Metrics items={paidModel.paidRetention.keyDays.map((p) => ({ label: `D${p.day} ${paidRetentionMode === 'exact' ? 'Exact' : 'Rolling'}`, value: p.eligible > 0 ? `${p.ratePct.toFixed(1)}%` : '—', note: growthCounts ? `${p.returned} / ${p.eligible} eligible users` : 'Of payers who have reached this day' }))} />
            <DashboardLineChart
              labels={paidModel.paidRetention.line.map((p) => `D${p.day}`)}
              tooltips={paidModel.paidRetention.line.map((p) => `Day ${p.day}`)}
              series={[{ label: 'Retention', values: paidModel.paidRetention.line.map((p) => p.ratePct) }]}
              notes={growthCounts ? paidModel.paidRetention.line.map((p) => `${formatCount(p.returned)} / ${formatCount(p.eligible)} eligible users`) : undefined}
              format="percent"
            />
          </article>
        </section>
      )

      const paidRatePanel = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow={paidRateView === 'strict' ? 'First payments' : 'Payment mix'}
              title="新付费趋势"
              actions={(
                <div className="sample4-heading-actions">
                  <DateRange start={paidRateRange.start} end={paidRateRange.end} onChange={setPaidRateRange} onReset={() => setPaidRateRange({ start: '', end: '' })} />
                  <InlineField label="颗粒度">
                    <Segmented value={paidRateGranularity} onChange={setPaidRateGranularity} options={[{ value: 1, label: '1d' }, { value: 3, label: '3d' }, { value: 7, label: '7d' }]} />
                  </InlineField>
                  <Segmented value={paidRateView} onChange={setPaidRateView} options={[{ value: 'strict', label: '严格口径' }, { value: 'broad', label: '宽口径' }]} />
                </div>
              )}
            />
            {paidRateView === 'strict' ? (
              <>
                {/* Says plainly what the denominator is. This is first-payments-
                    per-new-signup in the same bucket, NOT a cohort conversion
                    rate — the payers and the signups are different people. */}
                <p className="sample4-note">
                  每个用户的首次付费 ÷ 同期新注册数。首次付费按最早付费时间判定，不依赖 billing_reason。
                  {' '}{notCohortNote}
                </p>
                {/* Volume first: the rate below shares its buckets, but its
                    denominator is that bucket's signups, so the rate alone
                    swings with registrations rather than with revenue. */}
                <p className="sample4-chart-caption">绝对量 · 每桶首次付费人数</p>
                <DashboardLineChart labels={paidRateLabels} series={strictVolumeLines} notes={strictNotes} />
                <p className="sample4-chart-caption">比率 · 占同期新注册</p>
                <DashboardLineChart
                  labels={paidRateLabels}
                  series={strictRateLines}
                  notes={strictNotes}
                  referenceLines={strictRateAverage}
                  format="percent"
                />
              </>
            ) : (
              <>
                <p className="sample4-note">
                  全部付费笔数（含续费）÷ 同期新注册数 —— 柱高就是当期总付费率，分段是续费和首次付费各占其中多少。
                  同一人多次付费算多笔，所以分子会超过付费人数。
                  {' '}{notCohortNote}
                </p>
                <p className="sample4-chart-caption">总付费率 · 拆首次付费 / 续费</p>
                <DashboardStackedBars
                  labels={paidRateLabels}
                  segments={firstVsRepeat}
                  notes={broadNotes}
                  totalLabel="总付费率"
                  format="percent"
                />
                {/* Same bars, same height, with the first-payment band split by
                    how it was paid for. */}
                <p className="sample4-chart-caption">总付费率 · 首次付费再拆 One-off / Subscription</p>
                <DashboardStackedBars
                  labels={paidRateLabels}
                  segments={firstSplitVsRepeat}
                  notes={broadNotes}
                  totalLabel="总付费率"
                  format="percent"
                />
              </>
            )}
          </article>
        </section>
      )

      // Pre-payment feature analysis. Shown to both roles: it is about which
      // features lead to payment, and it reads perfectly well as rates and
      // shares. `general` just loses the raw user/payer counts, same rule as
      // every other tab.
      const firstTouchRanking = paidModel.features.conversion
        .map((row) => ({ name: row.name, value: row.paid }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)

      const prePaymentSection = (
        <>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Pre-payment usage"
                title="付费前主要在用什么功能"
                note={`Baseline paid rate ${ratePct(paidModel.features.overallRatePct)} · covers ${formatCount(paidModel.features.analyzedPaid)} of ${formatCount(paidModel.features.paidTotal)} paid users`}
              />
              <p className="sample4-note">
                Ranked by how often a user whose <em>first</em> function was X went on to pay.
                <code>initial_used_function</code> is the only feature signal that predates payment.
                Buckets under {FEATURE_MIN_SAMPLE} users are excluded from the ranking
                {paidModel.features.belowSample > 0 ? ` (${paidModel.features.belowSample} hidden)` : ''}.
                {paidModel.features.paidTotal > paidModel.features.analyzedPaid && (
                  <> {formatCount(paidModel.features.paidTotal - paidModel.features.analyzedPaid)} of{' '}
                  {formatCount(paidModel.features.paidTotal)} paid users have no
                  <code>user_analytics</code> row and are not counted here.</>
                )}
              </p>
              <DataTable
                columns={['Initial function', 'Users', 'Paid', 'Paid rate', 'vs baseline', 'Share of payers']}
                empty="No analyzed users with an initial function yet."
                rows={paidModel.features.conversion.map((row) => [
                  row.name,
                  formatCount(row.users),
                  formatCount(row.paid),
                  ratePct(row.ratePct),
                  row.index === null ? '—' : `${row.index.toFixed(2)}×`,
                  ratePct(row.paidSharePct),
                ])}
              />
            </article>
          </section>
          <section className="sample4-grid">
            {/* Nothing sits beside this one on either role — the lifetime
                ranking below has its own row — so it takes the full width
                rather than leaving half the row empty. */}
            <RankingPanel
              eyebrow="Payers · first touch"
              title="付费用户的初始功能"
              entries={firstTouchRanking}
              total={paidModel.features.analyzedPaid}
              className="sample4-full"
            />
          </section>
        </>
      )

      // Detailed analysis: one cohort, its own date range, read end to end.
      const insightsRes = sources.paidInsights
      const usageEntries = (phase) => paidDetail.usage[phase].map((entry) => ({
        name: entry.name,
        value: paidUsageMetric === 'events' ? entry.events : entry.users,
      }))
      const usageUnit = paidUsageMetric === 'events' ? '次' : '人'

      const detailedSection = (
        <>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Detailed analysis"
                title="付费用户画像 · 按首次付费时间"
                note={`${formatCount(paidDetail.cohort.length)} / ${formatCount(paidModel.paidUsers.length)} 名付费用户在范围内`}
                actions={(
                  <DateRange
                    start={paidDetailRange.start}
                    end={paidDetailRange.end}
                    onChange={setPaidDetailRange}
                    onReset={() => setPaidDetailRange({ start: '', end: '' })}
                  />
                )}
              />
              <p className="sample4-note">
                这里的时间范围<strong>只作用于 Detailed analysis</strong>，与 General analysis 的时间选择互不影响。
                它按<strong>首次付费时间</strong>圈定一批付费用户，本页下面所有图都基于这批人的完整历史。
              </p>
            </article>
          </section>
          <section className="sample4-grid sample4-even">
            <article className="sample4-panel">
              <PanelHeading eyebrow="Country" title="付费用户使用地区分布" note="From user_analytics.country" />
              <DashboardPieChart entries={paidDetail.country} hideCounts={!isAdmin} />
            </article>
            <article className="sample4-panel">
              <PanelHeading eyebrow="Nationality" title="付费用户国籍分布" note="From user_analytics.nationality" />
              <DashboardPieChart entries={paidDetail.nationality} hideCounts={!isAdmin} />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Feature usage"
                title="付费前 / 付费后功能使用比例"
                note="Split at each user's own first payment"
                actions={(
                  <Segmented
                    value={paidUsageMetric}
                    onChange={setPaidUsageMetric}
                    options={[{ value: 'events', label: '按使用次数' }, { value: 'users', label: '按用户数' }]}
                  />
                )}
              />
              <p className="sample4-note">
                每条记录都带时间戳，按用户自己的首次付费时间切成前 / 后两段。
                对话（Chat）把 cheatsheet、概念讲解等会话内技能合并成一个口径 —— 这些记录在
                {' '}<code>conversation_data</code> 里，逐条拆开要下载几百 MB。
                「按用户数」是该阶段用过此功能的去重人数，各功能相加会大于命中人数。
              </p>
              {insightsRes.error ? (
                <p className="sample4-note">功能使用数据加载失败：{insightsRes.error}</p>
              ) : !insightsRes.data ? (
                <SkeletonBlock height={200} />
              ) : (
                <section className="sample4-grid sample4-thirds">
                  {PAID_USAGE_PHASES.map((phase) => {
                    const entries = usageEntries(phase.key)
                    const total = entries.reduce((sum, entry) => sum + entry.value, 0)
                    return (
                      <article key={phase.key} className="sample4-panel">
                        <PanelHeading
                          eyebrow={phase.note}
                          title={phase.label}
                          note={isAdmin ? `${formatCount(total)} ${usageUnit}` : undefined}
                        />
                        <DashboardPieChart entries={entries} hideCounts={!isAdmin} />
                      </article>
                    )
                  })}
                </section>
              )}
            </article>
          </section>
          {prePaymentSection}
        </>
      )

      // Who the payers are, and which kind of user converts best.
      const profileDimension =
        PAID_PROFILE_DIMENSIONS.find((d) => d.value === paidProfileDimension) ?? PAID_PROFILE_DIMENSIONS[0]
      const profileResult = paidModel.profile[profileDimension.value]
      // `ranked` is already sorted by paid rate; "按付费人数" re-sorts it to
      // answer the composition question instead of the conversion one.
      const profileRows = paidProfileSort === 'volume'
        ? [...profileResult.ranked].sort((a, b) => b.paid - a.paid || b.users - a.users)
        : profileResult.ranked
      const unprofiledPaid = Math.max(0, paidModel.overview.totalPaidUsers - profileResult.analyzedPaid)

      const paidProfileSection = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow="Paid profile"
              title="付费用户画像 · 功能 / 人口属性 / 身份"
              note={`Baseline paid rate ${ratePct(profileResult.overallRatePct)} · ${formatCount(profileResult.analyzedPaid)} payers across ${formatCount(profileResult.analyzedTotal)} profiled users`}
              actions={(
                <div className="sample4-heading-actions">
                  <Segmented
                    value={paidProfileDimension}
                    onChange={setPaidProfileDimension}
                    options={PAID_PROFILE_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                  />
                  <Segmented
                    value={paidProfileSort}
                    onChange={setPaidProfileSort}
                    options={[{ value: 'rate', label: '按付费率' }, { value: 'volume', label: '按付费人数' }]}
                  />
                </div>
              )}
            />
            <p className="sample4-note">
              {profileDimension.note}
              {' '}分母是有 <code>user_analytics</code> 画像的用户，
              少于 {profileDimension.minSample} 人的分段不参与排名
              {profileResult.belowSample > 0 ? `（已隐藏 ${profileResult.belowSample} 个）` : ''}。
              <em>vs baseline</em> = 该分段付费率 ÷ 整体付费率，&gt;1 表示这类用户更容易付费。
              {unprofiledPaid > 0 && (
                <> 另有 {formatCount(unprofiledPaid)} 名付费用户没有画像数据，未计入本表。</>
              )}
            </p>
            <DataTable
              columns={[profileDimension.column, 'Users', 'Paid', 'Paid rate', 'vs baseline', 'Share of payers']}
              empty="No profiled users in this dimension yet."
              rows={profileRows.map((row) => [
                row.name,
                formatCount(row.users),
                formatCount(row.paid),
                ratePct(row.ratePct),
                row.index === null ? '—' : `${row.index.toFixed(2)}×`,
                ratePct(row.paidSharePct),
              ])}
            />
          </article>
        </section>
      )

      // `general` gets the trend and both analysis tables exactly as an admin
      // sees them, signup counts included. What stays admin-only is only the
      // parts that name individual users: the paid user list, the invite /
      // manual rosters and the recent-payment feed.
      const viewToggle = (
        <Segmented
          value={paidView}
          onChange={setPaidView}
          options={[
            { value: 'general', label: 'General analysis' },
            { value: 'detailed', label: 'Detailed analysis' },
            ...(canViewRevenue ? [{ value: 'billing', label: '收入与取消' }] : []),
          ]}
        />
      )

      if (paidView === 'billing' && canViewRevenue) {
        return (
          <>
            <Intro actions={viewToggle} />
            <BillingView
              resource={sources.billing}
              tzOffsetMs={tzOffsetMs}
              isAdmin={isAdmin}
              labelFor={(userId) => labelUser(userId, userLabels)}
            />
          </>
        )
      }

      const paidMostUsedSection = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow="Payers · lifetime"
              title="付费用户最常用功能"
              note="Lifetime totals — includes usage after paying"
            />
            {/* The heading's "Lifetime totals" note carries the caveat:
                most_used_function has no timestamps, so this cannot be split
                into before / after payment. */}
            <Ranking entries={paidModel.features.paidMostUsed} total={paidModel.features.paidMostUsed.reduce((sum, e) => sum + e.value, 0)} />
          </article>
        </section>
      )

      if (paidView === 'detailed') {
        return (
          <>
            <Intro actions={viewToggle} />
            {detailedSection}
            {isAdmin && paidMostUsedSection}
            {isAdmin && recentPaymentsSection}
          </>
        )
      }

      if (!isAdmin) {
        return (
          <>
            <Intro actions={viewToggle} />
            {canViewGrowth && paidCohortSection}
            {paidRatePanel}
            {canViewGrowth && renewalSection}
            {canViewGrowth && paidRetentionSection}
            {paidProfileSection}
          </>
        )
      }

      return (
        <>
          <Intro actions={viewToggle} />
          {/* An unrecognised billing_reason is excluded from every metric on
              this tab, so say so rather than letting it vanish — that is how
              the *-upgrade rows went missing. One line, and dismissible: it
              is worth knowing once, not worth a banner on every visit. */}
          {paidModel.bucketed.other.length > 0 && !paidOtherNoticeHidden && (
            <div className="sample4-notice">
              <p>
                {formatCount(paidModel.bucketed.other.length)} 条订阅的 <code>billing_reason</code> 未识别
                （{Array.from(new Set(paidModel.bucketed.other.map((sub) => sub.billing_reason ?? '(null)'))).join(', ')}），
                未计入本页任何数字 —— 认它们请改 <code>src/api/getUserInfo/paid.ts</code>。
              </p>
              <button type="button" aria-label="Dismiss" onClick={() => setPaidOtherNoticeHidden(true)}>×</button>
            </div>
          )}
          {paidCohortSection}
          {paidRatePanel}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading eyebrow="Overview" title="付费用户总览" actions={<ExpandButton open={showPaidOverviewGeo} onClick={() => setShowPaidOverviewGeo((v) => !v)}>地区 / 国籍 / 身份分布</ExpandButton>} />
              <Metrics items={[
                { label: '付费用户总数', value: formatCount(paidModel.overview.totalPaidUsers), note: 'Distinct users with at least one paid subscription' },
                { label: '当前活跃付费', value: formatCount(paidModel.overview.currentlyActive), note: 'Currently inside an unexpired paid span' },
                { label: '已流失', value: formatCount(paidModel.overview.churned), note: 'Was paid before but no active span now' },
                { label: '仅一次性付费', value: formatCount(paidModel.overview.onlyOneOff), note: 'Only one-off-payment, single span' },
              ]} />
              {showPaidOverviewGeo && (
                <section className="sample4-grid sample4-even">
                  <RankingPanel eyebrow="Country" title="使用地区分布" entries={paidModel.geo.country} total={paidModel.paidUsers.length} />
                  <RankingPanel eyebrow="Nationality" title="国籍分布" entries={paidModel.geo.nationality} total={paidModel.paidUsers.length} />
                </section>
              )}
            </article>
          </section>
          <section className="sample4-grid sample4-even">
            {sidebarPanel('invite', '邀请奖励用户', 'invite_code_grant + invitation_credit_grant + partner_referral_grant', paidModel.inviteUsers)}
            {sidebarPanel('manual', '手动添加用户', 'manual_addition (operations / scripts)', paidModel.manualUsers)}
          </section>
          {renewalSection}
          {paidRetentionSection}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Paid users"
                title="付费用户列表"
                actions={<div className="sample4-heading-actions"><Segmented value={paidFilter} onChange={(value) => { setPaidUsersPage(0); setPaidFilter(value) }} options={[{ value: 'all', label: `全部 (${paidModel.paidUsers.length})` }, { value: 'active', label: `活跃 (${paidModel.overview.currentlyActive})` }, { value: 'churned', label: `已流失 (${paidModel.overview.churned})` }]} /><select value={paidSort} onChange={(e) => { setPaidUsersPage(0); setPaidSort(e.target.value) }}><option value="first_paid_desc">首次付费时间 ↓ (最新)</option><option value="first_paid_asc">首次付费时间 ↑ (最早)</option><option value="total_days_desc">累计付费时长 ↓ (最长)</option><option value="total_days_asc">累计付费时长 ↑ (最短)</option><option value="signup_to_paid_asc">注册→首次付费 ↑ (最快)</option><option value="signup_to_paid_desc">注册→首次付费 ↓ (最慢)</option></select><ExpandButton open={showPaidListGeo} onClick={() => setShowPaidListGeo((v) => !v)}>地区/国籍分布</ExpandButton><div className="sample4-pagination"><button type="button" disabled={paidSafePage === 0} onClick={() => setPaidUsersPage(paidSafePage - 1)}>Prev</button><span>{filteredPaidUsers.length === 0 ? '0 users' : `${paidSafePage * PAID_USERS_PAGE_SIZE + 1}-${Math.min((paidSafePage + 1) * PAID_USERS_PAGE_SIZE, filteredPaidUsers.length)} of ${filteredPaidUsers.length}`} · Page {paidSafePage + 1} / {paidTotalPages}</span><button type="button" disabled={paidSafePage >= paidTotalPages - 1} onClick={() => setPaidUsersPage(paidSafePage + 1)}>Next</button></div></div>}
              />
              {showPaidListGeo && <section className="sample4-grid sample4-even"><RankingPanel eyebrow="Country" title="使用地区分布" entries={paidModel.geo.country} total={paidModel.paidUsers.length} /><RankingPanel eyebrow="Nationality" title="国籍分布" entries={paidModel.geo.nationality} total={paidModel.paidUsers.length} /></section>}
              {/* No per-row expander: the span breakdown it used to reveal now
                  lives in the user profile, which opens from the name. */}
              <DataTable
                columns={['User', 'Identity', 'Country', 'Tier', 'First payment', 'Signed up', 'First paid', 'Signup → paid', 'Total paid', 'Spans', 'Status', 'Tags', 'Init Fn', 'Top Fns', 'Source']}
                rows={paidPageUsers.map((row) => {
                  const tags = [row.hasOneOff && 'one-off', row.hasInvite && 'invite', row.hasManual && 'manual'].filter(Boolean).join(', ') || '—'
                  const topFns = Array.isArray(row.mostUsedFunctions) ? [...row.mostUsedFunctions].sort((a, b) => b.count - a.count).slice(0, 3).map((f) => f.function).join(' · ') : '—'
                  const firstSub = row.spans[0]?.subs[0]
                  return [
                    <UserLink key="user" userId={row.user_id} label={row.label} tzOffsetMs={tzOffsetMs} />,
                    row.identity ?? '—',
                    row.nationality && row.nationality !== row.country ? `${row.country ?? '—'} · ${row.nationality}` : row.country ?? '—',
                    row.tierMix,
                    firstSub ? `${firstSub.tier} · ${firstSub.billing_reason ?? '—'}` : '—',
                    row.signupAt != null ? dateOnly(row.signupAt, tzOffsetMs) : '—',
                    dateOnly(row.firstPaidAt, tzOffsetMs),
                    row.signupToFirstPaidDays == null ? '—' : `${Math.round(row.signupToFirstPaidDays)}d`,
                    `${Math.round(row.totalPaidDays)}d`,
                    row.totalPaidSpans,
                    row.isCurrentlyPaid ? 'Active' : 'Churned',
                    tags,
                    row.initialUsedFunction ?? '—',
                    topFns,
                    sourceString(row.acquisitionSources),
                  ]
                })}
              />
            </article>
          </section>
          {paidProfileSection}
        </>
      )
    }

    if (activeTab === 'channels') {
      const isUtm = channelDimension !== 'selfReported'
      const utmRes = sources.utm
      const coverage = channelPerformance.coverage
      const retentionTarget = (day) => GROWTH_BENCHMARKS.retention.find((bench) => bench.day === day)?.target ?? undefined
      const shareCell = (row) => ({ ratePct: row.sharePct, hit: row.size, eligible: coverage.covered, partial: false })
      const cellsOf = (row) => [shareCell(row), row.activation, ...row.retention, row.paid, row.renewal]
      return (
        <>
          <Intro eyebrow="Channels" headline="Which channel brings users worth having." description="Activation, return, payment and renewal for the users each acquisition channel brought in." />
          <section className="sample4-overview-controls">
            <Segmented
              value={channelDimension}
              onChange={setChannelDimension}
              options={[
                { value: 'selfReported', label: '用户自述来源' },
                { value: 'utm_source', label: 'utm_source' },
                { value: 'utm_medium', label: 'utm_medium' },
                { value: 'utm_campaign', label: 'utm_campaign' },
              ]}
            />
            <DateRange
              start={channelRange.start}
              end={channelRange.end}
              maxDate={todayTzKey(tzOffsetMs)}
              onChange={setChannelRange}
              onReset={() => setChannelRange({ start: '', end: '' })}
            />
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow={isUtm ? 'UTM attribution' : 'Self-reported source'}
                title="渠道质量 · 激活 / 留存 / 付费 / 续费"
                note={coverage.pct == null ? undefined : `覆盖 ${coverage.pct.toFixed(1)}% 的注册用户${growthCounts ? `（${formatCount(coverage.covered)} / ${formatCount(coverage.cohortSize)}）` : ''}`}
              />
              <p className="sample4-note">
                {isUtm
                  ? <>渠道来自注册链接上的 UTM 参数。<strong>目前只有极少数注册带 UTM</strong>，样本太小，这张表只能看个方向 —— 投放链接统一加上 UTM 之后才有判断价值。</>
                  : <>渠道来自用户注册问卷里<strong>自己选的</strong>来源（<code>user_acquisition_sources</code>），不是链接追踪：没填问卷的人不在表里，选了多个来源的人在每个来源下各算一次。
                    填了问卷的人本身就更投入，所以这张表的激活率和留存会<strong>高于全体用户</strong> —— 适合渠道之间横向比，不能当作整体水平。</>}
                {' '}日期范围按<strong>注册日期</strong>筛选。少于 {isUtm ? 5 : 30} 人的渠道不单独列出
                {channelPerformance.belowSample > 0 ? `（隐藏了 ${channelPerformance.belowSample} 个）` : ''}。
                D{channelPerformance.paidDay} 付费 = 注册后 {channelPerformance.paidDay} 天内首次付费；首次续费率只看订阅用户的第一期。
              </p>
              {isUtm && !utmRes.data ? (
                utmRes.error
                  ? <p className="sample4-note">UTM 数据加载失败：{utmRes.error}</p>
                  : <SkeletonBlock height={200} />
              ) : (
                <CohortTable
                  rowHeader="渠道"
                  sizeHeader="用户数"
                  showCounts={growthCounts}
                  empty="这个范围内没有达到最小样本的渠道。"
                  columns={[
                    { key: 'share', label: '用户占比', title: '占有渠道信息的用户' },
                    { key: 'activation', label: '激活率', title: `注册后 ${ACTIVATION_WINDOW_HOURS} 小时内有学习行为` },
                    ...channelPerformance.retentionDays.map((day) => ({ key: `d${day}`, label: `D${day} 留存`, target: retentionTarget(day) })),
                    { key: 'paid', label: `D${channelPerformance.paidDay} 付费` },
                    { key: 'renewal', label: '首次续费率' },
                  ]}
                  rows={channelPerformance.rows.map((row) => ({ key: row.name, label: row.name, size: row.size, cells: cellsOf(row) }))}
                  total={{ label: channelPerformance.total.name, size: channelPerformance.total.size, cells: cellsOf(channelPerformance.total) }}
                />
              )}
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'utmTracking') {
      if (!utm) return <div className="sample4-state">{utmError ? `Failed to load UTM stats: ${utmError}` : 'Loading UTM data…'}</div>
      const activeFilterCount = Object.values(utmFilters).filter(Boolean).length
      return (
        <>
          <Intro eyebrow="Marketing Attribution" headline="UTM Tracking" description="All users with UTM data on signup. Use the filters below to drill down by source, medium, campaign, content, or term." />
          <Metrics items={[
            { label: 'Tracked users', value: formatCount(utmData.filteredUsers.length), note: activeFilterCount > 0 ? `Filtered from ${formatCount(utmData.allUsers.length)} total` : 'Total users with UTM' },
            ...UTM_TOP_FIELDS.map((field) => {
              const top = utmData.breakdowns[field][0]
              return {
                label: `Top ${UTM_LABELS[field].toLowerCase()}`,
                value: top?.name ?? '—',
                note: top ? `${formatCount(top.value)} users · ${formatPct(top.value / utmData.filteredUsers.length, 0)}` : 'No data',
              }
            }),
          ]} />
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Breakdown"
                title="Users by UTM value"
                actions={
                  <Segmented
                    value={utmBreakdownField}
                    onChange={setUtmBreakdownField}
                    options={UTM_FIELDS.map((field) => ({ value: field, label: UTM_LABELS[field] }))}
                  />
                }
              />
              <DataTable
                columns={['#', UTM_LABELS[utmBreakdownField], 'Users', 'Share', '']}
                empty="No UTM data in this selection."
                rows={utmData.breakdowns[utmBreakdownField].map((entry, index) => {
                  const isFiltered = utmFilters[utmBreakdownField] === entry.name
                  return [
                    index + 1,
                    entry.name,
                    formatCount(entry.value),
                    formatPct(entry.value / utmData.filteredUsers.length, 1),
                    // "(not set)" is absent from the select options, so there is
                    // nothing to filter it down to.
                    entry.name === UTM_UNSET ? '' : (
                      <ExpandButton
                        key="filter"
                        onClick={() => setUtmFilters((prev) => ({
                          ...prev,
                          [utmBreakdownField]: isFiltered ? undefined : entry.name,
                        }))}
                      >
                        {isFiltered ? 'Clear' : 'Filter'}
                      </ExpandButton>
                    ),
                  ]
                })}
              />
            </article>
          </section>
          <section className="sample4-grid sample4-even">
            <RankingPanel
              eyebrow="Source"
              title="Users by utm_source"
              entries={utmData.breakdowns.utm_source}
              total={utmData.filteredUsers.length}
            />
            <RankingPanel
              eyebrow="Medium"
              title="Users by utm_medium"
              entries={utmData.breakdowns.utm_medium}
              total={utmData.filteredUsers.length}
            />
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Filters"
                title="UTM fields"
                actions={activeFilterCount > 0 && <ExpandButton onClick={() => setUtmFilters({})}>Clear filters ({activeFilterCount})</ExpandButton>}
              />
              <div className="sample4-filter-grid">
                {UTM_FIELDS.map((field) => (
                  <label key={field} className="sample4-field">
                    <span>{UTM_LABELS[field]}</span>
                    <select value={utmFilters[field] ?? ''} onChange={(e) => setUtmFilters((prev) => ({ ...prev, [field]: e.target.value || undefined }))}>
                      <option value="">All {UTM_LABELS[field]}s</option>
                      {utmData.optionsFor[field].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <DataTable
                columns={['#', 'User', ...UTM_FIELDS.map((field) => UTM_LABELS[field]), 'Acquisition', 'Location', 'Signed Up', '']}
                rows={utmData.filteredUsers.flatMap((user, index) => {
                  const isExpanded = expandedUtmUser === user.user_id
                  const base = [
                    index + 1,
                    <UserLink
                      key="user"
                      userId={user.user_id}
                      label={user.email || user.user_id.slice(0, 8) + '…'}
                      tzOffsetMs={tzOffsetMs}
                    />,
                    ...UTM_FIELDS.map((field) => fieldValue(user, field) || '—'),
                    user.acquisition_sources?.join(', ') || '—',
                    [user.login_ip?.city, user.login_ip?.region, user.login_ip?.country].filter(Boolean).join(', ') || '—',
                    formatDateTime(user.signup_at, tzOffsetMs),
                    <ExpandButton key="raw" open={isExpanded} onClick={() => setExpandedUtmUser(isExpanded ? null : user.user_id)}>{isExpanded ? 'Hide' : 'Raw'}</ExpandButton>,
                  ]
                  return isExpanded ? [base, ['Raw', JSON.stringify(user.utm_data, null, 2), '', '', '', '', '', '', '', '', '']] : [base]
                })}
              />
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'errorLogs') {
      if (!errorLogsData) {
        return <div className="sample4-state">{errorLogsError ? `Failed to load error logs: ${errorLogsError}` : 'Loading error logs…'}</div>
      }
      const { errorLogs, traceLogs, testSuite } = errorLogsData

      return (
        <>
          <Intro eyebrow="Reliability" headline="Error Logs" description="Last 500 rows from error_log, agent_trace_log, and agent_test_suite." />
          <section className="sample4-subtabs">
            <Segmented
              value={errorLogsSubTab}
              onChange={setErrorLogsSubTab}
              options={[
                { value: 'clientServer', label: 'Client & Server Errors' },
                { value: 'traces', label: 'Model Traces' },
                { value: 'testSuite', label: 'Test Suite' },
              ]}
            />
          </section>

          {errorLogsSubTab === 'clientServer' && (() => {
            const typeCounts = countByKey(errorLogs, (r) => r.error_type)
            const errorCount = errorLogs.filter((r) => r.is_error).length
            const filtered = errorLogs.filter((r) => {
              if (errorLogsOnlyErrors && !r.is_error) return false
              if (errorLogsTypeFilter && r.error_type !== errorLogsTypeFilter) return false
              return true
            })
            return (
              <>
                <Metrics items={[
                  { label: 'Rows fetched', value: formatCount(errorLogs.length), note: 'Most recent 500' },
                  { label: 'Errors / warnings', value: formatCount(errorCount), note: `${formatPct(errorCount / (errorLogs.length || 1), 1)} of rows` },
                  { label: 'Distinct error_type', value: formatCount(typeCounts.length) },
                ]} />
                <section className="sample4-grid">
                  <RankingPanel
                    eyebrow="error_log"
                    title="Rows by error_type"
                    entries={typeCounts.map(([name, value]) => ({ name, value }))}
                    total={errorLogs.length}
                    className="sample4-full"
                    scrollRows
                  />
                </section>
                <section className="sample4-grid">
                  <article className="sample4-panel sample4-full">
                    <PanelHeading
                      eyebrow="Detail"
                      title="Recent rows"
                      actions={
                        <div className="sample4-inline-controls">
                          <label className="sample4-field">
                            <span>error_type</span>
                            <select value={errorLogsTypeFilter} onChange={(e) => setErrorLogsTypeFilter(e.target.value)}>
                              <option value="">All types</option>
                              {typeCounts.map(([name]) => <option key={name} value={name}>{name}</option>)}
                            </select>
                          </label>
                          <label className="sample4-field">
                            <span>
                              <input type="checkbox" checked={errorLogsOnlyErrors} onChange={(e) => setErrorLogsOnlyErrors(e.target.checked)} /> Errors/warnings only
                            </span>
                          </label>
                        </div>
                      }
                    />
                    <DataTable
                      columns={['User', 'Type', 'Conversation', 'Time', '']}
                      empty="No rows match the current filters."
                      rows={filtered.flatMap((row) => {
                        const rowId = row.id ?? `${row.user_id}-${row.created_at}`
                        const isExpanded = expandedErrorLogId === rowId
                        const base = [
                          row.email || (row.user_id ? row.user_id.slice(0, 8) + '…' : '—'),
                          row.error_type ?? 'unknown',
                          row.conversation_id ? row.conversation_id.slice(0, 8) + '…' : '—',
                          formatDateTime(row.created_at, tzOffsetMs),
                          <ExpandButton key="raw" open={isExpanded} onClick={() => setExpandedErrorLogId(isExpanded ? null : rowId)}>{isExpanded ? 'Hide' : 'Raw'}</ExpandButton>,
                        ]
                        return isExpanded ? [base, ['Raw', JSON.stringify(row.error_data, null, 2), '', '', '']] : [base]
                      })}
                    />
                  </article>
                </section>
              </>
            )
          })()}

          {errorLogsSubTab === 'traces' && (() => {
            const statusCounts = countByKey(traceLogs, (r) => r.status)
            const nonOkCount = traceLogs.filter((r) => r.status !== 'ok').length
            const callSiteCounts = countByKey(traceLogs.filter((r) => r.status !== 'ok'), (r) => r.call_site)
            const filtered = traceLogs.filter((r) => {
              if (traceStatusFilter === 'non-ok') return r.status !== 'ok'
              if (traceStatusFilter) return r.status === traceStatusFilter
              return true
            })
            return (
              <>
                <Metrics items={[
                  { label: 'Rows fetched', value: formatCount(traceLogs.length), note: 'Most recent 500' },
                  { label: 'Non-ok calls', value: formatCount(nonOkCount), note: 'error/empty/stalled are recorded 100%; ok is sampled' },
                ]} />
                <section className="sample4-grid sample4-even">
                  <RankingPanel
                    eyebrow="agent_trace_log"
                    title="Rows by status"
                    entries={statusCounts.map(([name, value]) => ({ name, value }))}
                    total={traceLogs.length}
                  />
                  <RankingPanel
                    eyebrow="Non-ok calls"
                    title="By call_site"
                    entries={callSiteCounts.map(([name, value]) => ({ name, value }))}
                    total={nonOkCount || 1}
                  />
                </section>
                <section className="sample4-grid">
                  <article className="sample4-panel sample4-full">
                    <PanelHeading
                      eyebrow="Detail"
                      title="Recent calls"
                      actions={
                        <label className="sample4-field">
                          <span>Status</span>
                          <select value={traceStatusFilter} onChange={(e) => setTraceStatusFilter(e.target.value)}>
                            <option value="non-ok">Non-ok only</option>
                            <option value="">All</option>
                            {statusCounts.map(([name]) => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </label>
                      }
                    />
                    <DataTable
                      columns={['User', 'Status', 'Call site', 'Model', 'TTFT / Total', 'Time', '']}
                      empty="No calls match the current filter."
                      rows={filtered.flatMap((row) => {
                        const isExpanded = expandedTraceId === row.trace_id
                        const base = [
                          row.email || (row.user_id ? row.user_id.slice(0, 8) + '…' : '—'),
                          row.status ?? 'unknown',
                          row.call_site ?? '—',
                          row.model_name ?? '—',
                          `${row.ttft_ms != null ? Math.round(row.ttft_ms) + 'ms' : '—'} / ${row.total_ms != null ? Math.round(row.total_ms) + 'ms' : '—'}`,
                          formatDateTime(row.created_at, tzOffsetMs),
                          <ExpandButton key="detail" open={isExpanded} onClick={() => setExpandedTraceId(isExpanded ? null : row.trace_id)}>{isExpanded ? 'Hide' : 'Detail'}</ExpandButton>,
                        ]
                        return isExpanded
                          ? [base, ['Detail', JSON.stringify({ error_type: row.error_type, error_message: row.error_message, conversation_id: row.conversation_id, turn_id: row.turn_id }, null, 2), '', '', '', '', '']]
                          : [base]
                      })}
                    />
                  </article>
                </section>
              </>
            )
          })()}

          {errorLogsSubTab === 'testSuite' && (() => {
            const byCase = new Map()
            for (const row of testSuite) {
              const name = testCaseName(row.testcase_detail)
              const entry = byCase.get(name) ?? { total: 0, pass: 0 }
              entry.total += 1
              if (row.status === 'pass') entry.pass += 1
              byCase.set(name, entry)
            }
            const caseStats = Array.from(byCase.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            const failCount = testSuite.filter((r) => r.status !== 'pass').length
            const filtered = testSuite.filter((r) => {
              if (testFailingOnly && r.status === 'pass') return false
              if (testCaseFilter && testCaseName(r.testcase_detail) !== testCaseFilter) return false
              return true
            })
            return (
              <>
                <Metrics items={caseStats.map(([name, s]) => ({
                  label: name,
                  value: formatPct(s.total ? s.pass / s.total : 0, 0),
                  note: `${formatCount(s.pass)} / ${formatCount(s.total)} passed`,
                }))} />
                <section className="sample4-grid">
                  <article className="sample4-panel sample4-full">
                    <PanelHeading
                      eyebrow="Detail"
                      title="Recent runs"
                      note={`${formatCount(failCount)} fail/error of ${formatCount(testSuite.length)} runs`}
                      actions={
                        <div className="sample4-inline-controls">
                          <label className="sample4-field">
                            <span>Test case</span>
                            <select value={testCaseFilter} onChange={(e) => setTestCaseFilter(e.target.value)}>
                              <option value="">All cases</option>
                              {caseStats.map(([name]) => <option key={name} value={name}>{name}</option>)}
                            </select>
                          </label>
                          <label className="sample4-field">
                            <span>
                              <input type="checkbox" checked={testFailingOnly} onChange={(e) => setTestFailingOnly(e.target.checked)} /> Fail/error only
                            </span>
                          </label>
                        </div>
                      }
                    />
                    <DataTable
                      columns={['Test case', 'Status', 'Summary', 'Duration', 'Time', '']}
                      empty="No runs match the current filters."
                      rows={filtered.flatMap((row) => {
                        const isExpanded = expandedTestId === row.id
                        const detail = row.conversation_detail && typeof row.conversation_detail === 'object' ? row.conversation_detail : null
                        const base = [
                          testCaseName(row.testcase_detail),
                          row.status ?? 'unknown',
                          row.summary ?? '—',
                          row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—',
                          formatDateTime(row.started_at, tzOffsetMs),
                          <ExpandButton key="detail" open={isExpanded} onClick={() => setExpandedTestId(isExpanded ? null : row.id)}>{isExpanded ? 'Hide' : 'Detail'}</ExpandButton>,
                        ]
                        if (!isExpanded) return [base]
                        const links = [
                          detail?.conversation_url ? `Conversation: ${detail.conversation_url}` : null,
                          row.screenshot_url ? `Screenshot: ${row.screenshot_url}` : null,
                        ].filter(Boolean).join('\n')
                        const detailText = [links, JSON.stringify(row.conversation_detail, null, 2)].filter(Boolean).join('\n\n')
                        return [base, ['Detail', detailText, '', '', '', '']]
                      })}
                    />
                  </article>
                </section>
              </>
            )
          })()}
        </>
      )
    }

    return <div className="sample4-state">{views?.[activeTab]?.empty ?? 'Nothing to show yet.'}</div>
  }

  return (
    <div className="sample4-page">
      <header className="sample4-topbar">
        <div>
          <strong>
            Hyperknow Data Dashboard
            <span className="sample4-version-tag">v2.0 smart</span>
          </strong>
          <span className="sample4-source">{API_BASE_URL}</span>
        </div>
        <div className="sample4-topbar-actions">
          <SiteNav active="/" />
          <label className="sample4-field">
            <span>Timezone</span>
            <select value={tzKey} onChange={(e) => setTzKey(e.target.value)}>
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="sample4-session">
            <span className="sample4-role-tag" title={`Signed in with a ${roleLabel} key`}>{roleLabel}</span>
            <button type="button" className="sample4-signout" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <nav className="sample4-tabs" aria-label="Dashboard sections">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="sample4-shell">{renderBody()}</main>

    </div>
  )
}
