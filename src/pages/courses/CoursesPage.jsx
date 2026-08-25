// Standalone /courses page — how far learners actually got in the courses
// they generated.
//
// One request, three views of the same rows: the ranking charts, the tick
// grid (one square per checkable item), and the table. Filtering and sorting
// happen here rather than on the backend, so changing what "completion" means
// is a frontend edit — same reasoning as the Paid tab.
//
// Why it isn't a Dashboard tab: the dashboard's stats payload is ~24 MB and
// takes ~15s, and this page has nothing to do with it. Kept standalone, like
// /feedback and /queries, so opening it costs exactly one request.
//
// That request is slow only on a cold backend cache (1-2 min: it reads ~500 MB
// of jsonb to find out which items exist). After that the snapshot is reused
// for an hour and served stale while it rescans, so the wait does not come
// back. Its age, and whether a rescan is running, sit above the checklist.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  KIND_LABELS,
  KIND_ORDER,
  STATE_LABELS,
  getCourseProgress,
  getCourseProgressDetail,
  hasStarted,
  kindTotals,
  sessionCompletion,
} from '../../api/getUserInfo/courseProgress'
import { PageShell } from '../../components/PageShell'
import { courseGenerationUrl } from '../../components/links'
import {
  DataTable,
  ExpandButton,
  Metrics,
  Modal,
  Pagination,
  PanelHeading,
  Segmented,
  SkeletonBlock,
  SkeletonMetrics,
} from '../../components/ui'
import { formatCount, formatDateTime } from '../../components/format'
import { UserLink } from '../sample/UserDetail'
import './CoursesPage.css'

const PAGE_SIZE = 20
const TOP_N = 20
const TITLE_CLAMP = 46

const SCOPES = [
  { value: 'started', label: 'Started' },
  { value: 'all', label: 'All' },
  { value: 'untouched', label: 'Never opened' },
]

const SORTS = [
  { value: 'completion', label: 'Completion' },
  { value: 'activity', label: 'Last activity' },
  { value: 'size', label: 'Course size' },
]

const VIEWS = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'table', label: 'Table' },
]

const TABLE_COLUMNS = [
  '#', 'Course', 'User', 'Type', 'Sessions', 'Practice', 'Exam', 'Project',
  'Completion', 'Last activity', '',
]

const percent = (value) => `${Math.round(value * 100)}%`

const clamp = (text, limit = TITLE_CLAMP) =>
  !text ? 'Untitled course' : text.length > limit ? `${text.slice(0, limit)}…` : text

/** "3 of 12" for one kind, or an em dash when the course has none of it. */
const ratio = (course, kind) => {
  const [done, , total] = kindTotals(course, kind)
  return total === 0 ? '—' : `${done} / ${total}`
}

const ageLabel = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes)) return 'just now'
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

/** One square per checkable item, in the order the backend built them. */
function TickRow({ course }) {
  return (
    <div className="cp-ticks">
      {Array.from(course.kinds, (kind, index) => {
        const state = course.states[index]
        return (
          <span
            key={index}
            className={`cp-tick cp-kind-${kind} cp-state-${state}`}
            title={`${KIND_LABELS[kind] ?? kind} ${index + 1} — ${STATE_LABELS[state] ?? state}`}
          />
        )
      })}
    </div>
  )
}

function Legend() {
  return (
    <div className="cp-legend">
      {KIND_ORDER.map((kind) => (
        <span key={kind} className="cp-legend-item">
          <span className={`cp-tick cp-kind-${kind} cp-state-2`} />
          {KIND_LABELS[kind]}
        </span>
      ))}
      <span className="cp-legend-item">
        <span className="cp-tick cp-kind-S cp-state-0" />
        Not started
        <span className="cp-tick cp-kind-S cp-state-1" />
        In progress
        <span className="cp-tick cp-kind-S cp-state-2" />
        Done
      </span>
    </div>
  )
}

