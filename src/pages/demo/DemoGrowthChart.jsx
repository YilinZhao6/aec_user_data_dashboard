// The /demo line chart. Same geometry and styling as DashboardLineChart, minus
// everything that would print a number: no value axis, no hover readout. The
// line draws itself in over ~2.5s, dots pop as the stroke reaches them, then
// the area fill washes in and the last point gets a relative-growth badge.

import { useEffect, useState } from 'react'
import { labelledIndices, useMeasuredWidth } from '../dashboard/chartFrame'

const PAD = { top: 22, right: 18, bottom: 38, left: 18 }
const HEIGHT = 300
const HEADROOM = 1.1
const GRID_LINES = 4
const DRAW_MS = 2600
const HOLD_MS = 350

/**
 * Monotone cubic through the points (Fritsch–Carlson, as d3's curveMonotoneX).
 * The dashboard's Catmull-Rom curve overshoots on a sharp turn — the segment
 * into a small dip right before a big jump swings below the dip — and on a
 * chart whose whole point is that jump, the overshoot reads as a fake wobble.
 */
function monotonePath(points) {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${points[0][0]} ${points[0][1]}`
  const dx = []
  const slope = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0])
    slope.push((points[i + 1][1] - points[i][1]) / dx[i])
  }
  const tangent = new Array(n)
  tangent[0] = slope[0]
  tangent[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
    }
  }
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    d += ` C${x0 + h} ${y0 + tangent[i] * h} ${x1 - h} ${y1 - tangent[i + 1] * h} ${x1} ${y1}`
  }
  return d
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** 0 → 1, eased, restarting whenever `key` changes. */
function useDrawProgress(key) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1)
      return undefined
    }
    setProgress(0)
    const start = performance.now() + HOLD_MS
    let frame = 0
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / DRAW_MS))
      setProgress(easeInOutCubic(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [key])

  return progress
}

export default function DemoGrowthChart({ labels, values, average, ratio, replayKey }) {
  const [ref, width] = useMeasuredWidth()
  const progress = useDrawProgress(replayKey)

  const count = values.length
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const stepX = count > 1 ? plotWidth / (count - 1) : 0
  const top = Math.max(...values) * HEADROOM
  const xAt = (index) => PAD.left + index * stepX
  const yAt = (value) => PAD.top + plotHeight - (value / top) * plotHeight
  const axisBottom = PAD.top + plotHeight

  const points = values.map((value, index) => [xAt(index), yAt(value)])
  const linePath = monotonePath(points)
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[count - 1][0]} ${axisBottom} L${points[0][0]} ${axisBottom} Z`
      : ''

  // Where along the stroke each point sits, so a dot appears the moment the
  // line reaches it rather than on a fixed timer.
  const reach = []
  let total = 0
  for (let i = 0; i < count; i++) {
    if (i > 0) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    reach.push(total)
  }
  const fractions = reach.map((r) => (total > 0 ? r / total : 0))

  const done = progress >= 1
  const showArea = progress >= 0.72
  const showAverage = progress >= 0.9
  const last = points[count - 1]
  const shownLabels = labelledIndices(count)
  const gridValues = Array.from({ length: GRID_LINES + 1 }, (_, i) => (top * i) / GRID_LINES)

  return (
    <div className="demo-chart" ref={ref}>
      {width > 0 && count > 1 && (
        <svg className="sample4-line-chart" width={width} height={HEIGHT} aria-hidden="true">
          <defs>
            <linearGradient id="demo-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3f3b35" stopOpacity="0.24" />
              <stop offset="0.55" stopColor="#3f3b35" stopOpacity="0.07" />
              <stop offset="1" stopColor="#3f3b35" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridValues.map((value) => (
            <line key={value} x1={PAD.left} x2={width - PAD.right} y1={yAt(value)} y2={yAt(value)} />
          ))}
          <line className="sample4-chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={axisBottom} />
          <line className="sample4-chart-axis" x1={PAD.left} x2={width - PAD.right} y1={axisBottom} y2={axisBottom} />

          {labels.map((label, index) =>
            shownLabels.has(index) ? (
              <text
                key={label + index}
                className="sample4-axis-label"
                x={xAt(index)}
                y={HEIGHT - 12}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
              >
                {label}
              </text>
            ) : null,
          )}

          {showArea && <path key={`area-${replayKey}`} className="demo-area" d={areaPath} />}

          {showAverage && (
            <g key={`avg-${replayKey}`} className="sample4-reference-line demo-reference">
              <line x1={PAD.left} x2={width - PAD.right} y1={yAt(average)} y2={yAt(average)} />
              <text x={width - PAD.right} y={yAt(average) - 7} textAnchor="end">Average</text>
            </g>
          )}

          <path
            className="demo-line"
            d={linePath}
            pathLength="1"
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }}
          />

          {points.map(([x, y], index) =>
            fractions[index] <= progress + 1e-6 ? (
              <circle
                key={`${replayKey}-${index}`}
                className={index === count - 1 ? 'demo-point peak' : 'demo-point'}
                cx={x}
                cy={y}
                r={index === count - 1 ? 5 : 3.6}
              />
            ) : null,
          )}

          {done && <circle key={`pulse-${replayKey}`} className="demo-pulse" cx={last[0]} cy={last[1]} r="6" />}
        </svg>
      )}

      {done && width > 0 && (
        <div
          key={`badge-${replayKey}`}
          className="demo-badge"
          style={{ right: PAD.right + 16, top: last[1] }}
        >
          <strong>▲ {Math.round((ratio - 1) * 100)}%</strong>
          <span>vs. average</span>
        </div>
      )}

      <div className="sample4-legend">
        <span className="sample4-legend-item main">New users</span>
      </div>
    </div>
  )
}
