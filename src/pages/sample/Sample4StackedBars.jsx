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
 * One stacked bar per bucket, for showing what a total is made of.
 *
 * `segments` are listed bottom-to-top, each `{ label, values, variant }` with
 * one raw count per bucket. `mode` decides what the bar height means:
 * 'share' normalises every bar to 100% (composition regardless of volume),
 * 'count' keeps the raw total so the height *is* the volume.
 *
 * The hover readout always carries the share; `showCounts` adds the raw
 * numbers, which the `general` role does not get.
 */
export default function Sample4StackedBars({
  labels,
  segments,
  mode = 'share',
  showCounts = false,
  height = DEFAULT_HEIGHT,
}) {
  const [ref, width] = useMeasuredWidth()
  const [hover, setHover] = useState(null)

  const count = labels.length
  useEffect(() => setHover(null), [count])

  const totals = labels.map((_, index) =>
    segments.reduce((sum, s) => sum + (s.values[index] ?? 0), 0),
  )

  const share = mode === 'share'
  const { top, ticks } = share
    ? { top: 100, ticks: [0, 25, 50, 75, 100] }
    : axisTicks(Math.max(0, ...totals), 'count')
  const formatTick = (value) => (share ? `${value}%` : formatCount(value))

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
    .map((s, index) => {
      const value = s.values[hover] ?? 0
      const pct = totals[hover] > 0 ? (value / totals[hover]) * 100 : 0
      return { label: s.label, variant: variantOf(s, index), value, pct }
    })
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
            const total = totals[index]
            // An empty bucket has no composition to show. Drawing a zero-height
            // bar would only put a smudge on the axis.
            if (total <= 0) return null
            const scale = share ? 100 / total : 1
            let stacked = 0
            return (
              <g key={label + index}>
                {segments.map((s, segmentIndex) => {
                  const value = (s.values[index] ?? 0) * scale
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
              <b>
                {showCounts ? `${formatCount(row.value)} · ${row.pct.toFixed(1)}%` : `${row.pct.toFixed(1)}%`}
              </b>
            </span>
          ))}
          {showCounts && <em className="sample4-tooltip-note">共 {formatCount(totals[hover])} 笔</em>}
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
