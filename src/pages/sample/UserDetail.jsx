// Everything the product knows about one user, in a single overlay, plus the
// `UserLink` that opens it.
//
// Used from the main dashboard AND from the standalone /feedback and /queries
// pages, so it loads its own payload from `/api/v1/dashboard/user-profile`
// rather than reading whatever the caller happens to hold. That is what lets
// the same click behave identically on a page that never fetches `/stats`.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { DataTable, Metrics, Modal, PanelHeading, Segmented, SkeletonBlock, SkeletonMetrics } from '../../components/ui'
import { formatCount, formatDateTime } from '../../components/format'
import { conversationUrl } from '../../components/links'
import { getUserProfile } from '../../api/getUserInfo/userProfile'
import { BROWSER_OFFSET_MS, addDays, daysBetweenDateKeys, extractLoginIpCountries, toTzDateKey, todayTzKey } from '../dashboardEntry/dashboardUtils'
import { DAY_MS, buildPaidSpans, paymentMethodLabel } from './paidSpans'
import Sample4LineChart from './Sample4LineChart'

const CONVERSATIONS_PAGE_SIZE = 10
const FREQUENCY_RANGES = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All' },
]
// An "All" window on an old account is mostly empty days; past this many the
// chart says more as weekly totals than as a row of zeroes.
const WEEKLY_BUCKET_THRESHOLD = 120

