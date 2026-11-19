// Model-health page against the backend's 11-18 payload (LearningAgentExperimental
// c46e7dbf4): rows of one deployment, practice / exam / project call sites,
// whole answers with no first token, DeepSeek's own API as a route.
// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEPLOYMENT,
  modelLabel,
  routeLabel,
  siteLabel,
  siteMeta,
  orderBySite,
  siteGroup,
} from '../src/pages/models/healthMeta.js'
import { selectionLabel } from '../src/pages/models/healthFormat.js'
import { HIST_EDGES_MS, breakdownRows, buildTimeline, computeMetrics, fallbackRows, mergeProbes, prepareView, rawStats, scoreSelection } from '../src/pages/models/healthScoring.js'

const BINS = HIST_EDGES_MS.length
const hist = (at, n) => {
  const h = new Array(BINS).fill(0)
  if (n) h[HIST_EDGES_MS.findIndex((edge) => at <= edge)] = n
  return h
}

/** One row as model_health_rows returns it, after the API adds `bucket`. */
const row = (over) => ({
  bucket: 0, call_site: 'other', model: 'gemini-3-flash-preview', route: 'dev_api',
  calls: 0, ok: 0, final_failed: 0, cancelled: 0,
  err_503: 0, err_429: 0, err_timeout: 0, err_empty: 0, err_stalled: 0, err_other: 0,
  retries: 0, fb_dev_to_vertex: 0, fb_dev_to_priority: 0, fb_failed: 0, fb_rescued: 0,
  wb_first_token_fb: 0, wb_hedge: 0, vertex_calls: 0, vertex_not_priority: 0,
  ttft_hist: hist(0, 0), total_hist: hist(0, 0), input_tokens: 0, output_tokens: 0,
  ...over,
})

test('deployment: the page reads prod only', () => {
  assert.equal(DEPLOYMENT, 'prod')
})

test('practice / exam / project have their own label and are judged as batch', () => {
  for (const [id, label] of [['practice', '练习题'], ['exam', '考试'], ['project', 'Project']]) {
    assert.equal(siteLabel(id), label)
    assert.equal(siteMeta(id).kind, 'batch')
  }
  // An unknown call site still falls back to "other".
  assert.equal(siteMeta('something_new').id, 'other')
})

test('DeepSeek routes and models have labels', () => {
  assert.equal(routeLabel('deepseek'), 'DeepSeek API')
  assert.equal(modelLabel('deepseek-flash'), 'DeepSeek Flash')
  assert.equal(modelLabel('deepseek-v4.1-flash-1017'), 'DeepSeek V4.1 Flash（百炼）')
})

test('a whole answer (no first token) does not touch the interactive first-token lines', () => {
  const live = [
    // Streamed director calls: first token around 1–1.5 s.
    row({ call_site: 'chat_director', model: 'deepseek-flash', route: 'deepseek', calls: 40, ok: 40, ttft_hist: hist(1500, 40), total_hist: hist(4000, 40) }),
    // Practice sets answered whole: ~21 s, empty ttft histogram since 11-18.
    row({ call_site: 'practice', model: 'deepseek-v4.1-flash-1017', route: 'dashscope', calls: 30, ok: 30, total_hist: hist(30000, 30) }),
    // An "other" whole answer, the same.
    row({ call_site: 'other', calls: 25, ok: 25, total_hist: hist(30000, 25) }),
  ]
  const m = computeMetrics(live, [], { practice: { ttftP90: null, totalP90: 25000 }, chat_director: { ttftP90: 1500, totalP90: 4000 } })
  assert.ok(m.ttftP90 <= 1500, `interactive p90 ${m.ttftP90}`)
  assert.equal(m.batchTtftRatio, null) // practice has no first token to compare
  assert.ok(m.totalRatio != null)
})

test('rescue rate: a vendor call Gemini answered is a rescue, never above 100%', () => {
  const live = [
    // DeepSeek failed 10 times, Gemini answered 9 of them (no Gemini-API fallback fields).
    row({ call_site: 'chat_director', model: 'deepseek-flash', route: 'deepseek', calls: 50, ok: 40, final_failed: 1, err_other: 10, fb_rescued: 9, fb_failed: 1 }),
  ]
  const m = computeMetrics(live, [], {})
  assert.equal(m.counts.fallbacks, 10)
  assert.equal(m.rescueRate, 0.9)
})

