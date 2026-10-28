// Synthetic data for the /performance page, for local development only: rendered
// when VITE_MODEL_HEALTH_MOCK=true (ModelHealthPage). Nothing here talks to
// the API.
//
// The rows have the shape GET /api/v1/dashboard/model-health returns from
// `model_health_30m`: one row per bucket × call site × model × route with
// counts and two latency histograms, plus probe rows per model × route.
//
// The story baked in, so every state can be seen:
//  - half-hour view: the last 2 hours, Gemini 3.8 Flash on the Gemini API
//    gets a 503 storm and its probe fails every time → banner;
//  - ~8.5 hours ago, one isolated red bucket: DashScope TTS times out for half
//    an hour → red, but no banner;
//  - day view: one red day 12 days ago (503s across the Gemini API), one
//    yellow day with Vertex Priority being downgraded.

import { HIST_EDGES_MS, histPercentile } from './healthScoring'

const HALF_HOUR_BUCKETS = 48 // last 24 hours
const DAY_BUCKETS = 30 // last 30 days
const MS_30M = 30 * 60_000
const MS_DAY = 24 * 60 * 60_000

// One stream per call site × model × route. `volume` is calls in a busy half
// hour; latencies are medians in ms.
const STREAMS = [
  { site: 'whiteboard', model: 'gemini-3-flash-preview', route: 'dev_api', volume: 70, ttft: 1100, total: 9000 },
  { site: 'whiteboard', model: 'gemini-3-flash-preview', route: 'vertex_priority', volume: 30, ttft: 1200, total: 9500 },
  { site: 'pdf_lecture', model: 'gemini-3.8-flash', route: 'dev_api', volume: 25, ttft: 2600, total: 14000 },
  { site: 'pdf_lecture', model: 'gemini-3.8-flash', route: 'vertex_priority', volume: 10, ttft: 2800, total: 15000 },
  { site: 'chat_director', model: 'gemini-3.8-flash', route: 'dev_api', volume: 60, ttft: 900, total: 3000 },
  { site: 'chat_content', model: 'gemini-3-flash-preview', route: 'dev_api', volume: 22, ttft: 1500, total: 8000 },
  { site: 'chat_content', model: 'gemini-3-flash-preview', route: 'vertex_priority', volume: 8, ttft: 1600, total: 8500 },
  { site: 'artifact', model: 'gemini-3.8-flash', route: 'dev_api', volume: 12, ttft: 3800, total: 20000 },
  { site: 'course_gen', model: 'gemini-3.8-flash', route: 'vertex_priority', volume: 6, ttft: 6000, total: 32000 },
  { site: 'animation', model: 'gemini-3.8-flash', route: 'dev_api', volume: 15, ttft: 13000, total: 24000 },
  { site: 'image', model: 'gemini-3-flash-preview', route: 'dev_api', volume: 10, ttft: 5000, total: 12000 },
  { site: 'tts', model: 'qwen-tts', route: 'dashscope', volume: 300, ttft: 1200, total: 2500 },
]

const PROBE_TARGETS = [
  { model: 'gemini-3.8-flash', route: 'dev_api', ttft: 700 },
  { model: 'gemini-3.8-flash', route: 'vertex_priority', ttft: 850 },
  { model: 'gemini-3-flash-preview', route: 'dev_api', ttft: 600 },
  { model: 'gemini-3-flash-preview', route: 'vertex_priority', ttft: 750 },
]

const SIGMA = 0.45 // spread of the lognormal latency

/** Quiet days: the normal error mix. Scenarios below override parts of it. */
const NORMAL = {
  p503: 0.006, p429: 0.004, pTimeout: 0.002, pEmpty: 0.003, pStalled: 0.003, pOther: 0.002,
  rescue: 0.95, downgrade: 0.015, hedge: 0.012, ttftMul: 1, slowFrac: 0.02, cancel: 0.03,
}

// --- Random and distributions ---------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/** Binomial draw: exact for small n, normal approximation for large n. */
function draw(rand, n, p) {
  if (n <= 0 || p <= 0) return 0
  if (n < 400) {
    let k = 0
    for (let i = 0; i < n; i++) if (rand() < p) k++
    return k
  }
  return Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gaussian(rand))))
}

function erf(x) {
  // Abramowitz–Stegun 7.1.26, plenty for a mock.
  const s = Math.sign(x)
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}

const lognormalCdf = (x, median, sigma) => (x <= 0 ? 0 : 0.5 * (1 + erf(Math.log(x / median) / (sigma * Math.SQRT2))))

