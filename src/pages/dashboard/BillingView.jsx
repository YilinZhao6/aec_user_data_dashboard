// Paid tab → 收入与取消: revenue received and why subscriptions end.
//
// Reads `/billing`, the one endpoint backed by Stripe. Everything here is
// self-contained — its ranges and granularity are this view's own state.

import { useMemo, useState } from 'react'
import {
  DataTable,
  DateRange,
  InlineField,
  Metrics,
  PanelHeading,
  Segmented,
  SkeletonBlock,
  SkeletonMetrics,
} from '../../components/ui'
import { formatCount, formatDateTime, formatUsd } from '../../components/format'
import { UserLink } from '../../components/UserDetail'
import { addDays, todayTzKey } from '../../utils/dashboardUtils'
import DashboardPieChart from './DashboardPieChart'
import DashboardStackedBars from './DashboardStackedBars'
import { dateOnly } from './paidSpans'
import { REVENUE_GROUPS, buildCancellations, buildRevenueSeries, buildRevenueSummary } from './billingMetrics'

const GRANULARITIES = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
]
const REVENUE_VARIANTS = { renewal: 'main', new: 'accent', oneOff: 'muted' }
const DEFAULT_REVENUE_DAYS = 29

const usd = (cents) => formatUsd(cents / 100)
const sharePct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : '—')

