// Model-health scoring — pure functions, no React, no data source.
//
// Input is the row shape of the planned `model_health_30m` table (one row per
// bucket × call site × model × route, counts plus latency histograms) and the
// probe results. Today the rows come from ./mockModelHealth; when the backend
// endpoint exists, feed its rows in instead and nothing here changes.
//
// Every threshold and weight lives in the constants at the top of this file.
// They are the starting values from reports/model-health-plan-1028.md, to be
// tuned after a week of real data.

import { siteMeta } from './healthMeta'

// --- Constants -------------------------------------------------------------

/** Upper edge of each latency-histogram bin, in ms (15 bins, last is open). */
export const HIST_EDGES_MS = [250, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6500, 8000, 10000, 15000, 20000, 30000, Infinity]
/** Where the open last bin is assumed to end when interpolating a percentile. */
const HIST_CAP_MS = 60000

/** Below this many calls a rate is not judged (gray). Probes are exempt. */
export const MIN_CALLS = 20

/** A probe slower than this counts as slow (probe turns yellow). */
export const PROBE_SLOW_MS = 3000

/**
 * Weight of each category in the overall score.
 *
 * The plan's original single score was
 *   40 final success + 25 first-token p90 + 15 fallback rate
 *   + 10 raw error rate + 10 probe success.
 * Grouped by what each term measures:
 *   availability = 40 + 10 + 10 = 60, speed = 25, fallback = 15.
 */
export const CATEGORY_WEIGHTS = { speed: 25, availability: 60, fallback: 15 }

/** Score bands, shared by the overall score and the three category scores. */
export const SCORE_BANDS = { green: 85, yellow: 70 } // ≥85 green, 70–84 yellow, <70 red

export const CATEGORIES = [
  { id: 'speed', label: '速度' },
  { id: 'availability', label: '可用性' },
  { id: 'fallback', label: '兜底' },
]

export const ERROR_TYPES = [
  { id: 'err_503', label: '503' },
  { id: 'err_429', label: '429' },
  { id: 'err_timeout', label: '超时' },
  { id: 'err_empty', label: '空回答' },
  { id: 'err_stalled', label: '流中断' },
  { id: 'err_other', label: '其他' },
]

export const PROBE_EXPLAINER =
  '我们每 5 分钟自己给每个模型发一个很小的测试请求，看能不能正常回；和用户流量无关，半夜没人用时也能发现模型挂了。'

/**
 * The items behind each category score.
 *
 * - `full` scores 100, `zero` scores 0, linear in between.
 * - `yellow` / `red` colour the item on their own (independent of the score).
 * - `weight` is the item's share inside its category (each category sums to 100).
 * - `hard`: item red ⇒ category red, whatever the score ("一票变红").
 * - `soft`: item yellow or worse ⇒ category at least yellow.
 * - Any item red ⇒ category at least yellow.
 * - unit: 'ms' | 'pct' (0–1) | 'x' (ratio to baseline) | 'per100'.
 */
