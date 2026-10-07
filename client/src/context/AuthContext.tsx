import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

const ADMIN_SESSION_KEY = 'admin_session';

interface AuthContextValue {
  token: string | null;
  user: User | null;
  isImpersonating: boolean;
  login: (userData: User, jwt: string, refreshToken?: string) => void;
  logout: () => void;
  impersonate: (userData: User, jwt: string) => void;
  exitImpersonation: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    // Inconsistent state: token without user data → wipe both so the app can
    // start clean rather than entering an infinite redirect loop at /login.
    if (t && !u) { localStorage.removeItem('token'); return null; }
    return t;
  });
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [isImpersonating, setIsImpersonating] = useState<boolean>(() => !!localStorage.getItem(ADMIN_SESSION_KEY));

  const login = useCallback((userData: User, jwt: string, refreshToken?: string) => {
    setToken(jwt);
    setUser(userData);
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify(userData));
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  }, []);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) authApi.logoutSession(refreshToken).catch(() => {});
    setToken(null);
    setUser(null);
    setIsImpersonating(false);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }, []);

  // Admin "View As" — stash the admin's own session, then switch the active
  // session to the target user. The target's JWT carries their own real
  // identity (see server/controllers/authController.ts impersonate), so
  // every subsequent request genuinely acts as them. Impersonation tokens
  // deliberately get no refresh token (hard-capped, no silent renewal) — the
  // admin's own refreshToken is stashed away too, not left sitting in
  // localStorage, so the response interceptor can't use it to silently
  // refresh back into the admin's identity mid-impersonation without anyone
  // noticing.
  const impersonate = useCallback((userData: User, jwt: string) => {
    const currentToken = localStorage.getItem('token');
    const currentUser  = localStorage.getItem('user');
    const currentRefresh = localStorage.getItem('refreshToken');
    if (currentToken && currentUser) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token: currentToken, user: currentUser, refreshToken: currentRefresh }));
      setIsImpersonating(true);
    }
    setToken(jwt);
    setUser(userData);
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem('refreshToken');
  }, []);

  const exitImpersonation = useCallback(() => {
    const saved = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!saved) return;
    try {
      const { token: adminToken, user: adminUserJson, refreshToken: adminRefresh } = JSON.parse(saved);
      setToken(adminToken);
      setUser(JSON.parse(adminUserJson));
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user', adminUserJson);
      if (adminRefresh) localStorage.setItem('refreshToken', adminRefresh);
    } finally {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setIsImpersonating(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isImpersonating, login, logout, impersonate, exitImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
