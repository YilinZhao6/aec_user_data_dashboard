import { apiFetch } from '../client';

/** One `beta_testing_suggestions` row without its jsonb payload. */
export interface FeedbackEntry {
  id: number;
  /** The raw user_id as stored. */
  from_user: string | null;
  /** Resolved server-side from `from_user`; null when the user is unknown. */
  email: string | null;
  user_comment: string | null;
  conversation_id: string | null;
  created_at: string | null;
}

/** Full row. `conversation_data` is jsonb — shape is not guaranteed. */
export interface FeedbackDetail extends FeedbackEntry {
  conversation_data: unknown;
}

export interface FeedbackResponse {
  entries: FeedbackEntry[];
  total: number;
  /** True when `limit` cut the result short. */
  truncated: boolean;
  table_name: string;
}

const API_ENDPOINT = '/api/v1/dashboard/feedback';

export interface FeedbackQuery {
  start?: string;
  end?: string;
  limit?: number;
}

/**
 * List feedback (metadata only — `conversation_data` is large and comes from
 * `getFeedbackEntry` on demand).
 */
export async function getFeedback(
  { start, end, limit }: FeedbackQuery = {},
  signal?: AbortSignal,
): Promise<FeedbackResponse> {
  return apiFetch<FeedbackResponse>(API_ENDPOINT, { params: { start, end, limit }, signal });
}

/** One entry in full, `conversation_data` included. */
export async function getFeedbackEntry(id: number, signal?: AbortSignal): Promise<FeedbackDetail> {
  return apiFetch<FeedbackDetail>(`${API_ENDPOINT}/${id}`, { signal });
}
