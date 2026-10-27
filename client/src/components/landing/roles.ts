import { Stethoscope, UserRound, Pill, FlaskConical, Hospital, ShieldCheck, type LucideIcon } from 'lucide-react';

// Everything the public pages say about each kind of account. The "can" lists
// mirror the routes each dashboard actually exposes in App.tsx — keep them in
// step if a dashboard gains or loses a section.
export type RoleId = 'patient' | 'doctor' | 'pharmacist' | 'laboratory' | 'org' | 'admin';

export interface RoleInfo {
  id: RoleId;
  label: string;
  short: string;
  icon: LucideIcon;
  color: string;        // hex, for SVG strokes and fills
  tint: string;         // lighter partner of `color`, for gradients
  chip: string;         // tailwind classes for the icon chip
  pitch: string;
  can: string[];
  nav: string[];        // sidebar items drawn in the sketch of the dashboard
  register?: { to: string; label: string };
}

export const ROLES: RoleInfo[] = [
  {
    id: 'patient',
    label: 'Patient',
    short: 'Patients',
    icon: UserRound,
    color: '#13A58F',
    tint: '#5EDDB0',
    chip: 'bg-emerald-50 text-suwela-green ring-emerald-200',
    pitch: 'Your whole medical story in one place, readable in English or සිංහල — and nobody sees it unless you say so.',
    can: [
      'Book a doctor and track appointments',
      'See every consultation, prescription and lab test on one timeline',
      'Upload past reports — readings are pulled out of the scan where possible',
      'Approve or decline doctors who ask to view your history',
    ],
    nav: ['Dashboard', 'Medical flow', 'Consultations', 'Lab tests', 'My reports', 'Access requests', 'Book a doctor'],
    register: { to: '/register', label: 'Create a free patient account' },
  },
  {
    id: 'doctor',
    label: 'Doctor',
    short: 'Doctors',
    icon: Stethoscope,
    color: '#1598E9',
    tint: '#5CC6FF',
    chip: 'bg-sky-50 text-suwela-blue ring-sky-200',
    pitch: 'Write the consultation once. The prescription reaches the pharmacy and the test request reaches the lab on its own.',
    can: [
      'Record symptoms, diagnosis, vitals and treatment plans',
      'Send prescriptions to the patient’s chosen pharmacy',
      'Request lab tests and get the report back on the same record',
      'Ask a patient for access to their earlier history',
    ],
    nav: ['Dashboard', 'Appointments', 'Consultations', 'Lab requests', 'Patients', 'Access requests'],
    register: { to: '/register', label: 'Register as a doctor' },
  },
  {
    id: 'pharmacist',
    label: 'Pharmacy',
    short: 'Pharmacies',
    icon: Pill,
    color: '#6A4DB6',
    tint: '#A68BF0',
    chip: 'bg-violet-50 text-suwela-purple ring-violet-200',
    pitch: 'Prescriptions arrive typed and signed — no handwriting to decode. Stock, suppliers and sales sit right beside them.',
    can: [
      'Receive and dispense incoming prescriptions',
      'Keep a medicine list and live inventory',
      'Manage suppliers and purchase orders',
      'Record sales and invite your team',
    ],
    nav: ['Dashboard', 'Prescriptions', 'Medicines', 'Inventory', 'Suppliers', 'Orders', 'Sales'],
    register: { to: '/org-register', label: 'Register your pharmacy' },
  },
  {
    id: 'laboratory',
    label: 'Laboratory',
    short: 'Laboratories',
    icon: FlaskConical,
    color: '#0279D1',
    tint: '#38B6F5',
    chip: 'bg-blue-50 text-suwela-deep ring-blue-200',
    pitch: 'Test requests land in a queue with the doctor’s notes attached. Upload the report and it’s on the patient’s record.',
    can: [
      'Work through incoming test requests',
      'Upload reports straight to the patient record',
      'Publish your test catalogue',
      'Give your technicians their own logins',
    ],
    nav: ['Dashboard', 'Requests', 'Reports', 'Test catalogue', 'Team'],
    register: { to: '/org-register', label: 'Register your laboratory' },
  },
  {
    id: 'org',
    label: 'Hospital & Clinic',
    short: 'Hospitals',
    icon: Hospital,
    color: '#EF7B2D',
    tint: '#FFB36B',
    chip: 'bg-orange-50 text-suwela-orange ring-orange-200',
    pitch: 'A shared workspace for your doctors: one appointment book, one patient list, one team page.',
    can: [
      'Run appointments across all your doctors',
      'Consultations and lab requests under your organisation',
      'Add and remove staff from the team page',
      'Doctors keep their personal dashboard too',
    ],
    nav: ['Dashboard', 'Appointments', 'Consultations', 'Lab requests', 'Team'],
    register: { to: '/org-register', label: 'Register a hospital or clinic' },
  },
  {
    id: 'admin',
    label: 'Administrator',
    short: 'Admins',
    icon: ShieldCheck,
    color: '#0E2C52',
    tint: '#3E6A9E',
    chip: 'bg-slate-100 text-suwela-navy ring-slate-300',
    pitch: 'For the Suwela team: approve organisations, look after users and keep the shared medicine list tidy.',
    can: [
      'Review and approve organisation sign-ups',
      'Manage user accounts',
      'Maintain the shared medicine and supplier lists',
      'Sign-in protected by a one-time code (MFA)',
    ],
    nav: ['Dashboard', 'Organisations', 'Users', 'Medicines', 'Suppliers'],
  },
];

export const roleById = (id: RoleId) => ROLES.find(r => r.id === id)!;
