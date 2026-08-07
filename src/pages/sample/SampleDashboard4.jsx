import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import landAtlas from 'world-atlas/land-110m.json'
import { useSample4Data, formatCount, formatPct } from './sample4Data'
import {
  DataTable,
  DateRange,
  ExpandButton,
  Metrics,
  PanelHeading,
  Segmented,
} from '../../components/ui'
import { formatDateTime } from '../../components/format'
import { SiteNav } from '../../components/SiteNav'
import { API_BASE_URL } from '../../api/client'
import Sample4LineChart from './Sample4LineChart'
import {
  TIMEZONE_OPTIONS,
  BROWSER_OFFSET_MS,
  MAX_RETENTION_DAY,
  KEY_RETENTION_DAYS,
  addDays,
  aggregateCounts,
  aggregateJsonbColumn,
  aggregateMostUsedFunctions,
  collectMeaningfulEvents,
  daysBetweenDateKeys,
  extractLoginIpCountries,
  extractStringLeaves,
  getTzNow,
  parseInTz,
  todayTzKey,
  toTzDateKey,
  topBreakdownByCategory,
  withOtherBucket,
} from '../dashboardEntry/dashboardUtils'
import { bucketOfBillingReason } from '../../api/getUserInfo/paid'
import '../../styles/dashboard.css'

// `adminOnly` tabs are removed from the nav entirely for the `general` role,
// mirroring the original DashboardEntry gating. User Queries is admin-only
// here (it was ungated before) because it exposes raw message content —
// the most sensitive payload in the dashboard.
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'retention', label: 'Retention', adminOnly: true },
  { id: 'analytics', label: 'User Analytics' },
  { id: 'topUsers', label: 'Top Users' },
  { id: 'paid', label: 'Paid' },
  { id: 'userQueries', label: 'User Queries', adminOnly: true },
  { id: 'utmTracking', label: 'UTM Tracking' },
]

const TIME_RANGES = ['12h', '1d', '7d', '30d']
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
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
const PAID_RETENTION_DAYS = [1, 7, 30, 60]
const PAID_RETENTION_LINE_MAX = 60
const CONTINUITY_GAP_DAYS = 10
const RENEWAL_WINDOW_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_LIST_LIMIT = 25
const LATEST_USERS_LIMIT = 200
const LATEST_USERS_PAGE_SIZE = 20
const QUERY_PAGE_SIZE = 50
const AGENT_RESPONSE_BASE_URL = 'https://agent.hyperknow.io/response'

