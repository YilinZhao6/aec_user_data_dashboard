// Standalone /models page — lecture model health.
//
// MOCK: every number comes from ./mockModelHealth, nothing calls the API.
// It is here to agree on the layout before any backend fields are added; the
// real page would read one aggregate endpoint over agent_trace_log (SQL only,
// no model calls) plus the hourly judge scores.

import { useMemo, useState } from 'react'
import { PageShell } from '../../components/PageShell'
import { InfoTip, Metrics, Modal, PanelHeading, Segmented } from '../../components/ui'
import DashboardLineChart from '../dashboard/DashboardLineChart'
import {
  BUCKET_MINUTES,
  CALL_SITES,
  MODELS,
  TTFT_TARGET_MS,
  buildModelHealth,
  gradeBucket,
  healthScore,
  summarize,
} from './mockModelHealth'
import './ModelHealthPage.css'

const WINDOWS = [
  { value: 2, label: '1h' },
  { value: 12, label: '6h' },
  { value: 48, label: '24h' },
]

const CHART_METRICS = [
  { value: 'ttftP90', label: 'First token p90', format: 'count', unit: 'ms' },
  { value: 'unavailableRate', label: 'Unavailable', format: 'percent' },
  { value: 'fallbackRate', label: 'Fallback', format: 'percent' },
  { value: 'failureRate', label: 'Failed', format: 'percent' },
]

const GRADE_LABEL = { green: 'Healthy', yellow: 'Watch', red: 'Degraded', gray: 'No data' }

const pct = (x, digits = 1) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`)
const secs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`)
const score5 = (q) => (q == null ? '—' : q.toFixed(1))
const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const shortModel = (id) => MODELS.find((m) => m.id === id)?.label ?? id

function gradeOfSummary(s) {
  return gradeBucket({ ...s, source: 'live' })
}

function Light({ grade, children }) {
  return (
    <span className={`mh-light mh-${grade}`}>
      <i />
      {children ?? GRADE_LABEL[grade]}
    </span>
  )
}

