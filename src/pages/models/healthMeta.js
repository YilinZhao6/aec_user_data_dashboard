// Names and kinds for the three dimensions the model-health data is split by
// (call site × model × route). This is configuration, not mock data: it stays
// when the page switches to the real endpoint.

/**
 * `kind` decides how first-token time is judged:
 *  - interactive: fixed thresholds (a learner is waiting on it);
 *  - batch: compared with that call site's own 7-day baseline.
 * `lecture` marks the two call sites that have the 8 s first-token fallback
 * and the 25 s hedge.
 * `group` is the category the page lists call sites under (SITE_GROUPS);
 * within a group, call sites go by their calls in the data on screen.
 * The order of this list is only the tie-break.
 */
export const CALL_SITES = [
  // 课程生成类. Since the backend's 11-18 change (c46e7dbf4) practice, exam
  // and project calls (generation, assistants, graders) have their own call
  // site instead of landing under "other". They mostly answer whole (no
  // first token), so they are judged like the other generators: against
  // their own 7 days.
  { id: 'course_gen', label: '课程生成', kind: 'batch', group: 'course' },
  { id: 'practice', label: '练习题', kind: 'batch', group: 'course' },
  { id: 'exam', label: '考试', kind: 'batch', group: 'course' },
  { id: 'project', label: 'Project', kind: 'batch', group: 'course' },
  // 即时协助类 (the chat is called 即时协助 in the product).
  { id: 'chat_director', label: '即时协助 · Director', kind: 'interactive', group: 'assist' },
  { id: 'chat_content', label: '即时协助 · Content Generator', kind: 'interactive', group: 'assist' },
  { id: 'artifact', label: '即时协助 · Artifact', kind: 'interactive', group: 'assist' },
  { id: 'whiteboard', label: '白板讲课', kind: 'interactive', lecture: true, group: 'assist' },
  { id: 'pdf_lecture', label: 'PDF 讲课', kind: 'interactive', lecture: true, group: 'assist' },
  { id: 'animation', label: '动画', kind: 'batch', group: 'assist' },
  { id: 'image', label: '配图', kind: 'batch', group: 'assist' },
  // 语音.
  { id: 'tts', label: 'TTS 语音', kind: 'interactive', group: 'voice' },
  { id: 'other', label: '其他', kind: 'interactive', group: 'other' },
]

/** Categories, in the order the page lists them. */
export const SITE_GROUPS = [
  { id: 'course', label: '课程生成类' },
  { id: 'assist', label: '即时协助类' },
  { id: 'voice', label: '语音' },
  { id: 'other', label: '其他' },
]

export const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image' },
  { id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS' },
  { id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS' },
  { id: 'deepseek-flash', label: 'DeepSeek Flash' },
  { id: 'deepseek-v4.1-flash-1017', label: 'DeepSeek V4.1 Flash（百炼）' },
  { id: 'qwen-audio-3.0-tts-flash', label: 'Qwen TTS' },
  { id: 'qwen-tts', label: 'Qwen TTS' },
]

export const ROUTES = [
  { id: 'dev_api', label: 'Gemini API' },
  { id: 'vertex_priority', label: 'Vertex Priority' },
  { id: 'vertex_standard', label: 'Vertex 标准档' },
  { id: 'dev_api_priority', label: 'Gemini API priority 档' },
  { id: 'dashscope', label: 'DashScope（百炼）' },
  { id: 'deepseek', label: 'DeepSeek API' },
]

/**
 * Whose traffic the page reads. Dev, prod and every developer's machine write
 * to one Supabase project; since 11-18 each row carries its deployment and
 * the API returns only one (`?env=`, by default the backend's own). The page
 * talks to the dev backend, so it asks for prod explicitly: learners' traffic
 * only (rows written before 11-18 were all labelled prod).
 */
export const DEPLOYMENT = 'prod'

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]))
const SITE_BY_ID = byId(CALL_SITES)
const MODEL_BY_ID = byId(MODELS)
const ROUTE_BY_ID = byId(ROUTES)

export const siteMeta = (id) => SITE_BY_ID[id] ?? SITE_BY_ID.other
export const siteLabel = (id) => SITE_BY_ID[id]?.label ?? id

const GROUP_RANK = Object.fromEntries(SITE_GROUPS.map((g, i) => [g.id, i]))
const SITE_RANK = Object.fromEntries(CALL_SITES.map((s, i) => [s.id, i]))
/** The category a call site is listed under; an unknown one goes with 其他. */
export const siteGroup = (id) => SITE_BY_ID[id]?.group ?? 'other'
export const groupLabel = (id) => SITE_GROUPS.find((g) => g.id === id)?.label ?? id

/**
 * Table rows in the page's order: call sites by category, then by their
 * total calls; inside a call site, rows by calls, most first.
 * `site(r)` and `calls(r)` read a row.
 */
export function orderBySite(rows, site, calls) {
  const totals = new Map()
  for (const r of rows) totals.set(site(r), (totals.get(site(r)) ?? 0) + calls(r))
  const cmp = (a, b) =>
    GROUP_RANK[siteGroup(a)] - GROUP_RANK[siteGroup(b)]
    || (totals.get(b) ?? 0) - (totals.get(a) ?? 0)
    || (SITE_RANK[a] ?? 99) - (SITE_RANK[b] ?? 99)
    || String(a).localeCompare(String(b))
  return [...rows].sort((a, b) => cmp(site(a), site(b)) || calls(b) - calls(a))
}
export const modelLabel = (id) => MODEL_BY_ID[id]?.label ?? id
export const routeLabel = (id) => ROUTE_BY_ID[id]?.label ?? id

/** The "show everything" value of each filter. */
export const ALL = 'all'
