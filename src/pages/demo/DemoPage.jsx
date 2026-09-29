// Standalone /demo page.
//
// One User growth panel with no absolute numbers on it — no value axis, and
// the only figure is today's bucket relative to the average. Built to be
// screenshotted: it animates in on load and again whenever the range changes.
// Nothing here talks to the API.

import { useMemo, useState } from 'react'
import { PageShell } from '../../components/PageShell'
import { MenuField, PanelHeading, ToolbarMenu } from '../../components/ui'
import DemoGrowthChart from './DemoGrowthChart'
import { buildDemoSeries } from './demoSeries'
import './DemoPage.css'

// Always the trailing week: a single spike on "today" is the story, and a
// range picker on a chart with no real data behind it only invites questions.
const RANGE = '7d'

export default function DemoPage() {
  // Seed 2 happens to give the nicest 7d plateau; Shuffle walks on from it.
  const [seed, setSeed] = useState(2)
  const [take, setTake] = useState(0)

  const series = useMemo(() => buildDemoSeries(RANGE, seed), [seed])
  const replayKey = `${seed}-${take}`

  return (
    <PageShell active="/demo">
      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="User Growth"
            title={
              <>
                User growth
                <span className="demo-live"><i />Live</span>
              </>
            }
            actions={
              <div className="sample4-heading-actions">
                <ToolbarMenu>
                  <MenuField label="Animation">
                    <div className="sample4-segmented">
                      <button type="button" onClick={() => setTake((n) => n + 1)}>Replay</button>
                      <button type="button" onClick={() => setSeed((n) => n + 1)}>Shuffle curve</button>
                    </div>
                  </MenuField>
                </ToolbarMenu>
              </div>
            }
          />
          <DemoGrowthChart
            labels={series.labels}
            values={series.values}
            average={series.average}
            ratio={series.ratio}
            replayKey={replayKey}
          />
        </article>
      </section>
    </PageShell>
  )
}
