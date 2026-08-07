import { apiFetch } from '../client';

export interface UserQuery {
  message: string;
  [key: string]: unknown;
}

export interface ConversationQueryResult {
  conversation_id: string;
  user_id: string;
  created_at: string;
  rounds_of_user_message: number;
  user_queries: UserQuery[];
}

export interface UserQueriesResponse {
  generated_at: string;
  start: string;
  end: string;
  total_conversations: number;
  conversations: ConversationQueryResult[];
}

const API_ENDPOINT = '/api/v1/dashboard/user-queries';

export async function getUserQueries(
  start: string,
  end?: string,
  signal?: AbortSignal,
): Promise<UserQueriesResponse> {
  return apiFetch<UserQueriesResponse>(API_ENDPOINT, { params: { start, end }, signal });
}
