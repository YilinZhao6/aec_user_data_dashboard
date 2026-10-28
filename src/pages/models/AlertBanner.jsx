// Page alert: red banner while an alert is on, yellow note for a single red
// bucket, a quiet green line otherwise. Logic lives in healthScoring.detectAlert.

import { modelLabel, routeLabel } from './healthMeta'
import { bucketLabel, clock, formatValue } from './healthFormat'

function reasonText(item, metrics) {
  if (item.def.id === 'probeSuccess') {
    const failing = (metrics.probe?.targets ?? []).filter((t) => t.endStreak >= 3 || t.maxFailStreak >= 3)
    const who = failing.map((t) => `${modelLabel(t.model)} · ${routeLabel(t.route)}`).join('、')
    return `探测连续失败${who ? `（${who}）` : ''}`
  }
  return `${item.def.label} ${formatValue(item.def.unit, item.value)}`
}

export function AlertBanner({ alert, view, routes }) {
  const { starts } = view
  const last = starts.length - 1

  if (alert.active) {
    const { since, buckets, reasons, err503, latest } = alert.active
    const okRoutes = routes.filter((r) => r.availability.grade === 'green' || r.availability.grade === 'yellow')
    const hours = (buckets * view.bucketMs) / 3_600_000
    return (
      <div className="mh-banner mh-banner-red" role="alert">
        <strong>模型告警</strong>
        <div>
          <p>
            从 {clock(starts[since])} 开始，连续 {buckets} 格（{hours} 小时）不正常，到现在还没恢复。
          </p>
          <p className="mh-banner-reasons">
            {reasons.map((r) => reasonText(r, latest.metrics)).join('；')}
            {err503 > 0 && `；503 共 ${err503.toLocaleString()} 次`}。
          </p>
          {okRoutes.length > 0 && (
            <p className="mh-banner-ok">还正常的线路：{okRoutes.map((r) => routeLabel(r.route)).join('、')}</p>
          )}
        </div>
      </div>
    )
  }

  if (alert.single) {
    return (
      <div className="mh-banner mh-banner-yellow" role="status">
        <strong>注意</strong>
        <p>最新一格（{bucketLabel(view, starts[last])}）红了。只有一格，先不报警，下一格还红就报。</p>
      </div>
    )
  }

  return (
    <div className="mh-banner mh-banner-green" role="status">
      <strong>正常</strong>
      <p>
        现在没有报警。
        {alert.isolated.length > 0 &&
          ` 最近 24 小时有 ${alert.isolated.length} 格孤立的红（${alert.isolated.map((i) => clock(starts[i])).join('、')}），只红一格不报警。`}
      </p>
    </div>
  )
}
