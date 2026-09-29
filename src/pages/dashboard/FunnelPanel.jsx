// Activation funnel (A0 → A4) for a signup cohort.
//
// Owns its own controls: the signup range and the window are only meaningful
// here, so they do not belong in the page's state.

import { useMemo, useState } from 'react'
import { DateRange, InlineField, PanelHeading, Segmented, SkeletonBlock } from '../../components/ui'
import { formatCount } from '../../components/format'
import { addDays, todayTzKey, toTzDateKey } from '../../utils/dashboardUtils'
import { buildFunnel } from './growthMetrics'

const WINDOWS = [
  { value: 1, label: '注册后 1 天内' },
  { value: 7, label: '注册后 7 天内' },
  { value: 'all', label: '不限时间' },
]
const DEFAULT_RANGE_DAYS = 30

const ratePct = (pct) => (pct == null ? '—' : `${pct.toFixed(1)}%`)

export default function FunnelPanel({ resource, activityIndex, tzOffsetMs, showCounts }) {
  const defaultRange = () => {
    const end = todayTzKey(tzOffsetMs)
    return { start: addDays(end, -DEFAULT_RANGE_DAYS), end }
  }
  const [range, setRange] = useState(defaultRange)
  const [windowDays, setWindowDays] = useState(7)

  const data = resource.data
  const funnel = useMemo(
    () => buildFunnel(activityIndex, data?.users, tzOffsetMs, {
      range,
      windowDays: windowDays === 'all' ? null : windowDays,
      dataStart: data?.first_generation_at,
    }),
    [activityIndex, data, tzOffsetMs, range, windowDays],
  )

  const steps = funnel.stages.slice(1)
  // The step that loses the largest share of the people who reached it.
  const weakest = steps.reduce(
    (worst, stage) => (stage.ofPreviousPct != null && (worst == null || stage.ofPreviousPct < worst.ofPreviousPct) ? stage : worst),
    null,
  )
  const activation = funnel.stages[funnel.stages.length - 1]
  const dataStartKey = data?.first_generation_at ? toTzDateKey(data.first_generation_at, tzOffsetMs) : undefined

  return (
    <section className="sample4-grid">
      <article className="sample4-panel sample4-full">
        <PanelHeading
          eyebrow="Activation funnel"
          title="激活漏斗 · A0 → A4"
          actions={(
            <div className="sample4-heading-actions">
              <DateRange
                start={range.start}
                end={range.end}
                minDate={dataStartKey}
                maxDate={todayTzKey(tzOffsetMs)}
                onChange={setRange}
                onReset={() => setRange(defaultRange())}
              />
              <InlineField label="Window">
                <Segmented value={windowDays} onChange={setWindowDays} options={WINDOWS} />
              </InlineField>
            </div>
          )}
        />
        <p className="sample4-note">
          日期范围内注册的这批人，各走到了哪一步。<strong>占注册</strong>回答「100 个注册的人里有几个做到了」，
          <strong>步骤转化</strong>回答「人主要是在哪一步流失的」。A4（完成一节讲解）是激活点 ——
          讲解是互动式的，完成一节就意味着学生在过程中答过题或提过问。
          {windowDays !== 'all' && ` 注册未满 ${windowDays} 天的人窗口还没走完，不计入（本次排除 ${formatCount(funnel.windowOpen)} 人）。`}
        </p>
        {resource.error ? (
          <p className="sample4-note">漏斗数据加载失败：{resource.error}</p>
        ) : !data ? (
          <SkeletonBlock height={260} />
        ) : funnel.cohort === 0 ? (
          <p className="sample4-note">这个范围内没有可统计的注册用户。课程产品的数据从 {dataStartKey} 开始。</p>
        ) : (
          <>
            <div className={showCounts ? 'sample4-funnel with-counts' : 'sample4-funnel'}>
              <div className="sample4-funnel-row head">
                <span>阶段</span>
                <span />
                {showCounts && <span>人数</span>}
                <span>占注册</span>
                <span>步骤转化</span>
              </div>
              {funnel.stages.map((stage) => (
                <div key={stage.key} className={stage === weakest ? 'sample4-funnel-row weakest' : 'sample4-funnel-row'}>
                  <span className="sample4-funnel-label"><b>{stage.code}</b>{stage.label}</span>
                  <span className="sample4-funnel-track">
                    <i style={{ width: `${Math.max(stage.ofSignupsPct ?? 0, 0.5)}%` }} />
                  </span>
                  {showCounts && <span>{formatCount(stage.users)}</span>}
                  <span>{ratePct(stage.ofSignupsPct)}</span>
                  <span>{ratePct(stage.ofPreviousPct)}</span>
                </div>
              ))}
            </div>
            <p className="sample4-note">
              <strong>激活率（走到 A4）{ratePct(activation.ofSignupsPct)}</strong>
              {weakest && <>。流失最多的一步是 <strong>{weakest.code} {weakest.label}</strong>：到达上一步的人里只有 {ratePct(weakest.ofPreviousPct)} 继续走到这里。</>}
            </p>
            <p className="sample4-note">
              走到后面步骤的人视为已通过前面的步骤（例如直接从对话里打开白板、没有单独生成课程的人）。
              A4 的时间取讲解会话的最后更新时间，可能偏晚、不会偏早。A5（确定下一节 / 设置提醒）产品里还没有对应功能，暂不统计。
            </p>
          </>
        )}
      </article>
    </section>
  )
}
