import { useEffect, useState } from 'react'
// Deliberately NOT `./sample4Data` — that module pulls in the whole dashboard
// data layer (stats / paid / utm clients), which would land in the standalone
// /feedback and /queries chunks the moment they render a chart.
import { formatCount } from '../../components/format'
import { PAD, axisTicks, labelledIndices, tooltipSideAt, useMeasuredWidth } from './chartFrame'

const DEFAULT_HEIGHT = 260
const VARIANTS = ['main', 'muted']

/** Smooth curve through the points, so real series keep the soft original look. */
function smoothPath(points) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}`

  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`
  }
  return d
}

/**
 * Line chart with a labelled value axis, one point per bucket, and a hover
 * readout of the exact numbers for that bucket.
 *
 * `labels` are the short x-axis captions, `tooltips` the long form shown on
 * hover (defaults to `labels`), and `format` decides how values are rendered.
 *
 * `notes[index]` adds one line of context under the hover readout — the raw
 * counts behind a percentage, typically, which a rate axis cannot show.
 * `shaded` = `{ indices, label }` greys out the buckets whose numbers are not
 * final yet, so a trailing dip reads as "not measured" rather than "fell off
 * a cliff".
 */
export default function Sample4LineChart({
  labels,
  tooltips,
  notes,
  series,
  format = 'count',
  referenceLines = [],
  shaded = null,
  height = DEFAULT_HEIGHT,
}) {
  const [ref, width] = useMeasuredWidth()
  const [hover, setHover] = useState(null)

  const count = labels.length
  useEffect(() => setHover(null), [count])

  const formatValue = (value) =>
    format === 'percent' ? `${value.toFixed(1)}%` : formatCount(Math.round(value))

  // Axis ticks land on round numbers, so drop the trailing ".0".
  const formatTick = (value) =>
    format === 'percent' && Number.isInteger(value) ? `${value}%` : formatValue(value)

  const { top, ticks } = axisTicks(Math.max(
    0,
    ...series.flatMap((s) => s.values),
    ...referenceLines.map((line) => line.value),
  ), format)
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = height - PAD.top - PAD.bottom
  const stepX = count > 1 ? plotWidth / (count - 1) : 0
  const xAt = (index) => PAD.left + index * stepX
  const yAt = (value) => PAD.top + plotHeight - (value / top) * plotHeight
  const axisBottom = PAD.top + plotHeight

  const shownLabels = labelledIndices(count)

  // A series can name its own variant instead of taking the next one by
  // position. Visual weight should follow which number matters, not the order
  // the lines happen to be listed in.
  const variantOf = (s, index) => s.variant ?? VARIANTS[index] ?? 'muted'

  // Contiguous runs of shaded buckets, so a stretch of them becomes one band
  // with one label rather than a stack of overlapping rectangles.
  const shadedBands = []
  if (shaded?.indices?.size) {
    let runStart = null
    for (let index = 0; index <= count; index++) {
      const on = index < count && shaded.indices.has(index)
      if (on && runStart === null) runStart = index
      if (!on && runStart !== null) {
        shadedBands.push([runStart, index - 1])
        runStart = null
      }
    }
  }

  // Per-point dots only help when the buckets are far enough apart to read.
  const showPointDots = count > 1 && stepX >= 14

  const handleMove = (event) => {
    if (count === 0 || plotWidth <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - bounds.left - PAD.left
    const index = stepX > 0 ? Math.round(offset / stepX) : 0
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  // Keep the tooltip inside the panel instead of letting it hang off an edge.
  // It is anchored by whichever side faces the middle of the chart, so its
  // width never has to be guessed — a long note line simply grows inwards.
  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(xAt(hover), PAD.left), width - PAD.right)
  const tooltipSide = hover === null ? 'left' : tooltipSideAt(hover, count)

  return (
    <div className="sample4-chart" ref={ref}>
      {width > 0 && (
        <svg
          className="sample4-line-chart"
          width={width}
          height={height}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {shadedBands.map(([from, to]) => {
            // Half a step of padding each side, so the band covers its buckets
            // instead of stopping dead on their centres.
            const half = stepX > 0 ? stepX / 2 : plotWidth
            const x1 = Math.max(PAD.left, xAt(from) - half)
            const x2 = Math.min(width - PAD.right, xAt(to) + half)
            return (
              <g key={`band-${from}`} className="sample4-chart-band">
                <rect x={x1} y={PAD.top} width={Math.max(0, x2 - x1)} height={plotHeight} />
                {shaded.label && (
                  <text x={(x1 + x2) / 2} y={PAD.top + 13} textAnchor="middle">
                    {shaded.label}
                  </text>
                )}
              </g>
            )
          })}

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

          {labels.map((label, index) =>
            shownLabels.has(index) ? (
              <text
                key={label + index}
                className="sample4-axis-label"
                x={xAt(index)}
                y={height - 12}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
              >
                {label}
              </text>
            ) : null,
          )}

          {hover !== null && (
            <line
              className="sample4-chart-guide"
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
            />
          )}

          {referenceLines.map((line) => (
            <g key={line.label} className="sample4-reference-line">
              <line x1={PAD.left} x2={width - PAD.right} y1={yAt(line.value)} y2={yAt(line.value)} />
              {/* Right-aligned: at the left edge the caption sat on top of
                  the value-axis labels whenever the average landed near a
                  tick. */}
              <text x={width - PAD.right} y={yAt(line.value) - 7} textAnchor="end">
                {line.label} · {formatValue(line.value)}
              </text>
            </g>
          ))}

          {series.map((s, seriesIndex) => {
            const variant = variantOf(s, seriesIndex)
            const points = s.values.map((value, index) => [xAt(index), yAt(value)])
            return (
              <g key={s.label} className={`sample4-chart-series ${variant}`}>
                <path d={smoothPath(points)} className={`sample4-chart-line ${variant}`} />
                {showPointDots &&
                  points.map(([x, y], index) =>
                    index === hover ? null : (
                      <circle key={index} cx={x} cy={y} r="3.6" className={`sample4-chart-point ${variant}`} />
                    ),
                  )}
                {hover !== null && points[hover] && (
                  <circle
                    cx={points[hover][0]}
                    cy={points[hover][1]}
                    r="5.5"
                    className={`sample4-chart-dot ${variant}`}
                  />
                )}
              </g>
            )
          })}
        </svg>
      )}

      {hover !== null && (
        <div className={`sample4-tooltip anchor-${tooltipSide}`} style={{ left: tooltipLeft }}>
          <strong>{(tooltips ?? labels)[hover]}</strong>
          {series.map((s, index) => (
            <span key={s.label} className={variantOf(s, index)}>
              {s.label}
              <b>{formatValue(s.values[hover])}</b>
            </span>
          ))}
          {notes?.[hover] && <em className="sample4-tooltip-note">{notes[hover]}</em>}
        </div>
      )}

      <div className="sample4-legend">
        {series.map((s, index) => (
          <span key={s.label} className={`sample4-legend-item ${variantOf(s, index)}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
