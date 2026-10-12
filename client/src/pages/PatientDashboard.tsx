import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LucideIcon } from 'lucide-react';
import {
  Download, Activity, CalendarPlus, Stethoscope, FlaskConical, FolderOpen,
  Phone, MapPin, Droplet, User, Calendar, CreditCard, Settings, ArrowRight,
} from 'lucide-react';
import { authApi, consultationApi, labApi, patientVitalsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import MiniCalendar from '../components/common/MiniCalendar';
import VitalsOverview from '../components/common/VitalsOverview';
import Modal from '../components/common/Modal';

function downloadHealthReport(me: any, profile: any, consultations: any[], t: TFunction) {
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 20;
  const colW   = pageW - margin * 2;
  let y = 0;
  const val = (v: any) => v || t('pdf.notProvided');
  const now = new Date();

  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Core Health', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('by BloomTech', margin, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(t('pdf.title'), margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(t('pdf.generatedLabel', { date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), time: now.toLocaleTimeString() }), pageW - margin, 32, { align: 'right' });
  y = 48;

  const section = (title: string) => {
    doc.setFillColor(240, 253, 250);
    doc.roundedRect(margin, y, colW, 7, 1, 1, 'F');
    doc.setTextColor(15, 118, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    y += 12;
  };

  const row = (label: string, value: any, highlight = false) => {
    if (y > 260) { doc.addPage(); y = 20; }
    if (highlight) { doc.setFillColor(254, 226, 226); doc.rect(margin, y - 1, colW, 7, 'F'); }
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(label, margin + 3, y + 4);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(val(value), colW - 60);
    doc.text(lines[0], margin + 55, y + 4);
    y += 8;
  };

  const divider = () => { doc.setDrawColor(229, 231, 235); doc.line(margin, y, margin + colW, y); y += 5; };

  doc.setFillColor(204, 251, 241);
  doc.roundedRect(margin, y, colW, 14, 2, 2, 'F');
  doc.setTextColor(13, 148, 136);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(me?.name || t('pdf.patientRole'), margin + 6, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 118, 110);
  doc.text(t('pdf.patientRole') + '  ·  ' + t('pdf.idLine', { id: me?.id || '—' }), pageW - margin - 3, y + 9.5, { align: 'right' });
  y += 20;

  section(t('pdf.sections.personal'));
  row(t('pdf.fields.fullName'), me?.name);
  row(t('pdf.fields.email'),    me?.email);
  row(t('pdf.fields.phone'),    profile?.phone);
  row(t('pdf.fields.dob'),      profile?.date_of_birth ? formatDate(profile.date_of_birth) : null);
  row(t('pdf.fields.gender'),   profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null);
  row(t('pdf.fields.address'),  profile?.address);
  divider();

  section(t('pdf.sections.health'));
  row(t('pdf.fields.bloodType'),         profile?.blood_type);
  row(t('pdf.fields.allergies'),         profile?.allergies, !!(profile?.allergies && profile.allergies !== 'None'));
  row(t('pdf.fields.chronicConditions'), profile?.chronic_conditions);
  divider();

  section(t('pdf.sections.emergency'));
  row(t('pdf.fields.contactName'),  profile?.emergency_contact_name);
  row(t('pdf.fields.contactPhone'), profile?.emergency_contact_phone);
  divider();

  if (consultations?.length) {
    section(t('pdf.sections.history'));
    consultations.slice(0, 10).forEach((c: any) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${formatDate(c.visit_date)} — ${c.diagnosis || c.sick_description || t('pdf.visitFallback')}`, margin + 3, y + 4);
      y += 7;
      if (c.treatment_description) {
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const lines = doc.splitTextToSize(t('pdf.treatmentLine', { text: c.treatment_description }), colW - 10);
        lines.slice(0, 2).forEach((line: string) => { doc.text(line, margin + 6, y + 3); y += 5; });
      }
      y += 2;
    });
    divider();
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(13, 148, 136);
  doc.rect(0, pageH - 14, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Core Health by BloomTech  ·  ${t('pdf.footerConfidential')}  ·  ${t('pdf.footerAuthorized')}`, pageW / 2, pageH - 6, { align: 'center' });

  doc.setTextColor(200, 200, 200);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(52);
  doc.saveGraphicsState();
  doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
  doc.text('CORE HEALTH', pageW / 2, pageH / 2, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  const filename = `CoreHealth_Report_${(me?.name || 'Patient').replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

function ProfileSetupPrompt({ onComplete, onDismiss }: { onComplete: () => void; onDismiss: () => void }) {
  const { t } = useTranslation('patientDashboard');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4 text-3xl">
          👋
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">{t('setupPrompt.title')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t('setupPrompt.message')}</p>
        <div className="flex flex-col gap-2">
          <button onClick={onComplete} className="btn-primary w-full py-2.5">{t('setupPrompt.completeButton')}</button>
          <button onClick={onDismiss} className="text-sm text-gray-400 hover:text-gray-600 py-1">{t('setupPrompt.laterButton')}</button>
        </div>
      </div>
    </div>
  );
}

interface QuickAction { key: string; label: string; Icon: LucideIcon; to?: string; onClick?: () => void; }

function QuickActionsRow({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {actions.map(a => {
        const inner = (
          <>
            <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center mb-2 group-hover:bg-primary-100 transition-colors">
              <a.Icon size={20} strokeWidth={1.8} className="text-primary-600" />
            </div>
            <p className="text-sm font-semibold text-gray-800">{a.label}</p>
          </>
        );
        const cls = 'group flex flex-col items-center text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-primary-200 hover:shadow-md transition-all';
        return a.to
          ? <Link key={a.key} to={a.to} className={cls}>{inner}</Link>
          : <button key={a.key} type="button" onClick={a.onClick} className={cls}>{inner}</button>;
      })}
    </div>
  );
}

function PersonalDetailsCard({ profile, age, allergies, conditions }: { profile: any; age: number | null; allergies: string[]; conditions: string[] }) {
  const { t } = useTranslation('patientDashboard');

  const fields: { label: string; value: string | null; Icon: LucideIcon }[] = [
    { label: t('personalDetails.fields.phone'),  value: profile?.phone || null, Icon: Phone },
    { label: t('personalDetails.fields.dob'),    value: profile?.date_of_birth ? formatDate(profile.date_of_birth) : null, Icon: Calendar },
    { label: t('personalDetails.fields.gender'), value: profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null, Icon: User },
    { label: t('personalDetails.fields.bloodType'), value: profile?.blood_type || null, Icon: Droplet },
    { label: t('personalDetails.fields.address'), value: profile?.address || null, Icon: MapPin },
    { label: t('personalDetails.fields.insurance'), value: profile?.insurance_provider || null, Icon: CreditCard },
  ].filter(f => f.value);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('personalDetails.title')}</p>
        <Link to="/patient/settings" className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors">
          <Settings size={12} strokeWidth={2.5} /> {t('personalDetails.editLink')}
        </Link>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-gray-400">{t('personalDetails.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.label} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <f.Icon size={14} className="text-gray-400" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">{f.label}</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{f.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {allergies.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 mb-1.5">{t('personalDetails.allergiesLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {allergies.map((a: string) => (
              <span key={a} className="bg-red-50 text-red-700 border border-red-100 text-xs font-semibold px-2.5 py-1 rounded-full">{a}</span>
            ))}
          </div>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 mb-1.5">{t('personalDetails.conditionsLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c: string) => (
              <span key={c} className="bg-orange-50 text-orange-700 border border-orange-100 text-xs font-semibold px-2.5 py-1 rounded-full">{c}</span>
            ))}
          </div>
        </div>
      )}

      {profile?.emergency_contact_name && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400">{t('personalDetails.fields.emergencyContact')}</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{profile.emergency_contact_name}</p>
          </div>
          {profile.emergency_contact_phone && (
            <p className="text-sm text-gray-500 shrink-0">{profile.emergency_contact_phone}</p>
          )}
        </div>
      )}
    </div>
  );
}

function QuickStatsRow({ stats }: { stats: { label: string; value: number; Icon: LucideIcon }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="w-9 h-9 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-2">
            <s.Icon size={16} className="text-primary-600" strokeWidth={2} />
          </div>
          <p className="text-xl font-bold text-gray-900">{s.value}</p>
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// Non-value keys on the vitals record — everything else is a measurable field.
const VITALS_META_KEYS = ['id', 'user_id', 'patient_id', 'created_at', 'updated_at', 'recorded_at', 'field_meta'];

function VitalsSummaryCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('patientDashboard');
  const { data: vitals } = useQuery({ queryKey: ['patient-vitals'], queryFn: patientVitalsApi.get });

  const filledCount = vitals
    ? Object.entries(vitals).filter(([k, v]) => !VITALS_META_KEYS.includes(k) && v != null).length
    : 0;
  const lastRecorded = vitals?.updated_at || vitals?.recorded_at;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-600 to-teal-600 flex items-center justify-center shrink-0">
          <Activity size={18} className="text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{t('vitalsSummary.title')}</p>
          <p className="text-xs text-gray-400">
            {filledCount > 0
              ? t('vitalsSummary.fieldsRecorded', { count: filledCount })
              : t('vitalsSummary.noVitals')}
          </p>
        </div>
      </div>
      {lastRecorded && (
        <p className="text-xs text-gray-400 mb-3">{t('vitalsSummary.recordedOn', { date: formatDate(lastRecorded) })}</p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 py-2.5 rounded-xl transition-colors"
      >
        {t('vitalsSummary.viewFullButton')} <ArrowRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function PatientDashboard() {
  const { t } = useTranslation('patientDashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [vitalsModalOpen, setVitalsModalOpen] = useState(false);

  const { data: me }                 = useQuery({ queryKey: ['me'],                 queryFn: authApi.me });
  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],       queryFn: consultationApi.getAll });
  const { data: labReports = [] }    = useQuery({ queryKey: ['patient-lab-reports'], queryFn: labApi.getAll });

  const profile   = me?.profile as any;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Patient';
  const showSetupPrompt = !!me && !profile?.phone && !setupDismissed;

  // Kept only for the PDF export, which still lists recent diagnosed visits.
  const diseases = useMemo(() =>
    (consultations as any[])
      .filter((c: any) => c.diagnosis || c.sick_description)
      .map((c: any) => ({ ...c, title: c.diagnosis || c.sick_description })),
    [consultations]
  );

  const activeConsultations = useMemo(() => (consultations as any[]).filter((c: any) => c.status === 'active'), [consultations]);

  const doctors = useMemo(() =>
    [...new Set((consultations as any[]).map((c: any) => c.doctor_display_name).filter(Boolean))],
    [consultations]
  );

  const allergies = useMemo(() =>
    profile?.allergies
      ? profile.allergies.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
      : [],
    [profile]
  );

  const conditions = useMemo(() =>
    profile?.chronic_conditions
      ? profile.chronic_conditions.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
      : [],
    [profile]
  );

  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const visitDates = useMemo(() =>
    (consultations as any[]).map((c: any) => c.visit_date?.split('T')[0]).filter(Boolean),
    [consultations]
  );

  const handleDownload = () => {
    setDownloading(true);
    try { downloadHealthReport(me, profile, diseases, t); }
    finally { setTimeout(() => setDownloading(false), 800); }
  };

  const quickActions: QuickAction[] = [
    { key: 'vitals',        label: t('quickActions.vitals'),        Icon: Activity,     onClick: () => setVitalsModalOpen(true) },
    { key: 'book-doctor',   label: t('quickActions.bookDoctor'),    Icon: CalendarPlus, to: '/patient/book-doctor' },
    { key: 'consultations', label: t('quickActions.consultations'), Icon: Stethoscope,  to: '/patient/consultations' },
    { key: 'lab-tests',     label: t('quickActions.labTests'),      Icon: FlaskConical, to: '/patient/lab-tests' },
    { key: 'my-reports',    label: t('quickActions.myReports'),     Icon: FolderOpen,   to: '/patient/my-reports' },
  ];

  const quickStats = [
    { label: t('quickStats.doctorVisits'),     value: (consultations as any[]).length, Icon: Stethoscope },
    { label: t('quickStats.activeTreatments'), value: activeConsultations.length,      Icon: Activity },
    { label: t('quickStats.labTests'),         value: (labReports as any[]).length,    Icon: FlaskConical },
    { label: t('quickStats.doctorsSeen'),      value: doctors.length,                  Icon: User },
  ];

  return (
    <div className="space-y-6">

      {showSetupPrompt && (
        <ProfileSetupPrompt
          onComplete={() => navigate('/patient/settings')}
          onDismiss={() => setSetupDismissed(true)}
        />
      )}

      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
        <div className="absolute -bottom-12 -right-4 w-56 h-56 bg-white/5 rounded-full" />

        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-primary-200 text-sm font-medium">{t('welcomeBanner.welcomeBack')}</p>
            <h1 className="text-3xl font-bold mt-1 leading-tight">{firstName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {profile?.blood_type && (
                <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  🩸 {profile.blood_type}
                </span>
              )}
              {age != null && (
                <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  {t('welcomeBanner.ageBadge', { age })}
                </span>
              )}
              {activeConsultations.length > 0 && (
                <span className="bg-yellow-400/25 text-yellow-100 text-xs font-semibold px-3 py-1.5 rounded-full border border-yellow-300/30">
                  {t('welcomeBanner.activeTreatments', { count: activeConsultations.length })}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading || !me}
            className="shrink-0 bg-white/15 hover:bg-white/25 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-2 border border-white/20 backdrop-blur-sm"
          >
            {downloading
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Download size={15} strokeWidth={2} />
            }
            {downloading ? t('welcomeBanner.generating') : t('welcomeBanner.healthReportButton')}
          </button>
        </div>
      </div>

      <QuickActionsRow actions={quickActions} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <PersonalDetailsCard profile={profile} age={age} allergies={allergies} conditions={conditions} />
          <QuickStatsRow stats={quickStats} />
        </div>

        <div className="space-y-4">
          <VitalsSummaryCard onOpen={() => setVitalsModalOpen(true)} />
          <MiniCalendar highlightDates={visitDates} title={t('calendar.title')} />
        </div>
      </div>

      <Modal isOpen={vitalsModalOpen} onClose={() => setVitalsModalOpen(false)} title={t('vitalsSummary.title')} size="xl">
        <VitalsOverview />
      </Modal>
    </div>
  );
}
