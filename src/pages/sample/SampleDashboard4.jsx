import { useState } from 'react'
import { useSample4Data, formatCount, formatPct } from './sample4Data'
import Sample4LineChart from './Sample4LineChart'
import './SampleDashboard4.css'

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'retention', label: 'Retention' },
  { id: 'analytics', label: 'User Analytics' },
  { id: 'pollData', label: 'User Poll Data' },
  { id: 'topUsers', label: 'Top Users' },
  { id: 'paid', label: 'Paid' },
  { id: 'userQueries', label: 'User Queries' },
  { id: 'utmTracking', label: 'UTM Tracking' },
]

function Bars({ bars }) {
  const max = Math.max(1, ...bars.map((b) => b.value))

  return (
    <div className="sample4-bars">
      {bars.map((bar) => (
        <div key={bar.label} className="sample4-bar" title={bar.caption}>
          <em>{bar.display}</em>
          <span style={{ height: `${Math.max(4, (bar.value / max) * 100)}%` }} />
          <small>{bar.label}</small>
        </div>
      ))}
    </div>
  )
}

function Ranking({ entries, total }) {
  if (entries.length === 0) {
    return <p className="sample4-note">No data in this range.</p>
  }
  const max = Math.max(...entries.map((e) => e.value))

  return (
    <ul className="sample4-ranking">
      {entries.map((entry) => (
        <li key={entry.name}>
          <span className="sample4-ranking-label" title={entry.name}>{entry.name}</span>
          <span className="sample4-ranking-track">
            <i style={{ width: `${(entry.value / max) * 100}%` }} />
          </span>
          <span className="sample4-ranking-value">
            {formatCount(entry.value)}
            {total > 0 && <small>{formatPct(entry.value / total, 0)}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DataTable({ columns, rows }) {
  if (rows.length === 0) {
    return <p className="sample4-note">Nothing to show yet.</p>
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

function PanelHeading({ eyebrow, title, note }) {
  return (
    <div className="sample4-panel-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {note && <p>{note}</p>}
    </div>
  )
}

function TabView({ view, action }) {
  return (
    <>
      <section className="sample4-intro compact">
        <span>{view.eyebrow}</span>
        <h1>{view.headline}</h1>
        {view.description && <p>{view.description}</p>}
        {action}
      </section>

      {view.metrics.length > 0 && (
        <section className="sample4-metrics">
          {view.metrics.map((metric) => (
            <article key={metric.label} className="sample4-metric">
              <span>{metric.label}</span>
              <strong title={metric.value}>{metric.value}</strong>
              <p>{metric.note}</p>
            </article>
          ))}
        </section>
      )}

      {view.empty && <div className="sample4-state">{view.empty}</div>}

      {(view.chart || view.bars) && (
        <section className="sample4-grid">
          {view.chart && (
            <article className="sample4-panel sample4-wide">
              <PanelHeading eyebrow={view.chart.eyebrow} title={view.chart.title} note={view.chart.note} />
              <Sample4LineChart
                labels={view.chart.labels}
                tooltips={view.chart.tooltips}
                series={view.chart.series}
                format={view.chart.format}
              />
            </article>
          )}
          {view.bars && (
            <article className="sample4-panel">
              <PanelHeading eyebrow={view.bars.eyebrow} title={view.bars.title} />
              <Bars bars={view.bars.bars} />
              {view.bars.callout && (
                <div className="sample4-callout">
                  <strong>{view.bars.callout.value}</strong>
                  <span>{view.bars.callout.label}</span>
                </div>
              )}
            </article>
          )}
        </section>
      )}

      {view.rankings && (
        <section className="sample4-grid sample4-even">
          {view.rankings.map((ranking) => (
            <article key={ranking.title} className="sample4-panel">
              <PanelHeading eyebrow={ranking.eyebrow} title={ranking.title} />
              <Ranking entries={ranking.entries} total={ranking.total} />
            </article>
          ))}
        </section>
      )}

      {view.table && (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading eyebrow={view.table.eyebrow} title={view.table.title} />
            <DataTable columns={view.table.columns} rows={view.table.rows} />
          </article>
        </section>
      )}
    </>
  )
}

export default function SampleDashboard4() {
  const [activeTab, setActiveTab] = useState('general')
  const { loading, error, views, userQueries } = useSample4Data()

  const renderBody = () => {
    if (loading) {
      return <div className="sample4-state">Loading live dashboard data…</div>
    }

    if (error || !views) {
      return (
        <div className="sample4-state error">
          <strong>Could not load dashboard data</strong>
          <p>{error ?? 'No data returned.'}</p>
          <p>Check that the API is reachable and <code>VITE_ADMIN_API_KEY</code> is set in <code>.env</code>.</p>
        </div>
      )
    }

    if (activeTab === 'userQueries') {
      return (
        <TabView
          view={userQueries.view}
          action={
            <button
              type="button"
              className="sample4-action"
              onClick={userQueries.load}
              disabled={userQueries.loading}
            >
              {userQueries.loading ? 'Loading…' : userQueries.loaded ? 'Reload queries' : 'Load queries'}
            </button>
          }
        />
      )
    }

    return <TabView view={views[activeTab]} />
  }

  return (
    <div className="sample4-page">
      <nav className="sample4-tabs" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="sample4-shell">{renderBody()}</main>
    </div>
  )
}