export const METRICS = [
  // Speed — interactive call sites use fixed lines, batch ones their own baseline.
  {
    id: 'ttftP90', category: 'speed', label: '首 token p90（互动类）', unit: 'ms', better: 'lower',
    full: 5000, zero: 15000, yellow: 8000, red: 15000, weight: 50, hard: true, soft: true,
    help: '从发出请求到收到第一个字，90% 的请求在这个时间以内。',
  },
  {
    id: 'ttftP50', category: 'speed', label: '首 token p50（互动类）', unit: 'ms', better: 'lower',
    full: 2000, zero: 8000, yellow: 4000, red: 8000, weight: 20,
    help: '中位数。p50 正常、p90 高，说明是一部分请求卡住了。',
  },
  {
    id: 'batchTtftRatio', category: 'speed', label: '首 token p90（批处理类，对比 7 天基线）', unit: 'x', better: 'lower',
    full: 1, zero: 2.5, yellow: 1.5, red: 2.5, weight: 15,
    help: '课程生成、动画、配图各自和自己过去 7 天比，取最差的那个。',
  },
  {
    id: 'totalRatio', category: 'speed', label: '总耗时 p90（对比 7 天基线）', unit: 'x', better: 'lower',
    full: 1, zero: 2.5, yellow: 1.5, red: 2.5, weight: 15,
    help: '从开始到最后一个字。每个调用点和自己过去 7 天比，取最差的那个。',
  },

  // Availability.
  {
    id: 'finalSuccess', category: 'availability', label: '最终成功率', unit: 'pct', better: 'higher',
    full: 0.99, zero: 0.9, yellow: 0.98, red: 0.95, weight: 65, hard: true, soft: true,
    help: '兜底、重试都用完以后，用户真的拿到回答的比例。用户自己点停止的不算失败。',
  },
  {
    id: 'rawErrorRate', category: 'availability', label: '原始错误率', unit: 'pct', better: 'lower',
    full: 0.02, zero: 0.25, yellow: 0.03, red: 0.1, weight: 15,
    help: '第一次请求就失败的比例，包括后来被兜底或重试救回来的。',
  },
  {
    id: 'probeSuccess', category: 'availability', label: '主动探测成功率', unit: 'pct', better: 'higher',
    full: 1, zero: 0.8, weight: 20, hard: true,
    yellowText: '有 1 次失败，或首 token > 3 秒',
    redText: '任一目标失败 ≥ 2 次；连续 3 次失败一票变红',
    help: PROBE_EXPLAINER,
    grade: (m) => {
      const p = m.probe
      if (!p || p.calls === 0) return 'gray'
      // Counts are per half hour (6 probes per target). Over a whole day the
      // same lines scale with the number of probes: 2% / 0.5% / 1%.
      const failed = (t) => t.calls - t.ok
      if (p.maxStreak >= 3 || p.targets.some((t) => failed(t) >= Math.max(2, 0.02 * t.calls))) return 'red'
      if (p.targets.some((t) => failed(t) >= Math.max(1, 0.005 * t.calls) || t.slow >= Math.max(1, 0.01 * t.calls))) return 'yellow'
      return 'green'
    },
    // Only the streak rule is a hard rule; two scattered failures are just red.
    hardWhen: (m) => (m.probe?.maxStreak ?? 0) >= 3,
  },

  // Fallback.
  {
    id: 'fbVertexRate', category: 'fallback', label: 'Gemini API → Vertex 兜底率', unit: 'pct', better: 'lower',
    full: 0.02, zero: 0.3, yellow: 0.02, red: 0.1, weight: 25,
    help: '503 以后改走 Vertex 的次数 ÷ 走 Gemini API 的调用数。',
  },
  {
    id: 'fbPriorityRate', category: 'fallback', label: 'Gemini API → Priority 档兜底率', unit: 'pct', better: 'lower',
    full: 0.02, zero: 0.3, yellow: 0.02, red: 0.1, weight: 15,
    help: '503 以后在 Gemini API 上改用 priority 档的次数（带 tools / 缓存 / 文件的请求）÷ 同一个分母。',
  },
  {
    id: 'rescueRate', category: 'fallback', label: '兜底救回率', unit: 'pct', better: 'higher',
    full: 0.95, zero: 0.6, yellow: 0.9, red: 0.7, weight: 20,
    help: '兜底以后成功的比例，看备用这条路靠不靠谱。这一格没有兜底就不算。',
  },
  {
    id: 'downgradeRate', category: 'fallback', label: 'Vertex Priority 被降档', unit: 'pct', better: 'lower',
    full: 0.01, zero: 0.3, yellow: 0.05, red: 0.2, weight: 15,
    help: 'Vertex 返回里 traffic_type 不是 ON_DEMAND_PRIORITY 的比例，也就是 Priority 没给到。',
  },
  {
    id: 'lectureFbRate', category: 'fallback', label: '白板 8 秒兜底 + hedge 触发率', unit: 'pct', better: 'lower',
    full: 0.01, zero: 0.25, yellow: 0.05, red: 0.15, weight: 15,
    help: '白板和 PDF 讲课里，8 秒首 token 兜底或 25 秒 hedge 被触发的比例。',
  },
  {
    id: 'retriesPer100', category: 'fallback', label: '每 100 次调用的重试数', unit: 'per100', better: 'lower',
    full: 1, zero: 15, yellow: 3, red: 10, weight: 10,
    help: '各功能自己的重试循环多发了几次（429、超时、空回答时会重试）。',
  },
]

