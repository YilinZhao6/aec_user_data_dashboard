// API + types for the Paid analytics tab.
//
// The backend (`/api/v1/dashboard/paid`) returns the raw pro / trial_pro
// subscription rows; everything else (bucketing, span chains, retention,
// renewal rate) is computed on the frontend so iterating on the rules
// doesn't require a redeploy.

export type BillingReasonBucket = 'paid' | 'invite' | 'manual' | 'other';

// Categorize the `billing_reason` text into one of three buckets. Only
// `paid` counts as real revenue; `invite` and `manual` are surfaced
// separately so they don't pollute paid metrics.
export const PAID_REASONS = new Set<string>([
  'initial_subscription',
  'renewal',
  'one-off-payment',
]);
export const INVITE_REASONS = new Set<string>([
  'invite_code_grant',
  'invitation_credit_grant',
]);
export const MANUAL_REASONS = new Set<string>(['manual_addition']);

export function bucketOfBillingReason(
  reason: string | null | undefined,
): BillingReasonBucket {
  if (!reason) return 'other';
  if (PAID_REASONS.has(reason)) return 'paid';
  if (INVITE_REASONS.has(reason)) return 'invite';
  if (MANUAL_REASONS.has(reason)) return 'manual';
  return 'other';
}

export interface PaidSubscription {
  id: string;
  user_id: string;
  tier: string;                    // "pro" | "trial_pro"
  status: string;                  // "active" | "inactive"
  billing_reason?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  stripe_subscription_id?: string | null;
  payment_intent_id?: string | null;
  invoice_id?: string | null;
}

export interface PaidStatsResponse {
  subscriptions: PaidSubscription[];
  table_name: string;
}

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
const API_ENDPOINT = '/api/v1/dashboard/paid';

export async function getPaidStats(apiKey?: string): Promise<PaidStatsResponse> {
  const url = `${BASE_URL}${API_ENDPOINT}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch paid stats: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
