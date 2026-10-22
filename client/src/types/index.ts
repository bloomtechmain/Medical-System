// ── Shared application types ───────────────────────────────────────────────────

export type UserRole = 'admin' | 'doctor' | 'pharmacist' | 'patient' | 'laboratory';

export type OrgType = 'hospital' | 'clinic' | 'pharmacy' | 'laboratory';

export interface UserOrganization {
  id: number;
  name: string;
  org_type: OrgType;
  slug: string;
  is_active: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled?: boolean;
  created_at: string;
  updated_at: string;
  profile?: DoctorProfile | PatientProfile | PharmacistProfile | LaboratoryProfile | null;
  /** The first organisation this user owns (or belongs to). Kept for existing
   *  callers; prefer `memberships`, which lists all of them. */
  organization?: UserOrganization | null;
  /** Requirement 1: every organisation this user belongs to, so the client can
   *  offer a dashboard choice and a switcher. A doctor who owns a hospital has
   *  both their own doctor dashboard and the hospital's — preferring one and
   *  hiding the other is the bug this replaced. */
  memberships?: (UserOrganization & { member_role: string; plan?: Plan | null })[];
  /** Migration 014: the package behind this user's own dashboard (for a
   *  pharmacist or laboratory user, their organisation's). null for patients
   *  and admins, who are never on a package. A snapshot from sign-in — use
   *  the useDashboardPlan hook for the live value. */
  plan?: Plan | null;
}

export interface PatientProfile {
  id: number;
  user_id: number;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
}

export interface DoctorProfile {
  id: number;
  user_id: number;
  phone: string | null;
  specialization: string | null;
  license_number: string | null;
  medical_school: string | null;
  years_experience: number;
  hospital_affiliation: string | null;
  consultation_fee: number;
  bio: string | null;
}

export interface PharmacistProfile {
  id: number;
  user_id: number;
  phone: string | null;
  license_number: string | null;
  pharmacy_name: string | null;
  pharmacy_address: string | null;
  years_experience: number;
  specialization_area: string | null;
}

export interface LaboratoryProfile {
  id: number;
  user_id: number;
  phone: string | null;
  lab_name: string | null;
  lab_type: string | null;
  license_number: string | null;
  accreditation: string | null;
  address: string | null;
  services_offered: string | null;
  operating_hours: string | null;
  website: string | null;
}

export interface Medicine {
  id: number;
  name: string;
  generic_name: string | null;
  category: string | null;
  description: string | null;
  unit: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  expiry_date: string | null;
  supplier_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  supplier_id: number | null;
  ordered_by: number | null;
  status: 'pending' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  ordered_at: string;
  received_at: string | null;
  supplier_name?: string;
  ordered_by_name?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  medicine_id: number;
  quantity: number;
  unit_cost: number;
  medicine_name?: string;
}

export interface Sale {
  id: number;
  sold_by: number | null;
  customer_name: string | null;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'online';
  sold_at: string;
  sold_by_name?: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id: number;
  sale_id: number;
  medicine_id: number;
  quantity: number;
  unit_price: number;
  medicine_name?: string;
}

export interface ConsultationMedicine {
  id: number;
  consultation_id: number;
  medicine_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  source: 'manual' | 'ocr';
}

export interface MedicalConsultation {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  assigned_pharmacist_id: number | null;
  visit_date: string;
  doctor_name: string | null;
  hospital_clinic: string | null;
  sick_description: string | null;
  diagnosis: string | null;
  treatment_description: string | null;
  prescription_file: string | null;
  ocr_text: string | null;
  lab_tests_requested: string | null;
  status: 'active' | 'dispensed' | 'completed';
  created_at: string;
  updated_at: string;
  medicines?: ConsultationMedicine[];
  doctor_display_name?: string;
  pharmacy_name?: string;
  pharmacist_name?: string;
  medicine_count?: number;
}

export interface LabRequest {
  id: number;
  doctor_id: number | null;
  patient_id: number;
  laboratory_id: number;
  consultation_id: number | null;
  test_description: string;
  notes: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  report_file: string | null;
  report_mimetype: string | null;
  report_notes: string | null;
  created_at: string;
  updated_at: string;
  doctor_name?: string;
  patient_name?: string;
  lab_name?: string;
  lab_type?: string;
  lab_phone?: string;
  lab_address?: string;
}

export interface LabViewRequest {
  id: number;
  lab_request_id: number;
  doctor_id: number;
  patient_id: number;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined';
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  doctor_name?: string;
  doctor_email?: string;
  doctor_specialization?: string;
  doctor_hospital?: string;
  test_description?: string;
  lab_name?: string;
  report_file?: string;
  report_notes?: string;
}