export default function ModelHealthPage() {
  const [seed, setSeed] = useState(7)
  const [windowSize, setWindowSize] = useState(12)
  const [chartMetric, setChartMetric] = useState('ttftP90')
  const [selected, setSelected] = useState(null) // { row, bucket }

  const data = useMemo(() => buildModelHealth(seed), [seed])
  const lecture = CALL_SITES.find((c) => c.primary)

  // Per-model summary over the chosen window, live traffic only.
  const summaries = useMemo(
    () =>
      MODELS.map((model) => {
        const live = data.rows.find((r) => r.model.id === model.id && r.source === 'live')
        const probe = data.rows.find((r) => r.model.id === model.id && r.source === 'probe')
        const recent = (row) => row.buckets.slice(-windowSize)
        return {
          model,
          live: summarize(recent(live)),
          probe: summarize(recent(probe)),
          lastProbe: probe.buckets.at(-1),
        }
      }),
    [data, windowSize],
  )

  const serving = summaries.find((s) => s.model.id === lecture.model)

  const chart = useMemo(() => {
    const metric = CHART_METRICS.find((m) => m.value === chartMetric)
    const labels = data.starts.map(clock)
    // Live traffic where the model has some, the probe otherwise — so the line
    // never drops to zero just because lectures are on the other model.
    const series = MODELS.map((model, i) => {
      const live = data.rows.find((r) => r.model.id === model.id && r.source === 'live')
      const probe = data.rows.find((r) => r.model.id === model.id && r.source === 'probe')
      return {
        label: model.label,
        variant: i === 0 ? 'main' : 'muted',
        values: live.buckets.map((b, k) => {
          const src = b.n >= 5 ? b : probe.buckets[k]
          const v = src[chartMetric] ?? 0
          return metric.format === 'percent' ? v * 100 : v
        }),
      }
    })
    const notes = data.starts.map((_, k) =>
      MODELS.map((model) => {
        const live = data.rows.find((r) => r.model.id === model.id && r.source === 'live').buckets[k]
        return `${model.label}: ${live.n >= 5 ? `${live.n} live requests` : 'probe only'}`
      }).join(' · '),
    )
    return { metric, labels, series, notes }
  }, [data, chartMetric])

  return (
    <PageShell active="/models">
      <div className="mh-mock-banner" role="note">
        <strong>Mock</strong>
        Simulated data, nothing is read from the backend yet. This is the layout to agree on before adding
        trace fields.
        <button type="button" className="sample4-mini-btn" onClick={() => setSeed((s) => s + 1)}>
          Shuffle data
        </button>
      </div>

      {/* 1 — What is serving lectures right now */}
      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="Now serving"
            title={
              <span className="mh-title-row">
                Lectures are on {shortModel(lecture.model)}
                <Light grade={gradeOfSummary(serving.live)} />
              </span>
            }
            actions={
              <span className="mh-muted">
                {lecture.env}={lecture.model} · switched {lecture.switchedAgo} · code default{' '}
                {shortModel(lecture.codeDefault)}
              </span>
            }
          />
          <div className="mh-callsites">
            {CALL_SITES.map((site) => (
              <div key={site.id} className={site.primary ? 'mh-callsite primary' : 'mh-callsite'}>
                <span>{site.label}</span>
                <strong>{site.model}</strong>
                <code>{site.env}</code>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* 2 — Side-by-side model cards */}
      <section className="sample4-grid sample4-even">
        {summaries.map(({ model, live, probe, lastProbe }) => {
          const isServing = model.id === lecture.model
          const s = live.n >= 5 ? live : probe
          const grade = live.n >= 5 ? gradeOfSummary(live) : gradeBucket(lastProbe)
          return (
            <article key={model.id} className={`sample4-panel mh-model-card mh-edge-${grade}`}>
              <PanelHeading
                eyebrow={isServing ? 'Serving lectures' : 'Standby'}
                title={
                  <span className="mh-title-row">
                    {model.label}
                    <Light grade={grade} />
                  </span>
                }
                actions={
                  <div className="mh-score">
                    <strong>{s.score ?? '—'}</strong>
                    <span>health</span>
                  </div>
                }
              />
              <dl className="mh-stats">
                <div>
                  <dt>Unavailable</dt>
                  <dd>{pct(s.unavailableRate)}</dd>
                </div>
                <div>
                  <dt>Fallback</dt>
                  <dd>
                    {pct(s.fallbackRate)}
                    {s.fallback > 0 && <small>{pct(s.rescueRate, 0)} rescued</small>}
                  </dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{pct(s.failureRate)}</dd>
                </div>
                <div>
                  <dt>First token p90</dt>
                  <dd>{secs(s.ttftP90)}</dd>
                </div>
                <div>
                  <dt>≤ {TTFT_TARGET_MS / 1000} s</dt>
                  <dd>{pct(s.ttftOkRate, 0)}</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>{score5(s.quality)}<small>/ 5</small></dd>
                </div>
              </dl>
              <p className="mh-muted">
                {live.n >= 5
                  ? `${live.n.toLocaleString()} live requests in the last ${windowSize * BUCKET_MINUTES >= 60 ? `${(windowSize * BUCKET_MINUTES) / 60}h` : `${windowSize * BUCKET_MINUTES}m`}`
                  : `No live traffic — showing scheduled probes (last probe ${clock(lastProbe.start)}, first token ${secs(lastProbe.ttftP50)})`}
              </p>
            </article>
          )
        })}
      </section>

      {/* 3 — 24h grid, 30-minute cells, click for detail */}
      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="Last 24 hours"
            title="Status every 30 minutes"
            actions={
              <div className="sample4-heading-actions">
                <span className="mh-muted">Window for the cards above</span>
                <Segmented value={windowSize} options={WINDOWS} onChange={setWindowSize} />
                <InfoTip>
                  <FormulaNotes />
                </InfoTip>
              </div>
            }
          />
          <div className="mh-heatmap" role="grid">
            {data.rows.map((row) => (
              <div key={`${row.model.id}-${row.source}`} className="mh-heat-row" role="row">
                <div className="mh-heat-label">
                  <strong>{row.model.label}</strong>
                  <span>{row.source === 'live' ? 'live traffic' : 'probe'}</span>
                </div>
                <div className="mh-heat-cells">
                  {row.buckets.map((b) => {
                    const grade = gradeBucket(b)
                    return (
                      <button
                        key={b.index}
                        type="button"
                        role="gridcell"
                        className={`mh-cell mh-${grade}`}
                        title={`${clock(b.start)} · ${GRADE_LABEL[grade]} · ${b.n} req`}
                        onClick={() => setSelected({ row, bucket: b })}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="mh-heat-row mh-heat-axis" aria-hidden="true">
              <div className="mh-heat-label" />
              <div className="mh-heat-cells">
                {data.starts.map((d, i) => (
                  <span key={i}>{i % 8 === 0 ? clock(d) : ''}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="mh-legend">
            {Object.entries(GRADE_LABEL).map(([grade, label]) => (
              <Light key={grade} grade={grade}>{label}</Light>
            ))}
            <span className="mh-muted">Click any cell for the numbers and the failing requests behind it.</span>
          </div>
        </article>
      </section>

      {/* 4 — Trend */}
      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="Trend"
            title={chart.metric.label}
            actions={<Segmented value={chartMetric} options={CHART_METRICS} onChange={setChartMetric} />}
          />
          <DashboardLineChart
            labels={chart.labels}
            notes={chart.notes}
            series={chart.series}
            format={chart.metric.format}
            referenceLines={chartMetric === 'ttftP90' ? [{ value: TTFT_TARGET_MS, label: '5 s target' }] : []}
            height={240}
          />
        </article>
      </section>

      {/* 5 — Quality */}
      <section className="sample4-grid sample4-even">
        <article className="sample4-panel">
          <PanelHeading
            eyebrow="Quality · hourly sample"
            title="Judge scores"
            actions={
              <span className="mh-muted">
                Local Claude Code judge · last run {clock(data.judgeLastRun)}
              </span>
            }
          />
          <p className="mh-muted mh-gap">
            10 lectures sampled per hour, scored 1–5 on correctness, board matches narration, clarity and pacing.
            Runs on the subscription, not the API. If it stops running, this panel goes gray and the health score
            falls back to stability + speed.
          </p>
          <dl className="mh-stats mh-stats-2">
            {summaries.map(({ model }) => {
              const live = data.rows.find((r) => r.model.id === model.id && r.source === 'live')
              const day = summarize(live.buckets)
              return (
                <div key={model.id}>
                  <dt>{model.label} · 24h</dt>
                  <dd>
                    {score5(day.quality)}
                    <small>/ 5</small>
                  </dd>
                </div>
              )
            })}
          </dl>
        </article>

        <article className="sample4-panel">
          <PanelHeading
            eyebrow="Quality · daily golden set"
            title="Same questions, both models"
            actions={<span className="mh-muted">Ran {data.goldenSet.ranAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          />
          <div className="sample4-table-wrap">
          <table className="sample4-table mh-golden">
            <thead>
              <tr>
                <th>Model</th>
                <th>Score</th>
                <th>Board correct</th>
                <th>Head-to-head</th>
                <th>First token</th>
                <th>Cost / lecture</th>
              </tr>
            </thead>
            <tbody>
              {data.goldenSet.results.map((r) => (
                <tr key={r.model.id}>
                  <td>{r.model.label}</td>
                  <td>{r.score.toFixed(1)}</td>
                  <td>{r.drewCorrectly} / {data.goldenSet.items}</td>
                  <td>{r.wins} wins</td>
                  <td>{secs(r.ttftP50)}</td>
                  <td>${r.costPerItem.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </article>
      </section>

      {selected && <BucketDetail selected={selected} onClose={() => setSelected(null)} />}
    </PageShell>
  )
}

function BucketDetail({ selected, onClose }) {
  const { row, bucket: b } = selected
  const grade = gradeBucket(b)
  const end = new Date(b.start.getTime() + BUCKET_MINUTES * 60_000)
  const score = healthScore(b)

  return (
    <Modal
      eyebrow={`${row.model.label} · ${row.source === 'live' ? 'live traffic' : 'probe'}`}
      title={
        <span className="mh-title-row">
          {clock(b.start)}–{clock(end)}
          <Light grade={grade} />
        </span>
      }
      onClose={onClose}
      className="mh-modal"
    >
      {b.n === 0 ? (
        <p className="sample4-note">No requests in this half hour — lectures were on the other model.</p>
      ) : (
        <>
          <Metrics
            items={[
              { label: 'Requests', value: b.n.toLocaleString(), note: `${b.stopped} stopped by the learner (not failures)` },
              { label: 'Unavailable', value: pct(b.unavailableRate), note: `${b.capacity} capacity errors on the first try` },
              { label: 'Fallback', value: pct(b.fallbackRate), note: b.fallback ? `${b.fallbackOk} / ${b.fallback} rescued by Vertex` : 'Not needed' },
              { label: 'Failed', value: pct(b.failureRate), note: `${b.errors} error${b.errors === 1 ? '' : 's'} · ${b.empty} empty` },
              { label: 'First token', value: secs(b.ttftP90), note: `p90 · p50 ${secs(b.ttftP50)} · ${pct(b.ttftOkRate, 0)} within ${TTFT_TARGET_MS / 1000} s` },
              { label: 'Health', value: score ?? '—', note: b.quality != null ? `Quality ${score5(b.quality)} / 5` : 'No judge sample this bucket' },
            ]}
          />

          <h3 className="mh-h3">Failed requests</h3>
          {b.failures.length === 0 ? (
            <p className="sample4-note">None.</p>
          ) : (
            <div className="sample4-table-wrap">
              <table className="sample4-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Route</th>
                    <th>Type</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {b.failures.slice(0, 12).map((f, i) => (
                    <tr key={i}>
                      <td>{f.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td>{f.user}</td>
                      <td>{f.route}</td>
                      <td><span className={`mh-type mh-type-${f.type}`}>{f.type}</span></td>
                      <td className="mh-error">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {b.judged.length > 0 && (
            <>
              <h3 className="mh-h3">Judge notes</h3>
              <ul className="mh-judged">
                {b.judged.map((j, i) => (
                  <li key={i}>
                    <b>{j.score.toFixed(1)}</b>
                    <span>{j.note}</span>
                    <em>{j.user}</em>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function FormulaNotes() {
  return (
    <div className="mh-formulas">
      <p><b>Requests</b> N = ok rows ÷ sample rate + error + empty. Stalled rows are extra watchdog rows, not counted.</p>
      <p><b>Unavailable</b> = first-try capacity errors (503 / 429 / high demand) ÷ N, including ones the fallback rescued.</p>
      <p><b>Fallback</b> = requests sent on the second route ÷ N.</p>
      <p><b>Failed</b> = (error + empty) ÷ N. A learner pressing Stop is not a failure.</p>
      <p><b>First token</b> p90 of ttft on successful requests; “≤ 5 s” counts failures as misses.</p>
      <p><b>Health</b> 40 stability + 30 speed + 30 quality, out of 100; without a judge score the first two are scaled up.</p>
      <p><b>Red</b> failed &gt; 5%, ≤ 5 s &lt; 80% or unavailable &gt; 20%. <b>Yellow</b> failed &gt; 2%, ≤ 5 s &lt; 90% or fallback &gt; 10%. A failure rate only counts with at least 2 failures. Gray: fewer than 5 requests.</p>
      <p><b>Probe</b> one small request per model every 30 min: red if it fails, yellow if it needed the fallback or took over 5 s.</p>
    </div>
  )
}
