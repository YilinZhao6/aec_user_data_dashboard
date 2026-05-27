export interface User {
  user_id: string;
  // email / username / created_at are optional on the backend (Pydantic
  // Optional[str]); we mirror that here so consumers must null-check.
  email?: string | null;
  username?: string | null;
  created_at?: string | null;
}

export interface Conversation {
  conversation_id: string;
  user_id: string;
  created_at: string;
}

export interface UserTimeline {
  user_id: string;
  created_at: string;
}

export interface MostUsedFunctionItem {
  count: number;
  function: string;
}

export interface UserAnalytics {
  user_id: string;
  country: string | null;
  language: unknown;
  nationality: string | null;
  identity: string | null;
  initial_used_function: string | null;
  most_used_function: MostUsedFunctionItem[] | null;
  source_last_updated_at: string | null;
  analyzed_at: string | null;
  country_reason: unknown;
}

export interface UserPollData {
  user_id: string;
  user_acquisition_sources: unknown;
  login_ip: unknown;
}

export interface StatsResponse {
  total_users: number;
  latest_users: User[];
  // Lightweight id/email/username for ALL users (not just the latest 20).
  // Used by the frontend to resolve any user_id to a friendly label
  // (e.g. for the Top Users ranking). May be omitted by older backends,
  // hence optional.
  all_users_basic?: User[];
  conversation_history: Conversation[];
  all_users_timeline: UserTimeline[];
  user_analytics?: UserAnalytics[];
  user_poll_data?: UserPollData[];
}

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;
const API_ENDPOINT = '/api/v1/dashboard/stats';

export async function getStats(): Promise<StatsResponse> {
  if (!ADMIN_API_KEY) {
    throw new Error('VITE_ADMIN_API_KEY is not configured');
  }

  const url = `${BASE_URL}${API_ENDPOINT}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-API-Key': ADMIN_API_KEY,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to fetch stats: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
    );
  }

  return response.json();
}