const dayLabel = (dateKey) => {
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}/${Number(day)}`
}

const rangeLabel = (rangeDays) => (rangeDays > 0 ? `last ${rangeDays} days` : 'all time')

const conversationDays = (conversations, tzOffsetMs) =>
  conversations
    .map((conversation) => (conversation.created_at ? toTzDateKey(conversation.created_at, tzOffsetMs) : null))
    .filter(Boolean)

const windowBounds = (days, rangeDays, tzOffsetMs) => {
  const today = todayTzKey(tzOffsetMs)
  const firstDay = days.length ? days.reduce((min, day) => (day < min ? day : min)) : today
  const span = rangeDays > 0
    ? rangeDays
    : Math.min(Math.max(daysBetweenDateKeys(firstDay, today) + 1, 1), 730)
  return { today, start: addDays(today, -(span - 1)), span }
}

const text = (value) => {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => text(item)).join(', ') : '—'
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** `language` is `[{ language, ratio }]` — "Chinese 84% · English 16%". */
const languageText = (value) => {
  if (!Array.isArray(value)) return text(value)
  const parts = value
    .map((item) => {
      if (!item?.language) return null
      const pct = typeof item.ratio === 'number' ? ` ${Math.round(item.ratio * 100)}%` : ''
      return `${item.language}${pct}`
    })
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : text(value)
}

/**
 * Daily (or weekly) conversation counts for the chart.
 *
 * The window always ends today so an inactive user reads as a flat tail
 * rather than a chart that stops at their last visit.
 */
function buildFrequency(conversations, rangeDays, tzOffsetMs) {
  const days = conversationDays(conversations, tzOffsetMs)
  const { today, start, span } = windowBounds(days, rangeDays, tzOffsetMs)

  const counts = new Map()
  for (const day of days) {
    if (day < start || day > today) continue
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  const step = span > WEEKLY_BUCKET_THRESHOLD ? 7 : 1
  const buckets = []
  for (let offset = 0; offset < span; offset += step) {
    const bucketStart = addDays(start, offset)
    let value = 0
    for (let i = 0; i < step && offset + i < span; i += 1) {
      value += counts.get(addDays(start, offset + i)) ?? 0
    }
    buckets.push({
      label: dayLabel(bucketStart),
      tooltip: step === 1
        ? bucketStart
        : `${bucketStart} → ${addDays(bucketStart, Math.min(step, span - offset) - 1)}`,
      value,
    })
  }

  return { buckets, step, start, today, inWindow: buckets.reduce((sum, bucket) => sum + bucket.value, 0) }
}

function topConversationDays(conversations, rangeDays, tzOffsetMs, limit = 5) {
  const days = conversationDays(conversations, tzOffsetMs)
  const { start, today } = windowBounds(days, rangeDays, tzOffsetMs)
  const counts = new Map()

  for (const day of days) {
    if (day < start || day > today) continue
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  return Array.from(counts, ([dateKey, value]) => ({ dateKey, label: dayLabel(dateKey), value }))
    .sort((a, b) => b.value - a.value || b.dateKey.localeCompare(a.dateKey))
    .slice(0, limit)
}

function latestConversationDay(conversations, tzOffsetMs) {
  const days = conversationDays(conversations, tzOffsetMs)
  return days.length ? days.reduce((max, day) => (day > max ? day : max)) : null
}

/** Paid status, total duration and payment methods, derived from the raw rows. */
function summarisePaid(subscriptions) {
  const spans = buildPaidSpans(subscriptions)
  if (spans.length === 0) {
    return { isPaid: false, spans, totalDays: 0, isActive: false, methods: [], tiers: [] }
  }
  const now = Date.now()
  return {
    isPaid: true,
    spans,
    totalDays: spans.reduce((sum, span) => sum + (span.end - span.start) / DAY_MS, 0),
    isActive: spans.some((span) => span.start <= now && now <= span.end),
    methods: Array.from(new Set(subscriptions.map(paymentMethodLabel))),
    tiers: Array.from(new Set(subscriptions.map((sub) => sub.tier).filter(Boolean))).sort(),
  }
}

/**
 * A user cell that opens the detail modal.
 *
 * Owns the modal itself rather than asking every caller to hoist a piece of
 * state — four tables across three pages would otherwise repeat the same
 * open/close plumbing. Renders as plain text when there is nothing to open:
 * no id, or a `general` key (the modal shows raw per-user data, so it follows
 * the same admin-only rule as the dashboard's other unaggregated views).
 */
export function UserLink({ userId, label, tzOffsetMs = BROWSER_OFFSET_MS }) {
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)

  if (!userId || !isAdmin) return label

  return (
    <>
      <button
        type="button"
        className="sample4-linkish sample4-user-link"
        title="Open this user's full profile"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <UserDetailModal
          userId={userId}
          label={label}
          tzOffsetMs={tzOffsetMs}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export function UserDetailModal({ userId, label, tzOffsetMs, onClose }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [rangeDays, setRangeDays] = useState(30)
  const [conversationsPage, setConversationsPage] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setProfile(null)
    setError(null)
    setConversationsPage(0)
    getUserProfile(userId, controller.signal)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => controller.abort()
  }, [userId])

  // Escape closes, matching the backdrop click the Modal already handles.
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const conversations = useMemo(() => profile?.conversations ?? [], [profile])
  const frequency = useMemo(
    () => buildFrequency(conversations, rangeDays, tzOffsetMs),
    [conversations, rangeDays, tzOffsetMs],
  )
  const topDays = useMemo(
    () => topConversationDays(conversations, rangeDays, tzOffsetMs),
    [conversations, rangeDays, tzOffsetMs],
  )
  const paid = useMemo(() => summarisePaid(profile?.subscriptions ?? []), [profile])

  const title = profile?.email || profile?.username || label || `${userId.slice(0, 8)}…`

  const body = () => {
    if (error) {
      return (
        <div className="sample4-state error">
          <strong>Could not load this user</strong>
          <p>{error}</p>
        </div>
      )
    }

    if (!profile) {
      return (
        <>
          <SkeletonMetrics count={4} />
          <SkeletonBlock height={220} />
        </>
      )
    }

    const analytics = profile.analytics
    const poll = profile.poll
    const loginCountries = extractLoginIpCountries(poll?.login_ip)
    const topFunctions = Array.isArray(analytics?.most_used_function)
      ? [...analytics.most_used_function].sort((a, b) => b.count - a.count)
      : []
    const totalPages = Math.max(1, Math.ceil(conversations.length / CONVERSATIONS_PAGE_SIZE))
    const safePage = Math.min(conversationsPage, totalPages - 1)
    const lastQuestionDay = latestConversationDay(conversations, tzOffsetMs)
    const inactiveDays = lastQuestionDay ? daysBetweenDateKeys(lastQuestionDay, frequency.today) : null
    const hasNoActivityInWindow = frequency.inWindow === 0
    const pageConversations = conversations.slice(
      safePage * CONVERSATIONS_PAGE_SIZE,
      (safePage + 1) * CONVERSATIONS_PAGE_SIZE,
    )

    return (
      <>
        <Metrics items={[
          {
            label: 'Registered',
            value: profile.created_at ? formatDateTime(profile.created_at, tzOffsetMs) : '—',
            note: profile.last_sign_in_at ? `Last sign-in ${formatDateTime(profile.last_sign_in_at, tzOffsetMs)}` : 'No sign-in recorded',
          },
          {
            label: 'Paid',
            value: paid.isPaid ? (paid.isActive ? 'Active' : 'Churned') : 'Never paid',
            note: paid.isPaid ? `${paid.tiers.join(' + ') || '—'} · ${paid.spans.length} span(s)` : 'No paid-tier subscription rows',
          },
          {
            label: 'Paid duration',
            value: paid.isPaid ? `${Math.round(paid.totalDays)}d` : '—',
            note: paid.isPaid ? 'Total across all continuous paid periods' : 'Nothing to total',
          },
          {
            label: 'Conversations',
            value: formatCount(conversations.length),
            note: `${formatCount(frequency.inWindow)} in the charted window`,
          },
        ]} />

        <section className="sample4-modal-section">
          <PanelHeading
            eyebrow="Activity"
            title="提问频率 · Conversations over time"
            actions={<Segmented value={rangeDays} onChange={setRangeDays} options={FREQUENCY_RANGES} />}
          />
          <div className="sample4-activity-grid">
            <div className="sample4-activity-chart-card">
              {hasNoActivityInWindow && (
                <div className="sample4-activity-empty">
                  <strong>No questions in {rangeLabel(rangeDays)}</strong>
                  <span>
                    {lastQuestionDay
                      ? `Last question: ${lastQuestionDay}${inactiveDays > 0 ? ` · ${inactiveDays}d ago` : ''}`
                      : 'This user has not started a conversation yet.'}
                  </span>
                </div>
              )}
              <Sample4LineChart
                labels={frequency.buckets.map((bucket) => bucket.label)}
                tooltips={frequency.buckets.map((bucket) => bucket.tooltip)}
                series={[{ label: frequency.step === 7 ? 'Conversations / week' : 'Conversations / day', values: frequency.buckets.map((bucket) => bucket.value) }]}
                height={220}
              />
            </div>

            <aside className="sample4-activity-rank">
              <span>Top days</span>
              <h3>哪几天提问最多</h3>
              {topDays.length ? (
                <ol>
                  {topDays.map((day) => (
                    <li key={day.dateKey}>
                      <div>
                        <strong>{day.dateKey}</strong>
                        <small>{day.label}</small>
                      </div>
                      <b>{formatCount(day.value)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No conversation days in {rangeLabel(rangeDays)}.</p>
              )}
              {hasNoActivityInWindow && lastQuestionDay && rangeDays > 0 && (
                <p className="sample4-activity-hint">Try 90d or All to see this user's older activity.</p>
              )}
            </aside>
          </div>
        </section>

        <div className="sample4-modal-section-grid">
          <section className="sample4-modal-section">
            <PanelHeading eyebrow="AI analysis" title="人物画像 · Persona" />
            {analytics ? (
              <dl className="sample4-detail-list">
                <div><dt>Identity</dt><dd>{text(analytics.identity)}</dd></div>
                <div><dt>Country</dt><dd>{text(analytics.country)}</dd></div>
                <div><dt>Nationality</dt><dd>{text(analytics.nationality)}</dd></div>
                <div><dt>Language</dt><dd>{languageText(analytics.language)}</dd></div>
                <div><dt>Initial fn</dt><dd>{text(analytics.initial_used_function)}</dd></div>
                <div><dt>Top fns</dt><dd>{topFunctions.length ? topFunctions.map((fn) => `${fn.function} (${fn.count})`).join(' · ') : '—'}</dd></div>
                {/* `country_reason` is `{ reason, conversation_ids }` — the prose
                    is the part worth reading; the ids are already linked below. */}
                <div><dt>Reasoning</dt><dd>{text(analytics.country_reason?.reason ?? analytics.country_reason)}</dd></div>
                <div><dt>Analyzed</dt><dd>{analytics.analyzed_at ? formatDateTime(analytics.analyzed_at, tzOffsetMs) : '—'}</dd></div>
              </dl>
            ) : (
              <p className="sample4-note">No <code>user_analytics</code> row for this user yet.</p>
            )}
          </section>

          <section className="sample4-modal-section">
            <PanelHeading eyebrow="Poll" title="Acquisition & location" />
            <dl className="sample4-detail-list">
              <div><dt>Sources</dt><dd>{text(poll?.user_acquisition_sources)}</dd></div>
              <div><dt>Login country</dt><dd>{loginCountries.length ? loginCountries.join(', ') : '—'}</dd></div>
              <div><dt>Login city</dt><dd>{text([poll?.login_ip?.city, poll?.login_ip?.region].filter(Boolean).join(', '))}</dd></div>
              <div><dt>ISP</dt><dd>{text(poll?.login_ip?.isp)}</dd></div>
            </dl>
          </section>
        </div>

        <section className="sample4-modal-section">
          <PanelHeading
            eyebrow="Billing"
            title="订阅记录 · Subscriptions"
            note={paid.isPaid ? `Payment method: ${paid.methods.join(' · ')}` : undefined}
          />
          <DataTable
            columns={['Tier', 'Plan', 'Reason', 'Payment method', 'Started', 'Expires', 'Status']}
            empty="No paid-tier subscription rows for this user."
            rows={profile.subscriptions.map((sub) => [
              sub.tier || '—',
              sub.plan_id || '—',
              sub.billing_reason || '—',
              paymentMethodLabel(sub),
              formatDateTime(sub.started_at, tzOffsetMs),
              formatDateTime(sub.expires_at, tzOffsetMs),
              sub.status || '—',
            ])}
          />
        </section>

        <section className="sample4-modal-section">
          <PanelHeading
            eyebrow="Conversations"
            title="全部对话链接 · All conversation links"
            actions={conversations.length > CONVERSATIONS_PAGE_SIZE ? (
              <div className="sample4-pagination">
                <button type="button" disabled={safePage === 0} onClick={() => setConversationsPage(safePage - 1)}>Prev</button>
                <span>{`${safePage * CONVERSATIONS_PAGE_SIZE + 1}-${Math.min((safePage + 1) * CONVERSATIONS_PAGE_SIZE, conversations.length)} of ${conversations.length}`}</span>
                <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setConversationsPage(safePage + 1)}>Next</button>
              </div>
            ) : undefined}
          />
          <DataTable
            columns={['#', 'Conversation', 'Created']}
            empty="This user has no conversations."
            rows={pageConversations.map((conversation, index) => [
              safePage * CONVERSATIONS_PAGE_SIZE + index + 1,
              <a
                key={conversation.conversation_id}
                href={conversationUrl(conversation.conversation_id)}
                target="_blank"
                rel="noreferrer"
              >
                {conversation.conversation_id}
              </a>,
              formatDateTime(conversation.created_at, tzOffsetMs),
            ])}
          />
        </section>
      </>
    )
  }

  return (
    <Modal eyebrow="User detail" title={title} onClose={onClose} className="sample4-user-modal">
      <p className="sample4-modal-subtitle"><span>USER ID:</span><code>{userId}</code></p>
      {body()}
    </Modal>
  )
}
