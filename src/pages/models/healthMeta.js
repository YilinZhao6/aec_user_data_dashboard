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
  { id: 'tts', label: 'TTS 语音', kind: 'interactive' },
  { id: 'other', label: '其他', kind: 'interactive' },
]

export const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'qwen-tts', label: 'Qwen TTS' },
]

export const ROUTES = [
  { id: 'dev_api', label: 'Gemini API' },
  { id: 'vertex_priority', label: 'Vertex Priority' },
  { id: 'vertex_standard', label: 'Vertex 标准档' },
  { id: 'dev_api_priority', label: 'Gemini API priority 档' },
  { id: 'dashscope', label: 'DashScope' },
]

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
