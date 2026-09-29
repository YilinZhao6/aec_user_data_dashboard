// API + types for the activation funnel.
//
// `/api/v1/dashboard/learning-funnel` returns, per user, the first time they
// reached each step of the course product. Signups (A0) are not in it — the
// dashboard already has them from `/stats` and joins the two by user id.
//
// The cohort window and date range are frontend controls, so this is raw
// timestamps rather than a finished funnel.

import { apiFetch } from '../client';

export interface FunnelUser {
  user_id: string;
  /** A1 — started a course generation, or joined a published course. */
  course_requested_at: string | null;
  /** A2 — a generation completed, or a joined course arrived ready-made. */
  course_ready_at: string | null;
  /** A3 — opened a whiteboard / PDF lecture session. */
  lecture_started_at: string | null;
  /** A4 — the AI teacher closed a lecture. Approximate: the session's last
   *  update, so it can read late but never early. */
  lecture_completed_at: string | null;
  lectures_started: number;
  lectures_completed: number;
}

export interface LearningFunnelResponse {
  users: FunnelUser[];
  /** Earliest rows in the source tables; signups before them cannot be placed. */
  first_generation_at: string | null;
  first_lecture_at: string | null;
}

const API_ENDPOINT = '/api/v1/dashboard/learning-funnel';

export async function getLearningFunnel(signal?: AbortSignal): Promise<LearningFunnelResponse> {
  return apiFetch<LearningFunnelResponse>(API_ENDPOINT, { signal });
}
