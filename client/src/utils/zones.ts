// The three-subdomain split — docs/decisions/0006-three-domain-split.md.
// One build, one bundle, served at three hostnames. Which hostname a route
// belongs to is decided here; App.tsx uses it to bounce a request to the
// right subdomain (carrying the session with it — see authHandoff.ts)
// instead of rendering a page under the wrong domain.
//
// All three zone origins are optional. Unset (the default in dev, tests, and
// any single-domain deployment) means SITE_URL/APP_URL/DASHBOARD_URL were
// never configured, so `currentZone()` returns null and every redirect in
// App.tsx is skipped — the app behaves exactly as it did before the split,
// all zones reachable on one origin.
import { SITE_URL, APP_URL, DASHBOARD_URL } from '../env';

export type Zone = 'site' | 'app' | 'dashboard';

interface ZoneHosts { site: string; app: string; dashboard: string }

const hostOf = (url: string): string => {
  try { return new URL(url).host; } catch { return ''; }
};

const configuredHosts = (): ZoneHosts | null => {
  if (!SITE_URL || !APP_URL || !DASHBOARD_URL) return null;
  return { site: hostOf(SITE_URL), app: hostOf(APP_URL), dashboard: hostOf(DASHBOARD_URL) };
};

// The zone this page is currently running under, or null when the three
// zone domains are not configured (dev/test/single-domain) or the current
// host matches none of them (e.g. a Railway preview URL) — both cases mean
// "don't redirect, there's only one place to be."
export const currentZone = (): Zone | null => {
  const hosts = configuredHosts();
  if (!hosts || typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === hosts.app) return 'app';
  if (host === hosts.dashboard) return 'dashboard';
  if (host === hosts.site) return 'site';
  return null;
};

// Dashboards under /doctor, /hospital, /clinic, /pharmacist, /patient and
// /laboratory are one audience (app.suwela.com); /admin is the operator
// console (dashboard.suwela.com); everything else — landing, auth, public
// site pages — is the "site" zone (www.suwela.com).
const APP_ZONE_PREFIXES = ['/doctor', '/hospital', '/clinic', '/pharmacist', '/patient', '/laboratory', '/choose-dashboard'];

export const zoneForPath = (path: string): Zone => {
  if (path === '/admin' || path.startsWith('/admin/')) return 'dashboard';
  if (APP_ZONE_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) return 'app';
  return 'site';
};

// The origin (protocol + host, no path) a zone is served from, or null if
// zones are not configured — callers must treat null as "stay put."
export const zoneOrigin = (zone: Zone): string | null => {
  if (zone === 'site') return SITE_URL ?? null;
  if (zone === 'app') return APP_URL ?? null;
  return DASHBOARD_URL ?? null;
};
