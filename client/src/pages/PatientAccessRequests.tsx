import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, Clock, FlaskConical, ClipboardList,
  FolderOpen, Phone, Stethoscope, Shield, ArrowUpRight, Microscope, Eye,
} from 'lucide-react';
import { accessRequestApi, labViewRequestApi } from '../services/api';

const TYPE_META: Record<string, { label: string; Icon: any; grad: string; light: string; accent: string }> = {
  lab_reports:      { label:'Lab Reports',              Icon: FlaskConical,  grad:'from-blue-500 to-indigo-600',   light:'bg-blue-50',   accent:'text-blue-600'  },
  medical_history:  { label:'Medical History',          Icon: ClipboardList, grad:'from-teal-500 to-emerald-600',  light:'bg-teal-50',   accent:'text-teal-600'  },
  personal_reports: { label:'Personal Health Reports',  Icon: FolderOpen,    grad:'from-violet-500 to-purple-600', light:'bg-violet-50', accent:'text-violet-600'},
  contact_info:     { label:'Contact Information',      Icon: Phone,         grad:'from-rose-500 to-pink-600',     light:'bg-rose-50',   accent:'text-rose-600'  },
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:  { label:'Awaiting Response', cls:'bg-amber-100 text-amber-700',   dot:'bg-amber-400'    },
  accepted: { label:'Access Granted',    cls:'bg-emerald-100 text-emerald-700', dot:'bg-emerald-400' },
  declined: { label:'Declined',          cls:'bg-red-100 text-red-600',        dot:'bg-red-400'      },
};

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

interface RequestCardProps {
  request: any;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  accepting: boolean;
  declining: boolean;
}