// Minimum users behind an initial-function bucket before its conversion rate
// is ranked — small buckets produce meaningless 100%s.
const FEATURE_MIN_SAMPLE = 20

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
function RankingPanel({ eyebrow, title, entries, total, defaultMode = 'count', lockedMode, actions, scrollRows = false }) {
  const [mode, setMode] = useState(defaultMode)
  const effectiveMode = lockedMode ?? mode
  return (
    <article className="sample4-panel">
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

const dateOnly = (tsMs, tzOffsetMs) => new Date(tsMs + tzOffsetMs).toISOString().slice(0, 10)
const parseTs = (s) => {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
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
const conversationUrl = (conversationId) => `${AGENT_RESPONSE_BASE_URL}/${encodeURIComponent(conversationId)}`

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

function buildChartData(stats, timeRange, tzOffsetMs, customRange = { start: '', end: '' }) {
  const empty = { userChart: [], userTotalChart: [], conversationChart: [], activeUserChart: [] }
  if (!stats) return empty
  const now = getTzNow(tzOffsetMs)
  let startTime
  let endTime = now
  let intervalMs
  let formatLabel
  const hourLabel = (date) => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  const dayLabel = (date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`

  if (customRange.start && customRange.end) {
    startTime = new Date(`${customRange.start}T00:00:00Z`)
    endTime = new Date(`${customRange.end}T23:59:59Z`)
    const spanMs = endTime.getTime() - startTime.getTime()
    intervalMs = spanMs <= DAY_MS ? 60 * 60 * 1000 : DAY_MS
    formatLabel = spanMs <= DAY_MS ? hourLabel : dayLabel
  } else if (timeRange === '12h') {
    startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000)
    intervalMs = 60 * 60 * 1000
    formatLabel = hourLabel
  } else if (timeRange === '1d') {
    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    intervalMs = 2 * 60 * 60 * 1000
    formatLabel = hourLabel
  } else {
    startTime = new Date(now.getTime() - (timeRange === '7d' ? 7 : 30) * DAY_MS)
    intervalMs = DAY_MS
    formatLabel = dayLabel
  }

  const bucketKey = (t) => Math.floor(t / intervalMs) * intervalMs
  const buckets = new Map()
  let cursor = new Date(startTime)
  while (cursor <= endTime) {
    const key = bucketKey(cursor.getTime())
    if (!buckets.has(key)) {
      buckets.set(key, {
        time: formatLabel(cursor),
        users: 0,
        conversations: 0,
        newUserConversations: 0,
        returningUserConversations: 0,
        newActiveUsers: new Set(),
        returningActiveUsers: new Set(),
      })
    }
    cursor = new Date(cursor.getTime() + intervalMs)
  }

  const signupTimeByUser = new Map()
  let baseTotal = 0
  for (const user of stats.all_users_timeline ?? []) {
    const d = parseInTz(user.created_at, tzOffsetMs)
    if (!signupTimeByUser.has(user.user_id)) signupTimeByUser.set(user.user_id, d.getTime())
    if (d < startTime) {
      baseTotal += 1
      continue
    }
    if (d > endTime) continue
    const bucket = buckets.get(bucketKey(d.getTime()))
    if (bucket) bucket.users += 1
  }

  for (const conv of stats.conversation_history ?? []) {
    const d = parseInTz(conv.created_at, tzOffsetMs)
    if (d < startTime || d > endTime) continue
    const key = bucketKey(d.getTime())
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.conversations += 1
    const signupTs = signupTimeByUser.get(conv.user_id)
    const isNewInBucket = signupTs != null && signupTs >= key && signupTs < key + intervalMs
    if (isNewInBucket) {
      bucket.newUserConversations += 1
      bucket.newActiveUsers.add(conv.user_id)
    } else {
      bucket.returningUserConversations += 1
      bucket.returningActiveUsers.add(conv.user_id)
    }
  }

  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([, b]) => b)
  let runningTotal = baseTotal
  return {
    userChart: sorted.map((b) => ({ time: b.time, users: b.users })),
    userTotalChart: sorted.map((b) => {
      runningTotal += b.users
      return { time: b.time, users: runningTotal }
    }),
    conversationChart: sorted.map((b) => ({
      time: b.time,
      conversations: b.conversations,
      newUserConversations: b.newUserConversations,
      returningUserConversations: b.returningUserConversations,
    })),
    activeUserChart: sorted.map((b) => ({
      time: b.time,
      activeUsers: b.newActiveUsers.size + b.returningActiveUsers.size,
      newUsers: b.newActiveUsers.size,
      returningUsers: b.returningActiveUsers.size,
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

function countOverviewStats(stats, window, tzOffsetMs) {
  if (!stats) return { totalUsers: 0, conversations: 0 }
  if (!window) {
    return {
      totalUsers: stats.total_users,
      conversations: stats.conversation_history.length,
    }
  }
  const inWindow = (stamp) => {
    const day = toTzDateKey(stamp, tzOffsetMs)
    return day >= window.start && day <= window.end
  }
  return {
    totalUsers: (stats.all_users_timeline ?? []).filter((user) => inWindow(user.created_at)).length,
    conversations: (stats.conversation_history ?? []).filter((conversation) => inWindow(conversation.created_at)).length,
  }
}

function buildAnalytics(stats) {
  const rows = stats?.user_analytics ?? []
  const chinaCountryKeys = ['china', 'chinese mainland', 'cn', 'mainland china']
  const isChineseNat = (s) => {
    const lower = s?.toLowerCase().trim()
    return lower === 'china' || lower === 'chinese' || lower === 'cn'
  }
  const isChineseCountry = (s) => !!s && chinaCountryKeys.includes(s.toLowerCase().trim())
  let overseas = 0
  let domestic = 0
  let nonChinese = 0
  let unknownNat = 0
  for (const row of rows) {
    if (!row.nationality?.trim()) unknownNat += 1
    else if (isChineseNat(row.nationality)) {
      if (isChineseCountry(row.country)) domestic += 1
      else overseas += 1
    } else nonChinese += 1
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
    studentBreakdown: [
      { name: '中国大陆用户', value: domestic },
      { name: '海外华人 / 留学生', value: overseas },
      { name: '纯外国人', value: nonChinese },
      { name: '未知国籍', value: unknownNat },
    ].filter((entry) => entry.value > 0),
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
  const dauUsers = new Set()
  for (const c of stats?.conversation_history ?? []) {
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
  for (const c of stats?.conversation_history ?? []) {
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
  for (const event of stats ? collectMeaningfulEvents(stats) : []) {
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
      if (user.daysSinceSignup < day) continue
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
    return { day, ratePct: eligible > 0 ? (returned / eligible) * 100 : 0, returned, eligible, mature: maxAge >= day, hasData: eligible > 0 }
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

function buildPaidSpans(subs) {
  const gapMs = CONTINUITY_GAP_DAYS * DAY_MS
  const items = subs
    .map((sub) => {
      const start = parseTs(sub.started_at)
      if (start == null) return null
      const end = parseTs(sub.expires_at) ?? start
      return { start, end: Math.max(start, end), sub }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
  const spans = []
  for (const item of items) {
    const current = spans[spans.length - 1]
    if (current && item.start - current.end <= gapMs) {
      current.end = Math.max(current.end, item.end)
      current.subs.push(item.sub)
    } else {
      spans.push({ start: item.start, end: item.end, subs: [item.sub] })
    }
  }
  return spans
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
      hasOneOff: subs.some((s) => s.billing_reason === 'one-off-payment'),
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
  const features = (() => {
    const analyticsRows = stats?.user_analytics ?? []
    const paidIds = new Set(paidUsers.map((u) => u.user_id))

    const allByFn = new Map()
    const paidByFn = new Map()
    let analyzedTotal = 0
    let analyzedPaid = 0

    for (const row of analyticsRows) {
      const fn = (row.initial_used_function ?? '').trim()
      if (!fn) continue
      analyzedTotal += 1
      allByFn.set(fn, (allByFn.get(fn) ?? 0) + 1)
      if (paidIds.has(row.user_id)) {
        analyzedPaid += 1
        paidByFn.set(fn, (paidByFn.get(fn) ?? 0) + 1)
      }
    }

    const rows = Array.from(allByFn.entries()).map(([name, users]) => {
      const paid = paidByFn.get(name) ?? 0
      // Share of payers starting here vs share of everyone starting here.
      // >1 means the feature is over-represented among people who paid.
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

    // A feature with 1 user and 1 payer is 100% and meaningless. Rank only
    // those with enough users, and report how many were held back rather
    // than dropping them silently.
    const ranked = rows
      .filter((r) => r.users >= FEATURE_MIN_SAMPLE)
      .sort((a, b) => b.ratePct - a.ratePct)
    const belowSample = rows.length - ranked.length

    const paidAnalytics = analyticsRows.filter((row) => paidIds.has(row.user_id))

    return {
      conversion: ranked,
      belowSample,
      analyzedTotal,
      analyzedPaid,
      // Lifetime, not pre-payment — see the note above.
      paidMostUsed: withOtherBucket(aggregateMostUsedFunctions(paidAnalytics)),
      overallRatePct: analyzedTotal > 0 ? (analyzedPaid / analyzedTotal) * 100 : 0,
      paidTotal: paidUsers.length,
    }
  })()

  const paidRate = buildPaidRate(stats, bucketed.paid, paidRateGranularity, paidRateRange, tzOffsetMs)
  const monthlyRenewal = buildMonthlyRenewal(bucketed.paid, tzOffsetMs)
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
    paidRate,
    monthlyRenewal,
    paidRetention,
    recentPayments,
  }
}

function buildPaidRate(stats, paidSubscriptions, granularityDays, range, tzOffsetMs) {
  const bucketMs = granularityDays * DAY_MS
  const now = Date.now()
  const shiftedNow = now + tzOffsetMs
  const signups = (stats?.all_users_timeline ?? []).map((u) => parseTs(u.created_at)).filter((v) => v != null)
  const oneoff = []
  const subscription = []
  const strict = []
  const firstOneoffByUser = new Map()
  for (const sub of paidSubscriptions) {
    const t = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (t == null || !sub.user_id) continue
    if (sub.billing_reason === 'one-off-payment') {
      oneoff.push(t)
      const prev = firstOneoffByUser.get(sub.user_id)
      if (prev == null || t < prev) firstOneoffByUser.set(sub.user_id, t)
    } else {
      subscription.push(t)
      if (sub.billing_reason === 'initial_subscription') strict.push(t)
    }
  }
  strict.push(...firstOneoffByUser.values())
  const all = [...signups, ...oneoff, ...subscription].map((t) => t + tzOffsetMs)
  if (all.length === 0) return { series: [], maxPct: 10 }
  const dataMin = Math.min(...all)
  const userStart = range.start ? (parseTs(`${range.start}T00:00:00`) ?? dataMin - tzOffsetMs) + tzOffsetMs : dataMin
  const userEnd = range.end ? (parseTs(`${range.end}T23:59:59`) ?? now) + tzOffsetMs : shiftedNow
  const rangeStart = Math.max(dataMin, userStart)
  const rangeEnd = Math.min(shiftedNow, userEnd)
  if (rangeEnd < rangeStart) return { series: [], maxPct: 10 }
  const minT = Math.floor(rangeStart / bucketMs) * bucketMs
  const lastT = Math.floor(rangeEnd / bucketMs) * bucketMs
  const count = Math.floor((lastT - minT) / bucketMs) + 1
  const buckets = Array.from({ length: count }, () => ({ signups: 0, oneoff: 0, subscription: 0, strict: 0 }))
  const add = (values, key) => {
    for (const raw of values) {
      const t = raw + tzOffsetMs
      if (t < rangeStart || t > rangeEnd) continue
      const index = Math.floor((t - minT) / bucketMs)
      if (buckets[index]) buckets[index][key] += 1
    }
  }
  add(signups, 'signups')
  add(oneoff, 'oneoff')
  add(subscription, 'subscription')
  add(strict, 'strict')
  let totalSignups = 0
  let totalPaid = 0
  let totalStrict = 0
  let maxPct = 10
  const rawSeries = buckets.map((bucket, index) => {
    const base = bucket.signups > 0 ? bucket.signups : 1
    const total = bucket.oneoff + bucket.subscription
    totalSignups += bucket.signups
    totalPaid += total
    totalStrict += bucket.strict
    const paidRatePct = (total / base) * 100
    const strictRatePct = (bucket.strict / base) * 100
    maxPct = Math.max(maxPct, paidRatePct, strictRatePct)
    return {
      time: dateOnly(minT + index * bucketMs - tzOffsetMs, tzOffsetMs),
      signups: bucket.signups,
      total,
      paidRatePct,
      oneoffRatePct: (bucket.oneoff / base) * 100,
      subscriptionRatePct: (bucket.subscription / base) * 100,
      strictTotal: bucket.strict,
      strictRatePct,
    }
  })
  const avgPaidRatePct = totalSignups > 0 ? (totalPaid / totalSignups) * 100 : 0
  const avgStrictRatePct = totalSignups > 0 ? (totalStrict / totalSignups) * 100 : 0
  return {
    series: rawSeries.map((row) => ({ ...row, avgPaidRatePct, avgStrictRatePct })),
    maxPct: Math.ceil(Math.max(maxPct, avgPaidRatePct, avgStrictRatePct) + 5),
  }
}

function buildMonthlyRenewal(paidSubscriptions, tzOffsetMs) {
  const matureThreshold = Date.now() - RENEWAL_WINDOW_DAYS * DAY_MS
  const startsByUser = new Map()
  for (const sub of paidSubscriptions) {
    if (!sub.user_id) continue
    const t = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (t == null) continue
    const list = startsByUser.get(sub.user_id) ?? []
    list.push(t)
    startsByUser.set(sub.user_id, list)
  }
  for (const list of startsByUser.values()) list.sort((a, b) => a - b)
  const buckets = new Map()
  for (const sub of paidSubscriptions) {
    if (!sub.user_id) continue
    const expiresAt = parseTs(sub.expires_at)
    if (expiresAt == null) continue
    const month = dateOnly(expiresAt, tzOffsetMs).slice(0, 7)
    const bucket = buckets.get(month) ?? { eligible: 0, renewed: 0, maturing: false }
    if (expiresAt > matureThreshold) {
      bucket.maturing = true
    } else {
      bucket.eligible += 1
      const windowEnd = expiresAt + RENEWAL_WINDOW_DAYS * DAY_MS
      if ((startsByUser.get(sub.user_id) ?? []).some((t) => t > expiresAt && t <= windowEnd)) bucket.renewed += 1
    }
    buckets.set(month, bucket)
  }
  return Array.from(buckets.entries())
    .map(([time, bucket]) => ({
      time,
      eligible: bucket.eligible,
      renewed: bucket.renewed,
      ratePct: bucket.eligible > 0 ? (bucket.renewed / bucket.eligible) * 100 : 0,
      maturing: bucket.maturing,
    }))
    .sort((a, b) => a.time.localeCompare(b.time))
}

function buildPaidRetention(paidUsers, stats, tzOffsetMs, mode) {
  const activeDaysByUser = new Map()
  for (const conv of stats?.conversation_history ?? []) {
    const day = toTzDateKey(conv.created_at, tzOffsetMs)
    const days = activeDaysByUser.get(conv.user_id) ?? new Set()
    days.add(day)
    activeDaysByUser.set(conv.user_id, days)
  }
  const now = Date.now()
  const line = Array.from({ length: PAID_RETENTION_LINE_MAX }, (_, index) => {
    const day = index + 1
    let eligible = 0
    let returned = 0
    for (const user of paidUsers) {
      if ((now - user.firstPaidAt) / DAY_MS < day) continue
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

function buildRecentPayments(paidSubscriptions, labels) {
  const groups = { oneoff: [], initial: [], renewal: [] }
  for (const sub of paidSubscriptions) {
    const startedAt = parseTs(sub.started_at) ?? parseTs(sub.created_at)
    if (!sub.user_id || startedAt == null) continue
    const row = { id: sub.id, label: labelUser(sub.user_id, labels), tier: sub.tier, billing_reason: sub.billing_reason ?? '—', startedAt }
    if (sub.billing_reason === 'one-off-payment') groups.oneoff.push(row)
    else if (sub.billing_reason === 'initial_subscription') groups.initial.push(row)
    else if (sub.billing_reason === 'renewal') groups.renewal.push(row)
  }
  for (const key of Object.keys(groups)) {
    groups[key] = groups[key].sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_LIST_LIMIT)
  }
  return groups
}

export default function SampleDashboard4() {
  const [activeTab, setActiveTab] = useState('general')
  const [analyticsTab, setAnalyticsTab] = useState('ai')
  const [tzKey, setTzKey] = useState('auto')
  const [overviewMode, setOverviewMode] = useState('allTime')
  const [overviewPreset, setOverviewPreset] = useState('pastTwoMonths')
  const [overviewCustomRange, setOverviewCustomRange] = useState({ start: '', end: '' })
  const [timeRange, setTimeRange] = useState('7d')
  const [customTimeRange, setCustomTimeRange] = useState({ start: '', end: '' })
  const [growthMode, setGrowthMode] = useState('net')
  const [activeUsersMode, setActiveUsersMode] = useState('line')
  const [conversationsMode, setConversationsMode] = useState('line')
  const [latestPage, setLatestPage] = useState(0)

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
  const [expandedTopUser, setExpandedTopUser] = useState(null)

  const [paidRateGranularity, setPaidRateGranularity] = useState(1)
  const [paidRateRange, setPaidRateRange] = useState(() => ({
    start: addDays(todayTzKey(BROWSER_OFFSET_MS), -30),
    end: todayTzKey(BROWSER_OFFSET_MS),
  }))
  const [paidRateView, setPaidRateView] = useState('broad')
  const [paidRetentionMode, setPaidRetentionMode] = useState('exact')
  const [showPaidOverviewGeo, setShowPaidOverviewGeo] = useState(false)
  const [showPaidListGeo, setShowPaidListGeo] = useState(false)
  const [paidFilter, setPaidFilter] = useState('all')
  const [paidSort, setPaidSort] = useState('first_paid_desc')
  const [expandedPaidUser, setExpandedPaidUser] = useState(null)
  const [expandedSidebar, setExpandedSidebar] = useState(null)

  const [queryStart, setQueryStart] = useState(() => addDays(todayTzKey(BROWSER_OFFSET_MS), -3))
  const [queryEnd, setQueryEnd] = useState(() => todayTzKey(BROWSER_OFFSET_MS))
  const [queryPage, setQueryPage] = useState(1)
  const [selectedQuery, setSelectedQuery] = useState(null)

  const [utmFilters, setUtmFilters] = useState({})
  const [expandedUtmUser, setExpandedUtmUser] = useState(null)

  const { role, isAdmin, logout } = useAuth()
  const { stats, paid, utm, loading, error, paidError, utmError, views, userQueries } = useSample4Data()

  const visibleTabs = useMemo(() => tabs.filter((tab) => isAdmin || !tab.adminOnly), [isAdmin])

  // A role change (or a deep link into a hidden tab) must not leave the user
  // parked on a tab they can no longer see.
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab('general')
  }, [visibleTabs, activeTab])

  const tzOffsetMs = useMemo(
    () => TIMEZONE_OPTIONS.find((option) => option.key === tzKey)?.offsetMs ?? BROWSER_OFFSET_MS,
    [tzKey],
  )

  const userLabels = useMemo(() => buildUserLabels(stats), [stats])
  const chartData = useMemo(
    () => buildChartData(stats, timeRange, tzOffsetMs, customTimeRange),
    [stats, timeRange, tzOffsetMs, customTimeRange],
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
    return { allUsers, filteredUsers, optionsFor }
  }, [utm, utmFilters])

  const renderBody = () => {
    // Belt and braces: the nav already hides these, this catches the render
    // that happens between a role change and the redirect effect.
    if (!isAdmin && tabs.find((tab) => tab.id === activeTab)?.adminOnly) {
      return (
        <div className="sample4-state">
          <strong>Not available for your account</strong>
          <p>This section requires an admin key.</p>
        </div>
      )
    }

    if (loading) {
      return <div className="sample4-state">Loading live dashboard data…</div>
    }

    if (error || !views) {
      return (
        <div className="sample4-state error">
          <strong>Could not load dashboard data</strong>
          <p>{error ?? 'No data returned.'}</p>
          <p>Check that the API at <code>VITE_BASE_URL</code> is reachable and that <code>VITE_ADMIN_API_KEY</code> is current.</p>
        </div>
      )
    }

    if (activeTab === 'general') {
      const latestUsers = (() => {
        const byUser = new Map()
        for (const user of stats.all_users_timeline ?? []) {
          byUser.set(user.user_id, {
            user_id: user.user_id,
            email: userLabels.get(user.user_id) ?? null,
            created_at: user.created_at,
          })
        }
        return Array.from(byUser.values())
          .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
          .slice(0, LATEST_USERS_LIMIT)
      })()
      const totalPages = Math.max(1, Math.ceil(latestUsers.length / LATEST_USERS_PAGE_SIZE))
      const safePage = Math.min(latestPage, totalPages - 1)
      const pageUsers = latestUsers.slice(safePage * LATEST_USERS_PAGE_SIZE, (safePage + 1) * LATEST_USERS_PAGE_SIZE)
      const pollByUser = new Map((stats.user_poll_data ?? []).map((row) => [row.user_id, row]))
      const overviewWindow = buildOverviewWindow(overviewMode, overviewPreset, overviewCustomRange, tzOffsetMs)
      const overviewStats = countOverviewStats(stats, overviewWindow, tzOffsetMs)
      const overviewNeedsRange = overviewMode !== 'allTime'
      const overviewRangeLabel = overviewWindow ? `${overviewWindow.start} → ${overviewWindow.end}` : 'Select a complete start and end date'
      // `general` never sees cumulative totals, so it always gets the net-growth series.
      const lineData = isAdmin && growthMode === 'total' ? chartData.userTotalChart : chartData.userChart
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
                  note: overviewNeedsRange ? `Conversations in range · ${overviewRangeLabel}` : 'All time, all users',
                },
              ]} />
            </>
          )}
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="User Growth"
                title="User growth"
                actions={<div className="sample4-heading-actions">{isAdmin && <Segmented value={growthMode} onChange={setGrowthMode} options={[{ value: 'net', label: 'Net growth' }, { value: 'total', label: 'Total' }]} />}{renderGeneralTimeControls()}</div>}
              />
              <Sample4LineChart
                labels={lineData.map((d) => d.time)}
                series={[{ label: growthMode === 'total' ? 'Total users' : 'New users', values: lineData.map((d) => d.users) }]}
                referenceLines={averageNetGrowth === null ? [] : [{ label: 'Average', value: averageNetGrowth }]}
              />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Activity"
                title={timeRange === '7d' || timeRange === '30d' ? 'Daily Active Users' : 'Active Users'}
                actions={<div className="sample4-heading-actions"><Segmented value={activeUsersMode} onChange={setActiveUsersMode} options={[{ value: 'line', label: 'Line' }, { value: 'bar', label: 'New vs Returning' }]} />{renderGeneralTimeControls()}</div>}
              />
              {activeUsersMode === 'line' ? (
                <Sample4LineChart labels={chartData.activeUserChart.map((d) => d.time)} series={[{ label: 'Active users', values: chartData.activeUserChart.map((d) => d.activeUsers) }]} />
              ) : (
                <Sample4LineChart
                  labels={chartData.activeUserChart.map((d) => d.time)}
                  series={[
                    { label: 'New users', values: chartData.activeUserChart.map((d) => d.newUsers) },
                    { label: 'Returning users', values: chartData.activeUserChart.map((d) => d.returningUsers) },
                  ]}
                />
              )}
            </article>
          </section>
          {isAdmin && (
            <section className="sample4-grid">
              <article className="sample4-panel sample4-full">
                <PanelHeading
                  eyebrow="Conversation Activity"
                  title="Conversation activity"
                  actions={<div className="sample4-heading-actions"><Segmented value={conversationsMode} onChange={setConversationsMode} options={[{ value: 'line', label: 'Line' }, { value: 'bar', label: 'New vs Returning' }]} />{renderGeneralTimeControls()}</div>}
                />
                {conversationsMode === 'line' ? (
                  <Sample4LineChart labels={chartData.conversationChart.map((d) => d.time)} series={[{ label: 'Conversations', values: chartData.conversationChart.map((d) => d.conversations) }]} />
                ) : (
                  <Sample4LineChart
                    labels={chartData.conversationChart.map((d) => d.time)}
                    series={[
                      { label: 'New user conversations', values: chartData.conversationChart.map((d) => d.newUserConversations) },
                      { label: 'Returning user conversations', values: chartData.conversationChart.map((d) => d.returningUserConversations) },
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
                title="Latest users"
                actions={<div className="sample4-pagination"><button type="button" disabled={safePage === 0} onClick={() => setLatestPage(safePage - 1)}>Prev</button><span>{latestUsers.length === 0 ? '0 users' : `${safePage * LATEST_USERS_PAGE_SIZE + 1}-${Math.min((safePage + 1) * LATEST_USERS_PAGE_SIZE, latestUsers.length)} of ${latestUsers.length}`} · Page {safePage + 1} / {totalPages}</span><button type="button" disabled={safePage >= totalPages - 1} onClick={() => setLatestPage(safePage + 1)}>Next</button></div>}
              />
              <DataTable
                columns={['Email / Username', 'Login IP Country', 'Acquisition Sources', 'Created At']}
                rows={pageUsers.map((user) => {
                  const poll = pollByUser.get(user.user_id)
                  return [
                    user.email || user.user_id.slice(0, 8) + '…',
                    extractLoginIpCountries(poll?.login_ip)[0] ?? '—',
                    sourceString(poll?.user_acquisition_sources),
                    formatDateTime(user.created_at, tzOffsetMs),
                  ]
                })}
              />
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
            <Segmented
              value={retentionMode}
              onChange={setRetentionMode}
              options={[
                { value: 'exact', label: 'Exact-day' },
                { value: 'rolling', label: 'Rolling' },
              ]}
            />
            <DateRange
              start={signupRange.start}
              end={signupRange.end}
              minDate={retention.signupBounds?.min}
              maxDate={retention.signupBounds?.max}
              onChange={setSignupRange}
              onReset={() => setSignupRange({ start: '', end: '' })}
            />
          </section>
          <Metrics items={[
            { label: 'DAU', value: formatCount(retention.dau.activeUsers), note: `${retention.dau.newSignups} new signups on ${dauDate}` },
            { label: 'MAU', value: formatCount(retention.mau.activeUsers), note: `${retention.mau.window.label} · ${retention.mau.newSignups} new signups` },
            { label: 'DAU : MAU', value: retention.mau.activeUsers > 0 ? retention.ratio.toFixed(3) : '—', note: 'Stickiness · 1.0 means used every day' },
          ]} />
          <section className="sample4-metrics">
            {KEY_RETENTION_DAYS.map((day) => {
              const point = retention.curve[day - 1]
              return (
                <article key={day} className="sample4-metric">
                  <span>D{day} {retentionMode === 'exact' ? 'Exact' : 'Rolling'}</span>
                  <strong>{point?.mature && point.hasData ? `${point.ratePct.toFixed(1)}%` : '—'}</strong>
                  <p>{point?.mature ? `${formatCount(point.returned)} / ${formatCount(point.eligible)} eligible users` : 'No cohort user has reached this day yet'}</p>
                </article>
              )
            })}
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Day-N Return Retention"
                title="Signup cohort retention"
              />
              <Sample4LineChart
                labels={retention.curve.map((p) => `D${p.day}`)}
                tooltips={retention.curve.map((p) => `Day ${p.day} · ${formatCount(p.returned)} of ${formatCount(p.eligible)} eligible${p.mature ? '' : ' · immature'}`)}
                series={[{ label: 'Retention', values: retention.curve.map((p) => p.mature ? p.ratePct : 0) }]}
                format="percent"
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
              <DataTable
                columns={isAdmin
                  ? ['', 'User', 'Identity', 'Country', 'Convs', 'Init Fn', 'Top Fns', 'Source']
                  : ['', 'User', 'Identity', 'Country', 'Init Fn', 'Top Fns', 'Source']}
                rows={topUsers.rows.flatMap((row) => {
                  const isExpanded = expandedTopUser === row.user_id
                  const topFns = Array.isArray(row.mostUsedFunctions) ? [...row.mostUsedFunctions].sort((a, b) => b.count - a.count).slice(0, 3).map((f) => f.function).join(' · ') : '—'
                  const base = [
                    <ExpandButton key="btn" open={isExpanded} onClick={() => setExpandedTopUser(isExpanded ? null : row.user_id)}>{row.loginIp ? (isExpanded ? 'Hide' : 'Raw') : ''}</ExpandButton>,
                    row.label,
                    row.identity ?? '—',
                    row.nationality && row.nationality !== row.country ? `${row.country ?? '—'} · ${row.nationality}` : row.country ?? '—',
                    ...(isAdmin ? [formatCount(row.conversations)] : []),
                    row.initialUsedFunction ?? '—',
                    topFns,
                    sourceString(row.acquisitionSources),
                  ]
                  const detail = ['Login IP', JSON.stringify(row.loginIp, null, 2), ...Array(base.length - 2).fill('')]
                  return isExpanded && row.loginIp ? [base, detail] : [base]
                })}
              />
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'paid') {
      if (!paid) return <div className="sample4-state">{paidError ? `Failed to load paid stats: ${paidError}` : 'Loading paid stats…'}</div>
      const paidRateSeries = paidModel.paidRate.series
      const paidRateLines = paidRateView === 'strict'
        ? [
            { label: '平均首次付费率', values: paidRateSeries.map((d) => d.avgStrictRatePct) },
            { label: '首次付费率', values: paidRateSeries.map((d) => d.strictRatePct) },
          ]
        : [
            { label: '总付费率', values: paidRateSeries.map((d) => d.paidRatePct) },
            { label: 'One-off 付费率', values: paidRateSeries.map((d) => d.oneoffRatePct) },
          ]
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
      const sidebarPanel = (key, title, description, rows) => (
        <article className="sample4-panel">
          <PanelHeading eyebrow="Bypass" title={title} actions={<ExpandButton open={expandedSidebar === key} onClick={() => setExpandedSidebar(expandedSidebar === key ? null : key)}>{expandedSidebar === key ? 'Hide users' : 'Show users'}</ExpandButton>} />
          <div className="sample4-callout"><strong>{formatCount(rows.length)}</strong><span>{description}</span></div>
          {expandedSidebar === key && <Ranking entries={rows.map((r) => ({ name: r.label, value: r.count }))} total={rows.reduce((s, r) => s + r.count, 0)} />}
        </article>
      )
      const paidRatePanel = (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow="Paid rate"
              title="新付费率趋势"
              actions={<div className="sample4-heading-actions"><DateRange start={paidRateRange.start} end={paidRateRange.end} onChange={setPaidRateRange} onReset={() => setPaidRateRange({ start: '', end: '' })} /><Segmented value={paidRateGranularity} onChange={setPaidRateGranularity} options={[{ value: 1, label: '1d' }, { value: 3, label: '3d' }, { value: 7, label: '7d' }]} /><Segmented value={paidRateView} onChange={setPaidRateView} options={[{ value: 'broad', label: '宽口径' }, { value: 'strict', label: '严格口径' }]} /></div>}
            />
            <Sample4LineChart labels={paidRateSeries.map((d) => d.time)} series={paidRateLines} format="percent" />
          </article>
        </section>
      )

      // `general` gets the conversion trend only — the same reduced view the
      // original dashboard served via PaidRateSection. No subscriber counts,
      // no per-user rows, no invite / manual breakdown.
      if (!isAdmin) {
        return (
          <>
            <Intro eyebrow="Paid" headline="Paid conversion trend." description="New paid rate over time." />
            {paidRatePanel}
          </>
        )
      }

      return (
        <>
          <Intro eyebrow="Paid" headline="Subscriptions, billing mix, and paid conversion." description={`Source table: ${paid.table_name}. Invite and manual grants are tracked separately.`} />
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
          <section className="sample4-grid sample4-even">
            <RankingPanel
              eyebrow="Payers · first touch"
              title="付费用户的初始功能"
              entries={paidModel.features.conversion
                .map((row) => ({ name: row.name, value: row.paid }))
                .filter((entry) => entry.value > 0)
                .sort((a, b) => b.value - a.value)}
              total={paidModel.features.analyzedPaid}
            />
            <article className="sample4-panel">
              <PanelHeading
                eyebrow="Payers · lifetime"
                title="付费用户最常用功能"
                note="Lifetime totals — includes usage after paying"
              />
              <p className="sample4-note">
                <code>most_used_function</code> carries no timestamps, so this cannot be
                split into before / after payment. Read it as what payers use overall,
                not as what led them to pay.
              </p>
              <Ranking entries={paidModel.features.paidMostUsed} total={paidModel.features.paidMostUsed.reduce((sum, e) => sum + e.value, 0)} />
            </article>
          </section>
          <section className="sample4-grid sample4-even">
            {sidebarPanel('invite', '邀请奖励用户', 'invite_code_grant + invitation_credit_grant', paidModel.inviteUsers)}
            {sidebarPanel('manual', '手动添加用户', 'manual_addition (operations / scripts)', paidModel.manualUsers)}
          </section>
          {paidRatePanel}
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
          <section className="sample4-grid">
            <article className="sample4-panel">
              <PanelHeading eyebrow="Monthly renewal" title="月度续费率" />
              <Sample4LineChart labels={paidModel.monthlyRenewal.map((d) => d.time)} series={[{ label: 'Renewal rate', values: paidModel.monthlyRenewal.map((d) => d.ratePct) }]} format="percent" />
            </article>
            <article className="sample4-panel">
              <PanelHeading eyebrow="Paid retention" title="付费用户留存率" actions={<Segmented value={paidRetentionMode} onChange={setPaidRetentionMode} options={[{ value: 'exact', label: 'Exact-day' }, { value: 'rolling', label: 'Rolling' }]} />} />
              <Metrics items={paidModel.paidRetention.keyDays.map((p) => ({ label: `D${p.day} ${paidRetentionMode === 'exact' ? 'Exact' : 'Rolling'}`, value: p.eligible > 0 ? `${p.ratePct.toFixed(1)}%` : '—', note: `${p.returned} / ${p.eligible} eligible users` }))} />
              <Sample4LineChart labels={paidModel.paidRetention.line.map((p) => `D${p.day}`)} series={[{ label: 'Retention', values: paidModel.paidRetention.line.map((p) => p.ratePct) }]} format="percent" />
            </article>
          </section>
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Paid users"
                title="付费用户列表"
                actions={<div className="sample4-heading-actions"><Segmented value={paidFilter} onChange={setPaidFilter} options={[{ value: 'all', label: `全部 (${paidModel.paidUsers.length})` }, { value: 'active', label: `活跃 (${paidModel.overview.currentlyActive})` }, { value: 'churned', label: `已流失 (${paidModel.overview.churned})` }]} /><select value={paidSort} onChange={(e) => setPaidSort(e.target.value)}><option value="first_paid_desc">首次付费时间 ↓ (最新)</option><option value="first_paid_asc">首次付费时间 ↑ (最早)</option><option value="total_days_desc">累计付费时长 ↓ (最长)</option><option value="total_days_asc">累计付费时长 ↑ (最短)</option><option value="signup_to_paid_asc">注册→首次付费 ↑ (最快)</option><option value="signup_to_paid_desc">注册→首次付费 ↓ (最慢)</option></select><ExpandButton open={showPaidListGeo} onClick={() => setShowPaidListGeo((v) => !v)}>地区/国籍分布</ExpandButton></div>}
              />
              {showPaidListGeo && <section className="sample4-grid sample4-even"><RankingPanel eyebrow="Country" title="使用地区分布" entries={paidModel.geo.country} total={paidModel.paidUsers.length} /><RankingPanel eyebrow="Nationality" title="国籍分布" entries={paidModel.geo.nationality} total={paidModel.paidUsers.length} /></section>}
              <DataTable
                columns={['', 'User', 'Identity', 'Country', 'Tier', 'First paid', 'Signup → paid', 'Total paid', 'Spans', 'Status', 'Tags', 'Init Fn', 'Top Fns', 'Source']}
                rows={filteredPaidUsers.flatMap((row) => {
                  const isExpanded = expandedPaidUser === row.user_id
                  const tags = [row.hasOneOff && 'one-off', row.hasInvite && 'invite', row.hasManual && 'manual'].filter(Boolean).join(', ') || '—'
                  const topFns = Array.isArray(row.mostUsedFunctions) ? [...row.mostUsedFunctions].sort((a, b) => b.count - a.count).slice(0, 3).map((f) => f.function).join(' · ') : '—'
                  const base = [
                    <ExpandButton key="btn" open={isExpanded} onClick={() => setExpandedPaidUser(isExpanded ? null : row.user_id)}>{isExpanded ? 'Hide' : 'Open'}</ExpandButton>,
                    row.label,
                    row.identity ?? '—',
                    row.nationality && row.nationality !== row.country ? `${row.country ?? '—'} · ${row.nationality}` : row.country ?? '—',
                    row.tierMix,
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
                  const detail = ['Spans', row.spans.map((span, index) => `#${index + 1}: ${dateOnly(span.start, tzOffsetMs)} → ${dateOnly(span.end, tzOffsetMs)} · ${span.subs.map((s) => `${s.tier}/${s.billing_reason ?? '—'}`).join(', ')}`).join('\n'), '', '', '', '', '', '', '', '', '', '', '', '']
                  return isExpanded ? [base, detail] : [base]
                })}
              />
            </article>
          </section>
        </>
      )
    }

    if (activeTab === 'userQueries') {
      const conversations = userQueries.data?.conversations ?? []
      const totalPages = Math.max(1, Math.ceil(conversations.length / QUERY_PAGE_SIZE))
      const safePage = Math.min(queryPage, totalPages)
      const rows = conversations.slice((safePage - 1) * QUERY_PAGE_SIZE, safePage * QUERY_PAGE_SIZE)
      const firstMessage = (conv) => {
        const msg = typeof conv.user_queries?.[0]?.message === 'string' ? conv.user_queries[0].message : '(no user message)'
        return msg.length > 320 ? `${msg.slice(0, 320)}...` : msg
      }
      return (
        <>
          <Intro
            eyebrow="Conversation Explorer"
            headline="User Queries"
            description="Pick a time window, then inspect each conversation by first user query, user id, and conversation id."
            actions={<button type="button" className="sample4-action" disabled={userQueries.loading || !queryStart} onClick={() => { setQueryPage(1); userQueries.load(`${queryStart}T00:00:00`, queryEnd ? `${queryEnd}T23:59:59` : undefined) }}>{userQueries.loading ? 'Loading…' : userQueries.loaded ? 'Reload queries' : 'Load queries'}</button>}
          />
          <section className="sample4-grid">
            <article className="sample4-panel sample4-full">
              <PanelHeading
                eyebrow="Controls"
                title="Query window"
                actions={<div className="sample4-heading-actions"><label className="sample4-field"><span>Start date</span><input type="date" value={queryStart} onChange={(e) => setQueryStart(e.target.value)} /></label><label className="sample4-field"><span>End date</span><input type="date" value={queryEnd} onChange={(e) => setQueryEnd(e.target.value)} /></label>{userQueries.data && <span className="sample4-muted">{formatCount(userQueries.data.total_conversations)} conversations · {formatDateTime(userQueries.data.start)} to {formatDateTime(userQueries.data.end)}</span>}</div>}
              />
              {userQueries.error && <div className="sample4-state error">{userQueries.error}</div>}
              {!userQueries.loaded && !userQueries.loading ? (
                <div className="sample4-state">Ready when you are. Auto fetch is off for this heavy query.</div>
              ) : (
                <>
                  <DataTable
                    columns={['#', 'First Query', 'User', 'Time', 'Rounds', 'Link', '']}
                    rows={rows.map((conv, index) => [
                      (safePage - 1) * QUERY_PAGE_SIZE + index + 1,
                      firstMessage(conv),
                      conv.user_id.slice(0, 8) + '…',
                      formatDateTime(conv.created_at),
                      conv.rounds_of_user_message,
                      <a key="link" href={conversationUrl(conv.conversation_id)} target="_blank" rel="noreferrer">Open</a>,
                      <ExpandButton key="details" onClick={() => setSelectedQuery(conv)}>See details</ExpandButton>,
                    ])}
                  />
                  {conversations.length > QUERY_PAGE_SIZE && (
                    <div className="sample4-pagination">
                      <button type="button" disabled={safePage === 1} onClick={() => setQueryPage(safePage - 1)}>Previous</button>
                      <span>Page {safePage} / {totalPages}</span>
                      <button type="button" disabled={safePage === totalPages} onClick={() => setQueryPage(safePage + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </article>
          </section>
          {selectedQuery && (
            <div className="sample4-modal" onClick={() => setSelectedQuery(null)}>
              <div className="sample4-modal-card" onClick={(e) => e.stopPropagation()}>
                <PanelHeading eyebrow="Conversation Detail" title={selectedQuery.user_id.slice(0, 8) + '…'} actions={<ExpandButton onClick={() => setSelectedQuery(null)}>Close</ExpandButton>} />
                <p className="sample4-note">Conversation ID: {selectedQuery.conversation_id} · Rounds: {selectedQuery.rounds_of_user_message}</p>
                <a href={conversationUrl(selectedQuery.conversation_id)} target="_blank" rel="noreferrer">Open conversation</a>
                <div className="sample4-query-list">
                  {selectedQuery.user_queries.map((query, index) => (
                    <div key={index}>
                      <span>{index === 0 ? 'First user query' : `Follow-up user query ${index + 1}`}</span>
                      <p>{typeof query.message === 'string' ? query.message : JSON.stringify(query.message)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
          ]} />
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
                    user.email || user.user_id.slice(0, 8) + '…',
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
            <span className="sample4-role-tag" title={`Signed in with a ${role} key`}>{role}</span>
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
