import { useEffect, useState } from 'react'
// Same reason as Sample4LineChart: no `./sample4Data` import, so the chart can
// be pulled into a standalone page chunk without dragging the data layer in.
import { formatCount } from '../../components/format'
import { PAD, axisTicks, labelledIndices, tooltipSideAt, useMeasuredWidth } from './chartFrame'

const DEFAULT_HEIGHT = 240
// Wide buckets should not turn into slabs; past this the bar just gets more
// whitespace around it.
const MAX_BAR_WIDTH = 30
const VARIANTS = ['main', 'accent', 'muted']

/**
 * One stacked bar per bucket, on a real value axis.
 *
 * Segments are stacked as given, NOT normalised: the bar's height is the sum,
 * and that sum is meant to be a number worth reading on its own. Every segment
 * must therefore share one denominator — parts of a whole, not slices of a pie
 * whose size is hidden.
 *
 * `segments` are listed bottom-to-top, each `{ label, values, variant }` with
 * one value per bucket. `totalLabel` names the sum in the hover readout, and
 * `notes[index]` adds a line of raw counts under it.
 */
export default function Sample4StackedBars({
  labels,
  segments,
  notes,
  totalLabel,
  format = 'count',
  height = DEFAULT_HEIGHT,
}) {
  const [ref, width] = useMeasuredWidth()
  const [hover, setHover] = useState(null)

  const count = labels.length
  useEffect(() => setHover(null), [count])

  const totals = labels.map((_, index) =>
    segments.reduce((sum, s) => sum + (s.values[index] ?? 0), 0),
  )

  const formatValue = (value) =>
    format === 'percent' ? `${value.toFixed(1)}%` : formatCount(Math.round(value))
  // Axis ticks land on round numbers, so drop the trailing ".0".
  const formatTick = (value) =>
    format === 'percent' && Number.isInteger(value) ? `${value}%` : formatValue(value)

  const { top, ticks } = axisTicks(Math.max(0, ...totals), format)
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = height - PAD.top - PAD.bottom
  const band = count > 0 ? plotWidth / count : 0
  const barWidth = Math.min(band * 0.62, MAX_BAR_WIDTH)
  const centreAt = (index) => PAD.left + band * (index + 0.5)
  const yAt = (value) => PAD.top + plotHeight - (value / top) * plotHeight
  const axisBottom = PAD.top + plotHeight

  const shownLabels = labelledIndices(count)
  const variantOf = (s, index) => s.variant ?? VARIANTS[index] ?? 'muted'

  const handleMove = (event) => {
    if (count === 0 || band <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const index = Math.floor((event.clientX - bounds.left - PAD.left) / band)
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(centreAt(hover), PAD.left), width - PAD.right)
  const tooltipSide = hover === null ? 'left' : tooltipSideAt(hover, count)

  // Read the stack top-down, the way it is drawn.
  const tooltipRows = hover === null ? [] : segments
    .map((s, index) => ({
      label: s.label,
      variant: variantOf(s, index),
      value: s.values[hover] ?? 0,
    }))
    .reverse()

  return (
    <div className="sample4-chart" ref={ref}>
      {width > 0 && (
        <svg
          className="sample4-bar-chart"
          width={width}
          height={height}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yAt(tick)} y2={yAt(tick)} />
              <text className="sample4-axis-label" x={PAD.left - 10} y={yAt(tick) + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}

          <line className="sample4-chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={axisBottom} />
          <line className="sample4-chart-axis" x1={PAD.left} x2={width - PAD.right} y1={axisBottom} y2={axisBottom} />

          {hover !== null && (
            <rect
              className="sample4-stack-hover"
              x={PAD.left + band * hover}
              y={PAD.top}
              width={band}
              height={plotHeight}
            />
          )}

          {labels.map((label, index) => {
            // An empty bucket has nothing to stack. Drawing a zero-height bar
            // would only put a smudge on the axis.
            if (totals[index] <= 0) return null
            let stacked = 0
            return (
              <g key={label + index}>
                {segments.map((s, segmentIndex) => {
                  const value = s.values[index] ?? 0
                  if (value <= 0) return null
                  const y = yAt(stacked + value)
                  const segmentHeight = yAt(stacked) - y
                  stacked += value
                  return (
                    <rect
                      key={s.label}
                      className={`sample4-stack-seg ${variantOf(s, segmentIndex)}`}
                      x={centreAt(index) - barWidth / 2}
                      y={y}
                      width={barWidth}
                      height={segmentHeight}
                    />
                  )
                })}
              </g>
            )
          })}

          {labels.map((label, index) =>
            shownLabels.has(index) ? (
              <text
                key={label + index}
                className="sample4-axis-label"
                x={centreAt(index)}
                y={height - 12}
                textAnchor="middle"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hover !== null && (
        <div className={`sample4-tooltip swatch anchor-${tooltipSide}`} style={{ left: tooltipLeft }}>
          <strong>{labels[hover]}</strong>
          {tooltipRows.map((row) => (
            <span key={row.label} className={row.variant}>
              {row.label}
              <b>{formatValue(row.value)}</b>
            </span>
          ))}
          {totalLabel && (
            <span className="total">
              {totalLabel}
              <b>{formatValue(totals[hover])}</b>
            </span>
          )}
          {notes?.[hover] && <em className="sample4-tooltip-note">{notes[hover]}</em>}
        </div>
      )}

      <div className="sample4-legend swatch">
        {segments.map((s, index) => (
          <span key={s.label} className={`sample4-legend-item ${variantOf(s, index)}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
