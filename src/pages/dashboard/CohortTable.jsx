// A table of rates, shaded by value, where every cell knows the sample behind
// it. Used for the retention cohorts, the paid cohorts and the channel table —
// they differ in what the rows are, not in how a rate should be read.

import { formatCount } from '../../components/format'

const ratePct = (pct) => (pct > 0 && pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`)

// Shading is relative to the column, not to 100%: D7 retention lives in the
// low single digits, and on an absolute scale every cell would be the same
// near-white.
const MAX_TINT = 0.3

/**
 * `columns`: `[{ key, label, title?, target? }]` — `target` (a percentage)
 *   marks the cells that meet it.
 * `rows`: `[{ key, label, size, cells: [cell] }]`, one cell per column, each
 *   `{ ratePct, hit, eligible, partial }` as produced by growthMetrics.
 * `total`: an optional summary row in the same shape.
 * `showCounts`: whether this role sees sizes and numerators; without it the
 *   table is percentages only.
 */
export default function CohortTable({ rowHeader, sizeHeader = 'Users', columns, rows, total, showCounts, empty = 'No cohorts in this range yet.' }) {
  if (rows.length === 0) return <p className="sample4-note">{empty}</p>

  const columnMax = columns.map((_, i) =>
    rows.reduce((max, row) => Math.max(max, row.cells[i]?.ratePct ?? 0), 0),
  )

  const renderCell = (cell, i, shaded) => {
    const column = columns[i]
    if (!cell || cell.ratePct == null) {
      return <td key={column.key} className="sample4-cohort-cell empty" title="Not measurable yet — this day has not fully elapsed for the cohort">—</td>
    }
    const met = column.target != null && cell.ratePct >= column.target
    const tint = shaded && columnMax[i] > 0 ? (cell.ratePct / columnMax[i]) * MAX_TINT : 0
    const title = [
      cell.partial ? 'Partial: only part of this cohort has reached this day' : null,
      column.target != null ? `Target ${column.target}%` : null,
    ].filter(Boolean).join(' · ') || undefined
    return (
      <td
        key={column.key}
        className={`sample4-cohort-cell${met ? ' met' : ''}`}
        style={tint > 0 ? { background: `rgba(79, 73, 65, ${tint.toFixed(3)})` } : undefined}
        title={title}
      >
        <strong>{ratePct(cell.ratePct)}{cell.partial ? '*' : ''}</strong>
        {showCounts && <span>{formatCount(cell.hit)} / {formatCount(cell.eligible)}</span>}
      </td>
    )
  }

  const renderRow = (row, isTotal) => (
    <tr key={row.key ?? row.label} className={isTotal ? 'sample4-cohort-total' : undefined}>
      <td>{row.label}</td>
      {showCounts && <td>{formatCount(row.size)}</td>}
      {row.cells.map((cell, i) => renderCell(cell, i, !isTotal))}
    </tr>
  )

  return (
    <div className="sample4-table-wrap">
      <table className="sample4-table sample4-cohort">
        <thead>
          <tr>
            <th>{rowHeader}</th>
            {showCounts && <th>{sizeHeader}</th>}
            {columns.map((column) => (
              <th key={column.key} title={column.title}>
                {column.label}
                {column.target != null && <em>目标 ≥{column.target}%</em>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {total && renderRow(total, true)}
          {rows.map((row) => renderRow(row, false))}
        </tbody>
      </table>
    </div>
  )
}
