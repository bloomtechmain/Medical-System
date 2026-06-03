import { Request } from 'express';

export type UserRole = 'admin' | 'doctor' | 'pharmacist' | 'patient' | 'laboratory';

export interface JwtUser {
  id: number;
  email: string;
  role: UserRole;
}

// Augment Express Request to carry the decoded JWT user
declare global {
  namespace Express {
    interface Request {
      user: JwtUser;
    }
  }
}

export interface DbUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
  supplier_name?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: Date;
}

export interface Order {
  id: number;
  supplier_id: number | null;
  ordered_by: number | null;
  status: 'pending' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  ordered_at: Date;
  received_at: Date | null;
  supplier_name?: string;
  ordered_by_name?: string;
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
  sold_at: Date;
  sold_by_name?: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  medicine_id: number;
  quantity: number;
  unit_price: number;
  medicine_name?: string;
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
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
}

export interface LabViewRequest {
  id: number;
  lab_request_id: number;
  doctor_id: number;
  patient_id: number;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined';
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DataAccessRequest {
  id: number;
  doctor_id: number;
  patient_id: number;
  access_type: 'lab_reports' | 'medical_history' | 'personal_reports' | 'contact_info';
  reason: string | null;
  status: 'pending' | 'accepted' | 'declined';
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

export interface OcrMedicine {
  medicine_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  source: 'ocr';
}
