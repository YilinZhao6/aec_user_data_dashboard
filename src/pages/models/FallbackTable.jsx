// Fallback detail per call site × model × route: how often each call left
// its route, where it went, how many the second route rescued, and what
// still failed in the end. Covers the time selected on the timeline (the
// whole range when nothing is), in the page's call-site order.

import { Fragment, useMemo } from 'react'
import { ALL, groupLabel, modelLabel, orderBySite, routeLabel, siteGroup, siteLabel } from './healthMeta'
import { fallbackRows } from './healthScoring'
import { formatRate } from './healthFormat'
import { FirstToken, TotalTime } from './HealthBits'

const NO_FILTER = { callSite: ALL, model: ALL, route: ALL }

const n = (v) => v.toLocaleString()

/** "→ Vertex 78 · → Priority 档 11" — only the destinations that happened. */
function Destinations({ r }) {
  const parts = [
    ['→ Vertex', r.toVertex],
    ['→ Priority 档', r.toPriority],
    ['→ Vertex Priority', r.stdToPriority],
    ['→ Gemini', r.toGemini],
  ].filter(([, v]) => v > 0)
  if (!parts.length) return <span className="mh-muted">—</span>
  return parts.map(([label, v]) => (
    <span key={label} className="mh-fb-dest">
      {label} <b>{n(v)}</b>
    </span>
  ))
}

/** Rate with its numerator / denominator, grayed under MIN_CALLS. */
function Rate({ value, num, den, enough, warn }) {
  if (value == null) return <span className="mh-muted">—</span>
  const cls = !enough ? 'mh-muted' : warn ? `mh-text-${warn}` : undefined
  return (
    <span className={cls} title={`${n(num)} / ${n(den)}`}>
      {formatRate(value)}
      <small className="mh-fb-frac">{n(num)}/{n(den)}</small>
    </span>
  )
}

// Same lines as the fallback-rate items in healthScoring (yellow 2%, red 10%).
const fbGrade = (v) => (v == null ? null : v > 0.1 ? 'red' : v > 0.02 ? 'yellow' : null)
const rescueGrade = (v) => (v == null ? null : v < 0.7 ? 'red' : v < 0.9 ? 'yellow' : null)
const finalGrade = (v) => (v == null ? null : v > 0.05 ? 'red' : v > 0.02 ? 'yellow' : null)

export function FallbackTable({ view, indices, bucketText }) {
  const rows = useMemo(
    () => orderBySite(fallbackRows(view, NO_FILTER, new Set(indices)), (r) => r.callSite, (r) => r.calls),
    [view, indices],
  )

  const totals = rows.reduce(
    (a, r) => ({ calls: a.calls + r.calls, fallbacks: a.fallbacks + r.fallbacks, rescued: a.rescued + r.rescued, failed: a.failed + r.failed }),
    { calls: 0, fallbacks: 0, rescued: 0, failed: 0 },
  )

  return (
    <>
      <div className="mh-fb-controls">
        <span className="mh-muted">
          {bucketText}，共 {n(totals.calls)} 次调用，兜底 {n(totals.fallbacks)} 次，救回 {n(totals.rescued)}，兜底后仍失败 {n(totals.failed)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="sample4-note">这段时间没有调用。</p>
      ) : (
        <div className="sample4-table-wrap">
          <table className="sample4-table mh-breakdown mh-fb-table">
            <thead>
              <tr>
                <th>调用点</th>
                <th>模型</th>
                <th>线路</th>
                <th>调用数</th>
                <th>兜底去向</th>
                <th title="兜底次数 ÷ 这条线路上的调用数">兜底率</th>
                <th title="兜底以后第二条路成功的比例">救回率</th>
                <th>兜底后仍失败</th>
                <th title="兜底、重试都用完以后仍失败 ÷ 调用数（不含用户自己停止的）">最终失败率</th>
                <th>首 token p90</th>
                <th title="从开始到最后一个字，p50 / p90">总耗时 p50 / p90</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={r.key}>
                {(i === 0 || siteGroup(rows[i - 1].callSite) !== siteGroup(r.callSite)) && (
                  <tr className="mh-group-row">
                    <td colSpan={11}>{groupLabel(siteGroup(r.callSite))}</td>
                  </tr>
                )}
                <tr className={r.enough ? undefined : 'mh-row-unscored'} title={r.enough ? undefined : '少于 20 次调用，数字只供参考'}>
                  <td>{siteLabel(r.callSite)}</td>
                  <td>{modelLabel(r.model)}</td>
                  <td>{routeLabel(r.route)}</td>
                  <td className="mh-num">{n(r.calls)}</td>
                  <td className="mh-fb-dests"><Destinations r={r} /></td>
                  <td className="mh-num"><Rate value={r.fbRate} num={r.fallbacks} den={r.calls} enough={r.enough} warn={fbGrade(r.fbRate)} /></td>
                  <td className="mh-num"><Rate value={r.rescueRate} num={r.rescued} den={r.fallbacks} enough warn={rescueGrade(r.rescueRate)} /></td>
                  <td className={`mh-num${r.failed ? ' mh-text-red' : ''}`}>{n(r.failed)}</td>
                  <td className="mh-num"><Rate value={r.finalFailRate} num={r.finalFailed} den={r.answered} enough={r.enough} warn={finalGrade(r.finalFailRate)} /></td>
                  <td className="mh-num"><FirstToken raw={r.raw} /></td>
                  <td className="mh-num"><TotalTime raw={r.raw} /></td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
