import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Lock, CheckCircle2, Clock, XCircle, FlaskConical,
  ClipboardList, FolderOpen, Phone, Pill, Calendar, UserRound,
  AlertTriangle, Stethoscope, ChevronDown, ChevronUp,
  MapPin, Shield, Send, X, Activity, FileText, Eye, Loader2,
  Droplets, Heart, Thermometer, Wind, TestTube2,
} from 'lucide-react';
import { accessRequestApi, patientReportApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const ACCESS_TYPES = [
  { key: 'lab_reports',      label: 'Lab Reports',               desc: 'Hospital & clinic laboratory test results',          Icon: FlaskConical,  grad: 'from-blue-500 to-indigo-600',   light: 'bg-blue-50',   accent: 'text-blue-600'   },
  { key: 'medical_history',  label: 'Medication Workflow',        desc: 'Consultation records, diagnoses & full prescriptions', Icon: ClipboardList, grad: 'from-teal-500 to-emerald-600',  light: 'bg-teal-50',   accent: 'text-teal-600'   },
  { key: 'personal_reports', label: 'Personal Health Reports',   desc: 'Patient-uploaded medical documents & reports',        Icon: FolderOpen,    grad: 'from-violet-500 to-purple-600', light: 'bg-violet-50', accent: 'text-violet-600' },
  { key: 'contact_info',     label: 'Personal Details',          desc: 'Personal contact, address & insurance details',       Icon: Phone,         grad: 'from-rose-500 to-pink-600',     light: 'bg-rose-50',   accent: 'text-rose-600'   },
  { key: 'vitals',           label: 'Patient Vitals',             desc: 'Blood work, CBC, metabolic & vital sign readings',    Icon: Activity,      grad: 'from-orange-500 to-amber-500',  light: 'bg-orange-50', accent: 'text-orange-600' },
];

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function calcAge(dob: string | null | undefined) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

async function openBlobInTab(fetchFn: () => Promise<Blob>): Promise<void> {
  const blob = await fetchFn();
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface RequestAccessModalProps {
  typeConf: any;
  patientId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function RequestAccessModal({ typeConf, patientId, onClose, onSuccess }: RequestAccessModalProps) {
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState('');

  const mutation = useMutation({
    mutationFn: () => accessRequestApi.create({
      patient_id:  patientId,
      access_type: typeConf.key,
      reason:      reason.trim() || null,
    }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError:   (err: any) => setError(err.message || 'Failed to send request'),
  });

  const { Icon } = typeConf;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-br ${typeConf.grad} px-6 py-5 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center shadow-md">
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <div>
                <p className="font-bold text-base leading-tight">Request Access</p>
                <p className="text-white/75 text-xs mt-0.5">{typeConf.label}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors">
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            You are requesting access to the patient's{' '}
            <strong className={typeConf.accent}>{typeConf.label}</strong>.{' '}
            The patient will be notified and must approve before you can view this data.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Reason for request{' '}
              <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Required for diagnosis and treatment planning…"
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={`flex-1 py-3 text-sm font-bold text-white rounded-2xl bg-gradient-to-br ${typeConf.grad} disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity`}
            >
              {mutation.isPending
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Send size={14} strokeWidth={2.5} />
              }
              {mutation.isPending ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AccessSectionProps {
  typeConf: any;
  accessStatus: any;
  onRequestAccess: (typeConf: any) => void;
  children: React.ReactNode;
}

function AccessSection({ typeConf, accessStatus, onRequestAccess, children }: AccessSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const status     = accessStatus?.status || null;
  const isPending  = status === 'pending';
  const isAccepted = status === 'accepted';
  const isDeclined = status === 'declined';
  const { Icon } = typeConf;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div
        className={`flex items-center justify-between px-5 py-4 ${isAccepted ? 'cursor-pointer hover:bg-gray-50/60 transition-colors' : ''}`}
        onClick={() => isAccepted && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${typeConf.grad} flex items-center justify-center shadow-sm shrink-0`}>
            <Icon size={18} strokeWidth={1.8} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{typeConf.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{typeConf.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {isAccepted && (
            <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={11} strokeWidth={2.5} /> Granted
            </span>
          )}
          {isPending && (
            <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
              <Clock size={11} strokeWidth={2.5} /> Pending
            </span>
          )}
          {isDeclined && (
            <span className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
              <XCircle size={11} strokeWidth={2.5} /> Declined
            </span>
          )}

          {(!status || isDeclined) && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRequestAccess(typeConf); }}
              className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-opacity hover:opacity-90 shadow-sm ${
                isDeclined
                  ? `${typeConf.light} ${typeConf.accent} border border-current/20`
                  : `bg-gradient-to-br ${typeConf.grad} text-white`
              }`}
            >
              <Lock size={11} strokeWidth={2.5} />
              {isDeclined ? 'Re-request' : 'Request Access'}
            </button>
          )}

          {isAccepted && (
            expanded
              ? <ChevronUp size={16} strokeWidth={2} className="text-gray-400" />
              : <ChevronDown size={16} strokeWidth={2} className="text-gray-400" />
          )}
        </div>
      </div>

      {!isAccepted && (
        <div className={`border-t border-gray-50 px-5 py-7 flex flex-col items-center gap-3 text-center ${
          isPending ? 'bg-amber-50/40' : isDeclined ? 'bg-red-50/30' : 'bg-gray-50/60'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            isPending ? 'bg-amber-100' : isDeclined ? 'bg-red-100' : 'bg-gray-100'
          }`}>
            <Lock size={20} strokeWidth={1.5} className={
              isPending ? 'text-amber-500' : isDeclined ? 'text-red-400' : 'text-gray-400'
            } />
          </div>
          <div>
            <p className={`text-sm font-semibold ${
              isPending ? 'text-amber-700' : isDeclined ? 'text-red-600' : 'text-gray-500'
            }`}>
              {isPending  ? 'Request sent — waiting for patient approval'
               : isDeclined ? 'Patient declined this request'
               : 'Access required to view this data'}
            </p>
            {isPending && (
              <p className="text-xs text-amber-500 mt-1">
                Requested on {fmtDate(accessStatus?.created_at)}
              </p>
            )}
          </div>
        </div>
      )}

      {isAccepted && expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

function LabReportsData({ reports, patientId }: { reports: any[] | null | undefined; patientId: number }) {
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [errorId,   setErrorId]   = useState<number | null>(null);

  const STATUS_CLS: Record<string, string> = {
    pending:     'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed:   'bg-emerald-100 text-emerald-700',
  };

  if (!reports?.length) {
    return <p className="text-sm text-gray-400 text-center py-4">No lab reports found.</p>;
  }

  const handleViewPDF = async (r: any) => {
    setOpeningId(r.id);
    setErrorId(null);
    try {
      await openBlobInTab(() => accessRequestApi.getLabReportFile(patientId, r.id));
    } catch {
      setErrorId(r.id);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-3">
      {reports.map((r: any) => (
        <div key={r.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-start gap-3 p-3.5">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <FlaskConical size={16} strokeWidth={1.8} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.test_description}</p>
                  {r.report_notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{r.report_notes}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">{fmtDate(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[r.status] || STATUS_CLS.pending}`}>
                    {r.status?.replace('_', ' ')}
                  </span>
                  {r.status === 'completed' && r.report_file && (
                    <button
                      onClick={() => handleViewPDF(r)}
                      disabled={openingId === r.id}
                      className="flex items-center gap-1.5 text-[11px] font-bold bg-blue-600 text-white px-2.5 py-1.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
                    >
                      {openingId === r.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Eye size={11} strokeWidth={2.5} />
                      }
                      {openingId === r.id ? 'Opening…' : 'View PDF'}
                    </button>
                  )}
                </div>
              </div>
              {errorId === r.id && (
                <p className="text-[11px] text-red-500 mt-1">Failed to open file. Please try again.</p>
              )}
            </div>
          </div>

          {/* Lab details row */}
          {(r.lab_type || r.lab_address) && (
            <div className="border-t border-gray-100 px-3.5 py-2 flex gap-3 text-[11px] text-gray-400">
              {r.lab_type    && <span className="capitalize">{r.lab_type.replace('_', ' ')}</span>}
              {r.lab_address && <span>{r.lab_address}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MedicalHistoryData({ consultations }: { consultations: any[] | null | undefined }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!consultations?.length) {
    return <p className="text-sm text-gray-400 text-center py-4">No consultation history found.</p>;
  }

  return (
    <div className="space-y-3">
      {consultations.map((c: any) => (
        <div key={c.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
          <button
            type="button"
            className="w-full text-left px-4 py-3 hover:bg-white/60 transition-colors"
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{c.diagnosis || c.sick_description || 'Medical Visit'}</p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <Calendar size={10} strokeWidth={2} /> {fmtDate(c.visit_date)}
                  {c.doctor_name && (
                    <span className="flex items-center gap-1">
                      <Stethoscope size={10} strokeWidth={2} /> Dr. {c.doctor_name}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  c.status === 'active'     ? 'bg-amber-100 text-amber-700'    :
                  c.status === 'completed'  ? 'bg-emerald-100 text-emerald-700' :
                                              'bg-blue-100 text-blue-700'
                }`}>{c.status}</span>
                {expandedId === c.id
                  ? <ChevronUp  size={14} strokeWidth={2} className="text-gray-400" />
                  : <ChevronDown size={14} strokeWidth={2} className="text-gray-400" />
                }
              </div>
            </div>
          </button>

          {expandedId === c.id && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
              {c.sick_description && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Symptoms</p>
                  <p className="text-xs text-gray-600">{c.sick_description}</p>
                </div>
              )}
              {c.diagnosis && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Diagnosis</p>
                  <p className="text-xs text-gray-700 font-medium">{c.diagnosis}</p>
                </div>
              )}
              {c.treatment_description && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Treatment Plan</p>
                  <p className="text-xs text-gray-600">{c.treatment_description}</p>
                </div>
              )}
              {c.lab_tests_requested && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Lab Tests Requested</p>
                  <p className="text-xs text-gray-600">{c.lab_tests_requested}</p>
                </div>
              )}

              {c.medicines?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Pill size={10} strokeWidth={2.5} className="text-teal-500" />
                    Prescribed Medications ({c.medicines.length})
                  </p>
                  <div className="space-y-2">
                    {c.medicines.map((m: any, i: number) => (
                      <div key={m.id || i} className="bg-white border border-teal-100 rounded-xl p-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
                            <Pill size={11} strokeWidth={2.5} className="text-teal-600" />
                          </div>
                          <p className="text-sm font-bold text-gray-900">{m.medicine_name}</p>
                          {m.source === 'ocr' && (
                            <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full ml-auto">OCR</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-8">
                          {m.dosage    && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg font-medium">{m.dosage}</span>}
                          {m.frequency && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg font-medium">{m.frequency}</span>}
                          {m.duration  && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg font-medium">{m.duration}</span>}
                        </div>
                        {m.notes && (
                          <p className="text-[11px] text-gray-400 italic mt-1 pl-8">{m.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {c.medicines?.length === 0 && (
                <p className="text-xs text-gray-400 italic">No medicines prescribed for this visit.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ContactInfoData({ patient }: { patient: any }) {
  const rows = [
    { label: 'Phone',            value: patient.phone,                   Icon: Phone     },
    { label: 'Address',          value: patient.address,                 Icon: MapPin    },
    { label: 'Emergency Contact',value: patient.emergency_contact_name,  Icon: UserRound },
    { label: 'Emergency Phone',  value: patient.emergency_contact_phone, Icon: Phone     },
    { label: 'Insurance',        value: patient.insurance_provider,      Icon: Shield    },
    { label: 'Policy No.',       value: patient.insurance_policy_number, Icon: Shield    },
  ];
  const filled = rows.filter(r => r.value);
  if (!filled.length) return <p className="text-sm text-gray-400 text-center py-4">No contact details on file.</p>;
  return (
    <div className="space-y-2.5">
      {filled.map(({ label, value, Icon: I }) => (
        <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3.5 py-2.5">
          <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center border border-gray-100 shrink-0">
            <I size={14} strokeWidth={1.8} className="text-gray-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonalReportsData({ reports }: { reports: any[] | null | undefined }) {
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [errorId,   setErrorId]   = useState<number | null>(null);

  if (!reports?.length) {
    return <p className="text-sm text-gray-400 text-center py-4">No personal reports uploaded.</p>;
  }

  const TYPE_LABEL: Record<string, string> = {
    lab_report:        'Lab Report',
    prescription:      'Prescription',
    imaging:           'Imaging',
    discharge_summary: 'Discharge Summary',
    vaccination:       'Vaccination',
    other:             'Other',
  };

  const handleView = async (r: any) => {
    setOpeningId(r.id);
    setErrorId(null);
    try {
      await openBlobInTab(() => patientReportApi.getDoctorFile(r.id));
    } catch {
      setErrorId(r.id);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-2.5">
      {reports.map((r: any) => (
        <div key={r.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <FileText size={16} strokeWidth={1.8} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{r.title}</p>
              <p className="text-xs text-gray-400">
                {TYPE_LABEL[r.report_type] || r.report_type}
                {r.issued_date && <> · {fmtDate(r.issued_date)}</>}
                {r.laboratory_name && <> · {r.laboratory_name}</>}
                {r.doctor_name && <> · Dr. {r.doctor_name}</>}
              </p>
              {r.description && (
                <p className="text-[11px] text-gray-400 italic mt-0.5 truncate">{r.description}</p>
              )}
            </div>
            {r.file_path && (
              <button
                onClick={() => handleView(r)}
                disabled={openingId === r.id}
                className="flex items-center gap-1.5 text-[11px] font-bold bg-violet-600 text-white px-2.5 py-1.5 rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-60 shrink-0"
              >
                {openingId === r.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Eye size={11} strokeWidth={2.5} />
                }
                {openingId === r.id ? 'Opening…' : 'View'}
              </button>
            )}
          </div>
          {errorId === r.id && (
            <p className="text-[11px] text-red-500 px-3.5 pb-2">Failed to open file. Please try again.</p>
          )}
        </div>
      ))}
    </div>
  );
}

const VITALS_GROUPS = [
  {
    label: 'Basic Vitals',
    color: 'rose',
    Icon: Heart,
    fields: [
      { key: 'bp_systolic',       label: 'Systolic BP',    unit: 'mmHg' },
      { key: 'bp_diastolic',      label: 'Diastolic BP',   unit: 'mmHg' },
      { key: 'heart_rate',        label: 'Heart Rate',     unit: 'bpm'  },
      { key: 'temperature',       label: 'Temperature',    unit: '°C'   },
      { key: 'oxygen_saturation', label: 'SpO₂',           unit: '%'    },
    ],
  },
  {
    label: 'Metabolic Panel',
    color: 'amber',
    Icon: Droplets,
    fields: [
      { key: 'blood_glucose', label: 'Blood Glucose', unit: 'mg/dL' },
      { key: 'hba1c',         label: 'HbA1c',         unit: '%'     },
      { key: 'creatinine',    label: 'Creatinine',    unit: 'mg/dL' },
    ],
  },
  {
    label: 'Lipid Panel',
    color: 'purple',
    Icon: Activity,
    fields: [
      { key: 'cholesterol',   label: 'Total Cholesterol', unit: 'mg/dL' },
      { key: 'hdl',           label: 'HDL',               unit: 'mg/dL' },
      { key: 'ldl',           label: 'LDL',               unit: 'mg/dL' },
      { key: 'triglycerides', label: 'Triglycerides',      unit: 'mg/dL' },
    ],
  },
  {
    label: 'CBC Panel',
    color: 'blue',
    Icon: TestTube2,
    fields: [
      { key: 'hemoglobin',  label: 'Hemoglobin',  unit: 'g/dL' },
      { key: 'wbc',         label: 'WBC',         unit: 'K/μL' },
      { key: 'rbc',         label: 'RBC',         unit: 'M/μL' },
      { key: 'platelets',   label: 'Platelets',   unit: 'K/μL' },
      { key: 'hematocrit',  label: 'Hematocrit',  unit: '%'    },
      { key: 'mcv',         label: 'MCV',         unit: 'fL'   },
      { key: 'mch',         label: 'MCH',         unit: 'pg'   },
      { key: 'mchc',        label: 'MCHC',        unit: 'g/dL' },
      { key: 'rdw',         label: 'RDW',         unit: '%'    },
      { key: 'mpv',         label: 'MPV',         unit: 'fL'   },
    ],
  },
] as const;

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; groupBg: string }> = {
  rose:   { bg: 'bg-rose-100',   text: 'text-rose-600',   border: 'border-rose-100',   groupBg: 'bg-rose-50/40'   },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-600',  border: 'border-amber-100',  groupBg: 'bg-amber-50/40'  },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-100', groupBg: 'bg-purple-50/40' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-600',   border: 'border-blue-100',   groupBg: 'bg-blue-50/40'   },
};

function VitalsRecord({ vitals }: { vitals: any }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          Recorded {fmtDate(vitals.recorded_at)}
        </p>
        {vitals.source && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            vitals.source === 'lab_report'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {vitals.source === 'lab_report' ? 'From Lab Report' : 'Manual Entry'}
          </span>
        )}
      </div>

      {VITALS_GROUPS.map(group => {
        const hasValues = group.fields.some(f => vitals[f.key] != null);
        if (!hasValues) return null;
        const clr = COLOR_MAP[group.color];
        const { Icon: GIcon } = group;
        return (
          <div key={group.label} className={`rounded-2xl border ${clr.border} ${clr.groupBg} p-3`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 ${clr.bg} rounded-lg flex items-center justify-center`}>
                <GIcon size={12} strokeWidth={2} className={clr.text} />
              </div>
              <p className={`text-[11px] font-bold ${clr.text} uppercase tracking-wider`}>{group.label}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {group.fields.map(f => {
                if (vitals[f.key] == null) return null;
                return (
                  <div key={f.key} className="bg-white rounded-xl px-2.5 py-2 border border-white/80">
                    <p className="text-[10px] text-gray-400 leading-none">{f.label}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">
                      {vitals[f.key]}
                      <span className="text-[10px] font-normal text-gray-400 ml-1">{f.unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {vitals.notes && (
        <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
          <p className="text-xs text-gray-600">{vitals.notes}</p>
        </div>
      )}
    </div>
  );
}

function VitalsData({ vitalsHistory }: { vitalsHistory: any[] | null | undefined }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  if (!vitalsHistory?.length) {
    return <p className="text-sm text-gray-400 text-center py-4">No vitals recorded yet.</p>;
  }

  if (vitalsHistory.length === 1) {
    return <VitalsRecord vitals={vitalsHistory[0]} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        {vitalsHistory.length} recorded entries — most recent first
      </p>
      {vitalsHistory.map((v: any, idx: number) => (
        <div key={v.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
          <button
            type="button"
            className="w-full text-left px-4 py-3 hover:bg-white/60 transition-colors flex items-center justify-between gap-2"
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          >
            <div className="flex items-center gap-2">
              {idx === 0 && (
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Latest</span>
              )}
              <span className="text-sm font-semibold text-gray-700">{fmtDate(v.recorded_at)}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                v.source === 'lab_report'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {v.source === 'lab_report' ? 'Lab' : 'Manual'}
              </span>
            </div>
            {expandedIdx === idx
              ? <ChevronUp  size={14} strokeWidth={2} className="text-gray-400 shrink-0" />
              : <ChevronDown size={14} strokeWidth={2} className="text-gray-400 shrink-0" />
            }
          </button>
          {expandedIdx === idx && (
            <div className="border-t border-gray-100 px-4 pb-4 pt-3">
              <VitalsRecord vitals={v} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DoctorPatientView() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate      = useNavigate();
  const qc            = useQueryClient();

  const [toast,       setToast]       = useState<{ msg: string; type: string } | null>(null);
  const [activeModal, setActiveModal] = useState<any>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-view', patientId],
    queryFn:  () => accessRequestApi.getPatientView(parseInt(patientId!, 10)),
    enabled:  !!patientId,
  });

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      Loading patient profile…
    </div>
  );

  if (isError || !data) return (
    <div className="text-center py-24">
      <p className="text-4xl mb-3">❌</p>
      <p className="font-bold text-gray-600">Patient not found</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-sm text-primary-600 hover:underline">
        ← Go back
      </button>
    </div>
  );

  const { patient, access, active_meds, data: accessData } = data;
  const age        = calcAge(patient.date_of_birth);
  const allergies  = patient.allergies?.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) || [];
  const conditions = patient.chronic_conditions?.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) || [];
  const pid        = parseInt(patientId!, 10);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border ${
          toast.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
        }`}>
          {toast.type === 'error' ? <XCircle size={15} strokeWidth={2.5} /> : <CheckCircle2 size={15} strokeWidth={2.5} />}
          {toast.msg}
        </div>
      )}

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back to Dashboard
      </button>

      {/* Patient header card */}
      <div className="ios-tile overflow-hidden">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-5 pt-5 pb-12 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute top-6 -right-20 w-32 h-32 bg-white/5 rounded-full" />
          <div className="relative flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl font-bold text-white shadow-lg shrink-0">
              {patient.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight">{patient.name}</h1>
              <p className="text-primary-200 text-sm mt-0.5">{patient.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {age && (
                  <span className="bg-white/15 text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/20">
                    {age} yrs
                  </span>
                )}
                {patient.gender && (
                  <span className="bg-white/15 text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/20 capitalize">
                    {patient.gender}
                  </span>
                )}
                {patient.blood_type && (
                  <span className="bg-red-500/30 text-red-100 text-xs font-bold px-2.5 py-1 rounded-full border border-red-400/30">
                    {patient.blood_type}
                  </span>
                )}
                {patient.date_of_birth && (
                  <span className="bg-white/15 text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/20">
                    DOB: {fmtDate(patient.date_of_birth)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50/60 -mt-8 pt-9 px-5 pb-5 rounded-b-3xl space-y-3">
          {allergies.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={13} strokeWidth={2.5} className="text-red-500" />
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Known Allergies</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {allergies.map((a: string) => (
                  <span key={a} className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {conditions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-2">Chronic Conditions</p>
              <div className="flex flex-wrap gap-2">
                {conditions.map((c: string) => (
                  <span key={c} className="bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {allergies.length === 0 && conditions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No allergies or chronic conditions recorded.</p>
          )}
        </div>
      </div>

      {/* Active medications summary */}
      {active_meds?.length > 0 && (
        <div className="ios-tile p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
              <Pill size={15} strokeWidth={2} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Active Medications</p>
              <p className="text-[10px] text-gray-400">{active_meds.length} medicine{active_meds.length !== 1 ? 's' : ''} currently prescribed</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active_meds.map((m: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                <div className="w-7 h-7 bg-amber-200 rounded-xl flex items-center justify-center shrink-0">
                  <Pill size={12} strokeWidth={2.5} className="text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{m.medicine_name}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {m.dosage    && <span className="text-[10px] bg-white border border-amber-100 text-gray-500 px-1.5 py-0.5 rounded-lg">{m.dosage}</span>}
                    {m.frequency && <span className="text-[10px] bg-white border border-amber-100 text-gray-500 px-1.5 py-0.5 rounded-lg">{m.frequency}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Protected sections */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={14} strokeWidth={2} className="text-gray-400" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Protected Patient Data</p>
        </div>

        {ACCESS_TYPES.map((typeConf: any) => (
          <AccessSection
            key={typeConf.key}
            typeConf={typeConf}
            accessStatus={access[typeConf.key]}
            onRequestAccess={setActiveModal}
          >
            {typeConf.key === 'lab_reports'      && <LabReportsData      reports={accessData.lab_reports}        patientId={pid}                   />}
            {typeConf.key === 'medical_history'  && <MedicalHistoryData  consultations={accessData.consultations}                                  />}
            {typeConf.key === 'personal_reports' && <PersonalReportsData reports={accessData.personal_reports}                                     />}
            {typeConf.key === 'contact_info'     && <ContactInfoData     patient={patient}                                                         />}
            {typeConf.key === 'vitals'           && <VitalsData          vitalsHistory={accessData.vitals_history}                                 />}
          </AccessSection>
        ))}
      </div>

      {activeModal && (
        <RequestAccessModal
          typeConf={activeModal}
          patientId={pid}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['patient-view', patientId] });
            showToast('Access request sent! Patient will be notified.');
          }}
        />
      )}
    </div>
  );
}
