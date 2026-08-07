// Display formatters shared across pages.
//
// Separate from ui.jsx so that file only exports components — mixing the two
// breaks React Fast Refresh (react-refresh/only-export-components).

import { BROWSER_OFFSET_MS } from '../pages/dashboardEntry/dashboardUtils'

export const formatCount = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '—')

export const formatDateTime = (iso, tzOffsetMs = BROWSER_OFFSET_MS) => {
  if (!iso) return '—'
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return '—'
  const d = new Date(time + tzOffsetMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}
