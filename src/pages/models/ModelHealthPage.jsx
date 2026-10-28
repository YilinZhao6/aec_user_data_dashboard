// /models — 模型健康 (admin only).
//
// MOCK: all numbers come from ./mockModelHealth; nothing calls the API yet.
// The data source is `loadData()` below. When the backend endpoint exists,
// replace it with the fetch; the scoring (./healthScoring) and the components
// take the same rows either way.

import { useMemo, useState } from 'react'
import { PageShell } from '../../components/PageShell'
import { PanelHeading } from '../../components/ui'
import { ALL, MODELS, ROUTES, CALL_SITES } from './healthMeta'
import { breakdownRows, buildTimeline, detectAlert, prepareView, PROBE_EXPLAINER, routeHealth } from './healthScoring'
import { buildMockModelHealth } from './mockModelHealth'
import { bucketLabel } from './healthFormat'
import { AlertBanner } from './AlertBanner'
import { HealthToolbar } from './HealthToolbar'
import { ScoreCards } from './ScoreCards'
import { CategoryDetail } from './CategoryDetail'
import { HealthTimeline } from './HealthTimeline'
import { BreakdownTable } from './BreakdownTable'
import './ModelHealthPage.css'

const NO_FILTER = { callSite: ALL, model: ALL, route: ALL }

function loadData() {
  const raw = buildMockModelHealth()
  return { halfHour: prepareView(raw.halfHour), day: prepareView(raw.day) }
}

/** Filter choices: only values that actually appear in the data. */
function filterOptions(view) {
  const present = (key) => new Set(view.live.map((r) => r[key]))
  const sites = present('call_site')
  const models = present('model')
  const routes = present('route')
  return {
    callSite: CALL_SITES.filter((s) => sites.has(s.id)),
    model: MODELS.filter((m) => models.has(m.id)),
    route: ROUTES.filter((r) => routes.has(r.id)),
  }
}

export default function ModelHealthPage() {
  const [data] = useState(loadData)
  const [viewId, setViewId] = useState('halfHour')
  const [filters, setFilters] = useState(NO_FILTER)
  const [selected, setSelected] = useState(null) // bucket index; null = latest
  const [open, setOpen] = useState(null) // which card is expanded

  const view = data[viewId]
  const timeline = useMemo(() => buildTimeline(view, filters), [view, filters])
  const last = timeline.length - 1
  const index = selected ?? last
  const bucket = timeline[index]

  // The banner always looks at the whole system on the half-hour view,
  // whatever is filtered or selected below.
  const alertState = useMemo(() => {
    const halfHour = buildTimeline(data.halfHour, NO_FILTER)
    const alert = detectAlert(halfHour)
    const lastHalf = halfHour.length - 1
    const routes = routeHealth(data.halfHour, alert.active?.since ?? lastHalf, lastHalf)
    return { alert, routes }
  }, [data])

  const options = useMemo(() => filterOptions(view), [view])
  const breakdown = useMemo(() => breakdownRows(view, index, filters), [view, index, filters])

  const switchView = (id) => {
    setViewId(id)
    setSelected(null)
  }
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const bucketText = `${viewId === 'day' ? '这一天' : '这半小时'}：${bucketLabel(view, bucket.start, index === last)}`

  return (
    <PageShell active="/models">
      <div className="mh-mock-note" role="note">
        <strong>模拟数据</strong>
        页面上的数都是假的，还没接后端，先用来定页面长什么样。
      </div>

      <AlertBanner alert={alertState.alert} view={data.halfHour} routes={alertState.routes} />

      <section className="sample4-panel mh-top">
        <div className="mh-top-head">
          <div>
            <span className="mh-eyebrow">模型健康</span>
            <h1>
              {bucketText}
              {index !== last && (
                <button type="button" className="sample4-mini-btn mh-latest" onClick={() => setSelected(null)}>
                  回到最新
                </button>
              )}
            </h1>
          </div>
          <HealthToolbar
            view={viewId}
            onView={switchView}
            filters={filters}
            options={options}
            onFilter={setFilter}
            onReset={() => setFilters(NO_FILTER)}
          />
        </div>

        <ScoreCards bucket={bucket} open={open} onToggle={(id) => setOpen((cur) => (cur === id ? null : id))} />
      </section>

      {open && <CategoryDetail open={open} bucket={bucket} bucketText={bucketText} />}

      <section className="sample4-panel mh-section">
        <PanelHeading
          eyebrow={viewId === 'day' ? '近 30 天 · 每天一格' : '近 24 小时 · 每 30 分钟一格'}
          title="时间线"
        />
        <HealthTimeline timeline={timeline} view={view} selected={index} onSelect={setSelected} />
      </section>

      <section className="sample4-panel mh-section">
        <PanelHeading
          eyebrow={bucketText}
          title="按调用点 × 模型 × 线路"
          actions={<span className="mh-muted">只看真实流量（不含探测）；少于 20 次的不打分；最差的排前面，点一行只看这个组合</span>}
        />
        <BreakdownTable
          rows={breakdown}
          onPick={(r) => setFilters({ callSite: r.callSite, model: r.model, route: r.route })}
        />
      </section>

      <details className="sample4-panel mh-section mh-rules">
        <summary>规则说明</summary>
        <ul>
          <li>每一格调用少于 20 次时，比率类的细项显示灰色，不打分（主动探测除外）。</li>
          <li>用户自己点停止不算失败。</li>
          <li>主动探测：{PROBE_EXPLAINER}探测不分调用点，只按模型和线路筛。</li>
          <li>首 token 分两类：白板、PDF、聊天、artifact、TTS 这些互动类用固定的线；课程生成、动画、配图跟自己过去 7 天比。</li>
          <li>三个分和总分都是 ≥ 85 绿、70–84 黄、&lt; 70 红。一票变红：最终成功率 &lt; 95%、互动类首 token p90 &gt; 15 秒、探测连续 3 次失败。</li>
          <li>页面报警：连续 2 格红，或者探测连续 3 次失败，顶部出红色横幅；只红一格不报；连续 2 格不红才撤下。不发邮件。</li>
        </ul>
      </details>
    </PageShell>
  )
}
