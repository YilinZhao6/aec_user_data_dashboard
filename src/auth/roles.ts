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

export type UserRole = 'admin' | 'general';

/** Parse VITE_API_KEYS="admin:sk-xxx,general:sk-yyy" into key -> role. */
function buildKeyMap(): Map<string, UserRole> {
  const raw = import.meta.env.VITE_API_KEYS as string | undefined;
  const map = new Map<string, UserRole>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const role = pair.slice(0, idx).trim();
    const key = pair.slice(idx + 1).trim();
    if (key && (role === 'admin' || role === 'general')) map.set(key, role);
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