test('chat · director scores speed and fallback on a prod-shaped payload', () => {
  const starts = [new Date('2026-11-19T06:00:00Z'), new Date('2026-11-19T06:30:00Z')]
  const view = prepareView({
    id: 'halfHour', bucketMs: 1800000, starts,
    live: [0, 1].flatMap((bucket) => [
      row({ bucket, call_site: 'chat_director', model: 'deepseek-flash', route: 'deepseek', calls: 120, ok: 119, final_failed: 1, err_other: 1, ttft_hist: hist(1500, 120), total_hist: hist(5000, 120) }),
      row({ bucket, call_site: 'chat_director', model: 'gemini-3-flash-preview', route: 'vertex_standard', calls: 90, ok: 90, ttft_hist: hist(2000, 90), total_hist: hist(6500, 90) }),
      row({ bucket, call_site: 'chat_director', model: 'gemini-2.5-flash-lite', route: 'dev_api', calls: 60, ok: 60, fb_dev_to_vertex: 1, fb_rescued: 1, ttft_hist: hist(1000, 60), total_hist: hist(2000, 60) }),
    ]),
    probe: [],
    baselines: { chat_director: { ttftP90: 1800, totalP90: 6000 } },
  })
  const timeline = buildTimeline(view, { callSite: 'chat_director', model: 'all', route: 'all' })
  const last = timeline.at(-1)
  assert.notEqual(last.categories.speed.score, null)
  assert.notEqual(last.categories.fallback.score, null)
  assert.notEqual(last.categories.availability.score, null)
})

test('fallback rates: each kind over the calls of the route it left', () => {
  const live = [
    // Gemini API: 2 to Vertex, 1 to the priority tier, one of the three failed.
    row({ model: 'gemini-3-flash-preview', route: 'dev_api', calls: 100, ok: 99, fb_dev_to_vertex: 2, fb_dev_to_priority: 1, fb_rescued: 2, fb_failed: 1 }),
    // Chat on Vertex standard: 4 to Vertex Priority. Must not inflate the Gemini API priority rate.
    row({ call_site: 'chat_director', route: 'vertex_standard', calls: 50, ok: 50, fb_dev_to_priority: 4, fb_rescued: 4 }),
    // DeepSeek on Bailian: 3 answered by Gemini.
    row({ call_site: 'whiteboard', model: 'deepseek-v4.1-flash-1017', route: 'dashscope', calls: 60, ok: 60, fb_rescued: 3 }),
    // Qwen TTS on the same route never falls back: not in the vendor denominator.
    row({ call_site: 'tts', model: 'qwen-audio-3.0-tts-flash', route: 'dashscope', calls: 1000, ok: 1000 }),
  ]
  const m = computeMetrics(live, [], {})
  assert.equal(m.fbVertexRate, 0.02)
  assert.equal(m.fbPriorityRate, 0.01)
  assert.equal(m.fbStdPriorityRate, 0.08)
  assert.equal(m.fbVendorRate, 0.05)
  assert.equal(m.counts.fallbacks, 10)
  assert.equal(m.rescueRate, 0.9)
})

test('fallbackRows: per call site × model × route over the selected buckets', () => {
  const view = {
    starts: [0, 1, 2],
    live: [
      row({ bucket: 0, call_site: 'chat_director', route: 'dev_api', calls: 30, ok: 30, fb_dev_to_vertex: 1, fb_rescued: 1 }),
      row({ bucket: 1, call_site: 'chat_director', route: 'dev_api', calls: 70, ok: 69, final_failed: 1, fb_dev_to_vertex: 2, fb_rescued: 1, fb_failed: 1 }),
      row({ bucket: 2, call_site: 'other', route: 'dev_api', calls: 100, ok: 100 }),
      row({ bucket: 1, call_site: 'chat_director', model: 'deepseek-flash', route: 'deepseek', calls: 40, ok: 40, fb_rescued: 2 }),
    ],
  }
  const all = { callSite: 'all', model: 'all', route: 'all' }
  const rows = fallbackRows(view, all)
  const director = rows.find((r) => r.callSite === 'chat_director' && r.route === 'dev_api')
  assert.equal(director.calls, 100)
  assert.equal(director.fallbacks, 3)
  assert.equal(director.toVertex, 3)
  assert.equal(director.fbRate, 0.03)
  assert.equal(director.rescueRate, 2 / 3)
  assert.equal(director.finalFailRate, 0.01)
  const ds = rows.find((r) => r.route === 'deepseek')
  assert.equal(ds.toGemini, 2)
  assert.equal(ds.fbRate, 0.05)
  // Most fallbacks first.
  assert.equal(rows[0], director)
  // A single bucket.
  assert.equal(fallbackRows(view, all, new Set([2])).length, 1)
  assert.equal(fallbackRows(view, all, new Set([0, 1])).find((r) => r.route === 'dev_api').calls, 100)
})