export interface DataAccessRequest {
  id: number;
  doctor_id: number;
  patient_id: number;
  access_type: 'lab_reports' | 'medical_history' | 'personal_reports' | 'contact_info';
  reason: string | null;
  status: 'pending' | 'accepted' | 'declined';
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  doctor_name?: string;
  doctor_specialization?: string;
  doctor_hospital?: string;
}

export interface PatientReport {
  id: number;
  patient_id: number;
  title: string;
  report_type: 'lab_report' | 'prescription' | 'imaging' | 'discharge_summary' | 'vaccination' | 'other';
  laboratory_name: string | null;
  doctor_name: string | null;
  hospital_clinic: string | null;
  issued_date: string;
  description: string | null;
  file_path: string;
  file_mimetype: string | null;
  file_original_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface PatientSearchResult {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  phone?: string | null;
  date_of_birth?: string | null;
  blood_type?: string | null;
  gender?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  insurance_provider?: string | null;
}

export interface LaboratorySearchResult {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  lab_name?: string | null;
  lab_type?: string | null;
  address?: string | null;
  phone?: string | null;
  accreditation?: string | null;
  operating_hours?: string | null;
  services_offered?: string | null;
  license_number?: string | null;
}

export interface InventorySummary {
  total_medicines: number;
  low_stock_count: number;
  expired_count: number;
  inventory_value: number;
}

export interface Organization {
  id: number;
  slug: string;
  name: string;
  org_type: 'hospital' | 'pharmacy' | 'laboratory' | 'clinic';
  schema_name: string | null;
  owner_user_id: number | null;
  owner_name?: string | null;
  owner_email?: string | null;
  is_active: boolean;
  approved_at: string | null;
  created_at: string;
  member_count?: number;
  /** Migration 014: the organisation's package (the default one if none is set). */
  plan_id?: number | null;
  plan_name?: string | null;
  plan_code?: string | null;
  plan_is_default?: boolean;
}

export interface OrganizationMember {
  id: number;
  organization_id?: number;
  user_id: number;
  member_role: 'doctor' | 'pharmacist' | 'laboratory' | 'staff' | 'owner';
  created_at: string;
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

export interface UserStats {
  users: {
    total_patients: number;
    total_doctors: number;
    total_pharmacists: number;
    total_laboratories: number;
    total_admins: number;
    total_users: number;
    active_users: number;
    new_this_week: number;
  };
  organizations: {
    total_organizations: number;
    total_hospitals: number;
    total_pharmacies: number;
    total_laboratories: number;
    total_clinics: number;
    pending_organizations: number;
  };
  medicines: {
    total_medicines: number;
    low_stock: number;
    expired: number;
  };
  consultations: {
    total_consultations: number;
    active_consultations: number;
    completed_consultations: number;
  };
  labs: {
    total_lab_requests: number;
    pending_lab_requests: number;
    completed_lab_requests: number;
  };
  sales: {
    total_sales: number;
    total_revenue: number;
    sales_this_month: number;
  };
  appointments: {
    total_appointments: number;
    upcoming_appointments: number;
    completed_appointments: number;
  };
  recentUsers: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    created_at: string;
  }>;
}

export interface Toast {
  msg: string;
  type: 'success' | 'error';
}

// ── Subscription packages (migration 014) ─────────────────────────────────────

export type PlanAudience = 'doctor' | 'pharmacy' | 'laboratory' | 'hospital' | 'clinic';

/** A boolean feature is true/false; a limit is a number, or null for unlimited. */
export type PlanFeatureValues = Record<string, boolean | number | null>;

export interface PlanFeatureDefinition {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'limit';
  fallback: boolean | number | null;
  enforcedBy: 'server' | 'dashboard';
  unit?: string;
}

export interface Plan {
  id: number;
  audience: PlanAudience;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  features: PlanFeatureValues;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  subscribers?: number;
  active_subscribers?: number;
}

export interface PlanSubject {
  kind: 'user' | 'organization';
  id: number;
  audience: PlanAudience;
}

export interface MyPlan {
  subject: PlanSubject | null;
  plan: Plan | null;
  features: PlanFeatureDefinition[];
  usage: Record<string, number>;
}

export interface PlanSubscriber {
  kind: 'user' | 'organization';
  id: number;
  name: string;
  contact: string | null;
  audience: PlanAudience;
  is_active: boolean;
  approved_at: string | null;
  created_at: string;
  on_default: boolean;
  plan_id: number;
  plan_code: string;
  plan_name: string;
  price_monthly: number;
  currency: string;
  plan_changed_at: string | null;
}

export interface PlanSummary {
  patients: { total: number };
  audiences: {
    audience: PlanAudience;
    total: number;
    estimated_monthly_revenue: number;
    plans: { plan_id: number; code: string; name: string; price_monthly: number; currency: string; is_default: boolean; is_active: boolean; subscribers: number; active_subscribers: number }[];
  }[];
}
