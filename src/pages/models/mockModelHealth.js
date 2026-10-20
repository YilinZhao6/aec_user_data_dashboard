// Synthetic data for the /models mock. Nothing here talks to the API.
//
// It mirrors what the backend would return from agent_trace_log once the
// planned fields exist (sample_rate, route, primary_error): one row per model
// and source (live traffic / scheduled probe), one cell per 30-minute bucket.
// The story baked in: lectures ran on 3.0 until ~14h ago, were switched to
// 3.8, and 3.8 hit a burst of 503s a few hours ago that the Vertex fallback
// mostly absorbed.

export const BUCKET_MINUTES = 30
export const BUCKETS = 48 // trailing 24 hours
export const TTFT_TARGET_MS = 5000

export const MODELS = [
  { id: 'gemini-3.8-flash', label: '3.8 Flash' },
  { id: 'gemini-3-flash-preview', label: '3.0 Flash' },
]

/** Which model each call site is configured to use right now. */
export const CALL_SITES = [
  {
    id: 'whiteboard_action_stream',
    label: 'Lecture (whiteboard)',
    env: 'GEMINI_ACTION_MODEL',
    model: 'gemini-3.8-flash',
    codeDefault: 'gemini-3-flash-preview',
    switchedAgo: '14h ago',
    primary: true,
  },
  {
    id: 'whiteboard_animation_generation',
    label: 'Classroom animation',
    env: 'GEMINI_CLASSROOM_ANIMATION_MODEL',
    model: 'gemini-3.8-flash',
    codeDefault: 'gemini-3.8-flash',
  },
  {
    id: 'whiteboard_interject',
    label: 'Interject (Q&A)',
    env: 'WHITEBOARD_INTERJECT_MODEL',
    model: 'gemini-3-flash-preview',
    codeDefault: 'gemini-3-flash-preview',
  },
  {
    id: 'whiteboard_tts_segment',
    label: 'Voice (TTS)',
    env: 'GEMINI_TTS_MODEL',
    model: 'gemini-3.1-flash-tts-preview',
    codeDefault: 'gemini-3.1-flash-tts-preview',
  },
]

// Lectures moved from 3.0 to 3.8 at this bucket index (0 = oldest).
const SWITCH_AT = 20
// 3.8 capacity incident on the Developer API.
const INCIDENT = new Set([36, 37, 38, 39])

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

const quantile = (sorted, q) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null

const pick = (rand, list) => list[Math.floor(rand() * list.length)]

const MASKED_USERS = ['ka***@gmail.com', 'j.***@nyu.edu', 'mi***@outlook.com', 'st***@ucla.edu', 'ri***@qq.com']

const CAPACITY_MSG = '503 UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary.'
const ERROR_SAMPLES = [
  { type: 'timeout', message: 'httpx.ReadTimeout: no first token within 240000 ms' },
  { type: 'api_error', message: '400 INVALID_ARGUMENT: Thought signature is not valid' },
  { type: 'empty', message: 'finish_reason=STOP with 0 output tokens' },
]

// Picked by score, so a 4.5 never comes with a "the student would get lost".
const JUDGE_NOTES = {
  good: [
    'Derivation is correct and the board follows the narration step by step.',
    'Good pacing; checks understanding before moving on.',
    'Clear worked example, and the diagram labels are right.',
  ],
  mixed: [
    'Correct, but the final diagram labels one axis wrongly.',
    'Correct but reads like a textbook dump — no checking in.',
    'Board drawing lags what is being said for ~10 s.',
  ],
  poor: [
    'Skips the key step between lines 2 and 3; the student would get lost.',
    'Board shows a different example from the one being explained.',
  ],
}

const noteFor = (rand, score) =>
  pick(rand, score >= 4 ? JUDGE_NOTES.good : score >= 3 ? JUDGE_NOTES.mixed : JUDGE_NOTES.poor)

/** Expected live share of lecture traffic for a model in a bucket. */
function servesLectures(modelId, index) {
  return modelId === 'gemini-3.8-flash' ? index >= SWITCH_AT : index < SWITCH_AT
}

