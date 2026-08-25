// Geometry shared by the dashboard's charts, so a line chart and a bar chart
// of the same buckets line up pixel for pixel instead of drifting apart the
// first time one of them grows a wider axis.
//
// Deliberately dependency-free for the same reason Sample4LineChart avoids
// `./sample4Data`: these helpers are imported by the standalone page chunks.

import { useLayoutEffect, useRef, useState } from 'react'

export const PAD = { top: 18, right: 16, bottom: 38, left: 46 }

const MAX_X_LABELS = 8

/** Round the axis up to a readable maximum and return evenly spaced ticks. */
export function axisTicks(max, format, targetIntervals = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  if (format === 'count') {
    const top = Math.max(1, Math.ceil(max))
    if (top <= 5) return { top, ticks: Array.from({ length: top + 1 }, (_, index) => index) }
  }

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
export function labelledIndices(count) {
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

export function useMeasuredWidth() {
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
 * Which side of the hovered point the tooltip hangs off.
 *
 * Anchoring by the side that faces the middle of the chart means its width
 * never has to be guessed, so a long readout grows inwards instead of off
 * the panel.
 */
export const tooltipSideAt = (index, count) => (index > (count - 1) / 2 ? 'right' : 'left')
