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

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

export async function getUtmStats(): Promise<UtmStatsResponse> {
  if (!ADMIN_API_KEY) throw new Error('VITE_ADMIN_API_KEY is not configured');

  const url = `${BASE_URL}/api/v1/dashboard/stats/utm`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-Key': ADMIN_API_KEY },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch UTM stats: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  return response.json();
}
