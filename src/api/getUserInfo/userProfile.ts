// API + types for the per-user detail modal.
//
// One request returns everything about a single user, so the modal opens the
// same way from every tab — it never depends on whether `/stats` or `/paid`
// happens to be loaded. See the backend route for why it isn't a client-side
// filter over the payload the dashboard already holds.

import { apiFetch } from '../client';
import type { MostUsedFunctionItem } from './stats';
import type { LoginIp } from './utm';

export interface ProfileConversation {
  conversation_id: string;
  created_at?: string | null;
}

/** Raw subscription row — bucketing and labelling happen in the view, as in paid.ts. */
export interface ProfileSubscription {
  id: string;
  tier: string;
  plan_id?: string | null;
  status?: string | null;
  billing_reason?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  stripe_subscription_id?: string | null;
  payment_intent_id?: string | null;
  invoice_id?: string | null;
}

/** The AI-derived persona (`user_analytics`). */
export interface ProfileAnalytics {
  country?: string | null;
  language?: unknown;
  nationality?: string | null;
  identity?: string | null;
  initial_used_function?: string | null;
  most_used_function?: MostUsedFunctionItem[] | null;
  country_reason?: unknown;
  source_last_updated_at?: string | null;
  analyzed_at?: string | null;
}

export interface ProfilePoll {
  user_acquisition_sources?: string[] | null;
  login_ip?: LoginIp | null;
}

export interface UserProfileResponse {
  user_id: string;
  email?: string | null;
  username?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  analytics?: ProfileAnalytics | null;
  poll?: ProfilePoll | null;
  subscriptions: ProfileSubscription[];
  conversations: ProfileConversation[];
  subscription_table: string;
}

const API_ENDPOINT = '/api/v1/dashboard/user-profile';

export async function getUserProfile(
  userId: string,
  signal?: AbortSignal,
): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>(API_ENDPOINT, { params: { user_id: userId }, signal });
}
