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

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

export async function getUserQueries(start: string, end?: string): Promise<UserQueriesResponse> {
  if (!ADMIN_API_KEY) throw new Error('VITE_ADMIN_API_KEY is not configured');

  const params = new URLSearchParams({ start });
  if (end) params.set('end', end);

  const url = `${BASE_URL}/api/v1/dashboard/user-queries?${params}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-Key': ADMIN_API_KEY },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch user queries: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  return response.json();
}