/** The clicked course's checklist with real titles, grouped by unit. */
function DetailBody({ detail, loading, error }) {
  const groups = useMemo(() => {
    if (!detail) return []
    const byUnit = new Map()
    for (const item of detail.items) {
      const unit = item.unit || 'Project'
      if (!byUnit.has(unit)) byUnit.set(unit, [])
      byUnit.get(unit).push(item)
    }
    return [...byUnit.entries()]
  }, [detail])

  if (loading) return <SkeletonBlock height={260} />
  if (error) return <p className="sample4-note">{error}</p>
  if (!detail) return null
  if (detail.items.length === 0) {
    return <p className="sample4-note">This course has no checkable items yet.</p>
  }

  return (
    <div>
      {groups.map(([unit, items]) => (
        <div key={unit}>
          <p className="cp-detail-unit">{unit}</p>
          <div className="cp-detail-list">
            {items.map((item) => (
              <div
                key={item.id}
                className={item.state === '0' ? 'cp-detail-row cp-detail-todo' : 'cp-detail-row'}
              >
                <span
                  className={`cp-tick cp-kind-${item.kind} cp-state-${item.state}`}
                  title={STATE_LABELS[item.state]}
                />
                <span>{item.label}</span>
                <span className="cp-detail-note">{item.note ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CoursesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [scope, setScope] = useState('started')
  const [sort, setSort] = useState('completion')
  const [view, setView] = useState('checklist')
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)        // { course, items? }
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const request = useRef(null)
  const detailRequest = useRef(null)

  const load = useCallback(async (refresh = false) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

    setLoading(true)
    setError(null)
    try {
      setData(await getCourseProgress(refresh, controller.signal))
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

  useEffect(() => {
    load()
    return () => {
      request.current?.abort()
      detailRequest.current?.abort()
    }
  }, [load])

  const openDetail = useCallback(async (course) => {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller

    setDetail({ course })
    setDetailError(null)
    setDetailLoading(true)
    try {
      const full = await getCourseProgressDetail(course.course_uuid, controller.signal)
      setDetail({ course, full })
    } catch (err) {
      if (controller.signal.aborted) return
      setDetailError(err instanceof Error ? err.message : String(err))
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null
        setDetailLoading(false)
      }
    }
  }, [])

  // Memoised so the derived useMemos below don't re-run on every render.
  const courses = useMemo(() => data?.courses ?? [], [data])

  const summary = useMemo(() => {
    const started = courses.filter(hasStarted)
    const completions = started.map(sessionCompletion)
    const finished = completions.filter((value) => value >= 1).length
    const average = completions.length
      ? completions.reduce((sum, value) => sum + value, 0) / completions.length
      : 0
    return { total: courses.length, started: started.length, finished, average }
  }, [courses])

  const visible = useMemo(() => {
    const filtered = courses.filter((course) => {
      if (scope === 'started') return hasStarted(course)
      if (scope === 'untouched') return !hasStarted(course)
      return true
    })

    const compare = {
      completion: (a, b) => sessionCompletion(b) - sessionCompletion(a),
      activity: (a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''),
      size: (a, b) => b.kinds.length - a.kinds.length,
    }[sort]

    return [...filtered].sort(compare)
  }, [courses, scope, sort])

  // Both charts describe the ranking, so they always read started courses —
  // the scope filter would otherwise let "Never opened" render 400 zero bars.
  const ranked = useMemo(
    () => courses.filter(hasStarted).sort((a, b) => sessionCompletion(b) - sessionCompletion(a)),
    [courses],
  )

  const rankCurve = useMemo(
    () => ranked.map((course, index) => ({
      rank: index + 1,
      completion: Math.round(sessionCompletion(course) * 100),
    })),
    [ranked],
  )

  const topCourses = useMemo(
    () => ranked.slice(0, TOP_N).map((course) => ({
      name: clamp(course.title, 28),
      completion: Math.round(sessionCompletion(course) * 100),
      sessions: ratio(course, 'S'),
    })),
    [ranked],
  )

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeScope = (next) => { setScope(next); setPage(1) }
  const changeSort = (next) => { setSort(next); setPage(1) }

  const tableRows = pageRows.map((course, index) => [
    (page - 1) * PAGE_SIZE + index + 1,
    <button type="button" className="cp-course-title" onClick={() => openDetail(course)}>
      {clamp(course.title, 60)}
    </button>,
    <UserLink userId={course.user_id} label="—" />,
    course.course_type ?? '—',
    ratio(course, 'S'),
    ratio(course, 'P'),
    ratio(course, 'E'),
    ratio(course, 'J'),
    percent(sessionCompletion(course)),
    course.last_activity_at ? formatDateTime(course.last_activity_at) : '—',
    <a href={courseGenerationUrl(course.course_uuid)} target="_blank" rel="noreferrer">Open</a>,
  ])

  return (
    <PageShell active="/courses">
      {error && <p className="sample4-note">{error}</p>}

      {loading && !data ? (
        <>
          <p className="sample4-note">
            Building the first snapshot — this reads every course payload and takes a minute
            or two. Later loads are instant, including after it goes stale.
          </p>
          <SkeletonMetrics count={4} />
        </>
      ) : (
        data && (
          <>
            <Metrics
              items={[
                { label: 'Live courses', value: formatCount(summary.total), note: data.course_table },
                {
                  label: 'Started',
                  value: formatCount(summary.started),
                  note: `${percent(summary.total ? summary.started / summary.total : 0)} of all courses`,
                },
                {
                  label: 'Fully completed',
                  value: formatCount(summary.finished),
                  note: 'every session done',
                },
                {
                  label: 'Avg completion',
                  value: percent(summary.average),
                  note: 'sessions done, started courses only',
                },
              ]}
            />

            <div className="sample4-grid sample4-even">
              <section className="sample4-panel">
                <PanelHeading
                  eyebrow="Ranking"
                  title="Completion curve"
                  note={`${formatCount(ranked.length)} started courses, best first`}
                />
                <div className="sample4-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={rankCurve} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                      <CartesianGrid stroke="#ece6da" vertical={false} />
                      <XAxis dataKey="rank" tick={{ fontSize: 11, fill: '#8d877b' }} />
                      <YAxis unit="%" tick={{ fontSize: 11, fill: '#8d877b' }} domain={[0, 100]} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Sessions done']} />
                      <Area
                        type="stepAfter"
                        dataKey="completion"
                        stroke="#6b8f71"
                        fill="#6b8f71"
                        fillOpacity={0.16}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="sample4-panel">
                <PanelHeading eyebrow="Ranking" title={`Top ${TOP_N}`} note="highest completion" />
                <div className="sample4-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={topCourses}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid stroke="#ece6da" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#8d877b' }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 10, fill: '#70695f' }}
                      />
                      <Tooltip
                        formatter={(value, _name, entry) => [
                          `${value}% (${entry?.payload?.sessions ?? ''} sessions)`,
                          'Completion',
                        ]}
                      />
                      <Bar dataKey="completion" fill="#6b8f71" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <div className="sample4-grid">
              <section className="sample4-panel sample4-full">
                <PanelHeading
                  eyebrow="Per course"
                  title={view === 'checklist' ? 'Checklist' : 'Table'}
                  actions={
                    <div className="sample4-heading-actions">
                      <Segmented value={scope} options={SCOPES} onChange={changeScope} />
                      <Segmented value={sort} options={SORTS} onChange={changeSort} />
                      <Segmented value={view} options={VIEWS} onChange={setView} />
                      <ExpandButton onClick={() => load(true)}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                      </ExpandButton>
                    </div>
                  }
                />

                <p className="sample4-note">
                  Snapshot {ageLabel(data.generated_at)} · scan took {data.scan_seconds}s
                  {data.refreshing ? ' · rescanning in the background' : ''}
                  {data.orphan_activity_rows > 0 &&
                    ` · ${formatCount(data.orphan_activity_rows)} activity rows belong to courses that no longer exist and are excluded`}
                  {data.unreadable_courses > 0 &&
                    ` · ${formatCount(data.unreadable_courses)} courses could not be read and are missing below`}
                </p>

                {view === 'checklist' ? (
                  <>
                    <Legend />
                    {pageRows.length === 0 ? (
                      <p className="sample4-note">No course matches this filter.</p>
                    ) : (
                      pageRows.map((course) => (
                        <div className="cp-course" key={course.course_uuid}>
                          <div className="cp-course-label">
                            <button
                              type="button"
                              className="cp-course-title"
                              onClick={() => openDetail(course)}
                            >
                              {clamp(course.title)}
                            </button>
                            <span className="cp-course-meta">
                              {course.course_type ?? 'course'} ·{' '}
                              {course.last_activity_at
                                ? formatDateTime(course.last_activity_at)
                                : 'never opened'}
                            </span>
                          </div>
                          <TickRow course={course} />
                          <span className="cp-course-score">
                            {percent(sessionCompletion(course))} · {ratio(course, 'S')}
                          </span>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  <DataTable
                    columns={TABLE_COLUMNS}
                    rows={tableRows}
                    empty="No course matches this filter."
                  />
                )}

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                  summary={`Page ${page} / ${totalPages} · ${formatCount(visible.length)} courses`}
                />
              </section>
            </div>
          </>
        )
      )}

      {detail && (
        <Modal
          eyebrow={detail.course.course_type ?? 'Course'}
          title={detail.course.title ?? 'Untitled course'}
          onClose={() => setDetail(null)}
        >
          <DetailBody detail={detail.full} loading={detailLoading} error={detailError} />
        </Modal>
      )}
    </PageShell>
  )
}
