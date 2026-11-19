// The selected time split by call site × model × route, by category
// (课程生成类 → 即时协助类 → 语音 → 其他), call sites and rows by calls.

import { groupLabel, modelLabel, routeLabel, siteGroup, siteLabel } from './healthMeta'
import { Fragment } from 'react'
import { formatRate, formatValue } from './healthFormat'
import { FirstToken, ScoreChip, TotalTime } from './HealthBits'

export function BreakdownTable({ rows }) {
  if (rows.length === 0) return <p className="sample4-note">这段时间没有调用。</p>
  return (
    <div className="sample4-table-wrap">
      <table className="sample4-table mh-breakdown">
        <thead>
          <tr>
            <th>调用点</th>
            <th>模型</th>
            <th>线路</th>
            <th>调用数</th>
            <th>总分</th>
            <th>速度</th>
            <th>可用性</th>
            <th>兜底</th>
            <th title="兜底次数 ÷ 这一行的调用数">兜底率</th>
            <th>最终成功率</th>
            <th>首 token p90</th>
            <th title="从开始到最后一个字，p50 / p90">总耗时 p50 / p90</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const group = siteGroup(r.callSite)
            const newGroup = i === 0 || siteGroup(rows[i - 1].callSite) !== group
            const { speed, availability, fallback } = r.categories
            const { raw } = r
            return (
              <Fragment key={`${r.callSite}|${r.model}|${r.route}`}>
              {newGroup && (
                <tr className="mh-group-row">
                  <td colSpan={12}>{groupLabel(group)}</td>
                </tr>
              )}
              <tr
                className={raw.enough ? undefined : 'mh-row-unscored'}
                title={raw.enough ? undefined : '少于 20 次调用，不打分；数字照常显示'}
              >
                <td>{siteLabel(r.callSite)}</td>
                <td>{modelLabel(r.model)}</td>
                <td>{routeLabel(r.route)}</td>
                <td className="mh-num">{r.metrics.counts.calls.toLocaleString()}</td>
                <td><ScoreChip {...r.overall} /></td>
                <td><ScoreChip {...speed} /></td>
                <td><ScoreChip {...availability} /></td>
                <td><ScoreChip {...fallback} /></td>
                <td className="mh-num">
                  {formatRate(raw.fbRate)}
                  {raw.fallbacks > 0 && <small className="mh-fb-frac">{raw.fallbacks}/{raw.calls}</small>}
                </td>
                <td className="mh-num">{formatValue('pct', raw.finalSuccess)}</td>
                <td className="mh-num"><FirstToken raw={raw} /></td>
                <td className="mh-num"><TotalTime raw={raw} /></td>
              </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
