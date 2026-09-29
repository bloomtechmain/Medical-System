import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enPatientDashboard from './locales/en/patientDashboard.json';
import enPatientConsultations from './locales/en/patientConsultations.json';
import enPatientReports from './locales/en/patientReports.json';
import enDoctorCore from './locales/en/doctorCore.json';
import enDoctorClinical from './locales/en/doctorClinical.json';
import enDoctorPatients from './locales/en/doctorPatients.json';
import enPharmacist from './locales/en/pharmacist.json';
import enLaboratory from './locales/en/laboratory.json';
import enAdmin from './locales/en/admin.json';

import siCommon from './locales/si/common.json';
import siPatientDashboard from './locales/si/patientDashboard.json';
import siPatientConsultations from './locales/si/patientConsultations.json';
import siPatientReports from './locales/si/patientReports.json';
import siDoctorCore from './locales/si/doctorCore.json';
import siDoctorClinical from './locales/si/doctorClinical.json';
import siDoctorPatients from './locales/si/doctorPatients.json';
import siPharmacist from './locales/si/pharmacist.json';
import siLaboratory from './locales/si/laboratory.json';
import siAdmin from './locales/si/admin.json';

// All dashboard text lives in these namespaces. `common` holds strings shared
// across every role (buttons, statuses, nav labels, generic empty states).
// Every other namespace is scoped to one specific page-group so independent
// contributors (including parallel translation passes) can each own a
// namespace's pair of JSON files without ever touching the same file.
const NS = [
  'common',
  'patientDashboard', 'patientConsultations', 'patientReports',
  'doctorCore', 'doctorClinical', 'doctorPatients',
  'pharmacist', 'laboratory', 'admin',
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        patientDashboard: enPatientDashboard, patientConsultations: enPatientConsultations, patientReports: enPatientReports,
        doctorCore: enDoctorCore, doctorClinical: enDoctorClinical, doctorPatients: enDoctorPatients,
        pharmacist: enPharmacist, laboratory: enLaboratory, admin: enAdmin,
      },
      si: {
        common: siCommon,
        patientDashboard: siPatientDashboard, patientConsultations: siPatientConsultations, patientReports: siPatientReports,
        doctorCore: siDoctorCore, doctorClinical: siDoctorClinical, doctorPatients: siDoctorPatients,
        pharmacist: siPharmacist, laboratory: siLaboratory, admin: siAdmin,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'si'],
    ns: NS as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      // Purely client-side preference — checked in this order, persisted to
      // localStorage so it survives reloads without any backend/DB change.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'corehealth_language',
      caches: ['localStorage'],
    },
  });

export default i18n;
