// Display helpers for the model-health page (text only, no React).

export const GRADE_LABEL = { green: '正常', yellow: '注意', red: '异常', gray: '数据不足' }

export function formatValue(unit, value) {
  if (value == null) return '—'
  switch (unit) {
    case 'ms':
      return `${(value / 1000).toFixed(1)} 秒`
    case 'pct':
      return formatRate(value)
    case 'x':
      return `${value.toFixed(1)} 倍`
    case 'per100':
      return value.toFixed(1)
    default:
      return String(value)
  }
}

/**
 * A rare-event rate (fallbacks, final failures): small values keep two
 * decimals so 30 in 104,745 reads 0.03%, not 0.0%; nonzero below 0.01% says so.
 */
export function formatRate(value) {
  if (value == null) return '—'
  const p = value * 100
  if (p === 0) return '0%'
  if (p < 0.01) return '<0.01%'
  if (p < 1) return `${p.toFixed(2)}%`
  return `${p >= 99.95 ? p.toFixed(0) : p.toFixed(1)}%`
}

/** "> 8 秒" / "< 98%" — the line a metric must not cross. */
export function thresholdText(def, level) {
  const custom = level === 'yellow' ? def.yellowText : def.redText
  if (custom) return custom
  const v = def[level]
  if (v == null) return '—'
  return `${def.better === 'lower' ? '>' : '<'} ${formatValue(def.unit, v)}`
}

const pad = (n) => String(n).padStart(2, '0')
export const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const monthDay = (d) => `${d.getMonth() + 1}/${d.getDate()}`

/** Label for one bucket: "14:30–15:00" or "10/16". */
export function bucketLabel(view, start, isLast) {
  if (view.id === 'day') return isLast ? `${monthDay(start)}（今天到现在）` : monthDay(start)
  const end = new Date(start.getTime() + view.bucketMs)
  return `${clock(start)}–${clock(end)}`
}

/** Short axis tick for the timeline. */
export function axisLabel(view, start) {
  return view.id === 'day' ? monthDay(start) : clock(start)
}

/**
 * Text for a selection of buckets: runs of neighbouring buckets as ranges.
 * "11/18 14:00–17:00、11/19 02:00–03:00" (half hours) or "11/12–11/15、11/18" (days).
 */
export function selectionLabel(view, indices) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const runs = []
  for (const i of sorted) {
    const run = runs.at(-1)
    if (run && i === run[1] + 1) run[1] = i
    else runs.push([i, i])
  }
  return runs
    .map(([a, b]) => {
      const start = view.starts[a]
      if (view.id === 'day') return a === b ? monthDay(start) : `${monthDay(start)}–${monthDay(view.starts[b])}`
      const end = new Date(view.starts[b].getTime() + view.bucketMs)
      // A range that ends on another day says which ("11/18 04:30–11/19 04:30").
      const endText = end.toDateString() === start.toDateString() ? clock(end) : `${monthDay(end)} ${clock(end)}`
      return `${monthDay(start)} ${clock(start)}–${endText}`
    })
    .join('、')
}
