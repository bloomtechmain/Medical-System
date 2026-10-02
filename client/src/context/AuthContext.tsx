import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { User } from '../types';

const ADMIN_SESSION_KEY = 'admin_session';

interface AuthContextValue {
  token: string | null;
  user: User | null;
  isImpersonating: boolean;
  login: (userData: User, jwt: string) => void;
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

  const login = useCallback((userData: User, jwt: string) => {
    setToken(jwt);
    setUser(userData);
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsImpersonating(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }, []);

  // Admin "View As" — stash the admin's own session, then switch the active
  // session to the target user. The target's JWT carries their own real
  // identity (see server/controllers/authController.ts impersonate), so
  // every subsequent request genuinely acts as them.
  const impersonate = useCallback((userData: User, jwt: string) => {
    const currentToken = localStorage.getItem('token');
    const currentUser  = localStorage.getItem('user');
    if (currentToken && currentUser) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token: currentToken, user: currentUser }));
      setIsImpersonating(true);
    }
    setToken(jwt);
    setUser(userData);
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const exitImpersonation = useCallback(() => {
    const saved = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!saved) return;
    try {
      const { token: adminToken, user: adminUserJson } = JSON.parse(saved);
      setToken(adminToken);
      setUser(JSON.parse(adminUserJson));
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user', adminUserJson);
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
