// Small presentational pieces shared by the model-health components.

import { GRADE_LABEL } from './healthFormat'

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

/** A "?" that explains itself on hover (title) and to screen readers. */
export function HelpMark({ text }) {
  return (
    <span className="mh-help" title={text} aria-label={text} role="img">
      ?
    </span>
  )
}
