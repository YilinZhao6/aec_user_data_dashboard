// The selected bucket split by call site × model × route, worst first.
// Clicking a row narrows the whole page to that combination.

import { modelLabel, routeLabel, siteLabel } from './healthMeta'
import { formatValue } from './healthFormat'
import { ScoreChip } from './HealthBits'

export function BreakdownTable({ rows, onPick }) {
  if (rows.length === 0) return <p className="sample4-note">这一格在这个筛选下没有调用。</p>
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
            <th>最终成功率</th>
            <th>首 token p90</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { speed, availability, fallback } = r.categories
            return (
              <tr
                key={`${r.callSite}|${r.model}|${r.route}`}
                className="mh-clickable"
                tabIndex={0}
                title="只看这个组合"
                onClick={() => onPick(r)}
                onKeyDown={(e) => (e.key === 'Enter' ? onPick(r) : null)}
              >
                <td>{siteLabel(r.callSite)}</td>
                <td>{modelLabel(r.model)}</td>
                <td>{routeLabel(r.route)}</td>
                <td className="mh-num">{r.metrics.counts.calls.toLocaleString()}</td>
                <td><ScoreChip {...r.overall} /></td>
                <td><ScoreChip {...speed} /></td>
                <td><ScoreChip {...availability} /></td>
                <td><ScoreChip {...fallback} /></td>
                <td className="mh-num">{formatValue('pct', r.metrics.finalSuccess)}</td>
                <td className="mh-num">{formatValue('ms', r.metrics.ttftP90 ?? null)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
