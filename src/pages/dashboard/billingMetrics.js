// Revenue and cancellation maths over the `/billing` payload.
//
// Pure functions, no React and no TypeScript imports — same arrangement as
// growthMetrics.js, so the numbers can be checked under plain node.
//
// Money is kept in cents until the very end. Two caveats travel with every
// figure here and the views state them:
//   - one-off purchases are priced at list price (`estimated`), because the
//     dashboard's Stripe key cannot read the payments themselves;
//   - refunds are not deducted, for the same reason.

import { DAY_MS, parseTs } from './paidSpans.js'
import { dayIndexOf, dayIndexOfKey, dayKeyOf } from './growthMetrics.js'

// How the payment kinds are grouped on the revenue chart. Three bands, so the
// chart reads as "new money, repeat money, and the part we estimate".
export const REVENUE_GROUPS = [
  { key: 'renewal', label: '订阅 · 续费', kinds: ['subscription_renewal'] },
  { key: 'new', label: '订阅 · 新购与升级', kinds: ['subscription_first', 'subscription_update', 'card_upgrade', 'other'] },
  { key: 'oneOff', label: 'One-off（按标价估算）', kinds: ['one_off'] },
]

const GROUP_OF_KIND = new Map(REVENUE_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key])))

// A subscription in one of these states is still billing.
const BILLING_STATUSES = new Set(['active', 'past_due', 'trialing'])

const CANCELLATION_LABELS = {
  too_expensive: '太贵',
  unused: '用得少 / 不需要了',
  switched_service: '换了别的产品',
  missing_features: '缺少需要的功能',
  too_complex: '太复杂',
  low_quality: '质量不满意',
  customer_service: '客服问题',
  other: '其他',
}
const PAYMENT_FAILED_LABEL = '扣款失败（非主动取消）'
const NO_FEEDBACK_LABEL = '未填写原因'

const weekStartOf = (dayIndex) => dayIndex - ((((dayIndex + 3) % 7) + 7) % 7)
const monthKeyOf = (dayIndex) => dayKeyOf(dayIndex).slice(0, 7)

const shortDay = (dayIndex) => {
  const d = new Date(dayIndex * DAY_MS)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

const emptyBucket = () => ({ renewal: 0, new: 0, oneOff: 0, payments: 0, unpriced: 0 })

/**
 * Revenue per day / week / month, split into REVENUE_GROUPS.
 *
 * Buckets are seeded across the whole range so a day with no payments shows
 * as zero instead of vanishing from the axis. Amounts are in cents.
 */
export function buildRevenueSeries(payments, tzOffsetMs, { range, granularity = 'day', now = Date.now() } = {}) {
  const today = dayIndexOf(now, tzOffsetMs)
  const end = range?.end ? Math.min(dayIndexOfKey(range.end), today) : today
  const start = range?.start ? dayIndexOfKey(range.start) : end - 29
  if (end < start) return []

  const keyOf = (day) => (granularity === 'month' ? monthKeyOf(day) : granularity === 'week' ? weekStartOf(day) : day)
  const labelOf = (key) => (granularity === 'month' ? key : shortDay(key))
  const titleOf = (key) => (granularity === 'month' ? key : granularity === 'week' ? `${dayKeyOf(key)} 起一周` : dayKeyOf(key))

  const buckets = new Map()
  for (let day = start; day <= end; day += 1) {
    const key = keyOf(day)
    if (!buckets.has(key)) buckets.set(key, { key, ...emptyBucket(), inProgress: false })
    if (day === today) buckets.get(key).inProgress = true
  }

  for (const payment of payments ?? []) {
    const ts = parseTs(payment.paid_at)
    if (ts == null) continue
    const day = dayIndexOf(ts, tzOffsetMs)
    if (day < start || day > end) continue
    const bucket = buckets.get(keyOf(day))
    if (!bucket) continue
    bucket.payments += 1
    if (payment.amount_cents == null) { bucket.unpriced += 1; continue }
    const group = GROUP_OF_KIND.get(payment.kind) ?? 'new'
    bucket[group] += payment.amount_cents
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    label: labelOf(bucket.key),
    title: titleOf(bucket.key),
    total: bucket.renewal + bucket.new + bucket.oneOff,
  }))
}

/**
 * Headline money figures.
 *
 * MRR is recurring revenue only: the list price of every subscription that is
 * still billing. One-off purchases are real money but not recurring, so they
 * are reported beside MRR (`last30`), never inside it. Discounted
 * subscriptions are counted at list price and flagged, since the discount
 * terms are not in the payload.
 */
