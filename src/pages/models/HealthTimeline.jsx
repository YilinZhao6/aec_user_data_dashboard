// Colour strips over time: the overall score and the three categories, each
// expandable into one strip per item. Clicking a cell selects that bucket.

import { useState } from 'react'
import { CATEGORIES, METRICS } from './healthScoring'
import { axisLabel, bucketLabel, formatValue, GRADE_LABEL } from './healthFormat'
import { Light } from './HealthBits'

function Strip({ timeline, view, selected, onSelect, cell }) {
  const last = timeline.length - 1
  return (
    <div className="mh-strip" style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}>
      {timeline.map((b) => {
        const { grade, text } = cell(b)
        return (
          <button
            key={b.index}
            type="button"
            className={`mh-cell mh-${grade}${b.index === selected ? ' selected' : ''}`}
            title={`${bucketLabel(view, b.start, b.index === last)} · ${text}`}
            aria-label={`${bucketLabel(view, b.start, b.index === last)} ${text}`}
            onClick={() => onSelect(b.index)}
          />
        )
      })}
    </div>
  )
}

export function HealthTimeline({ timeline, view, selected, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const tickEvery = view.id === 'day' ? 5 : 8
  const stripProps = { timeline, view, selected, onSelect }

  return (
    <div className="mh-timeline">
      <div className="mh-tl-row mh-tl-main">
        <span className="mh-tl-label"><b>总健康分</b></span>
        <Strip {...stripProps} cell={(b) => ({ grade: b.overall.grade, text: `总健康分 ${b.overall.score ?? '—'}` })} />
      </div>

      {CATEGORIES.map((c) => {
        const open = expanded.has(c.id)
        return (
          <div key={c.id} className="mh-tl-group">
            <div className="mh-tl-row">
              <button type="button" className="mh-tl-label mh-tl-toggle" aria-expanded={open} onClick={() => toggle(c.id)}>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                <b>{c.label}</b>
              </button>
              <Strip
                {...stripProps}
                cell={(b) => ({ grade: b.categories[c.id].grade, text: `${c.label} ${b.categories[c.id].score ?? '—'} 分` })}
              />
            </div>
            {open &&
              METRICS.filter((m) => m.category === c.id).map((def) => (
                <div key={def.id} className="mh-tl-row mh-tl-sub">
                  <span className="mh-tl-label" title={def.help}>{def.label}</span>
                  <Strip
                    {...stripProps}
                    cell={(b) => {
                      const item = b.categories[c.id].items.find((i) => i.def.id === def.id)
                      return { grade: item.grade, text: `${def.label} ${formatValue(def.unit, item.value)}（${GRADE_LABEL[item.grade]}）` }
                    }}
                  />
                </div>
              ))}
          </div>
        )
      })}

      <div className="mh-tl-row mh-tl-axis" aria-hidden="true">
        <span className="mh-tl-label" />
        <div className="mh-strip" style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}>
          {timeline.map((b) => (
            <span key={b.index}>{b.index % tickEvery === 0 ? axisLabel(view, b.start) : ''}</span>
          ))}
        </div>
      </div>

      <div className="mh-legend">
        {Object.entries(GRADE_LABEL).map(([grade, label]) => (
          <Light key={grade} grade={grade}>{label}</Light>
        ))}
        <span className="mh-muted">点一格，上面的分数就换成那一格的；点 ▸ 展开看每个细项。</span>
      </div>
    </div>
  )
}
