// API + types for the model-health page.
//
// `/api/v1/dashboard/model-health` returns raw counts from `model_health_30m`
// (attempts per 30-minute bucket × call site × model × route, with two latency
// histograms) and `model_health_probe` (the 5-minute liveness probe), in two
// views: the last 24 hours in half hours and the last 30 days in days. The
// scoring happens on the page (src/pages/models/healthScoring.js); this file
// only turns the ISO timestamps into Dates.

import { apiFetch } from '../client';

export interface LiveRow {
  /** Index into the view's `starts`. */
  bucket: number;
  call_site: string;
  model: string;
  route: string;
  calls: number;
  ok: number;
  final_failed: number;
  cancelled: number;
  err_503: number;
  err_429: number;
  err_timeout: number;
  err_empty: number;
  err_stalled: number;
  err_other: number;
  retries: number;
  fb_dev_to_vertex: number;
  fb_dev_to_priority: number;
  fb_failed: number;
  fb_rescued: number;
  wb_first_token_fb: number;
  wb_hedge: number;
  vertex_calls: number;
  vertex_not_priority: number;
  /** 19 bins; edges in healthScoring HIST_EDGES_MS. */
  ttft_hist: number[];
  total_hist: number[];
  input_tokens: number;
  output_tokens: number;
}

export interface ProbeResult {
  at: Date;
  ok: boolean;
  ttftMs: number | null;
}

/** Half-hour view: every 5-minute probe of the bucket. */
export interface ProbeBucketRow {
  bucket: number;
  model: string;
  route: string;
  results: ProbeResult[];
}

/** Day view: the day summarised. */
export interface ProbeDayRow {
  bucket: number;
  model: string;
  route: string;
  calls: number;
  ok: number;
  slow: number;
  maxFailStreak: number;
}

export interface Baselines {
  [callSite: string]: { ttftP90: number | null; totalP90: number | null };
}

export interface HealthView<P> {
  id: 'halfHour' | 'day';
  bucketMs: number;
  starts: Date[];
  live: LiveRow[];
  probe: P[];
  baselines: Baselines;
}

export interface ModelHealthResponse {
  generatedAt: Date;
  halfHour: HealthView<ProbeBucketRow>;
  day: HealthView<ProbeDayRow>;
}

type Wire<T> = Omit<T, 'starts'> & { starts: string[] };
interface WireResponse {
  generatedAt: string;
  halfHour: Wire<HealthView<Omit<ProbeBucketRow, 'results'> & { results: (Omit<ProbeResult, 'at'> & { at: string })[] }>>;
  day: Wire<HealthView<ProbeDayRow>>;
}

export interface ModelHealthParams {
  hours?: number;
  days?: number;
  /** Where a day starts for the day view; defaults to the browser's zone. */
  tz?: string;
}

export async function getModelHealth(params: ModelHealthParams = {}, signal?: AbortSignal): Promise<ModelHealthResponse> {
  const tz = params.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const wire = await apiFetch<WireResponse>('/api/v1/dashboard/model-health', {
    params: { view: 'both', hours: params.hours, days: params.days, tz },
    signal,
  });
  return {
    generatedAt: new Date(wire.generatedAt),
    halfHour: {
      ...wire.halfHour,
      starts: wire.halfHour.starts.map((s) => new Date(s)),
      probe: wire.halfHour.probe.map((p) => ({ ...p, results: p.results.map((r) => ({ ...r, at: new Date(r.at) })) })),
    },
    day: { ...wire.day, starts: wire.day.starts.map((s) => new Date(s)) },
  };
}
