// Standalone /feedback page.
//
// Renders `beta_testing_suggestions` and nothing else — it deliberately does
// not touch the main dashboard's data layer, so opening this URL costs one
// request instead of the whole stats/paid/utm bundle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getFeedback, getFeedbackEntry } from '../../api/getUserInfo/feedback'
import { PageShell } from '../../components/PageShell'
import { parseFeedback } from '../../components/links'
import {
  DataTable,
  DateRange,
  ExpandButton,
  Metrics,
  Modal,
  Pagination,
  PanelHeading,
  SkeletonMetrics,
  SkeletonTable,
} from '../../components/ui'
import { formatCount, formatDateTime } from '../../components/format'
import { UserLink } from '../sample/UserDetail'

const PAGE_SIZE = 25
const COMMENT_PREVIEW = 260
const FEEDBACK_COLUMNS = ['#', 'From', 'Source', 'Comment', 'Created', '']

const preview = (text) =>
  !text ? '—' : text.length > COMMENT_PREVIEW ? `${text.slice(0, COMMENT_PREVIEW)}…` : text

/** jsonb of unknown shape — pretty-print, never assume fields. */
const asJson = (value) => {
  if (value === null || value === undefined) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '—')

export default function FeedbackPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [range, setRange] = useState({ start: '', end: '' })
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)          // { entry, full?, error? }
  const [detailLoading, setDetailLoading] = useState(false)

  const request = useRef(null)
  const detailRequest = useRef(null)

  const load = useCallback(async ({ start, end }) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await getFeedback(
        {
          start: start ? `${start}T00:00:00Z` : undefined,
          end: end ? `${end}T23:59:59Z` : undefined,
        },
        controller.signal,
      )
      setData(result)
      setPage(1)
    } catch (err) {
      if (controller.signal.aborted) return // superseded by a newer request
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }, [])

  // Newest feedback on open — that is the whole point of the page.
  useEffect(() => {
    load({})
    return () => {
      request.current?.abort()
      detailRequest.current?.abort()
    }
  }, [load])

  // conversation_data is fetched per row so the list stays cheap.
  const openEntry = useCallback(async (entry) => {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller

    setDetail({ entry })
    setDetailLoading(true)
    try {
      const full = await getFeedbackEntry(entry.id, controller.signal)
      setDetail({ entry, full })
    } catch (err) {
      if (controller.signal.aborted) return
      setDetail({ entry, error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null
        setDetailLoading(false)
      }
    }
  }, [])

  const closeDetail = useCallback(() => {
    detailRequest.current?.abort()
    detailRequest.current = null
    setDetail(null)
  }, [])

  const entries = useMemo(() => data?.entries ?? [], [data])
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const rows = entries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const withEmail = entries.filter((e) => e.email).length
  const withConversation = entries.filter((e) => e.conversation_id).length
  const uniqueUsers = new Set(entries.map((e) => e.from_user).filter(Boolean)).size

  const detailParsed = detail ? parseFeedback(detail.entry) : null

  const body = () => {
    return (
      <>
        <section className="sample4-grid">
          <article className="sample4-panel sample4-full">
            <PanelHeading
              eyebrow="Beta testing suggestions"
              title="User feedback"
              actions={
                <div className="sample4-heading-actions">
                  <DateRange
                    start={range.start}
                    end={range.end}
                    onChange={setRange}
                    onReset={() => {
                      setRange({ start: '', end: '' })
                      load({})
                    }}
                  />
                  <button
                    type="button"
                    className="sample4-mini-btn"
                    disabled={loading}
                    onClick={() => load(range)}
                  >
                    {loading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              }
            />

            {error && <div className="sample4-state error"><strong>Could not load feedback</strong><p>{error}</p></div>}

            {/* First load: hold the layout with skeletons rather than
                collapsing the panel to nothing and jumping when data lands.
                A refresh keeps the current numbers on screen instead. */}
            {!error && loading && !data && (
              <>
                <SkeletonMetrics count={4} />
                <SkeletonTable columns={FEEDBACK_COLUMNS} rows={PAGE_SIZE > 10 ? 10 : PAGE_SIZE} />
              </>
            )}

            {!error && (data || !loading) && (
              <>
                <Metrics
                  items={[
                    { label: 'Entries', value: formatCount(entries.length), note: data?.truncated ? 'Capped — narrow the range' : 'In selected range' },
                    { label: 'Distinct senders', value: formatCount(uniqueUsers), note: 'By user_id' },
                    { label: 'Email resolved', value: formatCount(withEmail), note: `of ${formatCount(entries.length)} entries` },
                    { label: 'With conversation', value: formatCount(withConversation), note: 'Linked conversation_id' },
                  ]}
                />

                <DataTable
                  columns={FEEDBACK_COLUMNS}
                  empty="No feedback in this range."
                  rows={rows.map((entry, index) => {
                    const parsed = parseFeedback(entry)
                    return [
                      (safePage - 1) * PAGE_SIZE + index + 1,
                      // Email is the readable identity; the id stays in the
                      // details modal, and the cell opens the full profile.
                      <UserLink
                        key="from"
                        userId={entry.from_user}
                        label={entry.email || shortId(entry.from_user)}
                      />,
                      parsed.source,
                      preview(parsed.comment),
                      formatDateTime(entry.created_at),
                      // One action per row — the conversation link lives inside Details.
                      <ExpandButton key="details" onClick={() => openEntry(entry)}>Details</ExpandButton>,
                    ]
                  })}
                />

                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  onChange={setPage}
                  summary={`${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, entries.length)} of ${formatCount(entries.length)}`}
                />
              </>
            )}
          </article>
        </section>

        {detail && (
          <Modal
            eyebrow={`Feedback #${detail.entry.id} · ${detailParsed.source}`}
            title={detail.entry.email || 'Unknown sender'}
            onClose={closeDetail}
          >
            <dl className="sample4-detail-list">
              <div>
                <dt>User ID</dt>
                <dd><UserLink userId={detail.entry.from_user} label={detail.entry.from_user || '—'} /></dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{detail.entry.email || 'Not found in the user directory'}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(detail.entry.created_at)}</dd>
              </div>
              {detailParsed.primaryId && (
                <div>
                  <dt>{detailParsed.secondaryId ? 'Course ID' : 'Conversation ID'}</dt>
                  <dd>
                    {detailParsed.primaryId}
                    {detailParsed.url && (
                      <>
                        {' · '}
                        <a href={detailParsed.url} target="_blank" rel="noreferrer">open page</a>
                      </>
                    )}
                  </dd>
                </div>
              )}
              {detailParsed.secondaryId && (
                <div>
                  <dt>Session ID</dt>
                  <dd>{detailParsed.secondaryId}</dd>
                </div>
              )}
            </dl>

            <div className="sample4-callout">
              <span>Comment</span>
            </div>
            <p className="sample4-comment">{detailParsed.comment || '(no comment)'}</p>

            <div className="sample4-callout">
              <span>conversation_data</span>
            </div>
            {detailLoading && <div className="sample4-state">Loading conversation…</div>}
            {detail.error && <div className="sample4-state error"><p>{detail.error}</p></div>}
            {detail.full && (
              <pre className="sample4-json">
                {asJson(detail.full.conversation_data) ?? 'No conversation_data on this entry.'}
              </pre>
            )}
          </Modal>
        )}
      </>
    )
  }

  return <PageShell active="/feedback">{body()}</PageShell>
}
