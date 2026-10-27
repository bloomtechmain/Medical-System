// Subscription packages (migration 014): the catalogue of features a plan can
// switch on or cap, per dashboard type.
//
// The catalogue is code, not data, on purpose. Each key here is checked
// somewhere specific (middleware/planGate.ts, or a controller), so adding a
// key in the database alone would be a switch wired to nothing. What IS data
// is the value each plan gives a key — that lives in public.plans.features
// and is edited from the admin dashboard.
//
// Patients are not an audience. The patient side of the system is free and
// nothing in the plan layer ever restricts a patient request.

export type PlanAudience = 'doctor' | 'pharmacy' | 'laboratory' | 'hospital' | 'clinic';

export const PLAN_AUDIENCES: PlanAudience[] = ['doctor', 'pharmacy', 'laboratory', 'hospital', 'clinic'];

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  // boolean: on/off. limit: a non-negative integer cap, or null = unlimited.
  type: 'boolean' | 'limit';
  // Used when a plan row has no value for this key — e.g. a key added to the
  // catalogue after the plan was created. Off / zero, so a new paid feature
  // never silently appears on the free tier.
  fallback: boolean | number | null;
  // Where it is enforced. 'server' means an API request is refused when the
  // plan does not allow it. 'dashboard' means the feature is a section of an
  // organisation dashboard that the client hides — those dashboards are
  // reached through the same doctor endpoints as a doctor's own dashboard, so
  // the server cannot tell which dashboard a request came from. Shown to the
  // admin so the difference is not hidden.
  enforcedBy: 'server' | 'dashboard';
  unit?: string;
}

const TEAM_MEMBERS: FeatureDefinition = {
  key: 'team_members', label: 'Team members', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'staff accounts',
  description: 'Staff accounts the owner can add from the Team page (the owner is not counted).',
};