// --- Small helpers ---------------------------------------------------------

const GRADE_RANK = { gray: -1, green: 0, yellow: 1, red: 2 }
export const worseGrade = (a, b) => (GRADE_RANK[a] >= GRADE_RANK[b] ? a : b)

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const ratio = (num, den, min = 1) => (den >= min ? num / den : null)

export function bandOf(score) {
  if (score == null) return 'gray'
  if (score >= SCORE_BANDS.green) return 'green'
  if (score >= SCORE_BANDS.yellow) return 'yellow'
  return 'red'
}

/** Percentile from a binned histogram, interpolating inside the bin. */
export function histPercentile(hist, q) {
  const total = hist.reduce((a, b) => a + b, 0)
  if (!total) return null
  const target = q * total
  let seen = 0
  for (let i = 0; i < hist.length; i++) {
    if (seen + hist[i] >= target && hist[i] > 0) {
      const lo = i === 0 ? 0 : HIST_EDGES_MS[i - 1]
      const hi = Number.isFinite(HIST_EDGES_MS[i]) ? HIST_EDGES_MS[i] : HIST_CAP_MS
      return lo + ((target - seen) / hist[i]) * (hi - lo)
    }
    seen += hist[i]
  }
  return HIST_CAP_MS
}

const emptyHist = () => new Array(HIST_EDGES_MS.length).fill(0)
const addHist = (into, hist) => {
  for (let i = 0; i < into.length; i++) into[i] += hist?.[i] ?? 0
}

// --- Filtering and aggregation --------------------------------------------

const COUNT_FIELDS = [
  'calls', 'ok', 'final_failed', 'cancelled',
  'err_503', 'err_429', 'err_timeout', 'err_empty', 'err_stalled', 'err_other',
  'retries', 'fb_dev_to_vertex', 'fb_dev_to_priority', 'fb_failed', 'fb_rescued',
  'wb_first_token_fb', 'wb_hedge', 'vertex_calls', 'vertex_not_priority',
]

/** filters = { callSite, model, route }, each an id or 'all'. Probes ignore callSite. */
export function matchesLive(row, f) {
  return (f.callSite === 'all' || row.call_site === f.callSite)
    && (f.model === 'all' || row.model === f.model)
    && (f.route === 'all' || row.route === f.route)
}

export function matchesProbe(row, f) {
  return (f.model === 'all' || row.model === f.model) && (f.route === 'all' || row.route === f.route)
}

/** Group rows by bucket index once, so scoring a timeline is one pass. */
export function byBucket(rows, bucketCount) {
  const out = Array.from({ length: bucketCount }, () => [])
  for (const row of rows) out[row.bucket]?.push(row)
  return out
}

/**
 * Probe rows come either with raw `results` (half-hour view: one entry per
 * 5-minute probe) or already summarised (day view: calls / ok / slow /
 * maxFailStreak). Normalise both to the summary, computing the failure streak
 * across bucket boundaries per target.
 */