export default function BillingView({ resource, tzOffsetMs, isAdmin, labelFor }) {
  const defaultRevenueRange = () => {
    const end = todayTzKey(tzOffsetMs)
    return { start: addDays(end, -DEFAULT_REVENUE_DAYS), end }
  }
  const [revenueRange, setRevenueRange] = useState(defaultRevenueRange)
  const [granularity, setGranularity] = useState('day')
  const [cancelRange, setCancelRange] = useState({ start: '', end: '' })

  const data = resource.data
  const summary = useMemo(() => buildRevenueSummary(data?.payments, data?.subscriptions), [data])
  const revenue = useMemo(
    () => buildRevenueSeries(data?.payments, tzOffsetMs, { range: revenueRange, granularity }),
    [data, tzOffsetMs, revenueRange, granularity],
  )
  const cancellations = useMemo(
    () => buildCancellations(data?.subscriptions, tzOffsetMs, { range: cancelRange }),
    [data, tzOffsetMs, cancelRange],
  )

  if (resource.error) {
    return (
      <div className="sample4-state error">
        <strong>Could not load billing data</strong>
        <p>{resource.error}</p>
        <p>This view reads Stripe through <code>DASHBORD_STRIPE_KEY</code> on the API server.</p>
      </div>
    )
  }

  if (!data) {
    return (
      <>
        <p className="sample4-note">正在从 Stripe 读取订阅和付款记录，首次加载约 25 秒，之后 10 分钟内走缓存。</p>
        <SkeletonMetrics count={4} />
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full"><SkeletonBlock height={280} /></article>
        </section>
      </>
    )
  }

  const revenueTotal = revenue.reduce((sum, bucket) => sum + bucket.total, 0)
  const revenueUnpriced = revenue.reduce((sum, bucket) => sum + bucket.unpriced, 0)

  return (
    <>
      <p className="sample4-note">
        数据来自 Stripe，读取于 {formatDateTime(data.fetched_at, tzOffsetMs)}。
        订阅（卡付）是 Stripe 发票上的<strong>实收金额</strong>，已含折扣。
        One-off（微信 / 支付宝一次性购买）按方案<strong>标价估算</strong>，因为看板的 Stripe key 读不到这类付款的实际金额。
        退款未扣除。
      </p>
      <Metrics items={[
        {
          label: '近 30 天收入',
          value: usd(summary.last30.total),
          note: `订阅实收 ${usd(summary.last30.subscription)} · One-off 估算 ${usd(summary.last30.oneOff)}`,
        },
        {
          label: 'MRR',
          value: usd(summary.mrrCents),
          note: `${formatCount(summary.billing)} 个在扣费的订阅 · 按标价${summary.discounted > 0 ? `，其中 ${formatCount(summary.discounted)} 个有折扣` : ''}`,
        },
        { label: 'ARR', value: usd(summary.arrCents), note: 'MRR × 12 · 只含订阅，不含 One-off' },
        {
          label: '已预约取消',
          value: formatCount(summary.ending),
          note: `还在扣费、到期后结束 · 届时 MRR 减少 ${usd(summary.endingMrrCents)}`,
        },
      ]} />

      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="Revenue"
            title={granularity === 'day' ? '每日收入' : granularity === 'week' ? '每周收入' : '每月收入'}
            actions={(
              <div className="sample4-heading-actions">
                <DateRange
                  start={revenueRange.start}
                  end={revenueRange.end}
                  maxDate={todayTzKey(tzOffsetMs)}
                  onChange={setRevenueRange}
                  onReset={() => setRevenueRange(defaultRevenueRange())}
                />
                <InlineField label="颗粒度">
                  <Segmented value={granularity} onChange={setGranularity} options={GRANULARITIES} />
                </InlineField>
              </div>
            )}
          />
          <DashboardStackedBars
            labels={revenue.map((bucket) => bucket.label)}
            segments={REVENUE_GROUPS.map((group) => ({
              label: group.label,
              variant: REVENUE_VARIANTS[group.key],
              values: revenue.map((bucket) => bucket[group.key] / 100),
            }))}
            notes={revenue.map((bucket) => (
              `${bucket.title}${bucket.inProgress ? '（进行中）' : ''} · ${formatCount(bucket.payments)} 笔付款`
              + (bucket.unpriced > 0 ? ` · 其中 ${bucket.unpriced} 笔 One-off 升级金额未知，未计入` : '')
            ))}
            inProgress={new Set(revenue.flatMap((bucket, index) => (bucket.inProgress ? [index] : [])))}
            totalLabel="合计"
            format="currency"
          />
          <p className="sample4-note">
            所选范围合计 <strong>{usd(revenueTotal)}</strong>。
            {revenueUnpriced > 0 && ` 另有 ${formatCount(revenueUnpriced)} 笔 One-off 升级：补的是差价，金额无法还原，未计入。`}
            {' '}浅色的柱子包含今天，还没过完。
          </p>
        </article>
      </section>

      <section className="sample4-grid">
        <article className="sample4-panel sample4-full">
          <PanelHeading
            eyebrow="Cancellations"
            title="取消订阅 · 时间与原因"
            actions={(
              <DateRange
                start={cancelRange.start}
                end={cancelRange.end}
                maxDate={todayTzKey(tzOffsetMs)}
                onChange={setCancelRange}
                onReset={() => setCancelRange({ start: '', end: '' })}
              />
            )}
          />
          <p className="sample4-note">
            按<strong>用户提出取消的那天</strong>统计，不是权益到期那天 —— 第 3 天取消的人可以用到第 30 天，但说明问题的是第 3 天。
            只有订阅（卡付）才有「取消」；One-off 是一次性购买，到期即结束。日期留空 = 全部。
          </p>
          <Metrics items={[
            { label: '取消数', value: formatCount(cancellations.total), note: `其中 ${formatCount(cancellations.scheduled)} 个已预约、尚未到期` },
            { label: '主动取消', value: formatCount(cancellations.voluntary), note: `其余 ${formatCount(cancellations.total - cancellations.voluntary)} 个是扣款失败` },
            {
              label: '填写了原因',
              value: sharePct(cancellations.withFeedback, cancellations.voluntary),
              note: `${formatCount(cancellations.withFeedback)} / ${formatCount(cancellations.voluntary)} 个主动取消`,
            },
            {
              label: '订阅到取消 · 中位数',
              value: cancellations.medianDays == null ? '—' : `${Math.round(cancellations.medianDays)} 天`,
              note: '从订阅开始到提出取消',
            },
          ]} />
          <section className="sample4-grid sample4-even">
            <article className="sample4-panel">
              <PanelHeading eyebrow="Why" title="取消原因" />
              <DashboardPieChart entries={cancellations.reasons} />
            </article>
            <article className="sample4-panel">
              <PanelHeading eyebrow="When" title="在第几期取消" />
              <DataTable
                columns={['计费周期', '取消数', '占比']}
                rows={cancellations.periods.map((period) => [
                  period.label,
                  formatCount(period.value),
                  period.sharePct == null ? '—' : `${period.sharePct.toFixed(1)}%`,
                ])}
              />
            </article>
          </section>
          <p className="sample4-note">
            「未填写原因」多，是因为<strong>App 内的取消按钮不问原因</strong>，只有从 Stripe 账单页取消的人才会被问到。
            想要完整的原因，需要在 App 的取消流程里加一步并把答案传给 Stripe。
          </p>
          <p className="sample4-chart-caption">每月取消数 · 主动取消 vs 扣款失败</p>
          <DashboardStackedBars
            labels={cancellations.monthly.map((month) => month.time)}
            segments={[
              { label: '主动取消', values: cancellations.monthly.map((month) => month.voluntary), variant: 'main' },
              { label: '扣款失败', values: cancellations.monthly.map((month) => month.paymentFailed), variant: 'muted' },
            ]}
            totalLabel="合计"
          />
        </article>
      </section>

      {/* Free text written by individual customers: admin only, like every
          other list on this tab that names a person. */}
      {isAdmin && (
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading eyebrow="In their words" title="用户留言" note={`${formatCount(cancellations.comments.length)} 条`} />
            <DataTable
              columns={['User', '取消日期', '方案', '原因', '留言']}
              empty="这个范围内没有人留言。"
              rows={cancellations.comments.map((row) => [
                row.user_id
                  ? <UserLink key="user" userId={row.user_id} label={labelFor(row.user_id)} tzOffsetMs={tzOffsetMs} />
                  : '—',
                dateOnly(row.canceledAt, tzOffsetMs),
                row.plan,
                row.label,
                row.comment,
              ])}
            />
          </article>
        </section>
      )}
    </>
  )
}
