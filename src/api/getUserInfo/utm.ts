import { apiFetch } from '../client';

export interface UtmData {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  [key: string]: string | null | undefined;
}

export interface LoginIp {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  isp?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  [key: string]: unknown;
}

export interface UtmUser {
  user_id: string;
  email?: string | null;
  utm_data: UtmData;
  signup_at: string | null;
  acquisition_sources?: string[] | null;
  login_ip?: LoginIp | null;
}

export interface UtmStatsResponse {
  total: number;
  users: UtmUser[];
}

const API_ENDPOINT = '/api/v1/dashboard/stats/utm';

export async function getUtmStats(signal?: AbortSignal): Promise<UtmStatsResponse> {
  return apiFetch<UtmStatsResponse>(API_ENDPOINT, { signal });
}