function simulateBucket(rand, modelId, source, index, start) {
  const live = source === 'live'
  const isNew = modelId === 'gemini-3.8-flash'
  const hour = start.getHours()
  // Traffic follows the day: quiet overnight (NY), busy afternoon/evening.
  const load = 0.35 + 0.65 * Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5)

  let n
  if (!live) n = 1
  else if (!servesLectures(modelId, index)) n = rand() < 0.08 ? 1 + Math.floor(rand() * 2) : 0
  else n = Math.round(18 + 52 * load + rand() * 10)

  const incident = isNew && INCIDENT.has(index)
  const pCapacity = incident ? 0.32 + rand() * 0.14 : isNew ? 0.012 : 0.004
  const pRescue = 0.9
  const pOtherError = isNew ? 0.006 : 0.004
  const pEmpty = 0.004
  const pStop = live ? 0.03 : 0

  const ttftBase = isNew ? 2100 : 1600
  const ttfts = []
  const failures = []
  let capacity = 0
  let fallback = 0
  let fallbackOk = 0
  let errors = 0
  let empty = 0
  let stopped = 0
  let stalled = 0

  for (let i = 0; i < n; i++) {
    const at = new Date(start.getTime() + rand() * BUCKET_MINUTES * 60_000)
    const user = live ? pick(rand, MASKED_USERS) : 'scheduled probe'
    if (rand() < pCapacity) {
      capacity++
      fallback++
      if (rand() < pRescue) {
        fallbackOk++
        // The second route costs one extra round trip before the first token.
        ttfts.push(ttftBase + 1800 + rand() * 2600)
      } else {
        errors++
        failures.push({ at, user, route: 'vertex', type: 'capacity', message: CAPACITY_MSG })
      }
      continue
    }
    if (rand() < pOtherError) {
      errors++
      const sample = pick(rand, ERROR_SAMPLES.filter((s) => s.type !== 'empty'))
      failures.push({ at, user, route: 'primary', ...sample })
      continue
    }
    if (rand() < pEmpty) {
      empty++
      failures.push({ at, user, route: 'primary', ...ERROR_SAMPLES[2] })
      continue
    }
    if (rand() < pStop) stopped++
    // Long-tailed: most answers are quick, a few sit for a while.
    const tail = rand() < (incident ? 0.18 : 0.025) ? 2500 + rand() * 6000 : 0
    const ttft = ttftBase * (0.55 + rand() * 0.9) + tail
    if (ttft > 30_000) stalled++
    ttfts.push(ttft)
  }

  ttfts.sort((a, b) => a - b)
  const failed = errors + empty
  const withinTarget = ttfts.filter((t) => t <= TTFT_TARGET_MS).length

  // Hourly judge: 10 sampled lectures, only where the model has live traffic.
  let quality = null
  let judged = []
  if (live && n >= 5 && index % 2 === 1) {
    const mean = isNew ? 4.3 : 3.6
    const scores = Array.from({ length: 5 }, () =>
      Math.max(1, Math.min(5, Math.round((mean + (rand() - 0.5) * 1.6) * 2) / 2)),
    )
    quality = scores.reduce((a, b) => a + b, 0) / scores.length
    judged = scores.map((score) => ({ score, note: noteFor(rand, score), user: pick(rand, MASKED_USERS) }))
  }

  return {
    index,
    start,
    n,
    capacity,
    fallback,
    fallbackOk,
    errors,
    empty,
    stopped,
    stalled,
    ttftP50: quantile(ttfts, 0.5),
    ttftP90: quantile(ttfts, 0.9),
    ttftOkRate: n ? withinTarget / n : null,
    unavailableRate: n ? capacity / n : null,
    fallbackRate: n ? fallback / n : null,
    rescueRate: fallback ? fallbackOk / fallback : null,
    failureRate: n ? failed / n : null,
    quality,
    judged,
    failures: failures.sort((a, b) => b.at - a.at),
  }
}

