// Cohort maths for the growth views: retention cohorts, daily actives split
// by user age, paid conversion cohorts, the renewal ladder, and per-channel
// outcomes.
//
// Pure functions, no React and no TypeScript imports, so the same file can be
// run under plain node against a saved API payload to check the numbers.
//
// Conventions shared by everything here:
//   - A "day" is a calendar day in the selected timezone, held as an integer
//     (days since epoch in shifted time), so D-N is plain subtraction.
//   - A D-N cell only counts users whose day N has fully ELAPSED
//     (signup day + N < today). Counting today as a finished day makes the
//     newest cohort look like it fell off a cliff.
//   - Rates carry their numerator and denominator; the view decides whether
//     the role may see them.

import { DAY_MS, parseTs } from './paidSpans.js'

export const RETENTION_COHORT_DAYS = [1, 3, 7, 14, 30]
export const PAID_COHORT_DAYS = [0, 7, 14, 35, 60]
export const ACTIVATION_WINDOW_HOURS = 24

// A renewal lands at the old period's expiry, give or take. Stripe writes the
// new row with `started_at` EQUAL to the previous `expires_at`, so the window
// has to open at (or slightly before) the expiry, not strictly after it.
export const RENEWAL_EARLY_DAYS = 3
export const RENEWAL_WINDOW_DAYS = 10

// Targets and reference bands from the 2026-09-21 growth review. Directional
// only: every company defines "active" differently.
export const GROWTH_BENCHMARKS = {
  retention: [
    { day: 1, target: 20, industry: [14, 20], peak: [20, 30] },
    { day: 7, target: 10, industry: [4, 8], peak: [8, 15] },
    { day: 30, target: null, industry: [2, 5], peak: [5, 10] },
  ],
  firstRenewal: { median: 39, good: [50, 55] },
}

export const dayIndexOf = (tsMs, tzOffsetMs) => Math.floor((tsMs + tzOffsetMs) / DAY_MS)
export const dayKeyOf = (dayIndex) => new Date(dayIndex * DAY_MS).toISOString().slice(0, 10)
export const dayIndexOfKey = (key) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS)

// Day 0 of the epoch was a Thursday; weeks here start on Monday.
const weekStartOf = (dayIndex) => dayIndex - ((((dayIndex + 3) % 7) + 7) % 7)

const pct = (num, den) => (den > 0 ? (num / den) * 100 : null)