/** Spread n calls over the histogram bins: a lognormal body plus a slow tail. */
function histogram(n, median, slowFrac = 0, slowMedian = median * 4) {
  const prob = HIST_EDGES_MS.map((edge, i) => {
    const lo = i === 0 ? 0 : HIST_EDGES_MS[i - 1]
    const cdf = (x) => (Number.isFinite(x)
      ? (1 - slowFrac) * lognormalCdf(x, median, SIGMA) + slowFrac * lognormalCdf(x, slowMedian, SIGMA)
      : 1)
    return cdf(edge) - cdf(lo)
  })
  // Largest-remainder rounding, so the bins add up to exactly n.
  const raw = prob.map((p) => p * n)
  const hist = raw.map(Math.floor)
  let left = n - hist.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left-- > 0) hist[i]++
    })
  return hist
}

// --- Rows ------------------------------------------------------------------

/** Traffic follows the day: quiet at 4 am, busiest in the late afternoon. */
function loadAt(date) {
  const h = date.getHours() + date.getMinutes() / 60
  return 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(((h - 4) / 24) * 2 * Math.PI))
}

function liveRow(rand, stream, bucket, calls, sc) {
  const isDev = stream.route === 'dev_api'
  const cancelled = draw(rand, calls, sc.cancel)
  const answered = calls - cancelled
  const err503 = draw(rand, answered, isDev ? sc.p503 : NORMAL.p503 / 3)
  const err429 = draw(rand, answered, sc.p429)
  const errTimeout = draw(rand, answered, sc.pTimeout)
  const errEmpty = draw(rand, answered, sc.pEmpty)
  const errStalled = draw(rand, answered, sc.pStalled)
  const errOther = draw(rand, answered, sc.pOther)

  // Only 503s on the Gemini API take the fallback; most go to Vertex, the
  // ones with tools / cache / files go to the priority tier instead.
  const fallbacks = isDev && stream.site !== 'tts' ? err503 : 0
  const fbVertex = draw(rand, fallbacks, 0.83)
  const fbPriority = fallbacks - fbVertex
  const fbRescued = draw(rand, fallbacks, sc.rescue)
  const fbFailed = fallbacks - fbRescued
  // Everything else is retried by the feature's own loop; ~25% still fails.
  const retried = err429 + errTimeout + errEmpty + errStalled + (isDev ? 0 : err503)
  const retryFailed = draw(rand, retried, sc.retryFail ?? 0.25) + draw(rand, errOther, 0.8)
  const finalFailed = Math.min(answered, fbFailed + retryFailed)
  const ok = answered - finalFailed

  const vertexCalls = (stream.route === 'vertex_priority' ? calls : 0) + fbVertex
  const lecture = stream.site === 'whiteboard' || stream.site === 'pdf_lecture'
  const ttftMedian = stream.ttft * sc.ttftMul * (0.9 + rand() * 0.2)

  return {
    bucket,
    call_site: stream.site,
    model: stream.model,
    route: stream.route,
    calls,
    ok,
    final_failed: finalFailed,
    cancelled,
    err_503: err503,
    err_429: err429,
    err_timeout: errTimeout,
    err_empty: errEmpty,
    err_stalled: errStalled,
    err_other: errOther,
    retries: Math.round(retried * 1.4) + draw(rand, calls, 0.004),
    fb_dev_to_vertex: fbVertex,
    fb_dev_to_priority: fbPriority,
    fb_failed: fbFailed,
    fb_rescued: fbRescued,
    // Prod runs the whiteboard on the same model as its backup, so the 8 s
    // fallback never fires (plan §0.8); only the 25 s hedge shows up.
    wb_first_token_fb: 0,
    wb_hedge: lecture ? draw(rand, calls, sc.hedge) : 0,
    vertex_calls: vertexCalls,
    vertex_not_priority: draw(rand, vertexCalls, sc.downgrade),
    ttft_hist: histogram(ok, ttftMedian, sc.slowFrac, Math.max(ttftMedian * 4, 9000)),
    total_hist: histogram(ok, stream.total * (0.9 + rand() * 0.2) * (sc.totalMul ?? 1), sc.slowFrac / 2),
  }
}

/** Per-stream scenario for a half-hour bucket. `i` counts from the oldest. */
function halfHourScenario(stream, i) {
  const last = HALF_HOUR_BUCKETS - 1
  // Last 2 hours: 503 storm on 3.8 / Gemini API.
  if (i > last - 4 && stream.model === 'gemini-3.8-flash' && stream.route === 'dev_api') {
    return { ...NORMAL, p503: 0.45, rescue: 0.6, ttftMul: 1.6, slowFrac: 0.12, hedge: 0.08, totalMul: 1.4 }
  }
  // One isolated half hour: DashScope TTS times out and retries do not help.
  if (i === last - 17 && stream.site === 'tts') {
    return { ...NORMAL, pTimeout: 0.3, retryFail: 0.6, slowFrac: 0.2 }
  }
  return NORMAL
}