/** Red / yellow / green / gray for one bucket — the thresholds from the plan. */
export function gradeBucket(b) {
  if (!b) return 'gray'
  // A probe is one request: judge it on its own outcome, not on rates.
  if (b.source === 'probe') {
    if (b.n === 0) return 'gray'
    if (b.errors + b.empty > 0) return 'red'
    if (b.fallback > 0 || b.ttftP50 > TTFT_TARGET_MS) return 'yellow'
    return 'green'
  }
  if (b.n < 5) return 'gray'
  // One failure in a quiet half hour is already 5%; ask for two before a
  // failure rate can colour the cell.
  const failed = b.errors + b.empty
  const failRate = failed >= 2 ? b.failureRate : 0
  if (failRate > 0.05 || b.ttftOkRate < 0.8 || b.unavailableRate > 0.2) return 'red'
  if (failRate > 0.02 || b.ttftOkRate < 0.9 || b.fallbackRate > 0.1) return 'yellow'
  return 'green'
}

const clamp01 = (x) => Math.max(0, Math.min(1, x))

/** 0–100. 40 stability + 30 speed + 30 quality; reweighted when quality is missing. */
export function healthScore({ failureRate, ttftOkRate, quality }) {
  if (failureRate == null) return null
  const stability = clamp01(1 - failureRate / 0.1)
  const speed = clamp01((ttftOkRate - 0.6) / 0.4)
  if (quality == null) return Math.round(((40 * stability + 30 * speed) / 70) * 100)
  return Math.round(40 * stability + 30 * speed + 30 * clamp01((quality - 1) / 4))
}

/** Roll a list of buckets into one window summary (counts add, rates recompute). */
export function summarize(buckets) {
  const sum = (key) => buckets.reduce((acc, b) => acc + b[key], 0)
  const n = sum('n')
  const ttftWeighted = buckets.filter((b) => b.ttftP90 != null && b.n)
  const qualities = buckets.filter((b) => b.quality != null)
  const fallback = sum('fallback')
  const okWithin = buckets.reduce((acc, b) => acc + (b.ttftOkRate ?? 0) * b.n, 0)
  const summary = {
    n,
    capacity: sum('capacity'),
    fallback,
    fallbackOk: sum('fallbackOk'),
    errors: sum('errors'),
    empty: sum('empty'),
    stopped: sum('stopped'),
    stalled: sum('stalled'),
    unavailableRate: n ? sum('capacity') / n : null,
    fallbackRate: n ? fallback / n : null,
    rescueRate: fallback ? sum('fallbackOk') / fallback : null,
    failureRate: n ? (sum('errors') + sum('empty')) / n : null,
    ttftOkRate: n ? okWithin / n : null,
    // Approximation for the mock: request-weighted mean of bucket p90s.
    ttftP90: ttftWeighted.length
      ? ttftWeighted.reduce((acc, b) => acc + b.ttftP90 * b.n, 0) / ttftWeighted.reduce((a, b) => a + b.n, 0)
      : null,
    quality: qualities.length ? qualities.reduce((acc, b) => acc + b.quality, 0) / qualities.length : null,
  }
  summary.score = healthScore(summary)
  return summary
}

/**
 * Build the whole mock payload. `seed` only reshuffles the noise; the story
 * (switch, incident) stays put so screenshots stay comparable.
 */
export function buildModelHealth(seed = 7, now = new Date()) {
  const rand = mulberry32(seed)
  const end = new Date(now)
  end.setSeconds(0, 0)
  end.setMinutes(end.getMinutes() < 30 ? 0 : 30)
  const starts = Array.from(
    { length: BUCKETS },
    (_, i) => new Date(end.getTime() - (BUCKETS - 1 - i) * BUCKET_MINUTES * 60_000),
  )

  const rows = []
  for (const model of MODELS) {
    for (const source of ['live', 'probe']) {
      const buckets = starts.map((start, i) => ({
        ...simulateBucket(rand, model.id, source, i, start),
        source,
      }))
      rows.push({ model, source, buckets })
    }
  }

  const goldenSet = {
    ranAt: new Date(end.getTime() - 9 * 60 * 60_000),
    items: 12,
    results: [
      { model: MODELS[0], score: 4.4, drewCorrectly: 11, wins: 9, ttftP50: 2050, costPerItem: 0.011 },
      { model: MODELS[1], score: 3.5, drewCorrectly: 8, wins: 3, ttftP50: 1580, costPerItem: 0.006 },
    ],
  }

  return { generatedAt: now, starts, rows, goldenSet, judgeLastRun: new Date(end.getTime() - 22 * 60_000) }
}
