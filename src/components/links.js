// Link resolution for user-facing records.
//
// The notification email that goes out with each feedback submission can carry
// a `page_url` — but that value is supplied by the client at submit time and is
// NOT stored on `beta_testing_suggestions`, so it cannot be read back here.
// What we can do is reconstruct the link from what *is* stored, the same way
// the rest of the dashboard does.
//
// Feedback rows encode their origin two ways, both of which we parse:
//   1. The comment is prefixed "(SYSTEM MSG: Feedback from <surface>)" — the
//      same surface the email's `id_label` names.
//   2. `conversation_id` is either a bare uuid, or "<courseUuid> (<childId>)"
//      for surfaces that live inside a course (practice / exam / project).
//
// Only surfaces with a URL pattern we have actually verified get a link;
// the rest render their ids as plain text rather than a guess that 404s.

// Production frontend. It is also what the backend falls back to when
// FRONTEND_URL is unset, and what it stamps into `agent_course_generation.url`.
const AGENT_BASE_URL = 'https://agent.hyperknow.io'

/** Chat / deep-learn transcripts — the app's `/response/:conversationId`. */
export const conversationUrl = (conversationId) =>
  `${AGENT_BASE_URL}/response/${encodeURIComponent(conversationId)}`

/**
 * The conversation behind a generated course.
 *
 * A generation run has no conversation id: the app routes it by course uuid
 * instead (`/response/course-generation/:courseUuid`, the same uuid the client
 * pins the run to and the backend stores on the row). Runs that died before a
 * uuid existed have no such page — use the run log for those.
 */
export const courseGenerationUrl = (courseUuid) =>
  `${AGENT_BASE_URL}/response/course-generation/${encodeURIComponent(courseUuid)}`

/** Course generation run log — the read-only replay page for a run. */
export const generationLogUrl = (runId) =>
  `${AGENT_BASE_URL}/course-generation/log/${encodeURIComponent(runId)}`

const SOURCE_PREFIX = /^\(SYSTEM MSG:\s*Feedback from ([^)]*)\)\s*/i

/** Surfaces whose id is a conversation the /response page can render. */
const CONVERSATION_SURFACES = new Set(['chat', 'deep learn session'])

/**
 * Conversation ids are uuids. A handful of old rows carry things like
 * "course-1785837464289" in the same column — linking those to /response
 * produces a dead page, so they stay plain text.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Split a feedback row into its parts: the source surface, the id(s), a link
 * when we can build a real one, and the comment with the system prefix removed.
 *
 * `conversation_id` shapes seen in the table:
 *   "b199b07c-…"                 → single id
 *   "c284edc9-… (c7f96469-…)"    → course uuid + the practice/exam/project id
 *   "course-1785837464289"       → legacy non-uuid id
 */
export function parseFeedback(entry) {
  const rawComment = entry?.user_comment ?? ''
  const match = rawComment.match(SOURCE_PREFIX)
  const source = match ? match[1].trim() : 'chat'
  const comment = match ? rawComment.slice(match[0].length) : rawComment

  const rawId = (entry?.conversation_id ?? '').trim()
  const composite = rawId.match(/^(\S+)\s*\((.+)\)$/)
  const primaryId = composite ? composite[1] : rawId
  const secondaryId = composite ? composite[2] : null

  const linkable = UUID.test(primaryId) && CONVERSATION_SURFACES.has(source)

  return {
    source,
    comment,
    primaryId: primaryId || null,
    secondaryId,
    url: linkable ? conversationUrl(primaryId) : null,
  }
}
