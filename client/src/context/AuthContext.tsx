import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { authApi } from '../services/api';
import { clearActiveContextKey } from '../constants/dashboards';
import {
  consumeAuthHandoff, consumeSignout, consumeNoSession, clearStoredSession, tokenIssuedAt,
  SIGNOUT_HASH, SESSION_ORIGIN_KEY,
} from '../utils/authHandoff';
import { currentZone, zoneOrigin } from '../utils/zones';
import BrandLoader from '../components/common/BrandLoader';

const ADMIN_SESSION_KEY = 'admin_session';

// Runs once, at module load — before AuthProvider's first render, so the
// useState initializers below see a freshly-written localStorage rather than
// racing a useEffect and flashing "logged out" for one frame. See
// src/utils/authHandoff.ts for why the session arrives this way at all.
if (consumeSignout()) {
  // Signed out on another subdomain: forget anything this one still holds.
  clearStoredSession();
  clearActiveContextKey();
}
const noSessionAt = consumeNoSession();
if (noSessionAt && localStorage.getItem(SESSION_ORIGIN_KEY) === noSessionAt) {
  localStorage.removeItem(SESSION_ORIGIN_KEY);
}
const handoff = consumeAuthHandoff();
if (handoff?.token) {
  // Keep whichever session is newer. A copy left here by an older version of
  // the app may be fresher than the one arriving, and replacing it with a
  // stale one would end in an unexpected sign-out.
  const keepExisting = tokenIssuedAt(localStorage.getItem('token')) > tokenIssuedAt(handoff.token);
  if (!keepExisting) {
    localStorage.setItem('token', handoff.token);
    localStorage.setItem('user', JSON.stringify(handoff.user));
    if (handoff.refreshToken) localStorage.setItem('refreshToken', handoff.refreshToken);
    else localStorage.removeItem('refreshToken');
    if (handoff.adminSession) localStorage.setItem(ADMIN_SESSION_KEY, handoff.adminSession);
    else localStorage.removeItem(ADMIN_SESSION_KEY);
  }
}

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

  const navigate = useNavigate();
  // Set while a sign-out is on its way to www.suwela.com: the app shows the
  // loader instead of re-rendering the dashboard (or a route guard firing a
  // second, competing redirect).
  const [leaving, setLeaving] = useState(false);

  // Signs out and goes to the sign-in page. Callers need do nothing else.
  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    clearStoredSession();
    // Requirement 1: a remembered dashboard choice belongs to the account that
    // made it. Leaving it would send the NEXT person to sign in on this
    // browser straight to a dashboard they may not even have.
    clearActiveContextKey();

    const site = zoneOrigin('site');
    if (currentZone() !== null && site) {
      // Subdomains in use: end on www.suwela.com/login#signout, which also
      // clears www's storage. Revoke the refresh token first (briefly; the
      // page is about to unload and would cancel the request).
      setLeaving(true);
      const go = () => window.location.replace(`${site}/login#${SIGNOUT_HASH}`);
      if (!refreshToken) { go(); return; }
      Promise.race([
        authApi.logoutSession(refreshToken).catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]).then(go);
      return;
    }

    if (refreshToken) authApi.logoutSession(refreshToken).catch(() => {});
    setToken(null);
    setUser(null);
    setIsImpersonating(false);
    navigate('/login', { replace: true });
  }, [navigate]);

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
      {leaving ? <BrandLoader /> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
