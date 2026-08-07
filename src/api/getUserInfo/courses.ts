import { apiFetch } from '../client';

/** `agent_course_data` row without its jsonb payloads. */
export interface CourseSummary {
  course_uuid: string;
  user_id: string | null;
  course_type: string | null;
  origin_marketplace_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  join_count: number | null;
}

/** Full row. The jsonb columns have no guaranteed shape — render defensively. */
export interface CourseDetail extends CourseSummary {
  final_course: unknown;
  source_manifest: unknown;
  web_search: unknown;
  practice: unknown;
  exam: unknown;
  project: unknown;
}

export interface CourseListResponse {
  courses: CourseSummary[];
  total: number;
  truncated: boolean;
  table_name: string;
}

const API_ENDPOINT = '/api/v1/dashboard/courses';

export interface CourseQuery {
  start?: string;
  end?: string;
  course_type?: string;
  limit?: number;
}

/**
 * List generated courses (metadata only — the jsonb payloads are large and
 * come from `getCourse` on demand).
 */
export async function getCourses(
  { start, end, course_type, limit }: CourseQuery = {},
  signal?: AbortSignal,
): Promise<CourseListResponse> {
  return apiFetch<CourseListResponse>(API_ENDPOINT, {
    params: { start, end, course_type, limit },
    signal,
  });
}

/** One course in full, jsonb payloads included. */
export async function getCourse(courseUuid: string, signal?: AbortSignal): Promise<CourseDetail> {
  return apiFetch<CourseDetail>(`${API_ENDPOINT}/${encodeURIComponent(courseUuid)}`, { signal });
}
