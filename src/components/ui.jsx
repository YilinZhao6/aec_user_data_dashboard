// Presentational primitives shared by every dashboard page.
//
// These were originally defined inside SampleDashboard4.jsx; they live here
// now so the standalone /feedback and /queries pages reuse them instead of
// growing their own copies. SampleDashboard4 imports them back.
//
// The `sample4-` class prefix is historical: styles/dashboard.css is the
// shared stylesheet for every page in this family, the prefix just wasn't
// worth churning.

import { createPortal } from 'react-dom'

import '../styles/dashboard.css'

export function DataTable({ columns, rows, empty = 'Nothing to show yet.' }) {
  if (rows.length === 0) {
    return <p className="sample4-note">{empty}</p>
  }

  return (
    <div className="sample4-table-wrap">
      <table className="sample4-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Placeholder blocks shown while a panel's first payload is in flight.
 *
 * They exist to hold the layout at roughly its final height: without them the
 * panel collapses to zero and the page jumps once data lands.
 */
export function SkeletonMetrics({ count = 4 }) {
  return (
    <section className="sample4-metrics" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="sample4-metric">
          <span className="sample4-skeleton sk-label" />
          <strong className="sample4-skeleton sk-value" />
          <p className="sample4-skeleton sk-note" />
        </article>
      ))}
    </section>
  )
}

/** A plain placeholder area — for panels whose real content is a chart. */
export function SkeletonBlock({ height = 220 }) {
  return <div className="sample4-skeleton" style={{ height }} aria-hidden="true" />
}

export function SkeletonTable({ columns, rows = 8 }) {
  return (
    <div className="sample4-table-wrap" aria-hidden="true">
      <table className="sample4-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, cellIndex) => (
                <td key={column}>
                  {/* Vary the widths so it reads as text, not a progress bar. */}
                  <span
                    className="sample4-skeleton sk-cell"
                    style={{ width: `${[70, 55, 88, 62, 45][cellIndex % 5]}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PanelHeading({ eyebrow, title, note, actions }) {
  return (
    <div className="sample4-panel-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {actions ?? (note && <p>{note}</p>)}
    </div>
  )
}

export function Metrics({ items }) {
  return (
    <section className="sample4-metrics">
      {items.map((metric) => (
        <article key={metric.label} className="sample4-metric">
          <span>{metric.label}</span>
          <strong title={String(metric.value)}>{metric.value}</strong>
          {metric.note && <p>{metric.note}</p>}
        </article>
      ))}
    </section>
  )
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="sample4-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function DateRange({ start, end, minDate, maxDate, onChange, onReset }) {
  return (
    <div className="sample4-inline-controls">
      <label>
        <span>From</span>
        <input type="date" value={start} min={minDate} max={end || maxDate} onChange={(e) => onChange({ start: e.target.value, end })} />
      </label>
      <label>
        <span>To</span>
        <input type="date" value={end} min={start || minDate} max={maxDate} onChange={(e) => onChange({ start, end: e.target.value })} />
      </label>
      <button type="button" onClick={onReset}>Reset</button>
    </div>
  )
}

export function ExpandButton({ open, onClick, children }) {
  return (
    <button type="button" className="sample4-mini-btn" onClick={onClick}>
      {children ?? (open ? 'Hide' : 'Show')}
    </button>
  )
}

export function Pagination({ page, totalPages, onChange, summary }) {
  if (totalPages <= 1) return null
  return (
    <div className="sample4-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span>{summary ?? `Page ${page} / ${totalPages}`}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  )
}

/**
 * Full-screen detail overlay. Click the backdrop or Close to dismiss.
 *
 * Portalled to <body> so it never inherits the styling of wherever it was
 * rendered from — e.g. `.sample4-topbar div { flex-direction: column }` was
 * stacking the contents of a modal opened from the topbar nav.
 */
export function Modal({ eyebrow, title, onClose, className, children }) {
  return createPortal(
    <div className="sample4-modal" onClick={onClose}>
      <div
        className={className ? `sample4-modal-card ${className}` : 'sample4-modal-card'}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeading
          eyebrow={eyebrow}
          title={title}
          actions={<ExpandButton onClick={onClose}>Close</ExpandButton>}
        />
        {children}
      </div>
    </div>,
    document.body,
  )
}
