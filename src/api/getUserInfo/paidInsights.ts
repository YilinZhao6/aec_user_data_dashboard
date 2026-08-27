// API + types for the Paid tab's feature-usage section.
//
// Fetched on its own (`/api/v1/dashboard/paid-insights`), not alongside
// `/paid`: it walks six product tables and takes ~10s, and the rest of the
// tab must stay usable while it is in flight.
//
// The backend returns raw timestamped events for every user who has ever
// held a paid tier. Which of those users actually *paid*, and when their
// first payment was, stay frontend rules — see paid.ts.

import { apiFetch } from '../client';

/** Feature keys the backend emits today. Anything it adds later still
 *  renders — see `featureLabel` — it just falls back to the raw key. */
export type FeatureKey =
  | 'chat'
  | 'course_generation'
  | 'deep_learn'
  | 'calendar_task'
  | 'canvas_automation'
  | 'whiteboard'
  | 'pdf_annotation';

/** Display order + labels. Keys not listed here sort last, under their own
 *  raw name, so a newly shipped feature shows up instead of vanishing. */
const FEATURE_LABELS: Record<string, string> = {
  chat: '对话 Chat',
  course_generation: '课程生成 Course',
  deep_learn: '深度学习 Deep Learn',
  whiteboard: '白板 Whiteboard',
  pdf_annotation: 'PDF 批注',
  calendar_task: '日程任务 Calendar',
  canvas_automation: '自动化 Canvas',
};

const FEATURE_ORDER = Object.keys(FEATURE_LABELS);

export const featureLabel = (key: string): string => FEATURE_LABELS[key] ?? key;

/** Sort key: known features in declared order, unknown ones after them. */
export const featureRank = (key: string): number => {
  const i = FEATURE_ORDER.indexOf(key);
  return i === -1 ? FEATURE_ORDER.length : i;
};

export interface FeatureEvent {
  user_id: string;
  feature: string;
  /** ISO timestamp of the event. */
  at: string;
}

export interface PaidInsightsResponse {
  feature_events: FeatureEvent[];
  /** How many users the events cover (everyone who ever held a paid tier). */
  paid_tier_users: number;
  table_name: string;
}

const API_ENDPOINT = '/api/v1/dashboard/paid-insights';

export async function getPaidInsights(signal?: AbortSignal): Promise<PaidInsightsResponse> {
  return apiFetch<PaidInsightsResponse>(API_ENDPOINT, { signal });
}
