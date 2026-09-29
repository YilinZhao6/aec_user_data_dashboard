// API + types for revenue and cancellations.
//
// `/api/v1/dashboard/billing` is the one dashboard route that reads Stripe
// directly — cancellation reasons and real payment amounts live there, not in
// our tables. It is slow on a cold cache (~25s, two full Stripe listings) and
// cached server-side for ten minutes, so it is fetched only when the view that
// needs it is opened.
//
// Bucketing by day, reason or plan is done on the frontend; this file only
// describes what comes back.

import { apiFetch } from '../client';

export interface BillingSubscription {
  stripe_subscription_id: string;
  user_id: string | null;
  plan_id: string | null;
  tier: string | null;
  /** active | past_due | canceled | … */
  status: string;
  started_at: string | null;
  /** When the customer asked to cancel, or Stripe gave up collecting. */
  canceled_at: string | null;
  /** When access ends, for a cancellation that is scheduled but not final. */
  cancel_at: string | null;
  ended_at: string | null;
  cancel_at_period_end: boolean;
  /** cancellation_requested | payment_failed | payment_disputed */
  cancellation_reason: string | null;
  /** What the customer picked: too_expensive, unused, … */
  cancellation_feedback: string | null;
  cancellation_comment: string | null;
  /** List price, before discounts. */
  unit_amount_cents: number | null;
  currency: string | null;
  interval: string | null;
  has_discount: boolean;
}

export type PaymentKind =
  | 'subscription_first'
  | 'subscription_renewal'
  | 'subscription_update'
  | 'card_upgrade'
  | 'one_off'
  | 'one_off_upgrade'
  | 'other';

export interface BillingPayment {
  id: string;
  user_id: string | null;
  paid_at: string;
  /** Null when the amount cannot be known (one-off upgrades). */
  amount_cents: number | null;
  currency: string;
  kind: PaymentKind | string;
  plan_id: string | null;
  stripe_subscription_id: string | null;
  /** True when the amount is the plan's list price rather than money received. */
  estimated: boolean;
}

export interface BillingResponse {
  subscriptions: BillingSubscription[];
  payments: BillingPayment[];
  fetched_at: string;
}

const API_ENDPOINT = '/api/v1/dashboard/billing';

export async function getBilling(signal?: AbortSignal): Promise<BillingResponse> {
  return apiFetch<BillingResponse>(API_ENDPOINT, { signal });
}
