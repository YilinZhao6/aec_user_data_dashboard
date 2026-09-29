import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { resolveRole, hasConfiguredKeys, ROLE_ACCESS, ROLE_LABELS, type UserRole } from './roles';

export type { UserRole };

type AuthState = {
  apiKey: string;
  role: UserRole;
} | null;

type AuthContextValue = {
  auth: AuthState;
  /** Convenience: 'general' when signed out, so callers never gate on null. */
  role: UserRole;
  /** Display name for `role` — what the topbar shows. */
  roleLabel: string;
  isAdmin: boolean;
  /** Retention, cohort tables, renewal and Channels. See ROLE_ACCESS. */
  canViewGrowth: boolean;
  /** Cohort sizes and the counts behind each growth rate. */
  canViewGrowthCounts: boolean;
  /** Dollar figures and the cancellation analysis. */
  canViewRevenue: boolean;
  login: (key: string) => boolean; // returns false if key is invalid
  logout: () => void;
};

const LS_KEY = 'dashboard_api_key';

function loadFromStorage(): AuthState {
  try {
    const key = localStorage.getItem(LS_KEY);
    if (!key) return null;
    const role = resolveRole(key);
    if (!role) { localStorage.removeItem(LS_KEY); return null; }
    return { apiKey: key, role };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadFromStorage);

  const login = useCallback((rawKey: string): boolean => {
    const key = rawKey.trim();
    const role = resolveRole(key);
    if (!role) return false;
    try { localStorage.setItem(LS_KEY, key); } catch { /* storage unavailable */ }
    setAuth({ apiKey: key, role });
    return true;
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* storage unavailable */ }
    setAuth(null);
  }, []);

  const role: UserRole = auth?.role ?? 'general';

  return (
    <AuthContext.Provider
      value={{
        auth,
        role,
        roleLabel: ROLE_LABELS[role],
        isAdmin: role === 'admin',
        canViewGrowth: ROLE_ACCESS[role].growth,
        canViewGrowthCounts: ROLE_ACCESS[role].growthCounts,
        canViewRevenue: ROLE_ACCESS[role].revenue,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export { hasConfiguredKeys };
