// Model-health page against the backend's 11-18 payload (LearningAgentExperimental
// c46e7dbf4): rows of one deployment, practice / exam / project call sites,
// whole answers with no first token, DeepSeek's own API as a route.
// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DEPLOYMENT,
  DEPLOYMENTS,
  filterOptions,
  modelLabel,
  routeLabel,
  siteLabel,
  siteMeta,
} from '../src/pages/models/healthMeta.js'
import { HIST_EDGES_MS, buildTimeline, computeMetrics, prepareView } from '../src/pages/models/healthScoring.js'

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

test('deployment: the page asks for prod by default', () => {
  assert.equal(DEFAULT_DEPLOYMENT, 'prod')
  assert.deepEqual(DEPLOYMENTS.map((d) => d.id), ['prod', 'dev'])
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

test('filterOptions: known ids in order, unknown ids appended, nothing dropped', () => {
  const rows = [
    row({ call_site: 'chat_director', model: 'deepseek-flash', route: 'deepseek' }),
    row({ call_site: 'practice', model: 'brand-new-model', route: 'vertex_standard' }),
    row({ call_site: 'whiteboard', route: 'some_new_route' }),
  ]
  const o = filterOptions(rows)
  assert.deepEqual(o.callSite.map((x) => x.id), ['whiteboard', 'chat_director', 'practice'])
  assert.deepEqual(o.model.map((x) => x.id), ['gemini-3-flash-preview', 'deepseek-flash', 'brand-new-model'])
  assert.deepEqual(o.route.map((x) => x.id), ['vertex_standard', 'deepseek', 'some_new_route'])
  assert.equal(o.model.at(-1).label, 'brand-new-model')
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
