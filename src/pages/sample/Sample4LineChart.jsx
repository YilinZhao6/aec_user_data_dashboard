import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatCount } from './sample4Data'

const HEIGHT = 260
const PAD = { top: 18, right: 16, bottom: 30, left: 52 }
const VARIANTS = ['main', 'muted']
const MAX_X_LABELS = 8

/** Round the axis up to a readable maximum and return evenly spaced ticks. */
function axisTicks(max, targetIntervals = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  const rough = max / targetIntervals
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)))
  }
  return { top, ticks }
}

/** Indices that get an x-axis label — thinned out, but always including the last. */
function labelledIndices(count) {
  const step = Math.max(1, Math.ceil(count / MAX_X_LABELS))
  const shown = new Set()
  for (let i = 0; i < count; i += step) shown.add(i)
  if (count > 0 && !shown.has(count - 1)) {
    const last = Math.max(...shown)
    if (count - 1 - last < step * 0.6) shown.delete(last)
    shown.add(count - 1)
  }
  return shown
}

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

function useMeasuredWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/**
 * Line chart with a labelled value axis, one point per bucket, and a hover
 * readout of the exact numbers for that bucket.
 *
 * `labels` are the short x-axis captions, `tooltips` the long form shown on
 * hover (defaults to `labels`), and `format` decides how values are rendered.
 */
export default function Sample4LineChart({ labels, tooltips, series, format = 'count', referenceLines = [] }) {
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
  ))
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const stepX = count > 1 ? plotWidth / (count - 1) : 0
  const xAt = (index) => PAD.left + index * stepX
  const yAt = (value) => PAD.top + plotHeight - (value / top) * plotHeight

  const shownLabels = labelledIndices(count)

  const handleMove = (event) => {
    if (count === 0 || plotWidth <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - bounds.left - PAD.left
    const index = stepX > 0 ? Math.round(offset / stepX) : 0
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  // Keep the tooltip inside the panel instead of letting it hang off an edge.
  const tooltipLeft =
    hover === null ? 0 : Math.min(Math.max(xAt(hover), PAD.left + 60), width - 60)

  return (
    <div className="sample4-chart" ref={ref}>
      {width > 0 && (
        <svg
          className="sample4-line-chart"
          width={width}
          height={HEIGHT}
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

          {labels.map((label, index) =>
            shownLabels.has(index) ? (
              <text
                key={label + index}
                className="sample4-axis-label"
                x={xAt(index)}
                y={HEIGHT - 10}
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
              <text x={PAD.left + 8} y={yAt(line.value) - 7} textAnchor="start">
                {line.label} · {formatValue(line.value)}
              </text>
            </g>
          ))}

          {series.map((s, seriesIndex) => {
            const variant = VARIANTS[seriesIndex] ?? 'muted'
            const points = s.values.map((value, index) => [xAt(index), yAt(value)])
            return (
              <g key={s.label} className={`sample4-chart-series ${variant}`}>
                <path d={smoothPath(points)} className={`sample4-chart-line ${variant}`} />
                {hover !== null && points[hover] && (
                  <circle
                    cx={points[hover][0]}
                    cy={points[hover][1]}
                    r="4.5"
                    className={`sample4-chart-dot ${variant}`}
                  />
                )}
              </g>
            )
          })}
        </svg>
      )}

      {hover !== null && (
        <div className="sample4-tooltip" style={{ left: tooltipLeft }}>
          <strong>{(tooltips ?? labels)[hover]}</strong>
          {series.map((s, index) => (
            <span key={s.label} className={VARIANTS[index] ?? 'muted'}>
              {s.label}
              <b>{formatValue(s.values[hover])}</b>
            </span>
          ))}
        </div>
      )}

      <div className="sample4-legend">
        {series.map((s, index) => (
          <span key={s.label} className={`sample4-legend-item ${VARIANTS[index] ?? 'muted'}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
