// View switch (half hour / day) and the call site × model × route filters.

import { Segmented } from '../../components/ui'
import { ALL } from './healthMeta'

const VIEWS = [
  { value: 'halfHour', label: '半小时（近 24 小时）' },
  { value: 'day', label: '天（近 30 天）' },
]

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="mh-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL}>全部</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

export function HealthToolbar({ view, onView, filters, options, onFilter, onReset }) {
  const filtered = Object.values(filters).some((v) => v !== ALL)
  return (
    <div className="mh-toolbar">
      <Segmented value={view} options={VIEWS} onChange={onView} />
      <div className="mh-filters">
        <FilterSelect label="调用点" value={filters.callSite} options={options.callSite} onChange={(v) => onFilter('callSite', v)} />
        <FilterSelect label="模型" value={filters.model} options={options.model} onChange={(v) => onFilter('model', v)} />
        <FilterSelect label="线路" value={filters.route} options={options.route} onChange={(v) => onFilter('route', v)} />
        {filtered && (
          <button type="button" className="sample4-mini-btn" onClick={onReset}>
            看全部
          </button>
        )}
      </div>
    </div>
  )
}
