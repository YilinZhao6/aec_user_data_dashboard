// API + types for the Paid analytics tab.
//
// The backend (`/api/v1/dashboard/paid`) returns the raw pro / trial_pro
// subscription rows; everything else (bucketing, span chains, retention,
// renewal rate) is computed on the frontend so iterating on the rules
// doesn't require a redeploy.

import { apiFetch } from '../client';

export type BillingReasonBucket = 'paid' | 'invite' | 'manual' | 'other';

// One-off purchases, as opposed to a recurring card subscription. Upgrades
// paid with a payment intent belong here too — the money arrived once.
export const ONE_OFF_REASONS = new Set<string>([
  'one-off-payment',
  'one-off-upgrade',
]);

// Categorize the `billing_reason` text into one of three buckets. Only
// `paid` counts as real revenue; `invite` and `manual` are surfaced
// separately so they don't pollute paid metrics.
//
// `*-upgrade` rows are real Stripe payments (they carry a subscription id or
// a payment intent). Leaving them out of PAID_REASONS dropped them from every
// paid metric — which is how 3 of the 4 Max users vanished from this tab.
// Same failure the `PAID_TIERS` import in paid.py was written to prevent,
// one column over.
export const PAID_REASONS = new Set<string>([
  'initial_subscription',
  'renewal',
  'card-upgrade',
  ...ONE_OFF_REASONS,
]);
export const INVITE_REASONS = new Set<string>([
  'invite_code_grant',
  'invitation_credit_grant',
]);
export const MANUAL_REASONS = new Set<string>(['manual_addition']);

/** True for purchases that are not part of a recurring card subscription. */
export const isOneOffReason = (reason: string | null | undefined): boolean =>
  !!reason && ONE_OFF_REASONS.has(reason);

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

const API_ENDPOINT = '/api/v1/dashboard/paid';

export async function getPaidStats(signal?: AbortSignal): Promise<PaidStatsResponse> {
  return apiFetch<PaidStatsResponse>(API_ENDPOINT, { signal });
}
