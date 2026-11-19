// The time range: the last 24 hours (half-hour cells) or the last 30 days
// (day cells). The page shows learners' (prod) traffic only.

import { Segmented } from '../../components/ui'

const VIEWS = [
  { value: 'halfHour', label: '近 24 小时' },
  { value: 'day', label: '近 30 天' },
]

export function HealthToolbar({ view, onView }) {
  return (
    <div className="mh-toolbar">
      <Segmented value={view} options={VIEWS} onChange={onView} />
    </div>
  )
}