const shortDay = (dayIndex) => {
  const d = new Date(dayIndex * DAY_MS)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/**
 * Index signups and learning events once; every builder below reads this.
 *
 * `events` is whatever `collectMeaningfulEvents` returns. Users who have
 * events but no signup row (deleted accounts) are kept out of cohorts — there
 * is no day zero to measure them from — but still count as active users.
 */
export function buildActivityIndex(stats, events, tzOffsetMs, now = Date.now()) {
  const signups = new Map()
  for (const user of stats?.all_users_timeline ?? []) {
    const ts = parseTs(user.created_at)
    if (ts == null || signups.has(user.user_id)) continue
    signups.set(user.user_id, { ts, day: dayIndexOf(ts, tzOffsetMs) })
  }

  const activeDays = new Map()
  const firstEventTs = new Map()
  const usersByDay = new Map()
  let firstEventDay = null
  for (const event of events ?? []) {
    const ts = parseTs(event.created_at)
    if (ts == null || !event.user_id) continue
    const day = dayIndexOf(ts, tzOffsetMs)
    if (firstEventDay === null || day < firstEventDay) firstEventDay = day

    let days = activeDays.get(event.user_id)
    if (!days) activeDays.set(event.user_id, (days = new Set()))
    days.add(day)

    let users = usersByDay.get(day)
    if (!users) usersByDay.set(day, (users = new Set()))
    users.add(event.user_id)

    const prev = firstEventTs.get(event.user_id)
    if (prev == null || ts < prev) firstEventTs.set(event.user_id, ts)
  }

  return {
    signups,
    activeDays,
    firstEventTs,
    usersByDay,
    // Cohorts older than the first recorded event cannot be measured at all:
    // their activity predates the log.
    firstEventDay,
    today: dayIndexOf(now, tzOffsetMs),
    now,
  }
}

const bucketOf = (day, granularity) => (granularity === 'week' ? weekStartOf(day) : day)

const bucketLabel = (bucket, granularity) =>
  granularity === 'week' ? `${dayKeyOf(bucket)} 周` : dayKeyOf(bucket)

const inRange = (day, range) => {
  if (range?.start && day < dayIndexOfKey(range.start)) return false
  if (range?.end && day > dayIndexOfKey(range.end)) return false
  return true
}

const emptyCell = () => ({ eligible: 0, hit: 0 })

// Below this share of the cohort, a partial rate is withheld rather than
// starred: "2 of the 2 users who have reached this point" is 100% and means
// nothing.
const MIN_PARTIAL_COVERAGE = 0.5

const finishCell = (cell, size, minCoverage = MIN_PARTIAL_COVERAGE) => {
  const measurable = cell.eligible > 0 && cell.eligible >= size * minCoverage
  return {
    eligible: cell.eligible,
    hit: cell.hit,
    ratePct: measurable ? pct(cell.hit, cell.eligible) : null,
    // A weekly cohort matures one signup day at a time; until the last day
    // has caught up the rate covers only part of the cohort.
    partial: measurable && cell.eligible < size,
  }
}

/**
 * Signup cohorts × Day-N return.
 *
 * `mode`: 'exact' = active on day N itself; 'rolling' = active on day N or
 * any later day (unbounded retention, which always reads higher and keeps
 * rising for older cohorts).
 *
 * Activation = a learning event within 24h of the signup timestamp — a
 * rolling window, not "same calendar day", so a 23:50 signup still gets a
 * full day.
 */
export function buildRetentionCohorts(index, { granularity = 'day', range, mode = 'exact', days = RETENTION_COHORT_DAYS } = {}) {
  const { signups, activeDays, firstEventTs, today, now, firstEventDay } = index
  const buckets = new Map()
  const total = { size: 0, activation: emptyCell(), cells: days.map(emptyCell) }
  const windowMs = ACTIVATION_WINDOW_HOURS * 60 * 60 * 1000

  for (const [userId, signup] of signups) {
    if (!inRange(signup.day, range)) continue
    if (firstEventDay != null && signup.day < firstEventDay) continue
    const key = bucketOf(signup.day, granularity)
    let row = buckets.get(key)
    if (!row) buckets.set(key, (row = { bucket: key, size: 0, activation: emptyCell(), cells: days.map(emptyCell) }))
    row.size += 1
    total.size += 1

    if (signup.ts + windowMs <= now) {
      const first = firstEventTs.get(userId)
      const activated = first != null && first - signup.ts <= windowMs
      for (const target of [row, total]) {
        target.activation.eligible += 1
        if (activated) target.activation.hit += 1
      }
    }

    const userDays = activeDays.get(userId)
    days.forEach((n, i) => {
      const target = signup.day + n
      if (target >= today) return
      let returned = false
      if (userDays) {
        if (mode === 'exact') returned = userDays.has(target)
        else for (const d of userDays) if (d >= target) { returned = true; break }
      }
      for (const t of [row, total]) {
        t.cells[i].eligible += 1
        if (returned) t.cells[i].hit += 1
      }
    })
  }

  // The summary row spans cohorts of every age, so its later columns are
  // always partial — it shows whatever has matured instead of withholding.
  const coverageOf = (row) => (row.bucket == null ? 0 : MIN_PARTIAL_COVERAGE)
  const finish = (row) => ({
    bucket: row.bucket,
    label: row.bucket == null ? '合计' : bucketLabel(row.bucket, granularity),
    size: row.size,
    activation: finishCell(row.activation, row.size, coverageOf(row)),
    cells: row.cells.map((cell) => finishCell(cell, row.size, coverageOf(row))),
  })

  return {
    days,
    rows: Array.from(buckets.values()).sort((a, b) => b.bucket - a.bucket).map(finish),
    total: finish({ ...total, bucket: null }),
  }
}

/**
 * Daily active users split by how old the account is.
 *
 * The question this answers: is DAU just today's signups, or is there a pool
 * of older users underneath that keeps coming back? If the bottom band does
 * not grow while signups do, growth is rented, not owned.
 */
export function buildDailyActives(index, { range, recentDays = 7 } = {}) {
  const { signups, usersByDay, today } = index
  const end = range?.end ? Math.min(dayIndexOfKey(range.end), today) : today
  const start = range?.start ? dayIndexOfKey(range.start) : end - 29
  const signupsByDay = new Map()
  for (const signup of signups.values()) signupsByDay.set(signup.day, (signupsByDay.get(signup.day) ?? 0) + 1)

  const rows = []
  for (let day = start; day <= end; day += 1) {
    let fresh = 0
    let recent = 0
    let established = 0
    for (const userId of usersByDay.get(day) ?? []) {
      const signup = signups.get(userId)
      // No signup row: the account predates the log or was deleted. It is
      // certainly not new today.
      const age = signup ? day - signup.day : Infinity
      if (age <= 0) fresh += 1
      else if (age <= recentDays) recent += 1
      else established += 1
    }
    const active = fresh + recent + established
    rows.push({
      day,
      key: dayKeyOf(day),
      label: shortDay(day),
      signups: signupsByDay.get(day) ?? 0,
      fresh,
      recent,
      established,
      active,
      returningSharePct: pct(recent + established, active),
      // Today is still in progress, so its bar is always short.
      inProgress: day === today,
    })
  }
  return rows
}

/**
 * Signup cohorts × cumulative first payment.
 *
 * D-N = share of the cohort whose FIRST payment landed on or before day N
 * after signup. Numerator and denominator are the same people, which is what
 * makes this a conversion rate — unlike payments ÷ signups in the same week.
 */
export function buildPaidCohorts(index, firstPaidByUser, tzOffsetMs, { granularity = 'week', range, days = PAID_COHORT_DAYS } = {}) {
  const { signups, today } = index
  const buckets = new Map()
  const total = { size: 0, paidEver: 0, cells: days.map(emptyCell) }

  for (const [userId, signup] of signups) {
    if (!inRange(signup.day, range)) continue
    const key = bucketOf(signup.day, granularity)
    let row = buckets.get(key)
    if (!row) buckets.set(key, (row = { bucket: key, size: 0, paidEver: 0, cells: days.map(emptyCell) }))
    row.size += 1
    total.size += 1

    const paidAt = firstPaidByUser.get(userId)
    // A payment stamped before the signup row (clock skew, migrated account)
    // is a day-zero conversion, not a negative one.
    const lag = paidAt == null ? null : Math.max(0, dayIndexOf(paidAt, tzOffsetMs) - signup.day)
    if (lag != null) { row.paidEver += 1; total.paidEver += 1 }

    days.forEach((n, i) => {
      if (signup.day + n >= today) return
      for (const t of [row, total]) {
        t.cells[i].eligible += 1
        if (lag != null && lag <= n) t.cells[i].hit += 1
      }
    })
  }

  const finish = (row) => ({
    bucket: row.bucket,
    label: row.bucket == null ? '合计' : bucketLabel(row.bucket, granularity),
    size: row.size,
    paidEver: row.paidEver,
    paidEverPct: pct(row.paidEver, row.size),
    cells: row.cells.map((cell) => finishCell(cell, row.size, row.bucket == null ? 0 : MIN_PARTIAL_COVERAGE)),
  })

  return {
    days,
    rows: Array.from(buckets.values()).sort((a, b) => b.bucket - a.bucket).map(finish),
    total: finish({ ...total, bucket: null }),
  }
}

const startOf = (sub) => parseTs(sub.started_at) ?? parseTs(sub.created_at)

/**
 * Turn one user's recurring-subscription rows into billing periods with a
 * position in their chain (1 = first period, 2 = after the first renewal…).
 *
 * A row that starts well INSIDE the running period is an upgrade or a
 * replacement, not a renewal: it extends the period instead of opening a new
 * one. A row that starts after the renewal window has closed is a
 * re-subscription and begins a new chain at position 1.
 */
function buildPeriods(rows) {
  const earlyMs = RENEWAL_EARLY_DAYS * DAY_MS
  const windowMs = RENEWAL_WINDOW_DAYS * DAY_MS
  const items = rows
    .map((sub) => {
      const start = startOf(sub)
      if (start == null) return null
      const end = Math.max(start, parseTs(sub.expires_at) ?? start)
      return { start, end }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const periods = []
  for (const item of items) {
    const current = periods[periods.length - 1]
    if (current && item.start < current.end - earlyMs) {
      current.end = Math.max(current.end, item.end)
    } else if (current && item.start <= current.end + windowMs) {
      current.renewed = true
      periods.push({ start: item.start, end: item.end, position: current.position + 1, renewed: false })
    } else {
      periods.push({ start: item.start, end: item.end, position: 1, renewed: false })
    }
  }
  return periods
}

/**
 * Renewal, measured properly.
 *
 * Two things the old monthly figure got wrong:
 *   1. It looked for the next payment strictly AFTER the expiry. Stripe's
 *      renewal row starts exactly AT the expiry, so nearly every real renewal
 *      was missed.
 *   2. One-off purchases sat in the same denominator. They cannot auto-renew,
 *      so they dragged the rate down without saying anything about churn.
 *
 * Subscriptions and one-off purchases are therefore reported separately:
 * `ladder` and `monthly[].ratePct` are subscriptions only, and one-off buyers
 * get their own repurchase rate.
 *
 * A period is only judged once its renewal window has fully closed.
 */
export function buildRenewal(paidSubscriptions, isOneOff, tzOffsetMs, now = Date.now()) {
  const windowMs = RENEWAL_WINDOW_DAYS * DAY_MS
  const earlyMs = RENEWAL_EARLY_DAYS * DAY_MS
  const recurringByUser = new Map()
  const startsByUser = new Map()
  const oneOffs = []
  for (const sub of paidSubscriptions) {
    if (!sub.user_id) continue
    const start = startOf(sub)
    if (start == null) continue
    let starts = startsByUser.get(sub.user_id)
    if (!starts) startsByUser.set(sub.user_id, (starts = []))
    starts.push(start)
    if (isOneOff(sub.billing_reason)) {
      oneOffs.push({ userId: sub.user_id, start, end: Math.max(start, parseTs(sub.expires_at) ?? start) })
    } else {
      let list = recurringByUser.get(sub.user_id)
      if (!list) recurringByUser.set(sub.user_id, (list = []))
      list.push(sub)
    }
  }

  const months = new Map()
  const monthOf = (ts) => new Date(ts + tzOffsetMs).toISOString().slice(0, 7)
  const monthRow = (ts) => {
    const key = monthOf(ts)
    let row = months.get(key)
    if (!row) months.set(key, (row = { time: key, eligible: 0, renewed: 0, oneOffEligible: 0, oneOffRepurchased: 0, maturing: false }))
    return row
  }

  const LADDER_STEPS = 4
  const ladder = Array.from({ length: LADDER_STEPS }, (_, i) => ({ position: i + 1, eligible: 0, renewed: 0 }))
  const firstPeriodByUser = new Map()

  for (const [userId, rows] of recurringByUser) {
    const periods = buildPeriods(rows)
    if (periods.length > 0) firstPeriodByUser.set(userId, periods[0])
    for (const period of periods) {
      const row = monthRow(period.end)
      const mature = period.end + windowMs <= now
      period.mature = mature
      if (!mature) { row.maturing = true; continue }
      row.eligible += 1
      if (period.renewed) row.renewed += 1
      const step = ladder[Math.min(period.position, LADDER_STEPS) - 1]
      step.eligible += 1
      if (period.renewed) step.renewed += 1
    }
  }

  for (const purchase of oneOffs) {
    const row = monthRow(purchase.end)
    if (purchase.end + windowMs > now) { row.maturing = true; continue }
    row.oneOffEligible += 1
    const again = (startsByUser.get(purchase.userId) ?? []).some(
      (t) => t !== purchase.start && t >= purchase.end - earlyMs && t <= purchase.end + windowMs,
    )
    if (again) row.oneOffRepurchased += 1
  }

  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
  const monthly = Array.from(months.values())
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((row) => ({
      ...row,
      ratePct: pct(row.renewed, row.eligible) ?? 0,
      oneOffRatePct: pct(row.oneOffRepurchased, row.oneOffEligible) ?? 0,
    }))

  return {
    monthly,
    ladder: ladder.map((step) => ({
      ...step,
      label: step.position === LADDER_STEPS ? `第 ${LADDER_STEPS}+ 次续费` : `第 ${step.position} 次续费`,
      ratePct: pct(step.renewed, step.eligible),
    })),
    overall: {
      subscription: { eligible: sum(monthly, 'eligible'), renewed: sum(monthly, 'renewed') },
      oneOff: { eligible: sum(monthly, 'oneOffEligible'), renewed: sum(monthly, 'oneOffRepurchased') },
    },
    firstPeriodByUser,
  }
}

// ---- Channels --------------------------------------------------------------

const CHANNEL_ALIASES = [
  [/youtube|油管/i, 'youtube'],
  [/wechat|weixin|微信|视频号|公众号/i, 'wechat'],
  [/rednote|小红书|xhs/i, 'rednote'],
]

/**
 * Self-reported sources are a fixed list plus a free-text "other: …". The
 * free text is folded into a handful of names so "other: YouTube" and
 * "other: youtube" are one channel; anything unrecognised stays "other".
 */
export function normalizeSelfReportedSource(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (!/^other\b/i.test(value)) return value.toLowerCase()
  const detail = value.replace(/^other\s*[:：]?\s*/i, '')
  for (const [pattern, name] of CHANNEL_ALIASES) if (pattern.test(detail)) return name
  return 'other'
}

/**
 * Outcomes per acquisition channel: did the users it brought activate, come
 * back, pay, and renew?
 *
 * `channelsByUser` maps a user to the channel(s) they belong to. A user who
 * named two sources counts under both, so channel sizes can sum past the
 * number of users — shares are of the channel, never of the total.
 *
 * Channels under `minSample` users are held out of `rows` and counted in
 * `belowSample`: two users and one payer is not a 50% channel.
 */
export function buildChannelPerformance(index, channelsByUser, firstPaidByUser, renewal, tzOffsetMs, {
  range,
  minSample = 30,
  retentionDays = [1, 7],
  paidDay = 30,
} = {}) {
  const { signups, activeDays, firstEventTs, today, now, firstEventDay } = index
  const windowMs = ACTIVATION_WINDOW_HOURS * 60 * 60 * 1000
  const windowCloseMs = RENEWAL_WINDOW_DAYS * DAY_MS
  const channels = new Map()
  const make = (name) => ({
    name,
    size: 0,
    activation: emptyCell(),
    retention: retentionDays.map(emptyCell),
    paid: emptyCell(),
    paidEver: 0,
    renewal: emptyCell(),
  })
  const all = make('全部有渠道信息的用户')
  let covered = 0
  let cohortSize = 0

  for (const [userId, signup] of signups) {
    if (!inRange(signup.day, range)) continue
    cohortSize += 1
    const names = channelsByUser.get(userId)
    if (!names || names.length === 0) continue
    covered += 1

    const measurable = firstEventDay == null || signup.day >= firstEventDay
    const first = firstEventTs.get(userId)
    const userDays = activeDays.get(userId)
    const paidAt = firstPaidByUser.get(userId)
    const lag = paidAt == null ? null : Math.max(0, dayIndexOf(paidAt, tzOffsetMs) - signup.day)
    const firstPeriod = renewal.firstPeriodByUser.get(userId)

    const targets = [all, ...Array.from(new Set(names)).map((name) => {
      let row = channels.get(name)
      if (!row) channels.set(name, (row = make(name)))
      return row
    })]

    for (const row of targets) {
      row.size += 1
      if (measurable && signup.ts + windowMs <= now) {
        row.activation.eligible += 1
        if (first != null && first - signup.ts <= windowMs) row.activation.hit += 1
      }
      if (measurable) {
        retentionDays.forEach((n, i) => {
          if (signup.day + n >= today) return
          row.retention[i].eligible += 1
          if (userDays?.has(signup.day + n)) row.retention[i].hit += 1
        })
      }
      if (lag != null) row.paidEver += 1
      if (signup.day + paidDay < today) {
        row.paid.eligible += 1
        if (lag != null && lag <= paidDay) row.paid.hit += 1
      }
      if (firstPeriod && firstPeriod.end + windowCloseMs <= now) {
        row.renewal.eligible += 1
        if (firstPeriod.renewed) row.renewal.hit += 1
      }
    }
  }

  const whole = (cell) => ({ ...finishCell(cell, cell.eligible, 0), partial: false })
  const finish = (row) => ({
    name: row.name,
    size: row.size,
    sharePct: pct(row.size, covered),
    // A channel row spans signups of every age, so every rate here is over
    // "those who have reached that day" — that is the normal case, not an
    // exception worth starring. The denominator is shown in the cell.
    activation: whole(row.activation),
    retention: row.retention.map(whole),
    paid: whole(row.paid),
    paidEver: row.paidEver,
    paidEverPct: pct(row.paidEver, row.size),
    renewal: whole(row.renewal),
  })

  const ranked = Array.from(channels.values()).sort((a, b) => b.size - a.size)
  return {
    retentionDays,
    paidDay,
    rows: ranked.filter((row) => row.size >= minSample).map(finish),
    belowSample: ranked.filter((row) => row.size < minSample).length,
    total: finish(all),
    coverage: { covered, cohortSize, pct: pct(covered, cohortSize) },
  }
}

// ---- Activation funnel -----------------------------------------------------

export const FUNNEL_STAGES = [
  { key: 'signup', code: 'A0', label: '完成注册' },
  { key: 'course_requested_at', code: 'A1', label: '发起课程（输入主题 / 上传资料 / 加入课程）' },
  { key: 'course_ready_at', code: 'A2', label: '课程生成成功' },
  { key: 'lecture_started_at', code: 'A3', label: '开始讲解' },
  { key: 'lecture_completed_at', code: 'A4', label: '完成一节讲解' },
]

/**
 * Signup cohort → how far each user got.
 *
 * A user counts at a stage when they reached it OR ANY LATER ONE inside the
 * window. Someone who opened a lecture straight from a chat never "asked for
 * a course", but they are plainly past that point; dropping them at A1 would
 * understate every stage after it. It also keeps the funnel monotonic.
 *
 * `windowDays` bounds how long after signup a step still counts (null = no
 * bound). With a bound, users who signed up less than `windowDays` ago are
 * left out entirely — their window is still open, and counting them would
 * drag every rate down for no reason but their age.
 *
 * Signups from before the course product existed (`dataStart`) are left out
 * too: they could not have entered the funnel at signup.
 */
export function buildFunnel(index, funnelUsers, tzOffsetMs, { range, windowDays = null, dataStart = null } = {}) {
  const { signups, now } = index
  const byUser = new Map((funnelUsers ?? []).map((user) => [user.user_id, user]))
  const windowMs = windowDays == null ? Infinity : windowDays * DAY_MS
  const dataStartTs = parseTs(dataStart)
  const stepKeys = FUNNEL_STAGES.slice(1).map((stage) => stage.key)
  const reached = FUNNEL_STAGES.map(() => 0)
  let cohort = 0
  let windowOpen = 0

  for (const [userId, signup] of signups) {
    if (!inRange(signup.day, range)) continue
    if (dataStartTs != null && signup.ts < dataStartTs) continue
    if (windowDays != null && signup.ts + windowMs > now) { windowOpen += 1; continue }
    cohort += 1
    reached[0] += 1

    const steps = byUser.get(userId)
    if (!steps) continue
    // Furthest stage reached inside the window; everything up to it counts.
    let furthest = 0
    stepKeys.forEach((key, i) => {
      const ts = parseTs(steps[key])
      // A step stamped before the signup row is clock skew, not time travel.
      if (ts != null && Math.max(0, ts - signup.ts) <= windowMs) furthest = i + 1
    })
    for (let stage = 1; stage <= furthest; stage += 1) reached[stage] += 1
  }

  return {
    cohort,
    windowOpen,
    stages: FUNNEL_STAGES.map((stage, i) => ({
      ...stage,
      users: reached[i],
      ofSignupsPct: pct(reached[i], cohort),
      ofPreviousPct: i === 0 ? null : pct(reached[i], reached[i - 1]),
    })),
  }
}
