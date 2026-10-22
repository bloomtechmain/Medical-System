import { PlanAudience } from '../types';

// Migration 014: shared lookups for the package UI.

/** Which package audience a dashboard (URL base) belongs to. */
export const DASHBOARD_AUDIENCE: Record<string, PlanAudience> = {
  doctor: 'doctor', pharmacist: 'pharmacy', laboratory: 'laboratory', hospital: 'hospital', clinic: 'clinic',
};

/** The feature a dashboard section needs, by dashboard then route segment. */
export const SECTION_FEATURE: Record<string, Record<string, string>> = {
  doctor:     { 'lab-requests': 'lab_requests', requests: 'patient_records_access', appointments: 'online_booking' },
  hospital:   { 'lab-requests': 'lab_requests', requests: 'access_requests', appointments: 'channeling' },
  clinic:     { 'lab-requests': 'lab_requests', requests: 'access_requests', appointments: 'channeling' },
  pharmacist: { orders: 'purchase_orders', inventory: 'inventory_reports' },
  laboratory: {},
};

/** The feature a nav link needs, or undefined if it is always available. */
export const featureForPath = (path: string): string | undefined => {
  const [, dash, section] = path.split('/');
  return section ? SECTION_FEATURE[dash]?.[section] : undefined;
};

export const PLAN_AUDIENCES: PlanAudience[] = ['doctor', 'pharmacy', 'laboratory', 'hospital', 'clinic'];

export const formatPrice = (amount: number, currency: string): string =>
  amount === 0 ? 'Free' : `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const formatLimit = (value: boolean | number | null | undefined): string =>
  value === null ? 'Unlimited' : String(value ?? 0);

// Tailwind classes per tier position (0 = free, 1 = middle, 2+ = top).
export const TIER_STYLE = [
  { ring: 'border-gray-200', badge: 'bg-gray-100 text-gray-700', accent: 'text-gray-700' },
  { ring: 'border-primary-300', badge: 'bg-primary-100 text-primary-700', accent: 'text-primary-700' },
  { ring: 'border-amber-300', badge: 'bg-amber-100 text-amber-800', accent: 'text-amber-700' },
];
export const tierStyle = (index: number) => TIER_STYLE[Math.min(index, TIER_STYLE.length - 1)];