export function summariseProbes(probeRows) {
  const streak = new Map() // target -> running consecutive failures
  return [...probeRows]
    .sort((a, b) => a.bucket - b.bucket)
    .map((row) => {
      if (!row.results) return { ...row, endStreak: row.maxFailStreak ?? 0 }
      const key = `${row.model}|${row.route}`
      let run = streak.get(key) ?? 0
      let maxRun = 0
      let ok = 0
      let slow = 0
      for (const r of row.results) {
        if (r.ok) {
          ok++
          if (r.ttftMs > PROBE_SLOW_MS) slow++
          run = 0
        } else {
          run++
          maxRun = Math.max(maxRun, run)
        }
      }
      streak.set(key, run)
      return { ...row, calls: row.results.length, ok, slow, maxFailStreak: maxRun, endStreak: run }
    })
}

/** Normalise one view of the payload (half-hour or day) before scoring it. */
export function prepareView(view) {
  return { ...view, probe: summariseProbes(view.probe) }
}

/** Sum the live rows and probe rows of one bucket into the metrics the items read. */
export function computeMetrics(liveRows, probeRows, baselines) {
  const sum = Object.fromEntries(COUNT_FIELDS.map((k) => [k, 0]))
  let devApiCalls = 0
  let lectureCalls = 0
  const interactiveTtft = emptyHist()
  const perSite = new Map() // call_site -> { calls, ttft, total }

  for (const row of liveRows) {
    for (const k of COUNT_FIELDS) sum[k] += row[k] ?? 0
    const meta = siteMeta(row.call_site)
    if (row.route === 'dev_api') devApiCalls += row.calls
    if (meta.lecture) lectureCalls += row.calls
    if (meta.kind === 'interactive') addHist(interactiveTtft, row.ttft_hist)
    const site = perSite.get(row.call_site) ?? { calls: 0, ttft: emptyHist(), total: emptyHist() }
    site.calls += row.calls
    addHist(site.ttft, row.ttft_hist)
    addHist(site.total, row.total_hist)
    perSite.set(row.call_site, site)
  }

  // Worst call site against its own baseline, among sites with enough calls.
  const worstRatio = (pick, kindFilter) => {
    let worst = null
    for (const [siteId, site] of perSite) {
      if (site.calls < MIN_CALLS || !baselines?.[siteId]) continue
      if (kindFilter && siteMeta(siteId).kind !== kindFilter) continue
      const { hist, base } = pick(site, baselines[siteId])
      const p90 = histPercentile(hist, 0.9)
      if (p90 == null || !base) continue
      const value = p90 / base
      if (!worst || value > worst.value) worst = { value, site: siteId, p90 }
    }
    return worst
  }

  const answered = sum.calls - sum.cancelled
  const interactiveCount = interactiveTtft.reduce((a, b) => a + b, 0)
  const rawErrors = ERROR_TYPES.reduce((acc, t) => acc + sum[t.id], 0)
  const fallbacks = sum.fb_dev_to_vertex + sum.fb_dev_to_priority
  const batch = worstRatio((s, b) => ({ hist: s.ttft, base: b.ttftP90 }), 'batch')
  const total = worstRatio((s, b) => ({ hist: s.total, base: b.totalP90 }))

  // Probes.
  const targets = probeRows.map((p) => ({
    model: p.model, route: p.route, calls: p.calls, ok: p.ok, slow: p.slow,
    maxFailStreak: p.maxFailStreak, endStreak: p.endStreak, results: p.results,
  }))
  const probeCalls = targets.reduce((a, t) => a + t.calls, 0)
  const probe = probeCalls
    ? {
        calls: probeCalls,
        ok: targets.reduce((a, t) => a + t.ok, 0),
        slow: targets.reduce((a, t) => a + t.slow, 0),
        maxStreak: Math.max(...targets.map((t) => t.maxFailStreak)),
        endStreak: Math.max(...targets.map((t) => t.endStreak)),
        targets,
      }
    : null

  return {
    counts: { ...sum, answered, rawErrors, fallbacks, devApiCalls, lectureCalls },
    enough: sum.calls >= MIN_CALLS,
    ttftP50: interactiveCount >= MIN_CALLS ? histPercentile(interactiveTtft, 0.5) : null,
    ttftP90: interactiveCount >= MIN_CALLS ? histPercentile(interactiveTtft, 0.9) : null,
    batchTtftRatio: batch?.value ?? null,
    batchTtftWorst: batch,
    totalRatio: total?.value ?? null,
    totalWorst: total,
    finalSuccess: ratio(sum.ok, answered, MIN_CALLS),
    rawErrorRate: ratio(rawErrors, answered, MIN_CALLS),
    errorsByType: Object.fromEntries(ERROR_TYPES.map((t) => [t.id, sum[t.id]])),
    probeSuccess: probe ? probe.ok / probe.calls : null,
    probe,
    fbVertexRate: ratio(sum.fb_dev_to_vertex, devApiCalls, MIN_CALLS),
    fbPriorityRate: ratio(sum.fb_dev_to_priority, devApiCalls, MIN_CALLS),
    // A handful of fallbacks is enough to say whether the second route held.
    rescueRate: sum.calls >= MIN_CALLS ? ratio(sum.fb_rescued, fallbacks, 5) : null,
    downgradeRate: ratio(sum.vertex_not_priority, sum.vertex_calls, MIN_CALLS),
    lectureFbRate: ratio(sum.wb_first_token_fb + sum.wb_hedge, lectureCalls, MIN_CALLS),
    retriesPer100: sum.calls >= MIN_CALLS ? (sum.retries / sum.calls) * 100 : null,
  }
}

