// /performance — 模型健康 (every signed-in role).
//
// Data: GET /api/v1/dashboard/model-health (src/api/getUserInfo/modelHealth),
// refreshed every REFRESH_MS. The scoring (./healthScoring) and the components
// take the rows as the API returns them.
//
// Local development without a backend: VITE_MODEL_HEALTH_MOCK=true in .env
// renders ./mockModelHealth instead and says so at the top of the page. A
// backend that cannot be reached is an empty state, never the mock.
//
// Deployment: rows carry prod / dev since 11-18 and the API returns one. The
// page shows prod (learners' traffic) only. A backend that does not separate
// deployments (no env in the reply) gets a notice at the top.
//
// Time: the last 24 hours or the last 30 days. Everything below the timeline
// (cards, details, both tables) covers the cells selected on it, or the whole
// range when none are.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageShell } from '../../components/PageShell'
import { PanelHeading } from '../../components/ui'
import { getModelHealth } from '../../api/getUserInfo/modelHealth'
import { ALL, DEPLOYMENT } from './healthMeta'
import { breakdownRows, buildTimeline, detectAlert, prepareView, PROBE_EXPLAINER, routeHealth, scoreSelection } from './healthScoring'
import { bucketLabel, selectionLabel } from './healthFormat'
import { AlertBanner } from './AlertBanner'
import { HealthToolbar } from './HealthToolbar'
import { ScoreCards } from './ScoreCards'
import { CategoryDetail } from './CategoryDetail'
import { HealthTimeline } from './HealthTimeline'
import { BreakdownTable } from './BreakdownTable'
import { FallbackTable } from './FallbackTable'
import './ModelHealthPage.css'

const NO_FILTER = { callSite: ALL, model: ALL, route: ALL }
const REFRESH_MS = 60_000

/** The obvious switch: mock data only when asked for in .env. */
const USE_MOCK = import.meta.env.VITE_MODEL_HEALTH_MOCK === 'true'

async function loadData(signal) {
  if (USE_MOCK) {
    const { buildMockModelHealth } = await import('./mockModelHealth')
    const raw = buildMockModelHealth()
    return { halfHour: prepareView(raw.halfHour), day: prepareView(raw.day) }
  }
  const raw = await getModelHealth({ env: DEPLOYMENT }, signal)
  // A backend older than 11-18 ignores ?env= and sends no env: it sums every
  // deployment, which is what the page showed before.
  return { env: raw.env ?? null, halfHour: prepareView(raw.halfHour), day: prepareView(raw.day) }
}

/** True when neither table has a single row in either window. */
const isEmpty = (data) => !data.halfHour.live.length && !data.halfHour.probe.length && !data.day.live.length && !data.day.probe.length

export default function ModelHealthPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const request = useRef(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const next = await loadData(controller.signal)
      if (controller.signal.aborted) return
      setData(next)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      // A failed refresh keeps the last good picture and says so.
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    load()
    const timer = USE_MOCK ? null : setInterval(load, REFRESH_MS)
    return () => {
      request.current?.abort()
      if (timer) clearInterval(timer)
    }
  }, [load])

  if (!data) {
    return (
      <PageShell active="/performance" className="mh-wide-page">
        <div className="sample4-state">
          {error ? (
            <>
              <strong>拿不到模型健康数据</strong>
              <p>{error}</p>
              <p>后端没起来、X-API-Key 不对，或者还没跑 scripts/model_health.sql 时都会这样。页面每分钟会自动再试。</p>
            </>
          ) : (
            <strong>正在读取模型健康数据…</strong>
          )}
        </div>
      </PageShell>
    )
  }
  return <ModelHealthBody data={data} error={error} />
}

