// Role resolution — deliberately isolated in one file.
//
// ⚠️  THIS IS A DISPLAY SWITCH, NOT A SECURITY BOUNDARY.
//
// The keys in `VITE_API_KEYS` are a client-side sign-in gate: they decide
// which sections the UI *draws*. They are not sent to the backend and the
// backend does not know them — every API request carries the single key the
// backend does recognise (see src/api/client.ts).
//
// Vite inlines `VITE_API_KEYS` into the JS bundle at build time, so both keys
// are readable in devtools, and a `general` user's browser holds the full
// admin payload either way. Treat this as UI convenience only.
//
// To make it real, the backend has to scope responses per key. At that point
// replace `resolveRole` with a call to the backend and delete this file —
// AuthContext is its only consumer.

export type UserRole = 'admin' | 'growth' | 'general';

/** What the topbar calls each role. The ids above are what the code gates on. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Founder',
  growth: 'Growth Internal',
  general: 'General',
};

/**
 * What each role is shown, beyond the baseline every signed-in user gets.
 *
 * - `growth`: the growth views — Retention, the cohort tables, renewal, and
 *   the Channels tab.
 * - `growthCounts`: cohort sizes and the numerator / denominator behind each
 *   rate in those views. A rate over an unknown sample cannot be judged, so
 *   the growth role gets them; flip it to `false` here to hold that role to
 *   percentages only.
 * - `revenue`: money — daily revenue, MRR / ARR — and the cancellation
 *   analysis that sits with it. Flip `growth` to `false` here to keep dollar
 *   figures to the admin role.
 *
 * Everything that was admin-only before — cumulative totals, lists that name
 * individual users, Error Logs — stays admin-only. `growth` does not widen it.
 */
export const ROLE_ACCESS: Record<UserRole, { growth: boolean; growthCounts: boolean; revenue: boolean }> = {
  admin: { growth: true, growthCounts: true, revenue: true },
  growth: { growth: true, growthCounts: true, revenue: true },
  general: { growth: false, growthCounts: false, revenue: false },
};

// Names accepted in VITE_API_KEYS, including the display names people
// actually say out loud.
const ROLE_ALIASES: Record<string, UserRole> = {
  admin: 'admin',
  founder: 'admin',
  growth: 'growth',
  growth_internal: 'growth',
  general: 'general',
};

/** Parse VITE_API_KEYS="admin:sk-xxx,growth:sk-zzz,general:sk-yyy" into key -> role. */
function buildKeyMap(): Map<string, UserRole> {
  const raw = import.meta.env.VITE_API_KEYS as string | undefined;
  const map = new Map<string, UserRole>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const role = ROLE_ALIASES[pair.slice(0, idx).trim().toLowerCase()];
    const key = pair.slice(idx + 1).trim();
    if (key && role) map.set(key, role);
  }
  return map;
}

const KEY_MAP = buildKeyMap();

/** Returns null when the key isn't recognised. */
export function resolveRole(key: string): UserRole | null {
  return KEY_MAP.get(key) ?? null;
}

/** True when no keys are configured at all — worth surfacing on the login page. */
export function hasConfiguredKeys(): boolean {
  return KEY_MAP.size > 0;
}