// --- Scoring ---------------------------------------------------------------

function gradeItem(def, value, metrics) {
  if (def.grade) return def.grade(metrics)
  if (value == null) return 'gray'
  if (def.better === 'lower') return value > def.red ? 'red' : value > def.yellow ? 'yellow' : 'green'
  return value < def.red ? 'red' : value < def.yellow ? 'yellow' : 'green'
}

function subScore(def, value) {
  if (value == null) return null
  const t = (def.zero - value) / (def.zero - def.full) // same formula both directions
  return Math.round(clamp01(t) * 100)
}

function scoreCategory(categoryId, metrics) {
  const items = METRICS.filter((d) => d.category === categoryId).map((def) => {
    const value = metrics[def.id]
    const grade = gradeItem(def, value, metrics)
    const hardHit = def.hardWhen ? def.hardWhen(metrics) : def.hard && grade === 'red'
    return { def, value, grade, score: subScore(def, value), hardHit, softHit: def.soft && (grade === 'yellow' || grade === 'red') }
  })
  const counted = items.filter((i) => i.score != null)
  const weightSum = counted.reduce((a, i) => a + i.def.weight, 0)
  const score = weightSum ? Math.round(counted.reduce((a, i) => a + i.def.weight * i.score, 0) / weightSum) : null
  for (const item of items) item.share = item.score != null && weightSum ? item.def.weight / weightSum : 0

  let grade = bandOf(score)
  const hard = items.filter((i) => i.hardHit)
  const raised = items.filter((i) => i.softHit || i.grade === 'red')
  if (score != null && raised.length) grade = worseGrade(grade, 'yellow')
  if (hard.length) grade = 'red'
  return { id: categoryId, score, grade, items, hard, raised }
}

/** Score one bucket (already filtered rows). */
export function scoreBucket(liveRows, probeRows, baselines) {
  const metrics = computeMetrics(liveRows, probeRows, baselines)
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c.id, scoreCategory(c.id, metrics)]))

  const scored = CATEGORIES.filter((c) => categories[c.id].score != null)
  const weightSum = scored.reduce((a, c) => a + CATEGORY_WEIGHTS[c.id], 0)
  const score = weightSum
    ? Math.round(scored.reduce((a, c) => a + CATEGORY_WEIGHTS[c.id] * categories[c.id].score, 0) / weightSum)
    : null

  let grade = bandOf(score)
  const all = Object.values(categories)
  if (score != null && all.some((c) => c.grade === 'red' || c.raised.length)) grade = worseGrade(grade, 'yellow')
  if (all.some((c) => c.hard.length)) grade = 'red'
  return { metrics, categories, overall: { score, grade } }
}

