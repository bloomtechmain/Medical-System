import { describe, it, expect } from 'vitest';
import appSource from '../App.tsx?raw';
import { notificationRoute } from './notificationRoutes';

// Every notification type the server sends (grep sendNotification in
// server/). A click must land on a route that exists — the old per-header
// maps pointed at /patient/medical and /patient/lab-reports, which do not.
const TYPES = [
  'new_consultation', 'consultation_assigned', 'prescription_cancelled', 'prescription_preparing',
  'prescription_dispensed', 'prescription_delivered', 'prescription_message',
  'lab_request_assigned', 'lab_request_created', 'lab_request_sent', 'lab_report_ready',
  'lab_request_rejected', 'lab_request_message', 'access_request', 'lab_view_request',
  'access_accepted', 'access_declined', 'lab_view_accepted', 'lab_view_declined',
  'vitals_updated', 'report_vitals_extracted', 'report_vitals_none',
  'appointment_request', 'appointment_confirmed', 'appointment_declined', 'appointment_cancelled', 'appointment_completed',
  'org_join_request', 'org_registration_certification', 'org_doctor_left', 'org_removal_accepted', 'org_removal_declined',
  'org_join_accepted', 'org_join_declined', 'org_removal_request', 'org_registration_certified', 'org_registration_rejected',
  'registration_ready_for_review', 'plan_change_requested', 'plan_changed', 'account_approved',
];

// The routes App.tsx actually declares: "/section" and "/section/child".
const appRoutes = (() => {
  const src: string = appSource;
  const out = new Set<string>(['/']);
  let section: string | null = null;
  for (const line of src.split('\n')) {
    const top = line.match(/<Route path="(\/[a-z-]*)"/);
    if (top) { section = top[1]; out.add(top[1]); continue; }
    const child = line.match(/<Route path="([a-z-]+)"/);
    if (child && section) out.add(`${section}/${child[1]}`);
    if (line.includes('</Route>')) section = null;
  }
  return out;
})();

const USERS = [
  { role: 'patient' as const, organization: null },
  { role: 'doctor' as const, organization: null },
  { role: 'doctor' as const, organization: { id: 1, name: 'H', org_type: 'hospital' as const, slug: 'h', is_active: true } },
  { role: 'doctor' as const, organization: { id: 2, name: 'C', org_type: 'clinic' as const, slug: 'c', is_active: true } },
  { role: 'pharmacist' as const, organization: null },
  { role: 'laboratory' as const, organization: null },
  { role: 'admin' as const, organization: null },
];

describe('notificationRoute', () => {
  it('only ever points at routes that exist', () => {
    const broken: string[] = [];
    for (const type of TYPES) {
      for (const user of USERS) {
        const to = notificationRoute(type, user as never);
        if (to && !appRoutes.has(to.split('#')[0])) broken.push(`${type} (${user.role}/${user.organization?.org_type ?? '-'}) -> ${to}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('sends a hospital owner to their hospital dashboard, not the personal doctor one', () => {
    expect(notificationRoute('org_registration_certification', USERS[2] as never)).toBe('/hospital/team#certify');
    expect(notificationRoute('lab_report_ready', USERS[3] as never)).toBe('/clinic/lab-requests');
  });

  it('routes the patient to their own pages', () => {
    expect(notificationRoute('lab_report_ready', USERS[0] as never)).toBe('/patient/lab-tests');
    expect(notificationRoute('new_consultation', USERS[0] as never)).toBe('/patient/consultations');
  });
});
