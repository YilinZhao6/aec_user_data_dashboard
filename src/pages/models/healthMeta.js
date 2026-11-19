// Names and kinds for the three dimensions the model-health data is split by
// (call site × model × route). This is configuration, not mock data: it stays
// when the page switches to the real endpoint.

/**
 * `kind` decides how first-token time is judged:
 *  - interactive: fixed thresholds (a learner is waiting on it);
 *  - batch: compared with that call site's own 7-day baseline.
 * `lecture` marks the two call sites that have the 8 s first-token fallback
 * and the 25 s hedge.
 */
export const CALL_SITES = [
  { id: 'whiteboard', label: '白板讲课', kind: 'interactive', lecture: true },
  { id: 'pdf_lecture', label: 'PDF 讲课', kind: 'interactive', lecture: true },
  { id: 'chat_director', label: '聊天 · director', kind: 'interactive' },
  { id: 'chat_content', label: '聊天 · 内容', kind: 'interactive' },
  { id: 'artifact', label: 'Artifact', kind: 'interactive' },
  { id: 'course_gen', label: '课程生成', kind: 'batch' },
  { id: 'animation', label: '动画', kind: 'batch' },
  { id: 'image', label: '配图', kind: 'batch' },
  // Since the backend's 11-18 change (c46e7dbf4) practice, exam and project
  // calls (generation, assistants, graders) have their own call site instead
  // of landing under "other". They mostly answer whole (no first token), so
  // they are judged like the other generators: against their own 7 days.
  { id: 'practice', label: '练习题', kind: 'batch' },
  { id: 'exam', label: '考试', kind: 'batch' },
  { id: 'project', label: 'Project', kind: 'batch' },
  { id: 'tts', label: 'TTS 语音', kind: 'interactive' },
  { id: 'other', label: '其他', kind: 'interactive' },
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
 * talks to the dev backend, so it asks for prod explicitly: rows written
 * before 11-18 were all labelled prod, and prod is what learners get.
 */
export const DEPLOYMENTS = [
  { id: 'prod', label: '线上（用户）' },
  { id: 'dev', label: '测试服' },
]
export const DEFAULT_DEPLOYMENT = 'prod'

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]))
const SITE_BY_ID = byId(CALL_SITES)
const MODEL_BY_ID = byId(MODELS)
const ROUTE_BY_ID = byId(ROUTES)

export const siteMeta = (id) => SITE_BY_ID[id] ?? SITE_BY_ID.other
export const siteLabel = (id) => SITE_BY_ID[id]?.label ?? id
export const modelLabel = (id) => MODEL_BY_ID[id]?.label ?? id
export const routeLabel = (id) => ROUTE_BY_ID[id]?.label ?? id

/** The "show everything" value of each filter. */
export const ALL = 'all'

/**
 * Filter choices: every value that appears in the rows, the known ones in
 * the order above, then any the lists do not know yet (labelled by id), so a
 * new call site, model or route is never missing from the filters.
 */
export function filterOptions(rows) {
  const pick = (key, list) => {
    const present = new Set(rows.map((r) => r[key]))
    const known = list.filter((item) => present.has(item.id))
    const knownIds = new Set(list.map((item) => item.id))
    const unknown = [...present].filter((id) => id && !knownIds.has(id)).sort().map((id) => ({ id, label: id }))
    return [...known, ...unknown]
  }
  return { callSite: pick('call_site', CALL_SITES), model: pick('model', MODELS), route: pick('route', ROUTES) }
}
