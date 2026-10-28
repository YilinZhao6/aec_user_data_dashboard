// Display helpers for the model-health page (text only, no React).

export const GRADE_LABEL = { green: '正常', yellow: '注意', red: '异常', gray: '数据不足' }

export function formatValue(unit, value) {
  if (value == null) return '—'
  switch (unit) {
    case 'ms':
      return `${(value / 1000).toFixed(1)} 秒`
    case 'pct': {
      const p = value * 100
      return `${p >= 99.95 || p === 0 ? p.toFixed(0) : p.toFixed(1)}%`
    }
    case 'x':
      return `${value.toFixed(1)} 倍`
    case 'per100':
      return value.toFixed(1)
    default:
      return String(value)
  }
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