test('breakdown: total time for whole answers, raw numbers under 20 calls without a score', () => {
  const view = {
    starts: [0],
    baselines: {},
    live: [
      // Course generation on DeepSeek, answered whole: no first token, 30 calls.
      row({ call_site: 'course_gen', model: 'deepseek-flash', route: 'deepseek', calls: 30, ok: 30, total_hist: hist(30000, 30) }),
      // Chat · content streamed, only 5 calls.
      row({ call_site: 'chat_content', calls: 5, ok: 4, fb_dev_to_vertex: 1, fb_rescued: 1, ttft_hist: hist(1500, 5), total_hist: hist(6500, 5) }),
    ],
  }
  const rows = breakdownRows(view, 0, { callSite: 'all', model: 'all', route: 'all' })
  const course = rows.find((r) => r.callSite === 'course_gen')
  assert.equal(course.raw.wholeAnswer, true)
  assert.equal(course.raw.ttftP90, null)
  // 30 calls in the 20–30 s bin: p90 interpolates to 29 s, the same as the scoring's histPercentile.
  assert.equal(course.raw.totalP90, 29000)
  assert.equal(course.raw.totalP50, 25000)

  const small = rows.find((r) => r.callSite === 'chat_content')
  assert.equal(small.overall.score, null) // not scored
  assert.equal(small.raw.enough, false)
  assert.equal(small.raw.calls, 5)
  assert.equal(small.raw.wholeAnswer, false)
  assert.ok(small.raw.ttftP90 > 1000 && small.raw.ttftP90 <= 1500)
  assert.ok(small.raw.totalP90 > 5000 && small.raw.totalP90 <= 6500)
  assert.equal(small.raw.fbRate, 0.2)
  assert.equal(small.raw.finalSuccess, 0.8)

  // Nothing at all: not a whole answer, just no data.
  assert.equal(rawStats([]).wholeAnswer, false)
  assert.equal(rawStats([]).totalP90, null)
})

