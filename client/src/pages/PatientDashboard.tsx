import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  Stethoscope, HeartPulse, CheckCircle2, FlaskConical, Pill, UserRound,
  ArrowUpRight, Download, Calendar, MapPin, Building2, ChevronDown,
  Thermometer, Microscope, Package, Clock,
} from 'lucide-react';
import { authApi, consultationApi, labApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import MiniCalendar from '../components/common/MiniCalendar';
import VitalsOverview from '../components/common/VitalsOverview';

function downloadHealthReport(me: any, profile: any, consultations: any[]) {
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 20;
  const colW   = pageW - margin * 2;
  let y = 0;
  const val = (v: any) => v || 'Not provided';
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
    consultations.slice(0, 10).forEach((c: any) => {
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
  doc.text('Core Health by BloomTech  ·  Confidential Medical Record  ·  For authorized use only', pageW / 2, pageH - 6, { align: 'center' });

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{children}</h2>;
}

const STATUS_META: Record<string, { label: string; bg: string; dot: string }> = {
  active:     { label: 'Active',     bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  dispensed:  { label: 'Dispensed',  bg: 'bg-blue-100   text-blue-700   border-blue-200',   dot: 'bg-blue-400'   },
  completed:  { label: 'Completed',  bg: 'bg-green-100  text-green-700  border-green-200',  dot: 'bg-green-400'  },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${m.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

const STAT_THEMES: Record<string, { grad: string; glow: string }> = {
  teal:   { grad:'from-teal-400 to-teal-600',     glow:'shadow-teal-200/60'   },
  blue:   { grad:'from-blue-400 to-blue-600',     glow:'shadow-blue-200/60'   },
  purple: { grad:'from-violet-400 to-purple-600', glow:'shadow-violet-200/60' },
  green:  { grad:'from-emerald-400 to-green-600', glow:'shadow-emerald-200/60'},
  yellow: { grad:'from-amber-400 to-orange-500',  glow:'shadow-amber-200/60'  },
  cyan:   { grad:'from-cyan-400 to-sky-600',      glow:'shadow-cyan-200/60'   },
  red:    { grad:'from-rose-400 to-red-600',      glow:'shadow-rose-200/60'   },
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: string;
}

function StatCard({ icon, label, value, sub, color }: StatCardProps) {
  const t = STAT_THEMES[color] || STAT_THEMES.teal;
  return (
    <div className="ios-stat-tile relative overflow-hidden">
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${t.grad} opacity-10`} />
      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${t.grad} flex items-center justify-center mb-3 shadow-lg ${t.glow} relative`}>
        <span className="text-white [&>svg]:stroke-2">{icon}</span>
      </div>
      <p className="text-[32px] font-bold text-gray-900 tracking-tight leading-none relative">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 relative">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5 relative">{sub}</p>}
    </div>
  );
}

function TreatmentFlow({ consultation }: { consultation: any }) {
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
          <div className={`flex flex-col items-center flex-1`}>
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

interface TimelineItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  date: string;
  color: string;
  last: boolean;
}

function TimelineItem({ icon, title, subtitle, date, color, last }: TimelineItemProps) {
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

const DASH_PALETTES = [
  { grad:'from-violet-500 to-purple-700',   step:'bg-violet-500',  line:'bg-violet-300',  light:'bg-violet-50',  accent:'text-violet-600', badge:'bg-violet-100 text-violet-700'  },
  { grad:'from-blue-500 to-indigo-700',      step:'bg-blue-500',    line:'bg-blue-300',    light:'bg-blue-50',    accent:'text-blue-600',   badge:'bg-blue-100 text-blue-700'      },
  { grad:'from-teal-500 to-emerald-700',     step:'bg-teal-500',    line:'bg-teal-300',    light:'bg-teal-50',    accent:'text-teal-600',   badge:'bg-teal-100 text-teal-700'      },
  { grad:'from-rose-500 to-pink-700',        step:'bg-rose-500',    line:'bg-rose-300',    light:'bg-rose-50',    accent:'text-rose-600',   badge:'bg-rose-100 text-rose-700'      },
  { grad:'from-amber-500 to-orange-600',     step:'bg-amber-500',   line:'bg-amber-300',   light:'bg-amber-50',   accent:'text-amber-600',  badge:'bg-amber-100 text-amber-700'    },
  { grad:'from-cyan-500 to-sky-700',         step:'bg-cyan-500',    line:'bg-cyan-300',    light:'bg-cyan-50',    accent:'text-cyan-600',   badge:'bg-cyan-100 text-cyan-700'      },
];

function DashboardDoctorTiles({ consultations }: { consultations: any[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const doctorGroups = useMemo(() => {
    const groups: Record<string, any> = {};
    consultations.forEach((c: any) => {
      const key = c.doctor_display_name || c.doctor_name || 'Self-Recorded';
      if (!groups[key]) groups[key] = { doctorKey:key, isSystemDoctor:!!c.doctor_display_name, hospital:'', hasActive:false, consultations:[] };
      groups[key].consultations.push(c);
      if (c.hospital_clinic) groups[key].hospital = c.hospital_clinic;
      if (c.status === 'active') groups[key].hasActive = true;
    });
    return Object.values(groups).sort((a: any, b: any) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return new Date(b.consultations[0]?.visit_date||0).getTime() - new Date(a.consultations[0]?.visit_date||0).getTime();
    });
  }, [consultations]);

  if (doctorGroups.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Consultations by Doctor</SectionTitle>
        <Link to="/patient/consultations"
          className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors">
          View all &amp; manage
          <ArrowUpRight size={12} strokeWidth={2.5} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {doctorGroups.map((group: any, idx: number) => {
          const pal     = DASH_PALETTES[idx % DASH_PALETTES.length];
          const initial = group.doctorKey.replace(/^Dr\.?\s*/i,'').charAt(0).toUpperCase();

          return (
            <div key={group.doctorKey} className="ios-tile">
              <div className={`relative bg-gradient-to-br ${pal.grad} px-4 pt-4 pb-10 overflow-hidden`}>
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white font-bold text-base shadow-md">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm leading-snug">
                      {group.doctorKey === 'Self-Recorded' ? 'Self-Recorded' : `Dr. ${group.doctorKey}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {group.hospital && (
                        <span className="flex items-center gap-1 text-white/70 text-[11px]">
                          <Building2 size={9} strokeWidth={2} />{group.hospital}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-white/70 text-[11px]">
                        <Calendar size={9} strokeWidth={2} />
                        {group.consultations.length} visit{group.consultations.length !== 1 ? 's' : ''}
                      </span>
                      {group.hasActive && (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-400/30 text-amber-100 border border-amber-200/30 px-2 py-0.5 rounded-full">
                          <span className="w-1 h-1 bg-amber-300 rounded-full animate-pulse" />Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/60 -mt-6 pt-7 px-3 pb-3 rounded-b-3xl space-y-2">
                {group.consultations.map((c: any) => {
                  const isOpen = expandedId === c.id;
                  const meds   = c.medicines || [];
                  const wfSteps = [
                    { done:!!c.sick_description,     Icon:Thermometer,   label:'Symptom'   },
                    { done:!!c.diagnosis,             Icon:Stethoscope,   label:'Diagnosed' },
                    { done:!!c.treatment_description, Icon:Microscope,    label:'Treated'   },
                    { done: c.status !== 'active',
                      Icon: c.status==='completed' ? CheckCircle2 : c.status==='dispensed' ? Package : Clock,
                      label: c.status==='completed' ? 'Resolved' : c.status==='dispensed' ? 'Dispensed' : 'Ongoing' },
                  ];

                  return (
                    <div key={c.id} className={`rounded-2xl border bg-white overflow-hidden shadow-sm transition-all duration-200 ${
                      c.status==='active' ? 'border-amber-200' : c.status==='completed' ? 'border-emerald-100' : 'border-gray-100'
                    }`}>
                      <button type="button" className="w-full text-left px-3.5 pt-3 pb-2"
                        onClick={() => setExpandedId(isOpen ? null : c.id)}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900 leading-snug">
                            {c.diagnosis || c.sick_description || 'Medical Visit'}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {meds.length > 0 && (
                              <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${pal.badge}`}>
                                <Pill size={9} strokeWidth={2.5} />{meds.length}
                              </span>
                            )}
                            <ChevronDown size={13} strokeWidth={2} className={`text-gray-400 transition-transform duration-200 ${isOpen?'rotate-180':''}`} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Calendar size={10} strokeWidth={2} />
                            {formatDate(c.visit_date)}
                          </span>
                        </div>

                        <div className="flex items-start pt-2.5">
                          {wfSteps.map((s, i) => (
                            <div key={i} className="flex items-start flex-1">
                              <div className="flex flex-col items-center flex-1">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 ${
                                  s.done ? `bg-gradient-to-br ${pal.grad} ring-transparent shadow-sm` : 'bg-white ring-gray-200'
                                }`}>
                                  <s.Icon size={12} strokeWidth={2} className={s.done ? 'text-white' : 'text-gray-300'} />
                                </div>
                                <p className={`text-[9px] font-semibold mt-1 text-center leading-tight ${s.done ? pal.accent : 'text-gray-300'}`}>
                                  {s.label}
                                </p>
                              </div>
                              {i < wfSteps.length - 1 && (
                                <div className={`step-connector mt-3.5 mx-0.5 ${s.done && wfSteps[i+1].done ? pal.line : ''}`}
                                  style={{ background: s.done && wfSteps[i+1].done ? undefined : '#e5e7eb' }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-3.5 pb-3 pt-2 border-t border-gray-50 space-y-2">
                          {c.sick_description && (
                            <div className="bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
                              <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wider mb-0.5">Symptoms</p>
                              <p className="text-xs text-gray-700">{c.sick_description}</p>
                            </div>
                          )}
                          {c.diagnosis && (
                            <div className={`${pal.light} rounded-xl px-3 py-2 border border-gray-100`}>
                              <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${pal.accent}`}>Diagnosis</p>
                              <p className="text-xs text-gray-700">{c.diagnosis}</p>
                            </div>
                          )}
                          {c.treatment_description && (
                            <div className="bg-teal-50 rounded-xl px-3 py-2 border border-teal-100">
                              <p className="text-[9px] font-bold text-teal-600 uppercase tracking-wider mb-0.5">Treatment</p>
                              <p className="text-xs text-gray-700">{c.treatment_description}</p>
                            </div>
                          )}
                          {meds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {meds.map((m: any, i: number) => (
                                <span key={i} className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-2 py-1 text-[11px] shadow-sm">
                                  <div className={`w-4 h-4 rounded-lg ${pal.step} flex items-center justify-center`}>
                                    <Pill size={8} strokeWidth={2.5} className="text-white" />
                                  </div>
                                  <span className="font-semibold text-gray-800">{m.medicine_name}</span>
                                  {m.dosage && <span className="text-gray-400">· {m.dosage}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          {!c.doctor_id && (
                            <Link to="/patient/consultations"
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${pal.accent} hover:opacity-70 transition-opacity`}>
                              Edit this consultation <ArrowUpRight size={11} strokeWidth={2.5} />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [downloading, setDownloading]     = useState(false);
  const [expandedDisease, setExpandedDisease] = useState<number | null>(null);
  const [diseaseFilter, setDiseaseFilter] = useState('all');

  const { data: me }                 = useQuery({ queryKey: ['me'],                  queryFn: authApi.me });
  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],        queryFn: consultationApi.getAll });
  const { data: labReports = [] }    = useQuery({ queryKey: ['patient-lab-reports'],  queryFn: labApi.getAll });

  const profile   = me?.profile as any;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Patient';

  const diseases = useMemo(() =>
    (consultations as any[])
      .filter((c: any) => c.diagnosis || c.sick_description)
      .map((c: any) => ({
        ...c,
        title:  c.diagnosis || c.sick_description,
        doctor: c.doctor_display_name || null,
        meds:   c.medicines || [],
      })),
    [consultations]
  );

  const filteredDiseases = useMemo(() => {
    if (diseaseFilter === 'active')   return diseases.filter((d: any) => d.status === 'active');
    if (diseaseFilter === 'resolved') return diseases.filter((d: any) => d.status === 'completed' || d.status === 'dispensed');
    return diseases;
  }, [diseases, diseaseFilter]);

  const activeConsultations = useMemo(() => (consultations as any[]).filter((c: any) => c.status === 'active'), [consultations]);

  const activeMeds = useMemo(() =>
    activeConsultations.flatMap((c: any) =>
      (c.medicines || []).map((m: any) => ({ ...m, consultationTitle: c.diagnosis || c.sick_description }))
    ),
    [activeConsultations]
  );

  const medCount = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    (consultations as any[]).forEach((c: any) => (c.medicines || []).forEach((m: any) => {
      const key = m.medicine_name.toLowerCase();
      map[key] = { name: m.medicine_name, count: (map[key]?.count || 0) + 1 };
    }));
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [consultations]);

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

  const timeline = useMemo(() => {
    const events = [
      ...(consultations as any[]).map((c: any) => ({
        id:       `c-${c.id}`,
        type:     'consultation',
        icon:     '🏥',
        color:    'bg-teal-100',
        title:    c.diagnosis || c.sick_description || 'Medical Visit',
        subtitle: c.doctor_display_name ? `Dr. ${c.doctor_display_name}` : undefined,
        date:     c.visit_date,
        status:   c.status,
      })),
      ...(labReports as any[]).map((r: any) => ({
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
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [consultations, labReports]);

  const handleDownload = () => {
    setDownloading(true);
    try { downloadHealthReport(me, profile, diseases); }
    finally { setTimeout(() => setDownloading(false), 800); }
  };

  const visitDates = useMemo(() =>
    (consultations as any[]).map((c: any) => c.visit_date?.split('T')[0]).filter(Boolean),
    [consultations]
  );

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">

        <div className="lg:col-span-2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute -bottom-12 -right-4 w-56 h-56 bg-white/5 rounded-full" />

          <div className="relative flex flex-col h-full justify-between gap-4">
            <div>
              <p className="text-primary-200 text-sm font-medium">Welcome back,</p>
              <h1 className="text-3xl font-bold mt-1 leading-tight">{firstName}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {profile?.blood_type && (
                  <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                    🩸 {profile.blood_type}
                  </span>
                )}
                {age && (
                  <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                    🎂 {age} yrs
                  </span>
                )}
                {profile?.gender && (
                  <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 capitalize">
                    {profile.gender === 'male' ? '♂' : profile.gender === 'female' ? '♀' : '⚧'} {profile.gender}
                  </span>
                )}
                {activeConsultations.length > 0 && (
                  <span className="bg-yellow-400/25 text-yellow-100 text-xs font-semibold px-3 py-1.5 rounded-full border border-yellow-300/30">
                    ⚕️ {activeConsultations.length} active treatment{activeConsultations.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-end justify-between flex-wrap gap-3">
              <div className="flex gap-5">
                <div>
                  <p className="text-2xl font-bold">{(consultations as any[]).length}</p>
                  <p className="text-xs text-primary-300 mt-0.5">Total Visits</p>
                </div>
                <div className="w-px bg-white/10" />
                <div>
                  <p className="text-2xl font-bold">{doctors.length}</p>
                  <p className="text-xs text-primary-300 mt-0.5">Doctors</p>
                </div>
                <div className="w-px bg-white/10" />
                <div>
                  <p className="text-2xl font-bold">{(labReports as any[]).length}</p>
                  <p className="text-xs text-primary-300 mt-0.5">Lab Tests</p>
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
                {downloading ? 'Generating…' : 'Health Report'}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-1">
          <MiniCalendar highlightDates={visitDates} title="My Schedule" />
          {activeConsultations.length > 0 && (
            <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Active Treatments</p>
              <div className="space-y-2">
                {activeConsultations.slice(0, 3).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-sm shrink-0 font-bold text-yellow-700">
                      {(c.doctor_display_name || c.doctor_name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">
                        {c.diagnosis || c.sick_description || 'Treatment'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.doctor_display_name ? `Dr. ${c.doctor_display_name}` : c.doctor_name ? `Dr. ${c.doctor_name}` : 'Self-recorded'}
                      </p>
                    </div>
                    <span className="w-2 h-2 bg-yellow-400 rounded-full shrink-0 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Vitals Overview ── */}
      <VitalsOverview />

      <div className="space-y-3">
        {allergies.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">⚠️</span>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-bold text-red-700">ALLERGY ALERT — {allergies.length} Known Allergen{allergies.length !== 1 ? 's' : ''}</p>
                <span className="text-xs text-red-500">Inform all treating professionals</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {allergies.map((a: string) => (
                  <span key={a} className="bg-red-100 text-red-800 border border-red-200 text-xs font-bold px-2.5 py-1 rounded-full">
                    🚫 {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeConsultations.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">⚕️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-yellow-700">ACTIVE TREATMENT IN PROGRESS</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeConsultations.map((c: any) => (
                  <span key={c.id} className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                    {c.diagnosis || c.sick_description || 'Treatment'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {(labReports as any[]).filter((r: any) => r.status !== 'completed').length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-400 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">🔬</span>
            <div>
              <p className="text-sm font-bold text-blue-700">
                {(labReports as any[]).filter((r: any) => r.status !== 'completed').length} Lab Result{(labReports as any[]).filter((r: any) => r.status !== 'completed').length !== 1 ? 's' : ''} Pending
              </p>
              <p className="text-xs text-blue-600 mt-0.5">Results will appear in your Lab Reports section when ready.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        <StatCard icon={<Stethoscope size={14} />}   label="Doctor Visits"     value={(consultations as any[]).length}                                                    color="teal"   />
        <StatCard icon={<HeartPulse size={14} />}    label="Active Treatments" value={activeConsultations.length}                                                          color="yellow" />
        <StatCard icon={<CheckCircle2 size={14} />}  label="Resolved"          value={diseases.filter((d: any) => d.status === 'completed').length}                        color="green"  />
        <StatCard icon={<FlaskConical size={14} />}  label="Lab Tests"         value={(labReports as any[]).length}                                                        color="cyan"   />
        <StatCard icon={<Pill size={14} />}          label="Medicines"         value={medCount.length}                                                                    color="purple" />
        <StatCard icon={<UserRound size={14} />}     label="Doctors Seen"      value={doctors.length}                                                                     color="blue"   />
      </div>

      {(consultations as any[]).length > 0 && (
        <DashboardDoctorTiles consultations={consultations as any[]} />
      )}

      {activeMeds.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl border border-yellow-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Current Active Medications</SectionTitle>
            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">
              {activeMeds.length} medicine{activeMeds.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeMeds.map((m: any, i: number) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <SectionTitle>Health Profile</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Blood Type', value: profile?.blood_type || '—', icon: '🩸', color: 'bg-red-50    text-red-800    border-red-100'    },
              { label: 'Age',        value: age ? `${age} yrs` : '—',  icon: '🎂', color: 'bg-blue-50   text-blue-800   border-blue-100'   },
              { label: 'Gender',     value: profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—', icon: '👤', color: 'bg-purple-50 text-purple-800 border-purple-100' },
              { label: 'Insurance',  value: profile?.insurance_provider || '—', icon: '🛡️', color: 'bg-green-50  text-green-800  border-green-100'  },
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
                {conditions.map((c: string) => (
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
              {['all', 'active', 'resolved'].map((f: string) => (
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
                   f === 'active'   ? `Active (${diseases.filter((d: any) => d.status === 'active').length})` :
                                      `Resolved (${diseases.filter((d: any) => d.status === 'completed' || d.status === 'dispensed').length})`}
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
              {filteredDiseases.map((d: any, i: number) => (
                <div key={d.id} className={`rounded-xl border transition-all
                  ${d.status === 'active'    ? 'border-yellow-200 bg-yellow-50/30' :
                    d.status === 'completed' ? 'border-green-100  bg-green-50/20'  :
                                               'border-gray-100   bg-gray-50/50'}`}>

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

                  {expandedDisease === d.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
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
                            {d.meds.map((m: any, mi: number) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionTitle>Treating Doctors</SectionTitle>
          {doctors.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">🩺</p>
              <p className="text-sm">No doctor visits recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doc: any) => {
                const visits  = (consultations as any[]).filter((c: any) => c.doctor_display_name === doc);
                const latest  = visits[0];
                const hasActive = visits.some((v: any) => v.status === 'active');
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

      {(labReports as any[]).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionTitle>Recent Lab Reports</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(labReports as any[]).slice(0, 4).map((r: any) => {
              const STATUS: Record<string, string> = {
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
          {(labReports as any[]).length > 4 && (
            <p className="text-xs text-center text-gray-400 mt-3">
              +{(labReports as any[]).length - 4} more lab reports — view in Lab Reports tab
            </p>
          )}
        </div>
      )}

      {timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Health Timeline</SectionTitle>
            <span className="text-xs text-gray-400">{timeline.length} events</span>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1 space-y-0">
            {timeline.slice(0, 12).map((event: any, i: number) => (
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

      {(consultations as any[]).length === 0 && (labReports as any[]).length === 0 && (
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