export const FEATURE_CATALOG: Record<PlanAudience, FeatureDefinition[]> = {
  doctor: [
    { key: 'consultations_per_month', label: 'Consultations per month', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'per month',
      description: 'Consultation records the doctor can create in a calendar month.' },
    { key: 'appointments_per_month', label: 'Confirmed appointments per month', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'per month',
      description: 'Booking requests the doctor can confirm in a calendar month. Patients can always send requests.' },
    { key: 'online_booking', label: 'Online appointment booking', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Publish weekly hours so patients can book appointments online.' },
    { key: 'patient_records_access', label: 'Patient record access', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Search patients and ask for access to their history and reports.' },
    { key: 'lab_requests', label: 'Lab test orders', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Order lab tests for a patient directly from the consultation.' },
    { key: 'lab_report_access', label: 'Lab report requests', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: "Ask a patient for permission to view a lab report someone else ordered." },
    { key: 'e_prescriptions', label: 'E-prescriptions to pharmacies', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Send a prescription straight to a pharmacy for dispensing.' },
    { key: 'hospital_affiliations', label: 'Hospital / clinic affiliations', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'organisations',
      description: 'Hospitals and clinics the doctor can channel at (including pending requests).' },
  ],
  pharmacy: [
    { key: 'medicines', label: 'Medicines in catalogue', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'medicines',
      description: 'Medicines the pharmacy can list in its own catalogue.' },
    { key: 'suppliers', label: 'Suppliers', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'suppliers',
      description: 'Suppliers the pharmacy can record.' },
    { key: 'purchase_orders', label: 'Purchase orders', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Raise purchase orders to suppliers and receive stock against them.' },
    { key: 'sales_analytics', label: 'Sales analytics', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Revenue and top-seller charts on the dashboard.' },
    { key: 'inventory_reports', label: 'Inventory reports', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'The Inventory page and expiring-stock report.' },
    TEAM_MEMBERS,
  ],
  laboratory: [
    { key: 'reports_per_month', label: 'Reports per month', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'per month',
      description: 'Lab report files the laboratory can upload in a calendar month.' },
    { key: 'test_catalog', label: 'Tests in catalogue', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'tests',
      description: 'Tests the laboratory can list in its catalogue.' },
    { key: 'direct_reports', label: 'Walk-in report uploads', type: 'boolean', fallback: false, enforcedBy: 'server',
      description: 'Upload a report for a patient without an existing request.' },
    TEAM_MEMBERS,
  ],
  hospital: [
    // Not a separate team_members limit: a hospital's Team page creates doctor
    // accounts too, so both routes onto the panel count against this one cap.
    { key: 'affiliated_doctors', label: 'Doctors on the panel', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'doctors',
      description: 'Doctors and staff at this hospital — accepted channeling requests plus accounts added from the Team page. The owner is not counted.' },
    { key: 'channeling', label: 'Channeling & appointments', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Appointments section of the hospital dashboard.' },
    { key: 'lab_requests', label: 'Lab reports section', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Lab Reports section of the hospital dashboard.' },
    { key: 'access_requests', label: 'Patient access requests section', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Access Requests section of the hospital dashboard.' },
  ],
  clinic: [
    // Not a separate team_members limit: a clinic's Team page creates doctor
    // accounts too, so both routes onto the panel count against this one cap.
    { key: 'affiliated_doctors', label: 'Doctors on the panel', type: 'limit', fallback: 0, enforcedBy: 'server', unit: 'doctors',
      description: 'Doctors and staff at this clinic — accepted channeling requests plus accounts added from the Team page. The owner is not counted.' },
    { key: 'channeling', label: 'Channeling & appointments', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Appointments section of the clinic dashboard.' },
    { key: 'lab_requests', label: 'Lab reports section', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Lab Reports section of the clinic dashboard.' },
    { key: 'access_requests', label: 'Patient access requests section', type: 'boolean', fallback: false, enforcedBy: 'dashboard',
      description: 'The Access Requests section of the clinic dashboard.' },
  ],
};

export const isPlanAudience = (v: unknown): v is PlanAudience =>
  typeof v === 'string' && (PLAN_AUDIENCES as string[]).includes(v);

// The audience a user's PERSONAL account belongs to. Patients and admins have
// none — they are never subject to a plan.
export const audienceForRole = (role: string): PlanAudience | null => {
  if (role === 'doctor') return 'doctor';
  if (role === 'pharmacist') return 'pharmacy';
  if (role === 'laboratory') return 'laboratory';
  return null;
};

export const findFeature = (audience: PlanAudience, key: string): FeatureDefinition | undefined =>
  FEATURE_CATALOG[audience].find(f => f.key === key);

export type FeatureValues = Record<string, boolean | number | null>;

/**
 * Every catalogue key for the audience with a definite value, so callers never
 * see `undefined` for a key the plan row happens not to mention.
 */
export const resolveFeatures = (audience: PlanAudience, stored: unknown): FeatureValues => {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const out: FeatureValues = {};
  for (const def of FEATURE_CATALOG[audience]) {
    const v = src[def.key];
    if (def.type === 'boolean') out[def.key] = typeof v === 'boolean' ? v : (def.fallback as boolean);
    else out[def.key] = v === null ? null : (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : (def.fallback as number | null));
  }
  return out;
};

/**
 * Validates admin input for a plan's features. Unknown keys and wrong types
 * are rejected rather than dropped, so a typo in the admin form is reported
 * instead of quietly saving a plan that is missing the feature.
 */
export const validateFeatures = (
  audience: PlanAudience,
  input: unknown,
): { ok: true; features: FeatureValues } | { ok: false; error: string } => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'features must be an object' };
  const out: FeatureValues = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const def = findFeature(audience, key);
    if (!def) return { ok: false, error: `Unknown feature "${key}" for ${audience} plans` };
    if (def.type === 'boolean') {
      if (typeof value !== 'boolean') return { ok: false, error: `"${key}" must be true or false` };
    } else if (value !== null && !(Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000)) {
      return { ok: false, error: `"${key}" must be a whole number from 0 to 1,000,000, or empty for unlimited` };
    }
    out[key] = value as boolean | number | null;
  }
  return { ok: true, features: resolveFeatures(audience, out) };
};
