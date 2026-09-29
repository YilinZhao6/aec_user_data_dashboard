import { apiFetch } from '../client';

/** One `error_log` row — client + server failure/telemetry events. */
export interface ErrorLogRow {
  id: number | null;
  user_id: string | null;
  email: string | null;
  conversation_id: string | null;
  conversation_type: string | null;
  error_type: string | null;
  /** False for routine telemetry (audio-ok pings, network checks); see backend BENIGN_ERROR_TYPES. */
  is_error: boolean;
  error_data: unknown;
  created_at: string | null;
}

export interface ErrorLogListResponse {
  rows: ErrorLogRow[];
  total_fetched: number;
  table_name: string;
}

/** One `agent_trace_log` row — a single LLM call's outcome. */
export interface TraceLogRow {
  trace_id: string | null;
  turn_id: string | null;
  user_id: string | null;
  email: string | null;
  conversation_id: string | null;
  call_site: string | null;
  model_name: string | null;
  status: string | null;
  ttft_ms: number | null;
  total_ms: number | null;
  error_type: string | null;
  error_message: string | null;
  created_at: string | null;
}

export interface TraceLogListResponse {
  rows: TraceLogRow[];
  total_fetched: number;
  table_name: string;
}

/** One `agent_test_suite` row — an automated end-to-end test run. */
export interface TestSuiteRow {
  id: string | null;
  status: string | null;
  severity: string | null;
  target_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  steps_used: number | null;
  summary: string | null;
  screenshot_url: string | null;
  conversation_detail: unknown;
  testcase_detail: unknown;
  created_at: string | null;
}

export interface TestSuiteListResponse {
  rows: TestSuiteRow[];
  total_fetched: number;
  table_name: string;
}

/** Server caps this at 500 regardless of what's requested. */
const DEFAULT_LIMIT = 500;

export async function getErrorLogs(limit = DEFAULT_LIMIT, signal?: AbortSignal): Promise<ErrorLogListResponse> {
  return apiFetch<ErrorLogListResponse>('/api/v1/dashboard/error-logs', { params: { limit }, signal });
}

export async function getTraceLogs(limit = DEFAULT_LIMIT, signal?: AbortSignal): Promise<TraceLogListResponse> {
  return apiFetch<TraceLogListResponse>('/api/v1/dashboard/trace-logs', { params: { limit }, signal });
}

export async function getTestSuiteRuns(limit = DEFAULT_LIMIT, signal?: AbortSignal): Promise<TestSuiteListResponse> {
  return apiFetch<TestSuiteListResponse>('/api/v1/dashboard/test-suite-runs', { params: { limit }, signal });
}
