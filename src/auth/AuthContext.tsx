import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type UserRole = 'admin' | 'general';

type AuthState = {
  apiKey: string;
  role: UserRole;
} | null;

type AuthContextValue = {
  auth: AuthState;
  login: (key: string) => boolean; // returns false if key is invalid
  logout: () => void;
};

const LS_KEY = 'dashboard_api_key';

// Parse VITE_API_KEYS="admin:sk-xxx,general:sk-yyy" into a map
function buildKeyMap(): Map<string, UserRole> {
  const raw = import.meta.env.VITE_API_KEYS as string | undefined;
  const map = new Map<string, UserRole>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const role = pair.slice(0, idx).trim() as UserRole;
    const key = pair.slice(idx + 1).trim();
    if (key) map.set(key, role);
  }
  return map;
}

const KEY_MAP = buildKeyMap();

function resolveRole(key: string): UserRole | null {
  return KEY_MAP.get(key) ?? null;
}

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

  const login = useCallback((key: string): boolean => {
    const role = resolveRole(key.trim());
    if (!role) return false;
    localStorage.setItem(LS_KEY, key.trim());
    setAuth({ apiKey: key.trim(), role });
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
