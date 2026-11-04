import { describe, it, expect } from 'vitest';
import { isAdminAlias, zoneForPath } from './zones';

describe('zones', () => {
  it('treats admin.<domain> as the admin dashboard zone', () => {
    expect(isAdminAlias('admin.suwela.com', 'dashboard.suwela.com')).toBe(true);
    expect(isAdminAlias('app.suwela.com', 'dashboard.suwela.com')).toBe(false);
    expect(isAdminAlias('admin.evil.com', 'dashboard.suwela.com')).toBe(false);
  });

  it('sends /admin to the dashboard zone and role dashboards to the app zone', () => {
    expect(zoneForPath('/admin/billing')).toBe('dashboard');
    expect(zoneForPath('/doctor/patients')).toBe('app');
    expect(zoneForPath('/login')).toBe('site');
  });
});
