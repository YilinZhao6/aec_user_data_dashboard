// Standalone /queries page — everything the product stores about what users
// actually asked for, in one place and open to every role.
//
// Two sub-tabs, split the way User Analytics splits AI / Factual:
//
//  1. Course Generation — `agent_course_generation`: one row per generation
//     run, and the only table that stores the user's originating *query*
//     (`agent_course_data` keeps the produced course, not the request that
//     asked for it).
//  2. Agent — `/dashboard/user-queries`: conversation-level chat queries,
//     previously the main dashboard's admin-only "User Queries" tab.
//
// Like /feedback it stays off the main dashboard's data layer: opening this
// URL never touches the stats/paid/UTM payload. The two sub-tabs also keep
// their own requests: course generation loads with the page, agent queries
// load the default window the first time that sub-tab is opened — its scan is
// heavy enough that it should not run for someone who never looks at it.
// Editing the dates afterwards is an explicit reload, so a half-typed date
// never fires a request.
//
// The course generation list is metadata-only; a run's `events` / `error_logs`
// timelines and the generated course payloads are fetched per row when opened.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCourseGeneration,
  getCourseGenerations,
} from '../../api/getUserInfo/courseGenerations'
import { getCourse } from '../../api/getUserInfo/courses'
import { getUserQueries } from '../../api/getUserInfo/userQueries'
import { PageShell } from '../../components/PageShell'
import { conversationUrl, generationLogUrl } from '../../components/links'
import {
  DataTable,
  DateRange,
  ExpandButton,
  Metrics,
  Modal,
  Pagination,
  PanelHeading,
  Segmented,
  SkeletonMetrics,
  SkeletonTable,
} from '../../components/ui'
import { formatCount, formatDateTime } from '../../components/format'

const VIEWS = [
  { value: 'courseGeneration', label: 'Course Generation Queries' },
  { value: 'agent', label: 'Agent Queries' },
]

const PAGE_SIZE = 25
const AGENT_PAGE_SIZE = 50
const AGENT_LOOKBACK_DAYS = 5
const GENERATION_COLUMNS = ['#', 'Query', 'User', 'Status', 'Runtime', 'Rating', 'Started', '']
const AGENT_COLUMNS = ['#', 'First query', 'User', 'Started', 'Rounds', 'Link', '']
const QUERY_PREVIEW = 220

/** jsonb payloads on the generated course, in generation order. */
const COURSE_STAGES = ['final_course', 'source_manifest', 'web_search', 'practice', 'exam', 'project']

const asJson = (value) => {
  if (value === null || value === undefined) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const preview = (text) =>
  !text ? '—' : text.length > QUERY_PREVIEW ? `${text.slice(0, QUERY_PREVIEW)}…` : text

const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '—')

