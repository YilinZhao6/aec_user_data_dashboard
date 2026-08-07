import { apiFetch } from '../client';

/** One `agent_course_generation` run, without its jsonb timelines. */
export interface CourseGeneration {
  run_id: string;
  user_id: string | null;
  /** Resolved server-side from `user_id`; null when the user is unknown. */
  email: string | null;
  course_uuid: string | null;
  /** What the user actually asked for — the originating query. */
  query: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  total_run_time: number | null;
  /** Generation log page for this run. */
  url: string | null;
  rating_value: number | null;
  rating_comments: string | null;
}

/** Full row. `events` / `error_logs` are jsonb — shapes are not guaranteed. */
export interface CourseGenerationDetail extends CourseGeneration {
  events: unknown;
  error_logs: unknown;
}

export interface CourseGenerationListResponse {
  generations: CourseGeneration[];
  total: number;
  truncated: boolean;
  table_name: string;
}

const API_ENDPOINT = '/api/v1/dashboard/course-generations';

export interface CourseGenerationQuery {
  start?: string;
  end?: string;
  run_status?: string;
  limit?: number;
}

/** List runs (metadata + query; timelines come from `getCourseGeneration`). */
export async function getCourseGenerations(
  { start, end, run_status, limit }: CourseGenerationQuery = {},
  signal?: AbortSignal,
): Promise<CourseGenerationListResponse> {
  return apiFetch<CourseGenerationListResponse>(API_ENDPOINT, {
    params: { start, end, run_status, limit },
    signal,
  });
}

/** One run in full, `events` and `error_logs` included. */
export async function getCourseGeneration(
  runId: string,
  signal?: AbortSignal,
): Promise<CourseGenerationDetail> {
  return apiFetch<CourseGenerationDetail>(`${API_ENDPOINT}/${encodeURIComponent(runId)}`, { signal });
}