function RequestCard({ request, onAccept, onDecline, accepting, declining }: RequestCardProps) {
  const [confirmDecline, setConfirmDecline] = useState(false);
  const meta   = TYPE_META[request.access_type]   || TYPE_META.lab_reports;
  const stMeta = STATUS_META[request.status]       || STATUS_META.pending;
  const Icon   = meta.Icon;

  return (
    <div className="ios-tile overflow-hidden">
      <div className={`bg-gradient-to-br ${meta.grad} px-5 pt-4 pb-10 relative overflow-hidden`}>
        <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full" />
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl border border-white/30 flex items-center justify-center">
              <Icon size={18} strokeWidth={1.8} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">{meta.label}</p>
              <p className="text-white/70 text-xs">Access requested</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${stMeta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot}`} />
            {stMeta.label}
          </span>
        </div>
      </div>

      <div className="bg-slate-50/60 -mt-6 pt-7 px-5 pb-5 rounded-b-3xl space-y-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.grad} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {request.doctor_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Dr. {request.doctor_name}</p>
            <p className="text-xs text-gray-400">
              {request.doctor_specialization || 'Medical Doctor'}
              {request.doctor_hospital ? ` · ${request.doctor_hospital}` : ''}
            </p>
          </div>
          <Stethoscope size={16} strokeWidth={1.5} className="text-gray-300 shrink-0" />
        </div>

        {request.reason && (
          <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Reason from Doctor</p>
            <p className="text-sm text-gray-700 leading-relaxed">"{request.reason}"</p>
          </div>
        )}

        <div className="flex gap-4 text-xs text-gray-400">
          <span>Requested: <span className="font-semibold text-gray-600">{fmtDate(request.created_at)}</span></span>
          {request.responded_at && (
            <span>Responded: <span className="font-semibold text-gray-600">{fmtDate(request.responded_at)}</span></span>
          )}
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <Shield size={14} strokeWidth={2} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            If you accept, Dr. {request.doctor_name} will be able to view your <strong>{meta.label}</strong> in their portal.
          </p>
        </div>

        {request.status === 'pending' && (
          <div className="flex gap-3 pt-1">
            {!confirmDecline ? (
              <>
                <button
                  onClick={() => onAccept(request.id)}
                  disabled={accepting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl disabled:opacity-50 shadow-sm hover:opacity-90 transition-opacity"
                >
                  {accepting
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <CheckCircle2 size={16} strokeWidth={2.5} />
                  }
                  Accept Request
                </button>
                <button
                  onClick={() => setConfirmDecline(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-600 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <XCircle size={16} strokeWidth={2.5} />
                  Decline
                </button>
              </>
            ) : (
              <div className="flex-1 space-y-2">
                <p className="text-xs text-center text-gray-600 font-medium">Are you sure you want to decline?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDecline(false)}
                    className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => { onDecline(request.id); setConfirmDecline(false); }}
                    disabled={declining}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50"
                  >
                    Yes, Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {request.status === 'accepted' && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
            <CheckCircle2 size={15} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-700">Access granted — Dr. {request.doctor_name} can now view your {meta.label}</p>
          </div>
        )}
        {request.status === 'declined' && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
            <XCircle size={15} strokeWidth={2.5} className="text-red-500 shrink-0" />
            <p className="text-sm font-semibold text-red-600">Request declined</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface LabViewRequestCardProps {
  request: any;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  accepting: boolean;
  declining: boolean;
}

function LabViewRequestCard({ request, onAccept, onDecline, accepting, declining }: LabViewRequestCardProps) {
  const [confirmDecline, setConfirmDecline] = useState(false);
  const stMeta = STATUS_META[request.status] || STATUS_META.pending;

  return (
    <div className="ios-tile overflow-hidden">
      <div className="bg-gradient-to-br from-cyan-500 to-teal-600 px-5 pt-4 pb-10 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full" />
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl border border-white/30 flex items-center justify-center">
              <Microscope size={18} strokeWidth={1.8} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Lab Report Access</p>
              <p className="text-white/70 text-xs">Doctor wants to view your lab report</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${stMeta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot}`} />
            {stMeta.label}
          </span>
        </div>
      </div>

      <div className="bg-slate-50/60 -mt-6 pt-7 px-5 pb-5 rounded-b-3xl space-y-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {request.doctor_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Dr. {request.doctor_name}</p>
            <p className="text-xs text-gray-400">
              {request.doctor_specialization || 'Medical Doctor'}
              {request.doctor_hospital ? ` · ${request.doctor_hospital}` : ''}
            </p>
          </div>
          <Stethoscope size={16} strokeWidth={1.5} className="text-gray-300 shrink-0" />
        </div>

        <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 space-y-2">
          {request.lab_name && (
            <div className="flex items-center gap-2">
              <FlaskConical size={13} strokeWidth={2} className="text-cyan-600 shrink-0" />
              <p className="text-xs text-gray-500">Laboratory: <span className="font-semibold text-gray-800">{request.lab_name}</span></p>
            </div>
          )}
          {request.test_description && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Tests</p>
              <p className="text-sm text-gray-700 leading-relaxed">{request.test_description}</p>
            </div>
          )}
        </div>

        {request.message && (
          <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Reason from Doctor</p>
            <p className="text-sm text-gray-700 leading-relaxed">"{request.message}"</p>
          </div>
        )}

        <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
          <span>Requested: <span className="font-semibold text-gray-600">{fmtDate(request.created_at)}</span></span>
          {request.responded_at && (
            <span>Responded: <span className="font-semibold text-gray-600">{fmtDate(request.responded_at)}</span></span>
          )}
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <Shield size={14} strokeWidth={2} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            If you accept, Dr. {request.doctor_name} will be able to view and download this specific lab report.
          </p>
        </div>

        {request.status === 'pending' && (
          <div className="flex gap-3 pt-1">
            {!confirmDecline ? (
              <>
                <button
                  onClick={() => onAccept(request.id)}
                  disabled={accepting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl disabled:opacity-50 shadow-sm hover:opacity-90 transition-opacity"
                >
                  {accepting
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <CheckCircle2 size={16} strokeWidth={2.5} />
                  }
                  Allow Access
                </button>
                <button
                  onClick={() => setConfirmDecline(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-600 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <XCircle size={16} strokeWidth={2.5} />
                  Decline
                </button>
              </>
            ) : (
              <div className="flex-1 space-y-2">
                <p className="text-xs text-center text-gray-600 font-medium">Are you sure you want to decline?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDecline(false)}
                    className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => { onDecline(request.id); setConfirmDecline(false); }}
                    disabled={declining}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50"
                  >
                    Yes, Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {request.status === 'accepted' && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
            <Eye size={15} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-700">Access granted — Dr. {request.doctor_name} can now view this lab report</p>
          </div>
        )}
        {request.status === 'declined' && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
            <XCircle size={15} strokeWidth={2.5} className="text-red-500 shrink-0" />
            <p className="text-sm font-semibold text-red-600">Request declined</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PatientAccessRequests() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [activeTab, setActiveTab] = useState('access');
  const [accessFilter, setAccessFilter] = useState('all');
  const [labFilter, setLabFilter] = useState('all');

  const { data: requests = [], isLoading: accessLoading } = useQuery({
    queryKey: ['access-requests'],
    queryFn:  accessRequestApi.getAll,
  });

  const { data: labViewRequests = [], isLoading: labLoading } = useQuery({
    queryKey: ['lab-view-requests'],
    queryFn:  labViewRequestApi.getAll,
  });

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const respondMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => accessRequestApi.respond(id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['access-requests'] });
      showToast(status === 'accepted' ? 'Access granted! Doctor has been notified.' : 'Request declined.');
    },
    onError: (err: any) => showToast(err.message || 'Failed to respond', 'error'),
  });

  const labRespondMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => labViewRequestApi.respond(id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['lab-view-requests'] });
      showToast(status === 'accepted' ? 'Lab report access granted! Doctor has been notified.' : 'Request declined.');
    },
    onError: (err: any) => showToast(err.message || 'Failed to respond', 'error'),
  });

  const accessPending  = (requests as any[]).filter((r: any) => r.status === 'pending').length;
  const labPending     = (labViewRequests as any[]).filter((r: any) => r.status === 'pending').length;
  const totalPending   = accessPending + labPending;

  const accessFiltered = accessFilter === 'all' ? requests : (requests as any[]).filter((r: any) => r.status === accessFilter);
  const labFiltered    = labFilter === 'all' ? labViewRequests : (labViewRequests as any[]).filter((r: any) => r.status === labFilter);

  const isLoading = activeTab === 'access' ? accessLoading : labLoading;

  if (isLoading && (activeTab === 'access' ? (requests as any[]).length === 0 : (labViewRequests as any[]).length === 0)) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      Loading requests…
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border ${
          toast.type==='error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
        }`}>
          {toast.type==='error' ? <XCircle size={15}/> : <CheckCircle2 size={15}/>}
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Doctor Requests</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Doctors requesting access to your health data — you control what they can see
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label:'Pending',        value: totalPending,                                                                         grad:'from-amber-500 to-orange-500',   shadow:'shadow-amber-200/50'  },
          { label:'Data Access',    value: (requests as any[]).filter((r: any) => r.status==='accepted').length,                 grad:'from-emerald-500 to-teal-500',   shadow:'shadow-emerald-200/50'},
          { label:'Lab Reports',    value: (labViewRequests as any[]).filter((r: any) => r.status==='accepted').length,          grad:'from-cyan-500 to-teal-600',      shadow:'shadow-cyan-200/50'  },
        ].map(s => (
          <div key={s.label} className="ios-stat-tile relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
            <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3 shadow-lg ${s.shadow}`}>
              <ArrowUpRight size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 bg-gray-100 rounded-2xl p-1">
        <button
          onClick={() => setActiveTab('access')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'access' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield size={14} strokeWidth={2} />
          Data Access
          {accessPending > 0 && (
            <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {accessPending}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('lab')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'lab' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Microscope size={14} strokeWidth={2} />
          Lab Reports
          {labPending > 0 && (
            <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {labPending}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'access' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'accepted', 'declined'].map(f => (
              <button key={f} onClick={() => setAccessFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize ${
                  accessFilter === f
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'
                }`}>
                {f === 'all' ? `All (${(requests as any[]).length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${(requests as any[]).filter((r: any) => r.status===f).length})`}
              </button>
            ))}
          </div>

          {(accessFiltered as any[]).length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Shield size={28} strokeWidth={1.5} className="text-gray-300" />
              </div>
              <p className="font-bold text-gray-500">No {accessFilter !== 'all' ? accessFilter : ''} data access requests</p>
              <p className="text-sm text-gray-400 mt-1">When a doctor requests access to your health data, it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(accessFiltered as any[]).map((request: any) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  accepting={respondMutation.isPending && (respondMutation.variables as any)?.id === request.id && (respondMutation.variables as any)?.status === 'accepted'}
                  declining={respondMutation.isPending && (respondMutation.variables as any)?.id === request.id && (respondMutation.variables as any)?.status === 'declined'}
                  onAccept={(id) => respondMutation.mutate({ id, status: 'accepted' })}
                  onDecline={(id) => respondMutation.mutate({ id, status: 'declined' })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'lab' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'accepted', 'declined'].map(f => (
              <button key={f} onClick={() => setLabFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize ${
                  labFilter === f
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'
                }`}>
                {f === 'all' ? `All (${(labViewRequests as any[]).length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${(labViewRequests as any[]).filter((r: any) => r.status===f).length})`}
              </button>
            ))}
          </div>

          {(labFiltered as any[]).length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Microscope size={28} strokeWidth={1.5} className="text-gray-300" />
              </div>
              <p className="font-bold text-gray-500">No {labFilter !== 'all' ? labFilter : ''} lab report requests</p>
              <p className="text-sm text-gray-400 mt-1">When a doctor requests to view one of your lab reports, it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(labFiltered as any[]).map((request: any) => (
                <LabViewRequestCard
                  key={request.id}
                  request={request}
                  accepting={labRespondMutation.isPending && (labRespondMutation.variables as any)?.id === request.id && (labRespondMutation.variables as any)?.status === 'accepted'}
                  declining={labRespondMutation.isPending && (labRespondMutation.variables as any)?.id === request.id && (labRespondMutation.variables as any)?.status === 'declined'}
                  onAccept={(id) => labRespondMutation.mutate({ id, status: 'accepted' })}
                  onDecline={(id) => labRespondMutation.mutate({ id, status: 'declined' })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
