import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import { authApi, consultationApi, labApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

// ── PDF report ──────────────────────────────────────────────────
function downloadHealthReport(me, profile, consultations) {
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 20;
  const colW   = pageW - margin * 2;
  let y = 0;
  const val = (v) => v || 'Not provided';
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
  doc.text('Patient Health Report', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}  ${now.toLocaleTimeString()}`, pageW - margin, 32, { align: 'right' });
  y = 48;

  const section = (title) => {
    doc.setFillColor(240, 253, 250);
    doc.roundedRect(margin, y, colW, 7, 1, 1, 'F');
    doc.setTextColor(15, 118, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    y += 12;
  };

  const row = (label, value, highlight = false) => {
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
  doc.text(me?.name || 'Patient', margin + 6, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 118, 110);
  doc.text('Patient  ·  Core Health ID: #' + (me?.id || '—'), pageW - margin - 3, y + 9.5, { align: 'right' });
  y += 20;

  section('Personal Information');
  row('Full Name',     me?.name);
  row('Email',         me?.email);
  row('Phone',         profile?.phone);
  row('Date of Birth', profile?.date_of_birth ? formatDate(profile.date_of_birth) : null);
  row('Gender',        profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null);
  row('Address',       profile?.address);
  divider();

  section('Health Information');
  row('Blood Type',         profile?.blood_type);
  row('Allergies',          profile?.allergies, !!(profile?.allergies && profile.allergies !== 'None'));
  row('Chronic Conditions', profile?.chronic_conditions);
  divider();

  section('Emergency Contact');
  row('Contact Name',  profile?.emergency_contact_name);
  row('Contact Phone', profile?.emergency_contact_phone);
  divider();

  if (consultations?.length) {
    section('Disease & Treatment History');
    consultations.slice(0, 10).forEach(c => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${formatDate(c.visit_date)} — ${c.diagnosis || c.sick_description || 'Visit'}`, margin + 3, y + 4);
      y += 7;
      if (c.treatment_description) {
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const lines = doc.splitTextToSize(`Treatment: ${c.treatment_description}`, colW - 10);
        lines.slice(0, 2).forEach(line => { doc.text(line, margin + 6, y + 3); y += 5; });
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
  doc.text('Core Health by BloomTech  ·  Confidential Medical Record  ·  For authorized use only', pageW / 2, pageH - 6, { align: 'center' });

  doc.setTextColor(200, 200, 200);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(52);
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.07 }));
  doc.text('CORE HEALTH', pageW / 2, pageH / 2, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  const filename = `CoreHealth_Report_${(me?.name || 'Patient').replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ── Small helpers ───────────────────────────────────────────────
function SectionTitle({ children }) {
  return <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{children}</h2>;
}

const STATUS_META = {
  active:     { label: 'Active',     bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  dispensed:  { label: 'Dispensed',  bg: 'bg-blue-100   text-blue-700   border-blue-200',   dot: 'bg-blue-400'   },
  completed:  { label: 'Completed',  bg: 'bg-green-100  text-green-700  border-green-200',  dot: 'bg-green-400'  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${m.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  const rings = {
    teal:   'border-teal-100   bg-teal-50',
    blue:   'border-blue-100   bg-blue-50',
    purple: 'border-purple-100 bg-purple-50',
    green:  'border-green-100  bg-green-50',
    red:    'border-red-100    bg-red-50',
    yellow: 'border-yellow-100 bg-yellow-50',
    cyan:   'border-cyan-100   bg-cyan-50',
  }[color] || 'border-gray-100 bg-gray-50';
  return (
    <div className={`rounded-xl border p-4 ${rings}`}>
      <span className="text-2xl">{icon}</span>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Treatment Flow Steps ─────────────────────────────────────────
function TreatmentFlow({ consultation }) {
  const steps = [
    { label: 'Symptom',    done: !!consultation.sick_description,      icon: '🤒' },
    { label: 'Diagnosed',  done: !!consultation.diagnosis,              icon: '🔍' },
    { label: 'Treated',    done: !!consultation.treatment_description,  icon: '💉' },
    {
      label: consultation.status === 'completed' ? 'Resolved'
           : consultation.status === 'dispensed' ? 'Dispensed'
           : 'Ongoing',
      done:  consultation.status === 'completed' || consultation.status === 'dispensed',
      icon:  consultation.status === 'completed' ? '✅' : consultation.status === 'dispensed' ? '💊' : '⏳',
    },
  ];
  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className={`flex flex-col items-center flex-1 ${i > 0 ? '' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
              ${s.done ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'}`}>
              {s.icon}
            </div>
            <p className={`text-xs mt-0.5 text-center ${s.done ? 'text-primary-600 font-medium' : 'text-gray-300'}`}>
              {s.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mb-4 ${steps[i + 1].done ? 'bg-primary-300' : 'bg-gray-100'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Health Timeline Item ─────────────────────────────────────────
function TimelineItem({ icon, title, subtitle, date, color, last }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${color}`}>
          {icon}
        </div>
        {!last && <div className="w-0.5 flex-1 bg-gray-100 mt-1" />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{subtitle}</p>}
        <p className="text-xs text-gray-400 mt-0.5">{date}</p>
      </div>
    </div>
  );
}

// ── Main dashboard ──────────────────────────────────────────────
export default function PatientDashboard() {
  const { user } = useAuth();
  const [downloading, setDownloading]     = useState(false);
  const [expandedDisease, setExpandedDisease] = useState(null);
  const [diseaseFilter, setDiseaseFilter] = useState('all'); // 'all' | 'active' | 'resolved'

  const { data: me }                 = useQuery({ queryKey: ['me'],                  queryFn: authApi.me });
  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],        queryFn: consultationApi.getAll });
  const { data: labReports = [] }    = useQuery({ queryKey: ['patient-lab-reports'],  queryFn: labApi.getAll });

  const profile   = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Patient';

  // ── Derived data ─────────────────────────────────────────────
  const diseases = useMemo(() =>
    consultations
      .filter(c => c.diagnosis || c.sick_description)
      .map(c => ({
        ...c,
        title:  c.diagnosis || c.sick_description,
        doctor: c.doctor_display_name || null,
        meds:   c.medicines || [],
      })),
    [consultations]
  );

  const filteredDiseases = useMemo(() => {
    if (diseaseFilter === 'active')   return diseases.filter(d => d.status === 'active');
    if (diseaseFilter === 'resolved') return diseases.filter(d => d.status === 'completed' || d.status === 'dispensed');
    return diseases;
  }, [diseases, diseaseFilter]);

  const activeConsultations = useMemo(() => consultations.filter(c => c.status === 'active'), [consultations]);

  const activeMeds = useMemo(() =>
    activeConsultations.flatMap(c =>
      (c.medicines || []).map(m => ({ ...m, consultationTitle: c.diagnosis || c.sick_description }))
    ),
    [activeConsultations]
  );

  const medCount = useMemo(() => {
    const map = {};
    consultations.forEach(c => (c.medicines || []).forEach(m => {
      const key = m.medicine_name.toLowerCase();
      map[key] = { name: m.medicine_name, count: (map[key]?.count || 0) + 1 };
    }));
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [consultations]);

  const doctors = useMemo(() =>
    [...new Set(consultations.map(c => c.doctor_display_name).filter(Boolean))],
    [consultations]
  );

  const allergies = useMemo(() =>
    profile?.allergies
      ? profile.allergies.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      : [],
    [profile]
  );

  const conditions = useMemo(() =>
    profile?.chronic_conditions
      ? profile.chronic_conditions.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      : [],
    [profile]
  );

  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth)) / (365.25 * 24 * 3600 * 1000))
    : null;

  // Health timeline — merge consultations + lab reports, sort newest first
  const timeline = useMemo(() => {
    const events = [
      ...consultations.map(c => ({
        id:       `c-${c.id}`,
        type:     'consultation',
        icon:     '🏥',
        color:    'bg-teal-100',
        title:    c.diagnosis || c.sick_description || 'Medical Visit',
        subtitle: c.doctor_display_name ? `Dr. ${c.doctor_display_name}` : undefined,
        date:     c.visit_date,
        status:   c.status,
      })),
      ...labReports.map(r => ({
        id:       `l-${r.id}`,
        type:     'lab',
        icon:     '🔬',
        color:    'bg-blue-100',
        title:    r.test_description || 'Lab Test',
        subtitle: r.lab_name || undefined,
        date:     r.created_at,
        status:   r.status,
      })),
    ];
    return events.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [consultations, labReports]);

  const handleDownload = () => {
    setDownloading(true);
    try { downloadHealthReport(me, profile, diseases); }
    finally { setTimeout(() => setDownloading(false), 800); }
  };

  return (
    <div className="space-y-6">

      {/* ── Welcome banner ── */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary-200 text-sm">Good day,</p>
            <h1 className="text-2xl font-bold mt-0.5">{firstName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {profile?.blood_type && (
                <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  🩸 {profile.blood_type}
                </span>
              )}
              {age && (
                <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  🎂 {age} years
                </span>
              )}
              {profile?.gender && (
                <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full capitalize">
                  {profile.gender === 'male' ? '♂' : profile.gender === 'female' ? '♀' : '⚧'} {profile.gender}
                </span>
              )}
              {activeConsultations.length > 0 && (
                <span className="bg-yellow-400/30 text-yellow-100 text-xs font-bold px-2.5 py-1 rounded-full">
                  ⚕️ {activeConsultations.length} active treatment{activeConsultations.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || !me}
            className="shrink-0 bg-white text-primary-700 hover:bg-primary-50 disabled:opacity-60 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2 shadow-sm"
          >
            {downloading ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              </svg>
            )}
            {downloading ? 'Generating...' : 'Download Report'}
          </button>
        </div>
      </div>

      {/* ── Critical alerts row ── */}
      <div className="space-y-3">
        {/* Allergy alert */}
        {allergies.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">⚠️</span>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-bold text-red-700">ALLERGY ALERT — {allergies.length} Known Allergen{allergies.length !== 1 ? 's' : ''}</p>
                <span className="text-xs text-red-500">Inform all treating professionals</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {allergies.map(a => (
                  <span key={a} className="bg-red-100 text-red-800 border border-red-200 text-xs font-bold px-2.5 py-1 rounded-full">
                    🚫 {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active treatment alert */}
        {activeConsultations.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">⚕️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-yellow-700">ACTIVE TREATMENT IN PROGRESS</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeConsultations.map(c => (
                  <span key={c.id} className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                    {c.diagnosis || c.sick_description || 'Treatment'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pending lab results */}
        {labReports.filter(r => r.status !== 'completed').length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-400 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">🔬</span>
            <div>
              <p className="text-sm font-bold text-blue-700">
                {labReports.filter(r => r.status !== 'completed').length} Lab Result{labReports.filter(r => r.status !== 'completed').length !== 1 ? 's' : ''} Pending
              </p>
              <p className="text-xs text-blue-600 mt-0.5">Results will appear in your Lab Reports section when ready.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon="🏥" label="Doctor Visits"      value={consultations.length}                                        color="teal"   />
        <StatCard icon="⚕️" label="Active Treatments"  value={activeConsultations.length}                                  color="yellow" />
        <StatCard icon="✅" label="Resolved"           value={diseases.filter(d => d.status === 'completed').length}       color="green"  />
        <StatCard icon="🔬" label="Lab Tests"          value={labReports.length}                                           color="cyan"   />
        <StatCard icon="💊" label="Medicines Taken"    value={medCount.length}                                             color="purple" />
        <StatCard icon="🩺" label="Doctors Seen"       value={doctors.length}                                              color="blue"   />
      </div>

      {/* ── Active medications ── */}
      {activeMeds.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl border border-yellow-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Current Active Medications</SectionTitle>
            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">
              {activeMeds.length} medicine{activeMeds.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeMeds.map((m, i) => (
              <div key={i} className="flex items-start gap-2.5 bg-white rounded-xl border border-yellow-100 p-3 shadow-sm">
                <span className="text-xl mt-0.5">💊</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{m.medicine_name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.dosage    && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{m.dosage}</span>}
                    {m.frequency && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{m.frequency}</span>}
                    {m.duration  && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{m.duration}</span>}
                  </div>
                  {m.consultationTitle && (
                    <p className="text-xs text-yellow-600 mt-1 truncate">For: {m.consultationTitle}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Health profile + chronic conditions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Personal health card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <SectionTitle>Health Profile</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Blood Type', value: profile?.blood_type || '—',                                                                            icon: '🩸', color: 'bg-red-50    text-red-800    border-red-100'    },
              { label: 'Age',        value: age ? `${age} yrs` : '—',                                                                              icon: '🎂', color: 'bg-blue-50   text-blue-800   border-blue-100'   },
              { label: 'Gender',     value: profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—',              icon: '👤', color: 'bg-purple-50 text-purple-800 border-purple-100' },
              { label: 'Insurance',  value: profile?.insurance_provider || '—',                                                                     icon: '🛡️', color: 'bg-green-50  text-green-800  border-green-100'  },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className={`rounded-xl border p-3 ${color}`}>
                <p className="text-xs font-medium opacity-60">{icon} {label}</p>
                <p className="text-sm font-bold mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            {[
              { label: 'Phone',      value: profile?.phone },
              { label: 'Address',    value: profile?.address },
              { label: 'Policy No.', value: profile?.insurance_policy_number },
              { label: 'DOB',        value: profile?.date_of_birth ? formatDate(profile.date_of_birth) : null },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-400 w-24 shrink-0">{label}</span>
                <span className="text-gray-800 font-medium text-right">{value || <span className="text-gray-300">—</span>}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conditions + emergency */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionTitle>Chronic Conditions</SectionTitle>
            {conditions.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <span className="text-xl">✅</span>
                <p className="text-sm font-medium">No chronic conditions recorded</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conditions.map(c => (
                  <span key={c} className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                    📋 {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <SectionTitle>🆘 Emergency Contact</SectionTitle>
            {profile?.emergency_contact_name ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600 font-medium">Name</span>
                  <span className="text-gray-900 font-bold">{profile.emergency_contact_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600 font-medium">Phone</span>
                  <span className="text-gray-900 font-bold">{profile.emergency_contact_phone || '—'}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-orange-600">No emergency contact provided.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Disease & treatment history ── */}
      {diseases.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <SectionTitle>Previous Diseases & Treatments</SectionTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 mr-1">
                {filteredDiseases.length} record{filteredDiseases.length !== 1 ? 's' : ''}
              </span>
              {/* Filter tabs */}
              {['all', 'active', 'resolved'].map(f => (
                <button
                  key={f}
                  onClick={() => setDiseaseFilter(f)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors capitalize ${
                    diseaseFilter === f
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all'      ? `All (${diseases.length})` :
                   f === 'active'   ? `Active (${diseases.filter(d => d.status === 'active').length})` :
                                      `Resolved (${diseases.filter(d => d.status === 'completed' || d.status === 'dispensed').length})`}
                </button>
              ))}
            </div>
          </div>

          {filteredDiseases.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No {diseaseFilter !== 'all' ? diseaseFilter : ''} records found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDiseases.map((d, i) => (
                <div key={d.id} className={`rounded-xl border transition-all
                  ${d.status === 'active'    ? 'border-yellow-200 bg-yellow-50/30' :
                    d.status === 'completed' ? 'border-green-100  bg-green-50/20'  :
                                               'border-gray-100   bg-gray-50/50'}`}>

                  {/* Header row */}
                  <button
                    type="button"
                    className="w-full text-left p-4"
                    onClick={() => setExpandedDisease(expandedDisease === d.id ? null : d.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold
                          ${d.status === 'active'    ? 'bg-yellow-100 text-yellow-700' :
                            d.status === 'completed' ? 'bg-green-100  text-green-700'  :
                                                       'bg-primary-100 text-primary-700'}`}>
                          {d.status === 'active' ? '⚕️' : d.status === 'completed' ? '✅' : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{d.title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{formatDate(d.visit_date)}</span>
                            {d.doctor && <span className="text-xs text-primary-600 font-medium">Dr. {d.doctor}</span>}
                            {d.hospital_clinic && <span className="text-xs text-gray-400">· {d.hospital_clinic}</span>}
                            <StatusBadge status={d.status} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.meds.length > 0 && (
                          <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                            💊 {d.meds.length}
                          </span>
                        )}
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedDisease === d.id ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedDisease === d.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">

                      {/* Treatment flow */}
                      <TreatmentFlow consultation={d} />

                      {d.sick_description && d.diagnosis && (
                        <div className="bg-orange-50 rounded-lg px-3 py-2.5 border border-orange-100">
                          <p className="text-xs font-bold text-orange-600 mb-0.5">🤒 Symptoms</p>
                          <p className="text-sm text-gray-700">{d.sick_description}</p>
                        </div>
                      )}
                      {d.treatment_description && (
                        <div className="bg-teal-50 rounded-lg px-3 py-2.5 border border-teal-100">
                          <p className="text-xs font-bold text-teal-600 mb-0.5">💉 Treatment Plan</p>
                          <p className="text-sm text-gray-700">{d.treatment_description}</p>
                        </div>
                      )}
                      {d.meds.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2">💊 Medicines Prescribed</p>
                          <div className="flex flex-wrap gap-2">
                            {d.meds.map((m, mi) => (
                              <div key={mi} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1 text-xs shadow-sm">
                                <span>💊</span>
                                <span className="font-semibold text-gray-800">{m.medicine_name}</span>
                                {m.dosage    && <span className="text-gray-400">· {m.dosage}</span>}
                                {m.frequency && <span className="text-gray-400">· {m.frequency}</span>}
                                {m.duration  && <span className="text-gray-400">· {m.duration}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {d.status === 'completed' && (
                        <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                          <span>✅</span>
                          <p className="text-xs font-semibold text-green-700">Treatment completed — condition resolved</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Medicine history + Doctors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Medicine frequency */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionTitle>All-Time Medicine History</SectionTitle>
          {medCount.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">💊</p>
              <p className="text-sm">No medicines prescribed yet</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {medCount.slice(0, 8).map(({ name, count }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-base">💊</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">{count}×</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (count / (medCount[0]?.count || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {medCount.length > 8 && (
                <p className="text-xs text-gray-400 text-center pt-1">+{medCount.length - 8} more medicines</p>
              )}
            </div>
          )}
        </div>

        {/* Treating doctors */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionTitle>Treating Doctors</SectionTitle>
          {doctors.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">🩺</p>
              <p className="text-sm">No doctor visits recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map(doc => {
                const visits  = consultations.filter(c => c.doctor_display_name === doc);
                const latest  = visits[0];
                const hasActive = visits.some(v => v.status === 'active');
                return (
                  <div key={doc} className={`flex items-center gap-3 p-3 rounded-xl border
                    ${hasActive ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                      ${hasActive ? 'bg-yellow-200 text-yellow-800' : 'bg-primary-100 text-primary-700'}`}>
                      {doc.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">Dr. {doc}</p>
                        {hasActive && <span className="text-xs bg-yellow-200 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">Active</span>}
                      </div>
                      <p className="text-xs text-gray-400">
                        {visits.length} visit{visits.length !== 1 ? 's' : ''}
                        {latest ? ` · Last: ${formatDate(latest.visit_date)}` : ''}
                        {latest?.hospital_clinic ? ` · ${latest.hospital_clinic}` : ''}
                      </p>
                    </div>
                    <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                      {visits.length}×
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent lab reports ── */}
      {labReports.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionTitle>Recent Lab Reports</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {labReports.slice(0, 4).map(r => {
              const STATUS = {
                pending:     'bg-yellow-100 text-yellow-700',
                in_progress: 'bg-blue-100   text-blue-700',
                completed:   'bg-green-100  text-green-700',
              };
              return (
                <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-xl mt-0.5">🔬</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.lab_name || 'Laboratory'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS[r.status]}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{r.test_description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Dr. {r.doctor_name} · {formatDate(r.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {labReports.length > 4 && (
            <p className="text-xs text-center text-gray-400 mt-3">
              +{labReports.length - 4} more lab reports — view in Lab Reports tab
            </p>
          )}
        </div>
      )}

      {/* ── Health timeline ── */}
      {timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Health Timeline</SectionTitle>
            <span className="text-xs text-gray-400">{timeline.length} events</span>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1 space-y-0">
            {timeline.slice(0, 12).map((event, i) => (
              <TimelineItem
                key={event.id}
                icon={event.icon}
                title={event.title}
                subtitle={event.subtitle}
                date={formatDate(event.date)}
                color={event.color}
                last={i === Math.min(timeline.length, 12) - 1}
              />
            ))}
            {timeline.length > 12 && (
              <p className="text-xs text-center text-gray-400 mt-2 pb-2">
                +{timeline.length - 12} earlier events not shown
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {consultations.length === 0 && labReports.length === 0 && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-2xl border border-primary-100 p-8 text-center">
          <span className="text-4xl block mb-3">🏥</span>
          <p className="text-gray-700 font-semibold">Your health dashboard is ready</p>
          <p className="text-sm text-gray-500 mt-1">
            Your medical history, diagnoses, and lab reports will appear here as your doctors add them.
          </p>
        </div>
      )}
    </div>
  );
}