test('a selection of several cells is scored as one: rows and probes summed', () => {
  const starts = [0, 1, 2, 3].map((i) => new Date(Date.UTC(2026, 10, 18, 19, 0) + i * 1800000))
  const view = prepareView({
    id: 'halfHour', bucketMs: 1800000, starts,
    live: [
      row({ bucket: 0, call_site: 'chat_director', calls: 10, ok: 10, ttft_hist: hist(1500, 10), total_hist: hist(4000, 10) }),
      row({ bucket: 1, call_site: 'chat_director', calls: 15, ok: 14, final_failed: 1, err_503: 2, fb_dev_to_vertex: 1, fb_rescued: 1, ttft_hist: hist(1500, 15), total_hist: hist(4000, 15) }),
      row({ bucket: 3, call_site: 'chat_director', calls: 30, ok: 30, ttft_hist: hist(1500, 30), total_hist: hist(4000, 30) }),
    ],
    probe: [
      { bucket: 0, model: 'gemini-3-flash-preview', route: 'dev_api', results: [{ at: '', ok: true, ttftMs: 500 }, { at: '', ok: false }] },
      { bucket: 1, model: 'gemini-3-flash-preview', route: 'dev_api', results: [{ at: '', ok: false }, { at: '', ok: true, ttftMs: 500 }] },
    ],
    baselines: {},
  })
  const all = { callSite: 'all', model: 'all', route: 'all' }

  // Cells 0 and 1: 25 calls together, enough to score though neither cell is.
  const timeline = buildTimeline(view, all)
  assert.equal(timeline[0].metrics.finalSuccess, null)
  assert.equal(timeline[1].metrics.finalSuccess, null)
  const sel = scoreSelection(view, all, [1, 0])
  assert.deepEqual(sel.indices, [0, 1])
  assert.equal(sel.index, 0)
  assert.equal(sel.metrics.counts.calls, 25)
  assert.equal(sel.metrics.finalSuccess, 24 / 25)
  assert.equal(sel.metrics.rawErrorRate, 2 / 25)
  assert.notEqual(sel.overall.score, null)
  // Probes merged per target: 4 probes, 2 ok, and the failure streak across the boundary is 2.
  assert.equal(sel.metrics.probe.targets.length, 1)
  assert.equal(sel.metrics.probe.calls, 4)
  assert.equal(sel.metrics.probe.ok, 2)
  assert.equal(sel.metrics.probe.maxStreak, 2)
  assert.equal(sel.metrics.probe.targets[0].results.length, 4)

  // One cell scores exactly like the timeline's own entry.
  assert.deepEqual(scoreSelection(view, all, [3]).overall, timeline[3].overall)

  // The tables take the same selection.
  const rows = breakdownRows(view, [0, 1, 3], all)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].raw.calls, 55)
  const fb = fallbackRows(view, all, new Set([1, 3]))
  assert.equal(fb[0].calls, 45)
  assert.equal(fb[0].fallbacks, 1)

  // Header text: neighbouring cells become one range, gaps split it.
  assert.equal(mergeProbes([]).length, 0)
  const label = selectionLabel(view, [0, 1, 3])
  const parts = label.split('、')
  assert.equal(parts.length, 2)
  assert.match(parts[0], /^\d+\/\d+ \d\d:\d\d–\d\d:\d\d$/)
  // A half-hour range that crosses midnight names both days.
  const night = { id: 'halfHour', bucketMs: 1800000, starts: [new Date(2026, 10, 18, 23, 0), new Date(2026, 10, 18, 23, 30)] }
  assert.equal(selectionLabel(night, [0, 1]), '11/18 23:00–11/19 00:00')
  assert.equal(selectionLabel(night, [0]), '11/18 23:00–23:30')
  const dayView = { id: 'day', bucketMs: 86400000, starts: [0, 1, 2, 3].map((i) => new Date(2026, 10, 15 + i)) }
  assert.equal(selectionLabel(dayView, [0, 1, 2]), '11/15–11/17')
  assert.equal(selectionLabel(dayView, [3, 0]), '11/15、11/18')
})

test('call sites: 即时协助 labels, and the page order by category then calls', () => {
  assert.equal(siteLabel('chat_director'), '即时协助 · Director')
  assert.equal(siteLabel('chat_content'), '即时协助 · Content Generator')
  assert.equal(siteLabel('artifact'), '即时协助 · Artifact')
  assert.deepEqual(['course_gen', 'practice', 'exam', 'project'].map(siteGroup), ['course', 'course', 'course', 'course'])
  assert.deepEqual(['chat_director', 'chat_content', 'artifact', 'whiteboard', 'pdf_lecture', 'animation', 'image'].map(siteGroup), Array(7).fill('assist'))
  assert.equal(siteGroup('tts'), 'voice')
  assert.equal(siteGroup('brand_new_site'), 'other')

  const rows = [
    { callSite: 'tts', calls: 5000 },
    { callSite: 'other', calls: 9000 },
    { callSite: 'chat_director', calls: 300 },
    { callSite: 'whiteboard', calls: 800 },
    { callSite: 'chat_director', calls: 10 },
    { callSite: 'chat_director', calls: 700 },
    { callSite: 'practice', calls: 50 },
    { callSite: 'course_gen', calls: 100 },
  ]
  const ordered = orderBySite(rows, (r) => r.callSite, (r) => r.calls).map((r) => `${r.callSite}:${r.calls}`)
  assert.deepEqual(ordered, [
    'course_gen:100', 'practice:50', // 课程生成类
    'chat_director:700', 'chat_director:300', 'chat_director:10', // 即时协助类: director 1,010 calls > whiteboard 800
    'whiteboard:800',
    'tts:5000', // 语音
    'other:9000', // 其他 last, whatever its calls
  ])
})