function dayScenario(stream, i) {
  // 12 days ago: 503s across the Gemini API all day.
  if (i === DAY_BUCKETS - 13 && stream.route === 'dev_api') {
    return { ...NORMAL, p503: 0.4, rescue: 0.55, ttftMul: 1.3, slowFrac: 0.08 }
  }
  // 21 days ago: Vertex hands out standard tier instead of Priority.
  if (i === DAY_BUCKETS - 22) return { ...NORMAL, downgrade: 0.24 }
  return NORMAL
}

function probeResults(rand, target, bucket, start) {
  const last = HALF_HOUR_BUCKETS - 1
  return Array.from({ length: 6 }, (_, k) => {
    const at = new Date(start.getTime() + k * 5 * 60_000)
    // 3.8 / Gemini API: fails from the 2nd probe of the storm onwards.
    const storm = target.model === 'gemini-3.8-flash' && target.route === 'dev_api'
      && (bucket > last - 4 && !(bucket === last - 3 && k === 0))
    const ok = storm ? false : rand() > 0.001
    const ttftMs = ok ? target.ttft * (0.7 + rand() * 0.6) : null
    return { at, ok, ttftMs: ttftMs && Math.round(ttftMs) }
  })
}

/** Baselines: p90 of each call site's normal distribution (stands in for "last 7 days"). */
function baselinesFor() {
  const out = {}
  for (const s of STREAMS) {
    if (out[s.site]) continue
    out[s.site] = {
      ttftP90: histPercentile(histogram(100000, s.ttft, NORMAL.slowFrac, Math.max(s.ttft * 4, 9000)), 0.9),
      totalP90: histPercentile(histogram(100000, s.total, NORMAL.slowFrac / 2), 0.9),
    }
  }
  return out
}

function buildHalfHour(rand, now, baselines) {
  const end = new Date(now)
  end.setSeconds(0, 0)
  end.setMinutes(end.getMinutes() < 30 ? 0 : 30)
  const starts = Array.from({ length: HALF_HOUR_BUCKETS }, (_, i) => new Date(end.getTime() - (HALF_HOUR_BUCKETS - 1 - i) * MS_30M))

  const live = []
  starts.forEach((start, i) => {
    const load = loadAt(start)
    for (const stream of STREAMS) {
      const calls = Math.max(0, Math.round(stream.volume * load * (0.85 + rand() * 0.3)))
      live.push(liveRow(rand, stream, i, calls, halfHourScenario(stream, i)))
    }
  })
  const probe = []
  starts.forEach((start, i) => {
    for (const target of PROBE_TARGETS) {
      probe.push({ bucket: i, model: target.model, route: target.route, results: probeResults(rand, target, i, start) })
    }
  })
  return { id: 'halfHour', bucketMs: MS_30M, starts, live, probe, baselines }
}

function buildDays(rand, now, baselines) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const starts = Array.from({ length: DAY_BUCKETS }, (_, i) => new Date(today.getTime() - (DAY_BUCKETS - 1 - i) * MS_DAY))
  // Today is only partly over.
  const todayShare = Math.max(0.05, (now - today) / MS_DAY)
  const live = []
  starts.forEach((start, i) => {
    const share = i === DAY_BUCKETS - 1 ? todayShare : 1
    const weekend = [0, 6].includes(start.getDay()) ? 0.8 : 1
    for (const stream of STREAMS) {
      // ~48 half hours at an average load of ~0.56.
      const calls = Math.round(stream.volume * 48 * 0.56 * share * weekend * (0.9 + rand() * 0.2))
      live.push(liveRow(rand, stream, i, calls, dayScenario(stream, i)))
    }
  })
  // Today's row already contains the storm from the half-hour view.
  const probe = []
  starts.forEach((start, i) => {
    const calls = Math.round(288 * (i === DAY_BUCKETS - 1 ? todayShare : 1))
    for (const target of PROBE_TARGETS) {
      const redDay = i === DAY_BUCKETS - 13 && target.route === 'dev_api'
      const today3_8 = i === DAY_BUCKETS - 1 && target.model === 'gemini-3.8-flash' && target.route === 'dev_api'
      const fails = redDay ? 31 : today3_8 ? 23 : draw(rand, calls, 0.002)
      probe.push({
        bucket: i, model: target.model, route: target.route,
        calls, ok: calls - fails, slow: draw(rand, calls, 0.004),
        maxFailStreak: redDay ? 6 : today3_8 ? 23 : Math.min(fails, 1),
      })
    }
  })
  return { id: 'day', bucketMs: MS_DAY, starts, live, probe, baselines }
}

/** The whole mock payload for both views. Same seed → same picture. */
export function buildMockModelHealth(now = new Date(), seed = 1028) {
  const rand = mulberry32(seed)
  const baselines = baselinesFor()
  return {
    generatedAt: now,
    halfHour: buildHalfHour(rand, now, baselines),
    day: buildDays(rand, now, baselines),
  }
}
