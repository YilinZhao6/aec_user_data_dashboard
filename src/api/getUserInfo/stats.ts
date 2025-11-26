export interface User {
  user_id: string;
  email: string;
  username: string;
  created_at: string;
}

export interface PaidSubscriptionUser extends User {
  tier: string;
  status: string;
  stripe_subscription_id: string;
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

export interface StatsResponse {
  total_users: number;
  latest_users: User[];
  paid_subscription_count: number;
  paid_subscription_users: PaidSubscriptionUser[];
  conversation_history: Conversation[];
  all_users_timeline: UserTimeline[];
}

// Get BASE_URL from environment variable
// Note: Vite requires server restart to pick up .env changes
const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';

// API endpoint path
const API_ENDPOINT = '/api/v1/dashboard/stats';

export async function getStats(): Promise<StatsResponse> {
  const url = `${BASE_URL}${API_ENDPOINT}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

