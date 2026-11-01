import type { User } from '../types';
import {
  Bell, Stethoscope, Pill, CheckCircle2, FlaskConical, ClipboardList, Activity, XCircle,
  MessageCircle, ShieldCheck, CalendarClock, BadgeCheck, Building2, Package, UserCheck, ImageOff,
  type LucideIcon,
} from 'lucide-react';

/** Icon for a notification type — shared by the desktop and mobile headers. */
export function notificationIcon(type: string): LucideIcon {
  if (type === 'new_consultation') return Stethoscope;
  if (type === 'consultation_assigned' || type === 'prescription_preparing') return Pill;
  if (type === 'prescription_dispensed' || type === 'prescription_delivered') return CheckCircle2;
  if (type.endsWith('_message')) return MessageCircle;
  if (type === 'lab_report_ready') return ClipboardList;
  if (type.endsWith('_rejected') || type.endsWith('_declined') || type.endsWith('_cancelled')) return XCircle;
  if (type.startsWith('lab_')) return FlaskConical;
  if (type === 'report_vitals_none') return ImageOff;
  if (type === 'vitals_updated' || type.startsWith('report_vitals')) return Activity;
  if (type.startsWith('access_')) return ShieldCheck;
  if (type.startsWith('appointment_')) return CalendarClock;
  if (type.startsWith('org_registration') || type === 'registration_ready_for_review') return BadgeCheck;
  if (type.startsWith('org_')) return Building2;
  if (type.startsWith('plan_')) return Package;
  if (type === 'account_approved') return UserCheck;
  return Bell;
}

// Where clicking a notification takes you.
//
// This used to be two hand-copied maps (desktop and mobile header) that had
// drifted apart, pointed at routes that do not exist (/patient/medical,
// /patient/lab-reports — dead clicks), hard-coded /doctor/* for a doctor who
// actually works from the /hospital or /clinic dashboard, and covered about a
// third of the notification types the server sends. One resolver, every
// server-side type (grep sendNotification in server/), only real routes.

/** The dashboard a doctor works from: their organisation's, if they own one. */
const doctorBase = (user?: Pick<User, 'organization'> | null): string => {
  const t = user?.organization?.org_type;
  return t === 'hospital' ? '/hospital' : t === 'clinic' ? '/clinic' : '/doctor';
};

export function notificationRoute(type: string, user?: Pick<User, 'role' | 'organization'> | null): string | null {
  const role = user?.role;
  const doc = doctorBase(user);
  const byRole = (routes: Partial<Record<string, string>>): string | null => (role && routes[role]) || null;

  switch (type) {
    // Consultations & prescriptions
    case 'new_consultation':
      return byRole({ patient: '/patient/consultations', doctor: `${doc}/consultations` });
    case 'consultation_assigned':
    case 'prescription_cancelled':
      return '/pharmacist/consultations';
    case 'prescription_preparing':
    case 'prescription_dispensed':
    case 'prescription_delivered':
    case 'prescription_message':
      return byRole({ patient: '/patient/consultations', doctor: `${doc}/consultations`, pharmacist: '/pharmacist/consultations' });

    // Laboratory
    case 'lab_request_assigned':
    case 'lab_request_created':
    case 'lab_request_sent':
    case 'lab_report_ready':
    case 'lab_request_rejected':
    case 'lab_request_message':
      return byRole({ laboratory: '/laboratory/reports', doctor: `${doc}/lab-requests`, patient: '/patient/lab-tests' });

    // Patient-record access
    case 'access_request':
    case 'lab_view_request':
      return '/patient/requests';
    case 'access_accepted':
    case 'access_declined':
    case 'lab_view_accepted':
    case 'lab_view_declined':
      return byRole({ doctor: `${doc}/requests` });

    // Health values
    case 'vitals_updated':
    case 'report_vitals_extracted':
      return '/patient';
    case 'report_vitals_none':
      return '/patient/my-reports';

    // Appointments / channeling
    case 'appointment_request':
    case 'appointment_confirmed':
    case 'appointment_declined':
    case 'appointment_cancelled':
    case 'appointment_completed':
      return byRole({ patient: '/patient/book-doctor', doctor: `${doc}/appointments` });

    // Hospital/clinic ↔ doctor affiliation
    case 'org_join_request':
    case 'org_registration_certification':
    case 'org_doctor_left':
    case 'org_removal_accepted':
    case 'org_removal_declined':
      // Only an organisation owner receives these, from their org dashboard.
      return doc === '/doctor' ? null : `${doc}/team${type === 'org_registration_certification' ? '#certify' : ''}`;
    case 'org_join_accepted':
    case 'org_join_declined':
    case 'org_removal_request':
    case 'org_registration_certified':
    case 'org_registration_rejected':
      return byRole({ doctor: `${doc}/appointments` });

    // Accounts & packages
    case 'registration_ready_for_review':
      return byRole({ admin: '/admin/users' });
    case 'plan_change_requested':
      return byRole({ admin: '/admin/plans' });
    case 'plan_changed': {
      const base = byRole({ doctor: doc, pharmacist: '/pharmacist', laboratory: '/laboratory' });
      return base ? `${base}/package` : null;
    }
    case 'account_approved':
      return '/';
    default:
      return null;
  }
}