const duration = (seconds) => {
  if (seconds === null || seconds === undefined) return '—'
  // Round to whole seconds *before* splitting, otherwise 239.6s formats as
  // "3m 60s" instead of "4m 00s".
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/** Local-day key, offset by whole days. The date inputs speak this format. */
const dayKey = (daysOffset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The window the agent tab opens with — the last N days, today included. */
const defaultAgentRange = () => ({ start: dayKey(1 - AGENT_LOOKBACK_DAYS), end: dayKey(0) })

const messageText = (query) =>
  typeof query?.message === 'string' ? query.message : JSON.stringify(query?.message)

const firstMessage = (conversation) => {
  const queries = conversation.user_queries ?? []
  if (!queries.length) return '(no user messages)'
  return preview(messageText(queries[0]))
}

/** Everything on a message that isn't the message itself. */
const messageMetadata = (query) =>
  Object.entries(query).filter(([key]) => key !== 'message' && key !== 'parse_error')

export default function QueriesPage() {
  const [view, setView] = useState('courseGeneration')

  // --- Course generation -------------------------------------------------
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [range, setRange] = useState({ start: '', end: '' })
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)          // { run, full?, error? }
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailView, setDetailView] = useState('events')
  const [course, setCourse] = useState(null)          // { data? , error? }
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseStage, setCourseStage] = useState(COURSE_STAGES[0])

  // --- Agent queries -----------------------------------------------------
  const [agentRange, setAgentRange] = useState(defaultAgentRange)
  const [agentData, setAgentData] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState(null)
  const [agentPage, setAgentPage] = useState(1)
  const [conversation, setConversation] = useState(null)

  const request = useRef(null)
  const detailRequest = useRef(null)
  const courseRequest = useRef(null)
  const agentRequest = useRef(null)

  const load = useCallback(async ({ start, end }) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await getCourseGenerations(
        {
          start: start ? `${start}T00:00:00Z` : undefined,
          end: end ? `${end}T23:59:59Z` : undefined,
        },
        controller.signal,
      )
      setData(result)
      setPage(1)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    load({})
    return () => {
      request.current?.abort()
      detailRequest.current?.abort()
      courseRequest.current?.abort()
      agentRequest.current?.abort()
    }
  }, [load])

  const openRun = useCallback(async (run) => {
    detailRequest.current?.abort()
    courseRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller

    setDetail({ run })
    setDetailView('events')
    setCourse(null)
    setCourseStage(COURSE_STAGES[0])
    setDetailLoading(true)
    try {
      const full = await getCourseGeneration(run.run_id, controller.signal)
      setDetail({ run, full })
    } catch (err) {
      if (controller.signal.aborted) return
      setDetail({ run, error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null
        setDetailLoading(false)
      }
    }
  }, [])

  // The produced course lives in a different table, so it is a separate
  // opt-in fetch rather than something every opened run pays for.
  const loadCourse = useCallback(async (courseUuid) => {
    courseRequest.current?.abort()
    const controller = new AbortController()
    courseRequest.current = controller

    setCourseLoading(true)
    try {
      const result = await getCourse(courseUuid, controller.signal)
      setCourse({ data: result })
    } catch (err) {
      if (controller.signal.aborted) return
      setCourse({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (courseRequest.current === controller) {
        courseRequest.current = null
        setCourseLoading(false)
      }
    }
  }, [])

  const closeDetail = useCallback(() => {
    detailRequest.current?.abort()
    courseRequest.current?.abort()
    detailRequest.current = null
    courseRequest.current = null
    setDetail(null)
    setCourse(null)
  }, [])

  // An in-flight request is aborted before a new one starts, so a slow early
  // window can't land after a fast later one and win.
  const loadAgent = useCallback(async ({ start, end }) => {
    if (!start) return
    agentRequest.current?.abort()
    const controller = new AbortController()
    agentRequest.current = controller

    setAgentLoading(true)
    setAgentError(null)
    try {
      const result = await getUserQueries(
        `${start}T00:00:00`,
        end ? `${end}T23:59:59` : undefined,
        controller.signal,
      )
      setAgentData(result)
      setAgentPage(1)
    } catch (err) {
      if (controller.signal.aborted) return
      setAgentError(err instanceof Error ? err.message : String(err))
    } finally {
      if (agentRequest.current === controller) {
        agentRequest.current = null
        setAgentLoading(false)
      }
    }
  }, [])

  // Opening the sub-tab is signal enough to fetch its default window once —
  // the ref keeps that to the first arrival, so coming back after editing the
  // dates (or after a failure) never re-runs the scan behind the user's back.
  const agentAutoLoaded = useRef(false)
  useEffect(() => {
    if (view !== 'agent' || agentAutoLoaded.current) return
    agentAutoLoaded.current = true
    loadAgent(agentRange)
  }, [view, agentRange, loadAgent])

  const runs = useMemo(() => data?.generations ?? [], [data])
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const rows = runs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const uniqueUsers = new Set(runs.map((r) => r.user_id).filter(Boolean)).size
  const completed = runs.filter((r) => r.status === 'completed').length
  const rated = runs.filter((r) => r.rating_value !== null && r.rating_value !== undefined)
  const avgRating = rated.length
    ? (rated.reduce((sum, r) => sum + r.rating_value, 0) / rated.length).toFixed(1)
    : null

  const conversations = useMemo(() => agentData?.conversations ?? [], [agentData])
  const agentTotalPages = Math.max(1, Math.ceil(conversations.length / AGENT_PAGE_SIZE))
  const agentSafePage = Math.min(agentPage, agentTotalPages)
  const agentRows = conversations.slice(
    (agentSafePage - 1) * AGENT_PAGE_SIZE,
    agentSafePage * AGENT_PAGE_SIZE,
  )

  const agentUsers = new Set(conversations.map((c) => c.user_id).filter(Boolean)).size
  const agentRounds = conversations.reduce((sum, c) => sum + (c.rounds_of_user_message || 0), 0)
  const avgRounds = conversations.length
    ? (agentRounds / conversations.length).toFixed(1)
    : null

  const courseGenerationBody = () => (
    <section className="sample4-grid">
      <article className="sample4-panel sample4-full">
        <PanelHeading
          eyebrow="agent_course_generation"
          title="Course generation queries"
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

        {error && <div className="sample4-state error"><strong>Could not load generations</strong><p>{error}</p></div>}

        {/* First load: hold the layout with skeletons rather than
            collapsing the panel to nothing and jumping when data lands.
            A refresh keeps the current rows on screen instead. */}
        {!error && loading && !data && (
          <>
            <SkeletonMetrics count={4} />
            <SkeletonTable columns={GENERATION_COLUMNS} rows={10} />
          </>
        )}

        {!error && (data || !loading) && (
          <>
            <Metrics
              items={[
                { label: 'Runs', value: formatCount(runs.length), note: data?.truncated ? 'Capped — narrow the range' : 'In selected range' },
                { label: 'Distinct users', value: formatCount(uniqueUsers), note: 'By user_id' },
                { label: 'Completed', value: formatCount(completed), note: `of ${formatCount(runs.length)} runs` },
                { label: 'Avg rating', value: avgRating ?? '—', note: rated.length ? `${formatCount(rated.length)} rated` : 'No ratings yet' },
              ]}
            />

            <DataTable
              columns={GENERATION_COLUMNS}
              empty="No generation runs in this range."
              rows={rows.map((run, index) => [
                (safePage - 1) * PAGE_SIZE + index + 1,
                preview(run.query),
                <span key="user" title={run.user_id ?? undefined}>{run.email || shortId(run.user_id)}</span>,
                run.status || '—',
                duration(run.total_run_time),
                run.rating_value ?? '—',
                formatDateTime(run.started_at),
                // One action per row — the log link lives inside Details.
                <ExpandButton key="details" onClick={() => openRun(run)}>Details</ExpandButton>,
              ])}
            />

            <Pagination
              page={safePage}
              totalPages={totalPages}
              onChange={setPage}
              summary={`${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, runs.length)} of ${formatCount(runs.length)}`}
            />
          </>
        )}
      </article>
    </section>
  )

  const agentBody = () => (
    <section className="sample4-grid">
      <article className="sample4-panel sample4-full">
        <PanelHeading
          eyebrow="Conversation explorer"
          title="Agent queries"
          actions={
            <div className="sample4-heading-actions">
              <DateRange
                start={agentRange.start}
                end={agentRange.end}
                onChange={setAgentRange}
                onReset={() => setAgentRange(defaultAgentRange())}
              />
              <button
                type="button"
                className="sample4-mini-btn"
                disabled={agentLoading || !agentRange.start}
                onClick={() => loadAgent(agentRange)}
              >
                {agentLoading ? 'Loading…' : agentData ? 'Reload' : 'Load queries'}
              </button>
            </div>
          }
        />

        {agentError && <div className="sample4-state error"><strong>Could not load queries</strong><p>{agentError}</p></div>}

        {/* Nothing on screen yet — hold the layout while the first window
            loads. A reload keeps the current rows instead. */}
        {!agentError && !agentData && (
          <>
            <SkeletonMetrics count={4} />
            <SkeletonTable columns={AGENT_COLUMNS} rows={10} />
          </>
        )}

        {!agentError && agentData && (
          <>
            <Metrics
              items={[
                { label: 'Conversations', value: formatCount(conversations.length), note: `${formatDateTime(agentData.start)} → ${formatDateTime(agentData.end)}` },
                { label: 'Distinct users', value: formatCount(agentUsers), note: 'By user_id' },
                { label: 'User messages', value: formatCount(agentRounds), note: 'Rounds across all conversations' },
                { label: 'Avg rounds', value: avgRounds ?? '—', note: 'Per conversation' },
              ]}
            />

            <DataTable
              columns={AGENT_COLUMNS}
              empty="No conversations in this range."
              rows={agentRows.map((conv, index) => [
                (agentSafePage - 1) * AGENT_PAGE_SIZE + index + 1,
                <span key="query" className={conv.user_queries?.length ? undefined : 'sample4-muted'}>
                  {firstMessage(conv)}
                </span>,
                <span key="user" title={conv.user_id}>{shortId(conv.user_id)}</span>,
                formatDateTime(conv.created_at),
                conv.rounds_of_user_message,
                <a key="link" href={conversationUrl(conv.conversation_id)} target="_blank" rel="noreferrer">Open</a>,
                <ExpandButton key="details" onClick={() => setConversation(conv)}>Details</ExpandButton>,
              ])}
            />

            <Pagination
              page={agentSafePage}
              totalPages={agentTotalPages}
              onChange={setAgentPage}
              summary={`${(agentSafePage - 1) * AGENT_PAGE_SIZE + 1}-${Math.min(agentSafePage * AGENT_PAGE_SIZE, conversations.length)} of ${formatCount(conversations.length)}`}
            />
          </>
        )}
      </article>
    </section>
  )

  return (
    <PageShell active="/queries">
      <section className="sample4-subtabs">
        <Segmented value={view} onChange={setView} options={VIEWS} />
      </section>

      {view === 'courseGeneration' ? courseGenerationBody() : agentBody()}

      {detail && (
        <Modal
          eyebrow={`Run · ${detail.run.status || 'unknown status'}`}
          title={detail.run.email || shortId(detail.run.user_id)}
          onClose={closeDetail}
        >
          <div className="sample4-callout">
            <span>User query</span>
          </div>
          <p className="sample4-comment">{detail.run.query || '(no query recorded)'}</p>

          <dl className="sample4-detail-list">
            <div>
              <dt>User ID</dt>
              <dd>{detail.run.user_id || '—'}</dd>
            </div>
            <div>
              <dt>Run ID</dt>
              <dd>
                {detail.run.run_id}
                {' · '}
                <a href={detail.run.url || generationLogUrl(detail.run.run_id)} target="_blank" rel="noreferrer">
                  open log
                </a>
              </dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>
                {formatDateTime(detail.run.started_at)} → {formatDateTime(detail.run.ended_at)}
                {` · ${duration(detail.run.total_run_time)}`}
              </dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>
                {detail.run.rating_value ?? '—'}
                {detail.run.rating_comments ? ` · ${detail.run.rating_comments}` : ''}
              </dd>
            </div>
            {detail.run.course_uuid && (
              <div>
                <dt>Course</dt>
                <dd>
                  {detail.run.course_uuid}
                  {!course && !courseLoading && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="sample4-linkish"
                        onClick={() => loadCourse(detail.run.course_uuid)}
                      >
                        load generated course
                      </button>
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {detailLoading && <div className="sample4-state">Loading run timeline…</div>}
          {detail.error && <div className="sample4-state error"><p>{detail.error}</p></div>}

          {detail.full && (
            <>
              <div className="sample4-callout">
                <Segmented
                  value={detailView}
                  onChange={setDetailView}
                  options={[
                    { value: 'events', label: `events${Array.isArray(detail.full.events) ? ` (${detail.full.events.length})` : ''}` },
                    { value: 'error_logs', label: 'error_logs' },
                  ]}
                />
              </div>
              <pre className="sample4-json">
                {asJson(detail.full[detailView]) ?? `No ${detailView} on this run.`}
              </pre>
            </>
          )}

          {courseLoading && <div className="sample4-state">Loading generated course…</div>}
          {course?.error && <div className="sample4-state error"><p>{course.error}</p></div>}
          {course?.data && (
            <>
              <div className="sample4-callout">
                <span>Generated course</span>
              </div>
              <div className="sample4-stage-tags">
                {COURSE_STAGES.map((stage) => (
                  <span key={stage} className={`sample4-stage-tag${course.data[stage] ? '' : ' missing'}`}>
                    {stage}{course.data[stage] ? '' : ' · empty'}
                  </span>
                ))}
              </div>
              <div className="sample4-callout">
                <Segmented
                  value={courseStage}
                  onChange={setCourseStage}
                  options={COURSE_STAGES.map((stage) => ({ value: stage, label: stage }))}
                />
              </div>
              <pre className="sample4-json">
                {asJson(course.data[courseStage]) ?? `${courseStage} is empty for this course.`}
              </pre>
            </>
          )}
        </Modal>
      )}

      {conversation && (
        <Modal
          eyebrow={`Conversation · ${conversation.rounds_of_user_message} rounds`}
          title={shortId(conversation.user_id)}
          onClose={() => setConversation(null)}
        >
          <dl className="sample4-detail-list">
            <div>
              <dt>User ID</dt>
              <dd>{conversation.user_id}</dd>
            </div>
            <div>
              <dt>Conversation ID</dt>
              <dd>
                {conversation.conversation_id}
                {' · '}
                <a href={conversationUrl(conversation.conversation_id)} target="_blank" rel="noreferrer">
                  open conversation
                </a>
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatDateTime(conversation.created_at)}</dd>
            </div>
          </dl>

          {conversation.user_queries.length === 0 ? (
            <div className="sample4-state">No user messages on this conversation.</div>
          ) : (
            <div className="sample4-query-list">
              {conversation.user_queries.map((query, index) => {
                const metadata = messageMetadata(query)
                return (
                  <div key={index}>
                    <span>
                      {index === 0 ? 'First user query' : `Follow-up user query ${index + 1}`}
                      {Boolean(query.parse_error) && ' · parse error'}
                    </span>
                    <p>{messageText(query)}</p>
                    {metadata.length > 0 && (
                      <details>
                        <summary>Metadata</summary>
                        <pre className="sample4-json">
                          {asJson(Object.fromEntries(metadata))}
                        </pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Modal>
      )}
    </PageShell>
  )
}
