import { useState } from 'react'
// Same reason as the other two charts: no `./sample4Data` import, so a
// standalone page chunk can pull the chart in without the data layer.
import { formatCount } from '../../components/format'

const SIZE = 168
const RADIUS = SIZE / 2 - 2
const INNER_RADIUS = RADIUS * 0.58
const DEFAULT_TOP_N = 8
const OTHER_LABEL = 'Other'

// A tonal ramp built from the two hues the dashboard already uses — warm
// neutral and the accent brown — so a pie sits next to a bar chart without
// introducing a second palette. The last colour is reserved for `Other`.
const SLICE_COLORS = [
  '#3f3b35', '#a5763f', '#6f6a60', '#c99b5f',
  '#8d877b', '#ddb887', '#aaa294', '#b8825a',
]
const OTHER_COLOR = '#cfc7b8'

const polar = (angle, radius) => [
  SIZE / 2 + radius * Math.sin(angle),
  SIZE / 2 - radius * Math.cos(angle),
]

/** Donut segment between two angles (radians, clockwise from 12 o'clock). */
function arcPath(from, to) {
  // A single slice covering the whole circle has identical start and end
  // points, which collapses an arc path to nothing — draw two halves instead.
  if (to - from >= Math.PI * 2 - 1e-6) {
    return [arcPath(0, Math.PI), arcPath(Math.PI, Math.PI * 2)].join(' ')
  }
  const [ox, oy] = polar(from, RADIUS)
  const [ox2, oy2] = polar(to, RADIUS)
  const [ix, iy] = polar(to, INNER_RADIUS)
  const [ix2, iy2] = polar(from, INNER_RADIUS)
  const large = to - from > Math.PI ? 1 : 0
  return `M ${ox} ${oy} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${ox2} ${oy2}`
    + ` L ${ix} ${iy} A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${large} 0 ${ix2} ${iy2} Z`
}

/**
 * Share of a whole, as a donut plus a legend.
 *
 * `entries` are `{ name, value }` in the order they should be drawn; anything
 * past `topN` collapses into one `Other` slice so a long tail cannot shred the
 * ring into unreadable slivers. `hideCounts` keeps the `general` role on
 * percentages, the same rule the ranking panels follow.
 *
 * The hole stays empty on purpose: the legend already names every slice with
 * its share, so anything written in the middle is either a repeat or — as a
 * slice count captioned "payers" was — an outright wrong reading.
 */
export default function Sample4PieChart({
  entries,
  topN = DEFAULT_TOP_N,
  hideCounts = false,
}) {
  const [hover, setHover] = useState(null)

  const positive = entries.filter((entry) => entry.value > 0)
  const total = positive.reduce((sum, entry) => sum + entry.value, 0)
  if (total <= 0) {
    return <p className="sample4-note">No data in this range.</p>
  }

  const head = positive.slice(0, topN)
  const tail = positive.slice(topN)
  const slices = tail.length > 0
    ? [...head, { name: OTHER_LABEL, value: tail.reduce((sum, e) => sum + e.value, 0) }]
    : head

  let angle = 0
  const drawn = slices.map((slice, index) => {
    const start = angle
    angle += (slice.value / total) * Math.PI * 2
    return {
      ...slice,
      path: arcPath(start, angle),
      color: slice.name === OTHER_LABEL && tail.length > 0
        ? OTHER_COLOR
        : SLICE_COLORS[index % SLICE_COLORS.length],
      sharePct: (slice.value / total) * 100,
    }
  })

  return (
    <div className="sample4-pie">
      <div className="sample4-pie-ring">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img">
          {drawn.map((slice, index) => (
            <path
              key={slice.name}
              d={slice.path}
              fill={slice.color}
              opacity={hover === null || hover === index ? 1 : 0.45}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      <ul className="sample4-pie-legend">
        {drawn.map((slice, index) => (
          <li
            key={slice.name}
            className={hover !== null && hover !== index ? 'dim' : undefined}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <i style={{ background: slice.color }} />
            <span className="sample4-pie-name" title={slice.name}>{slice.name}</span>
            <span className="sample4-pie-value">
              {slice.sharePct.toFixed(1)}%
              {!hideCounts && <small>{formatCount(slice.value)}</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
