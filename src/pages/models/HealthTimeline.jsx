// Colour strips over time: the overall score and the three categories, each
// expandable into one strip per item.
//
// Selecting time: click a cell to select it alone; Cmd / Ctrl / Shift-click
// to add or remove a cell; press and drag across cells for a range (with a
// modifier held, the range is added). Pointer events, so touch drags work too
// (the strips allow vertical page scrolling, horizontal moves select).
// `selection` is a Set of bucket indices; onSelect gets the new sorted array.

import { useRef, useState } from 'react'
import { CATEGORIES, METRICS } from './healthScoring'
import { axisLabel, bucketLabel, formatValue, GRADE_LABEL } from './healthFormat'
import { Light } from './HealthBits'

const range = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i)
const sorted = (set) => [...set].sort((a, b) => a - b)

/** The bucket index of the cell under a pointer, or null. */
function cellIndexAt(x, y) {
  const el = document.elementFromPoint(x, y)
  const raw = el?.closest?.('[data-bucket]')?.getAttribute('data-bucket')
  return raw == null ? null : Number(raw)
}

/** Pointer handling shared by every strip: click, modifier-click, drag. */
function useCellSelection(selection, onSelect) {
  const drag = useRef(null)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    const index = cellIndexAt(e.clientX, e.clientY)
    if (index == null) return
    const additive = e.metaKey || e.ctrlKey || e.shiftKey
    drag.current = { anchor: index, current: index, additive, base: new Set(selection), moved: false, id: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const index = cellIndexAt(e.clientX, e.clientY)
    if (index == null || index === d.current) return
    d.current = index
    d.moved = true
    const span = range(d.anchor, index)
    onSelect(sorted(d.additive ? new Set([...d.base, ...span]) : new Set(span)))
  }

  const onPointerUp = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved) return
    if (d.additive) {
      const next = new Set(d.base)
      if (next.has(d.anchor)) next.delete(d.anchor)
      else next.add(d.anchor)
      onSelect(sorted(next))
    } else {
      onSelect([d.anchor])
    }
  }

  const onPointerCancel = () => {
    drag.current = null
  }

  // Keyboard (Enter / Space on a focused cell) arrives as a click with no pointer.
  const onKeyClick = (e, index) => {
    if (e.detail !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      const next = new Set(selection)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      onSelect(sorted(next))
    } else {
      onSelect([index])
    }
  }

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, onKeyClick }
}

function Strip({ timeline, view, selection, pointer, cell }) {
  const last = timeline.length - 1
  return (
    <div className="mh-strip mh-selectable" style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }} {...pointer.handlers}>
      {timeline.map((b) => {
        const { grade, text } = cell(b)
        return (
          <button
            key={b.index}
            type="button"
            data-bucket={b.index}
            className={`mh-cell mh-${grade}${selection.has(b.index) ? ' selected' : ''}`}
            title={`${bucketLabel(view, b.start, b.index === last)} · ${text}`}
            aria-label={`${bucketLabel(view, b.start, b.index === last)} ${text}`}
            aria-pressed={selection.has(b.index)}
            onClick={(e) => pointer.onKeyClick(e, b.index)}
          />
        )
      })}
    </div>
  )
}

export function HealthTimeline({ timeline, view, selection, onSelect, onClear }) {
  const pointer = useCellSelection(selection, onSelect)
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const tickEvery = view.id === 'day' ? 5 : 8
  const stripProps = { timeline, view, selection, pointer }

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
        <span className="mh-muted">
          点一格只看这一格；按住 ⌘ / Ctrl / Shift 点可以多选或取消；按住拖动选一段时间。上面的分数和下面的表都按选中的格子合起来算。点 ▸ 展开看每个细项。
        </span>
        {onClear && (
          <button type="button" className="sample4-mini-btn" onClick={onClear}>
            清除选择
          </button>
        )}
      </div>
    </div>
  )
}
