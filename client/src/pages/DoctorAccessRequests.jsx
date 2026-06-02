import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, FlaskConical, ClipboardList, FolderOpen, Phone, ArrowUpRight, ExternalLink } from 'lucide-react';
import { accessRequestApi } from '../services/api';

const TYPE_META = {
  lab_reports:      { label:'Lab Reports',             Icon: FlaskConical,  grad:'from-blue-500 to-indigo-600'   },
  medical_history:  { label:'Medical History',         Icon: ClipboardList, grad:'from-teal-500 to-emerald-600'  },
  personal_reports: { label:'Personal Health Reports', Icon: FolderOpen,    grad:'from-violet-500 to-purple-600' },
  contact_info:     { label:'Contact Information',     Icon: Phone,         grad:'from-rose-500 to-pink-600'     },
};

const STATUS_META = {
  pending:  { label:'Awaiting Patient',  cls:'bg-amber-100 text-amber-700',     dot:'bg-amber-400',   Icon: Clock         },
  accepted: { label:'Access Granted',   cls:'bg-emerald-100 text-emerald-700',  dot:'bg-emerald-400', Icon: CheckCircle2  },
  declined: { label:'Declined',         cls:'bg-red-100 text-red-600',          dot:'bg-red-400',     Icon: XCircle       },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function DoctorAccessRequests() {
  const navigate = useNavigate();
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['access-requests'],
    queryFn:  accessRequestApi.getAll,
  });

  const pending  = requests.filter(r => r.status === 'pending').length;
  const accepted = requests.filter(r => r.status === 'accepted').length;
  const declined = requests.filter(r => r.status === 'declined').length;

  if (isLoading) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      Loading…
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Access Requests</h1>
        <p className="text-sm text-gray-400 mt-0.5">Requests you have sent to patients for access to their health data</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Pending',  value:pending,  grad:'from-amber-500 to-orange-500'   },
          { label:'Accepted', value:accepted, grad:'from-emerald-500 to-teal-500'   },
          { label:'Declined', value:declined, grad:'from-red-500 to-rose-500'       },
        ].map(s => (
          <div key={s.label} className="ios-stat-tile relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
            <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3 shadow-sm`}>
              <ArrowUpRight size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Request list */}
      {requests.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} strokeWidth={1.3} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">No requests sent yet</p>
          <p className="text-sm text-gray-400 mt-1">Search for a patient and request access to their data.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const tm = TYPE_META[r.access_type] || TYPE_META.lab_reports;
            const sm = STATUS_META[r.status]    || STATUS_META.pending;
            const Icon = tm.Icon;
            const StatusIcon = sm.Icon;
            return (
              <div key={r.id} className="ios-tile p-4 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tm.grad} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon size={18} strokeWidth={1.8} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{tm.label}</p>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.cls}`}>
                      <StatusIcon size={9} strokeWidth={2.5} />
                      {sm.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Patient: <span className="font-semibold text-gray-700">{r.patient_name}</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Sent {fmtDate(r.created_at)}{r.responded_at ? ` · Responded ${fmtDate(r.responded_at)}` : ''}</p>
                </div>
                <button
                  onClick={() => navigate(`/doctor/patients/${r.patient_id}`)}
                  className="flex items-center gap-1 text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1.5 rounded-xl hover:bg-primary-100 transition-colors shrink-0"
                >
                  View <ExternalLink size={11} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
