// Small presentational pieces shared by the model-health components.

import { formatValue, GRADE_LABEL } from './healthFormat'

/** Coloured dot + label. */
export function Light({ grade, children }) {
  return (
    <span className={`mh-light mh-${grade}`}>
      <i />
      {children ?? GRADE_LABEL[grade]}
    </span>
  )
}

/** A score as a small coloured pill — for tables. */
export function ScoreChip({ score, grade }) {
  return <span className={`mh-chip mh-${grade}`}>{score ?? '—'}</span>
}

/** "1.2 秒 / 3.4 秒" — p50 / p90 of a raw stats object's total time. */
export function TotalTime({ raw }) {
  if (raw.totalP90 == null) return <span className="mh-muted">—</span>
  return <span className="mh-nowrap">{formatValue('ms', raw.totalP50)} / {formatValue('ms', raw.totalP90)}</span>
}

/** First-token p90, or「整段返回」when the calls were answered whole (no first token). */
export function FirstToken({ raw }) {
  if (raw.wholeAnswer) return <span className="mh-muted mh-whole" title="这些调用是一次性整段返回的（不是流式），没有首 token，速度看总耗时">整段返回</span>
  return formatValue('ms', raw.ttftP90)
}

/** A "?" that explains itself on hover (title) and to screen readers. */
export function HelpMark({ text }) {
  return (
    <span className="mh-help" title={text} aria-label={text} role="img">
      ?
    </span>
  )
}