/** One scored entry per bucket for the given view and filters. */
export function buildTimeline(view, filters) {
  const live = byBucket(view.live.filter((r) => matchesLive(r, filters)), view.starts.length)
  const probe = byBucket(view.probe.filter((r) => matchesProbe(r, filters)), view.starts.length)
  return view.starts.map((start, i) => ({ index: i, start, ...scoreBucket(live[i], probe[i], view.baselines) }))
}

/**
 * Rows of one bucket split by call site × model × route, each scored, worst
 * first. Live traffic only: a probe belongs to a model × route, not to a call
 * site, so attaching it to every row would count it several times (and would
 * score a row with 5 calls on the probe alone).
 */
export function breakdownRows(view, bucketIndex, filters) {
  const groups = new Map()
  for (const row of view.live) {
    if (row.bucket !== bucketIndex || !matchesLive(row, filters)) continue
    const key = `${row.call_site}|${row.model}|${row.route}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.values()]
    .map((rows) => {
      const { call_site: callSite, model, route } = rows[0]
      return { callSite, model, route, ...scoreBucket(rows, [], view.baselines) }
    })
    .sort((a, b) => (a.overall.score ?? 101) - (b.overall.score ?? 101))
}

/** Availability per route for a span of buckets — "which route still works". */
export function routeHealth(view, fromIndex, toIndex) {
  const routes = [...new Set(view.live.map((r) => r.route))]
  return routes.map((route) => {
    const live = view.live.filter((r) => r.route === route && r.bucket >= fromIndex && r.bucket <= toIndex)
    const probe = view.probe.filter((p) => p.route === route && p.bucket >= fromIndex && p.bucket <= toIndex)
    const { categories } = scoreBucket(live, probe, view.baselines)
    return { route, availability: categories.availability }
  })
}

// --- Page alert ------------------------------------------------------------

/**
 * Banner logic over the half-hour timeline (unfiltered):
 *  - on when 2 consecutive buckets are red, or a probe target fails 3 times
 *    in a row;
 *  - off again only after 2 consecutive non-red buckets;
 *  - a single red bucket never raises it.
 * Returns the live alert (or null), plus the red buckets that did not alert.
 */
export function detectAlert(timeline) {
  let on = false
  let since = null
  let run = 0
  let calm = 0
  const isolated = []

  timeline.forEach((b, i) => {
    const red = b.overall.grade === 'red'
    const probeHit = (b.metrics.probe?.maxStreak ?? 0) >= 3
    run = red ? run + 1 : 0
    calm = red ? 0 : calm + 1
    if (!on && (run >= 2 || probeHit)) {
      on = true
      since = run >= 2 ? i - run + 1 : i
    } else if (on && calm >= 2 && !probeHit) {
      on = false
      since = null
    }
    // A red bucket with clean neighbours that never raised the banner.
    if (red && !on && run === 1 && timeline[i + 1]?.overall.grade !== 'red') isolated.push(i)
  })

  const last = timeline.length - 1
  if (on) {
    const span = timeline.slice(since)
    const latestRed = [...span].reverse().find((b) => b.overall.grade === 'red') ?? timeline[last]
    const reasons = Object.values(latestRed.categories).flatMap((c) => c.hard.length ? c.hard : c.items.filter((i) => i.grade === 'red'))
    const err503 = span.reduce((a, b) => a + b.metrics.errorsByType.err_503, 0)
    return { active: { since, buckets: timeline.length - since, reasons, err503, latest: latestRed }, single: null, isolated }
  }
  const single = timeline[last]?.overall.grade === 'red' ? { index: last } : null
  return { active: null, single, isolated: isolated.filter((i) => i !== last) }
}
