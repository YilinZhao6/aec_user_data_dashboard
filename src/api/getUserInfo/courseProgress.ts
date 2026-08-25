// API + types for the Courses page (per-course completion checklist).
//
// The list endpoint hands back each course's checklist as two parallel
// strings — `kinds[i]` and `states[i]` describe the same item — which is what
// keeps ~1k courses and ~100k items under a megabyte. Item *titles* are the
// expensive part, so they come from the detail endpoint, one course at a time.
//
// The list is served from an hourly snapshot on the backend, and a stale one
// still comes back instantly while the rescan runs behind it — so only the
// first call after a deploy waits out the ~1-2 minute scan of ~500 MB of
// jsonb. Nothing here times out on its own, so let that first one run.

import { apiFetch } from '../client';

/** One character per item, in the order the checklist reads. */
export type ItemKind = 'S' | 'P' | 'E' | 'J';
export type ItemState = '0' | '1' | '2';

export const KIND_LABELS: Record<ItemKind, string> = {
  S: 'Session',
  P: 'Practice',
  E: 'Exam',
  J: 'Project',
};

export const STATE_LABELS: Record<ItemState, string> = {
  '0': 'Not started',
  '1': 'In progress',
  '2': 'Done',
};

export const KIND_ORDER: ItemKind[] = ['S', 'P', 'E', 'J'];

export interface CourseProgressRow {
  course_uuid: string;
  user_id?: string | null;
  title?: string | null;
  course_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  kinds: string;
  states: string;
  /** kind -> [done, started, total]; kinds with no items are absent. */
  totals: Partial<Record<ItemKind, [number, number, number]>>;
}

export interface CourseProgressResponse {
  courses: CourseProgressRow[];
  generated_at: string;
  scan_seconds: number;
  cached: boolean;
  /** Snapshot is past its TTL and a rescan is already running behind it. */
  refreshing: boolean;
  /** Learning activity whose course no longer exists — excluded everywhere. */
  orphan_activity_rows: number;
  /** Courses the database could not deliver; normally 0, missing below if not. */
  unreadable_courses: number;
  course_table: string;
  board_table: string;
}

export interface ProgressItem {
  id: string;
  kind: ItemKind;
  state: ItemState;
  label: string;
  unit?: string | null;
  lecture?: string | null;
  note?: string | null;
}

export interface CourseProgressDetail {
  course_uuid: string;
  user_id?: string | null;
  title?: string | null;
  course_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items: ProgressItem[];
}

const API_ENDPOINT = '/api/v1/dashboard/course-progress';

export async function getCourseProgress(
  refresh = false,
  signal?: AbortSignal,
): Promise<CourseProgressResponse> {
  return apiFetch<CourseProgressResponse>(API_ENDPOINT, {
    params: { refresh: refresh ? 'true' : undefined },
    signal,
  });
}

export async function getCourseProgressDetail(
  courseUuid: string,
  signal?: AbortSignal,
): Promise<CourseProgressDetail> {
  return apiFetch<CourseProgressDetail>(`${API_ENDPOINT}/${courseUuid}`, { signal });
}

/** [done, started, total] for one kind, or zeros when the course has none. */
export function kindTotals(
  course: CourseProgressRow,
  kind: ItemKind,
): [number, number, number] {
  return course.totals[kind] ?? [0, 0, 0];
}

/**
 * Completion is session-only on purpose.
 *
 * Sessions are the actual lessons; practice / exams / projects are optional
 * extras that most learners never open, so folding them into one ratio would
 * rank a finished course below a half-watched one that happens to have fewer
 * project steps. They get their own columns instead.
 */
export function sessionCompletion(course: CourseProgressRow): number {
  const [done, , total] = kindTotals(course, 'S');
  return total > 0 ? done / total : 0;
}

/** True once any session has been opened, completed or not. */
export function hasStarted(course: CourseProgressRow): boolean {
  const [done, started] = kindTotals(course, 'S');
  return done + started > 0;
}
