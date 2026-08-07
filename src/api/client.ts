// Single entry point for every dashboard API call.
//
// The backend recognises exactly one key (`VITE_ADMIN_API_KEY`), so that is
// what every request carries, regardless of who is signed in. The `admin` /
// `general` split is a *presentation* concern only — see src/auth/roles.ts.
//
// Consequence, stated plainly: a `general` user's browser still downloads the
// full admin payload; the UI just doesn't render the restricted parts. Making
// that a real boundary requires the backend to scope responses per key.

/** The API this dashboard reads from. Surfaced in the topbar so it is always
 *  obvious which environment the numbers on screen came from. */
export const API_BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
const BASE_URL = API_BASE_URL;
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiFetchOptions {
  /** Query params; empty / nullish values are dropped. */
  params?: Record<string, string | number | undefined | null>;
  /** Lets callers cancel superseded requests. */
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  if (!API_KEY) {
    throw new ApiError('VITE_ADMIN_API_KEY is not configured in .env', 0);
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': API_KEY },
      signal: options.signal,
    });
  } catch (err) {
    // AbortError is a caller-initiated cancel, not a failure — pass it through
    // untouched so callers can ignore it.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(`Network error reaching ${BASE_URL} — is the API running?`, 0);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new ApiError('The API rejected VITE_ADMIN_API_KEY — check that it is current.', response.status, body);
    }
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
      response.status,
      body,
    );
  }

  return response.json() as Promise<T>;
}
