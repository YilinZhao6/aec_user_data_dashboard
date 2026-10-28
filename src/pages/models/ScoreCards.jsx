// The overall score and the three category cards (速度 / 可用性 / 兜底).
// Clicking a card opens its breakdown underneath (CategoryDetail).

import { CATEGORIES } from './healthScoring'
import { formatValue } from './healthFormat'
import { Light } from './HealthBits'

// The two or three numbers each card shows on its face.
const FACE = {
  speed: ['ttftP50', 'ttftP90', 'totalRatio'],
  availability: ['finalSuccess', 'rawErrorRate', 'probeSuccess'],
  fallback: ['fbVertexRate', 'fbPriorityRate', 'rescueRate'],
}

const SHORT = {
  ttftP50: '首 token p50',
  ttftP90: '首 token p90',
  totalRatio: '总耗时 / 基线',
  finalSuccess: '最终成功率',
  rawErrorRate: '原始错误率',
  probeSuccess: '主动探测',
  fbVertexRate: '→ Vertex',
  fbPriorityRate: '→ Priority 档',
  rescueRate: '救回率',
}

function Card({ id, label, score, grade, lines, hardNote, open, onToggle }) {
  return (
    <button
      type="button"
      className={`mh-card mh-edge-${grade}${open ? ' open' : ''}`}
      aria-expanded={open}
      aria-controls="mh-detail"
      onClick={() => onToggle(id)}
    >
      <span className="mh-card-head">
        <span className="mh-card-label">{label}</span>
        <Light grade={grade} />
      </span>
      <strong className={`mh-card-score mh-text-${grade}`}>
        {score ?? '—'}
        <small>/ 100</small>
      </strong>
      {hardNote && <span className="mh-card-hard">{hardNote}</span>}
      <span className="mh-card-lines">
        {lines.map((line) => (
          <span key={line.label} className="mh-card-line">
            <i className={`mh-dot mh-${line.grade}`} />
            <span>{line.label}</span>
            <b>{line.value}</b>
          </span>
        ))}
      </span>
      <span className="mh-card-more">{open ? '收起细项 ▴' : '展开细项 ▾'}</span>
    </button>
  )
}

export function ScoreCards({ bucket, open, onToggle }) {
  const { categories, overall, metrics } = bucket

  const overallLines = CATEGORIES.map((c) => ({
    label: c.label,
    value: categories[c.id].score ?? '—',
    grade: categories[c.id].grade,
  }))
  const overallHard = CATEGORIES.filter((c) => categories[c.id].hard.length)

  return (
    <section className="mh-cards">
      <Card
        id="overall"
        label="总健康分"
        score={overall.score}
        grade={overall.grade}
        lines={overallLines}
        hardNote={overallHard.length ? `${overallHard.map((c) => c.label).join('、')}触发一票变红` : null}
        open={open === 'overall'}
        onToggle={onToggle}
      />
      {CATEGORIES.map((c) => {
        const cat = categories[c.id]
        const lines = FACE[c.id].map((metricId) => {
          const item = cat.items.find((i) => i.def.id === metricId)
          let value = formatValue(item.def.unit, item.value)
          if (metricId === 'probeSuccess' && metrics.probe) value = `${metrics.probe.ok}/${metrics.probe.calls} 次正常`
          return { label: SHORT[metricId], value, grade: item.grade }
        })
        return (
          <Card
            key={c.id}
            id={c.id}
            label={c.label}
            score={cat.score}
            grade={cat.grade}
            lines={lines}
            hardNote={cat.hard.length ? `一票变红：${cat.hard.map((i) => i.def.label).join('、')}` : null}
            open={open === c.id}
            onToggle={onToggle}
          />
        )
      })}
    </section>
  )
}