function ModelHealthBody({ data, error }) {
  const [viewId, setViewId] = useState('halfHour')
  // Selected bucket indices on the timeline; null = none chosen (the whole range).
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(null) // which card is expanded

  const view = data[viewId]
  const timeline = useMemo(() => buildTimeline(view, NO_FILTER), [view])
  const last = timeline.length - 1
  // Indices past the end (the window moved on a refresh) are dropped; none = all.
  const kept = useMemo(() => (selected ?? []).filter((i) => i >= 0 && i <= last), [selected, last])
  const hasSelection = kept.length > 0
  const indices = useMemo(() => (hasSelection ? kept : timeline.map((b) => b.index)), [hasSelection, kept, timeline])
  // One cell: the timeline's own entry. Several: their rows and probes summed, same scoring.
  const bucket = useMemo(
    () => (indices.length === 1 ? timeline[indices[0]] : scoreSelection(view, NO_FILTER, indices)),
    [view, indices, timeline],
  )

  // The banner always looks at the whole system on the half-hour view,
  // whatever is filtered or selected below.
  const alertState = useMemo(() => {
    const halfHour = buildTimeline(data.halfHour, NO_FILTER)
    const alert = detectAlert(halfHour)
    const lastHalf = halfHour.length - 1
    const routes = routeHealth(data.halfHour, alert.active?.since ?? lastHalf, lastHalf)
    return { alert, routes }
  }, [data])

  const breakdown = useMemo(() => breakdownRows(view, indices, NO_FILTER), [view, indices])

  const switchView = (id) => {
    setViewId(id)
    setSelected(null)
  }
  const rangeText = viewId === 'day' ? '近 30 天' : '近 24 小时'
  const bucketText = !hasSelection
    ? `${rangeText}：${selectionLabel(view, indices)}`
    : indices.length > 1
      ? `已选 ${indices.length} 格：${selectionLabel(view, indices)}`
      : `${viewId === 'day' ? '这一天' : '这半小时'}：${bucketLabel(view, view.starts[indices[0]], indices[0] === last)}`
  const clearSelection = () => setSelected(null)

  return (
    <PageShell active="/performance" className="mh-wide-page">
      {USE_MOCK && (
        <div className="mh-mock-note" role="note">
          <strong>模拟数据</strong>
          VITE_MODEL_HEALTH_MOCK=true：页面上的数都是假的，只用于本地开发。
        </div>
      )}
      {!USE_MOCK && data.env == null && (
        <div className="mh-mock-note" role="alert">
          <strong>没分线上 / 测试服</strong>
          这个后端还不会按部署分开数据（没有返回 env），页面上的数是线上、测试服和本地加在一起的。
        </div>
      )}
      {error && (
        <div className="mh-mock-note" role="alert">
          <strong>刷新失败</strong>
          {error}（显示的是上一次拿到的数据，每分钟会再试）
        </div>
      )}
      {isEmpty(data) && (
        <div className="sample4-state">
          <strong>还没有数据</strong>
          <p>接口通了，但两张表里还没有行：后端刚上线、还没跑 scripts/model_health.sql，或者还没有一次模型调用。</p>
        </div>
      )}

      <AlertBanner alert={alertState.alert} view={data.halfHour} routes={alertState.routes} />

      <section className="sample4-panel mh-top">
        <div className="mh-top-head">
          <div>
            <span className="mh-eyebrow">模型健康</span>
            <h1 className="mh-sel-head">
              {bucketText}
              {hasSelection && (
                <button type="button" className="sample4-mini-btn mh-latest" onClick={clearSelection}>
                  清除
                </button>
              )}
            </h1>
          </div>
          <HealthToolbar view={viewId} onView={switchView} />
        </div>

        <ScoreCards bucket={bucket} open={open} onToggle={(id) => setOpen((cur) => (cur === id ? null : id))} />
      </section>

      {open && <CategoryDetail open={open} bucket={bucket} bucketText={bucketText} />}

      <section className="sample4-panel mh-section">
        <PanelHeading
          eyebrow={viewId === 'day' ? '近 30 天 · 每天一格' : '近 24 小时 · 每 30 分钟一格'}
          title="时间线"
        />
        <HealthTimeline
          timeline={timeline}
          view={view}
          selection={new Set(hasSelection ? indices : [])}
          onSelect={(next) => setSelected(next.length ? next : null)}
          onClear={hasSelection ? clearSelection : null}
        />
      </section>

      <section className="sample4-panel mh-section">
        <PanelHeading
          eyebrow={bucketText}
          title="按调用点 × 模型 × 线路"
          actions={<span className="mh-muted">只看真实流量（不含探测）；少于 20 次的不打分、整行变灰，数字照常显示；「整段返回」= 不是流式、没有首 token，速度看总耗时；按课程生成类 → 即时协助类 → 语音 → 其他排，同一类里按调用量排</span>}
        />
        <BreakdownTable rows={breakdown} />
      </section>

      <section className="sample4-panel mh-section">
        <PanelHeading
          eyebrow={bucketText}
          title="兜底明细：每个模型的兜底率"
          actions={<span className="mh-muted">跟时间线上选中的时间走（没选就是整段）；兜底率 = 兜底次数 ÷ 这条线路的调用数；少于 20 次的显示灰色</span>}
        />
        <FallbackTable view={view} indices={indices} bucketText={bucketText} />
      </section>

      <details className="sample4-panel mh-section mh-rules">
        <summary>规则说明</summary>
        <ul>
          <li>每一格调用少于 20 次时，比率类的细项显示灰色，不打分（主动探测除外）。</li>
          <li>用户自己点停止不算失败。</li>
          <li>主动探测：{PROBE_EXPLAINER}探测不分调用点，只按模型和线路。</li>
          <li>首 token 分两类：白板讲课、PDF 讲课、即时协助（Director、Content Generator、Artifact）、TTS 语音这些互动类用固定的线；课程生成、动画、配图、练习题、考试、Project 跟自己过去 7 天比。一次性整段返回的调用（不是流式）没有首 token，只算总耗时。</li>
          <li>数据来源：只看线上（用户）的流量，不含测试服和本地。11 月 18 日以前的数据都算作线上。</li>
          <li>时间：近 24 小时（每 30 分钟一格）或近 30 天（每天一格）。在时间线上点一格、多选或拖动选一段，上面的分数和下面两张表就只算选中的格子；没选就是整段。</li>
          <li>兜底：Gemini API 遇到 503 改走 Vertex 或 priority 档；即时协助的 Vertex 标准档遇到 503 / 429 改走 Vertex Priority；DeepSeek API 和百炼上的模型失败时由 Gemini 接住。兜底记在出发的那条线路上，所以兜底率 = 兜底次数 ÷ 那条线路的调用数；最终失败 = 兜底、重试都用完以后仍失败。</li>
          <li>三个分和总分都是 ≥ 85 绿、70–84 黄、&lt; 70 红。一票变红：最终成功率 &lt; 95%、互动类首 token p90 &gt; 15 秒、探测连续 3 次失败。</li>
          <li>页面报警：连续 2 格红，或者探测连续 3 次失败，顶部出红色横幅；只红一格不报；连续 2 格不红才撤下。不发邮件。</li>
        </ul>
      </details>
    </PageShell>
  )
}