export function buildRevenueSummary(payments, subscriptions, { now = Date.now() } = {}) {
  const since = now - 30 * DAY_MS
  const last30 = { ...emptyBucket() }
  for (const payment of payments ?? []) {
    const ts = parseTs(payment.paid_at)
    if (ts == null || ts < since || ts > now) continue
    last30.payments += 1
    if (payment.amount_cents == null) { last30.unpriced += 1; continue }
    last30[GROUP_OF_KIND.get(payment.kind) ?? 'new'] += payment.amount_cents
  }

  let mrrCents = 0
  let endingMrrCents = 0
  let billing = 0
  let ending = 0
  let discounted = 0
  for (const sub of subscriptions ?? []) {
    if (!BILLING_STATUSES.has(sub.status)) continue
    // Every plan today is monthly; a yearly price is spread over 12 months.
    const monthly = (sub.unit_amount_cents ?? 0) / (sub.interval === 'year' ? 12 : 1)
    billing += 1
    mrrCents += monthly
    if (sub.has_discount) discounted += 1
    if (sub.cancel_at || sub.cancel_at_period_end) {
      ending += 1
      endingMrrCents += monthly
    }
  }

  return {
    last30: {
      ...last30,
      subscription: last30.renewal + last30.new,
      total: last30.renewal + last30.new + last30.oneOff,
    },
    mrrCents,
    arrCents: mrrCents * 12,
    endingMrrCents,
    billing,
    ending,
    discounted,
  }
}

export function cancellationLabel(sub) {
  if (sub.cancellation_reason && sub.cancellation_reason !== 'cancellation_requested') return PAYMENT_FAILED_LABEL
  if (!sub.cancellation_feedback) return NO_FEEDBACK_LABEL
  return CANCELLATION_LABELS[sub.cancellation_feedback] ?? sub.cancellation_feedback
}

// Which billing period the cancellation landed in. Plans are monthly, and a
// period is a calendar month long, so 31 days is the longest one can be.
const PERIOD_DAYS = 31
const PERIOD_BUCKETS = [
  { key: 1, label: '第 1 期内（首月）' },
  { key: 2, label: '第 2 期' },
  { key: 3, label: '第 3 期' },
  { key: 4, label: '第 4 期及以后' },
]

/**
 * Cancellations inside `range` (by the day the cancellation was made).
 *
 * "Cancelled" is when the customer asked, not when access ended: someone who
 * cancels on day 3 keeps access to day 30, and day 3 is the date that says
 * something about the product.
 */
export function buildCancellations(subscriptions, tzOffsetMs, { range } = {}) {
  const startDay = range?.start ? dayIndexOfKey(range.start) : -Infinity
  const endDay = range?.end ? dayIndexOfKey(range.end) : Infinity

  const reasons = new Map()
  const periods = new Map(PERIOD_BUCKETS.map((bucket) => [bucket.key, 0]))
  const months = new Map()
  const lifetimes = []
  const comments = []
  let total = 0
  let scheduled = 0
  let withFeedback = 0
  let voluntary = 0

  for (const sub of subscriptions ?? []) {
    const canceledAt = parseTs(sub.canceled_at)
    if (canceledAt == null) continue
    const day = dayIndexOf(canceledAt, tzOffsetMs)
    if (day < startDay || day > endDay) continue

    total += 1
    if (sub.status !== 'canceled') scheduled += 1
    const label = cancellationLabel(sub)
    reasons.set(label, (reasons.get(label) ?? 0) + 1)
    if (sub.cancellation_reason === 'cancellation_requested') {
      voluntary += 1
      if (sub.cancellation_feedback) withFeedback += 1
    }

    const month = monthKeyOf(day)
    const row = months.get(month) ?? { time: month, voluntary: 0, paymentFailed: 0 }
    if (label === PAYMENT_FAILED_LABEL) row.paymentFailed += 1
    else row.voluntary += 1
    months.set(month, row)

    const startedAt = parseTs(sub.started_at)
    if (startedAt != null) {
      const days = Math.max(0, (canceledAt - startedAt) / DAY_MS)
      lifetimes.push(days)
      const period = Math.min(PERIOD_BUCKETS.length, Math.floor(days / PERIOD_DAYS) + 1)
      periods.set(period, periods.get(period) + 1)
    }

    if (sub.cancellation_comment) {
      comments.push({
        user_id: sub.user_id,
        canceledAt,
        label,
        plan: sub.plan_id ?? sub.tier ?? '—',
        comment: sub.cancellation_comment,
      })
    }
  }

  lifetimes.sort((a, b) => a - b)
  const entries = (map) => Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return {
    total,
    scheduled,
    voluntary,
    withFeedback,
    medianDays: lifetimes.length > 0 ? lifetimes[Math.floor((lifetimes.length - 1) / 2)] : null,
    reasons: entries(reasons),
    periods: PERIOD_BUCKETS.map((bucket) => ({
      ...bucket,
      value: periods.get(bucket.key),
      sharePct: lifetimes.length > 0 ? (periods.get(bucket.key) / lifetimes.length) * 100 : null,
    })),
    monthly: Array.from(months.values()).sort((a, b) => a.time.localeCompare(b.time)),
    comments: comments.sort((a, b) => b.canceledAt - a.canceledAt),
  }
}
