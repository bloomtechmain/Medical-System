import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Pencil, X, Plus, AlertTriangle, ClipboardList } from 'lucide-react';
import { authApi, userApi, labApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  pending:     { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending'     },
  in_progress: { badge: 'bg-blue-100   text-blue-700',   label: 'In Progress' },
  completed:   { badge: 'bg-green-100  text-green-700',  label: 'Completed'   },
};

const OVERDUE_HOURS = 48;
const isOverdue = (r: any) => r.status === 'pending' && (Date.now() - new Date(r.created_at).getTime()) > OVERDUE_HOURS * 3600 * 1000;

// Mirrors the laboratory fields an admin can set via Admin → Users, minus
// account-level fields (name/email/password/role/is_active) which stay admin-only.
const LAB_PROFILE_FIELDS: { field: string; label: string; type?: string; half?: boolean; textarea?: boolean }[] = [
  { field: 'lab_name',         label: 'Laboratory Name',  half: true },
  { field: 'phone',            label: 'Phone',            type: 'tel', half: true },
  { field: 'lab_type',         label: 'Lab Type',         half: true },
  { field: 'license_number',   label: 'License Number',   half: true },
  { field: 'accreditation',    label: 'Accreditation',    half: true },
  { field: 'operating_hours',  label: 'Operating Hours',  half: true },
  { field: 'address',          label: 'Address',          half: false, textarea: true },
  { field: 'services_offered', label: 'Services Offered', half: false, textarea: true },
];

function EditLabProfileModal({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm<any>({ defaultValues: profile || {} });

  const mutation = useMutation({
    mutationFn: (data: any) => userApi.updateMyProfile({ profile: data }),
    onSuccess: () => { toast.success('Profile updated'); onSaved(); onClose(); },
    onError: (err: any) => toast.error(err.message || 'Failed to update profile'),
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-cyan-600 to-cyan-800">
          <p className="text-sm font-bold text-white">Edit Laboratory Profile</p>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            {LAB_PROFILE_FIELDS.map(f => (
              <div key={f.field} className={f.half === false ? 'col-span-2' : ''}>
                <label className="label">{f.label}</label>
                {f.textarea ? (
                  <textarea rows={f.field === 'services_offered' ? 3 : 2} className="input text-sm resize-none" {...register(f.field)} />
                ) : (
                  <input type={f.type || 'text'} className="input text-sm" {...register(f.field)} />
                )}
                {f.field === 'services_offered' && (
                  <p className="text-[11px] text-gray-400 mt-1">Comma-separated, e.g. Full Blood Count, X-Ray, Ultrasound, Lipid Profile</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LaboratoryDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: requests = [] } = useQuery({ queryKey: ['lab-assigned-requests'], queryFn: labApi.getAll });

  const profile    = me?.profile as any;
  const firstName  = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Lab';

  const overdue = (requests as any[]).filter(isOverdue);
  const recent  = [...(requests as any[])]
    .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 5);

  const services = profile?.services_offered
    ? profile.services_offered.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const labTypes       = profile?.lab_type       ? profile.lab_type.split(',').map((s: string) => s.trim()).filter(Boolean)       : [];
  const accreditations = profile?.accreditation  ? profile.accreditation.split(',').map((s: string) => s.trim()).filter(Boolean)  : [];

  const infoItems = [
    { label: 'Lab Name',        value: profile?.lab_name        },
    { label: 'License No.',     value: profile?.license_number  },
    { label: 'Phone',           value: profile?.phone           },
    { label: 'Operating Hours', value: profile?.operating_hours },
    { label: 'Address',         value: profile?.address         },
    { label: 'Website',         value: profile?.website         },
    { label: 'Member Since',    value: me?.created_at ? formatDate(me.created_at) : null },
  ];

  return (
    <div className="space-y-6">

      {/* Welcome banner + stats list */}
      <div className="w-full lg:w-3/4 bg-gradient-to-r from-cyan-600 to-cyan-900 rounded-2xl p-6 text-white">
        <p className="text-cyan-200 text-sm font-medium">Welcome,</p>
        <h1 className="text-2xl font-bold mt-0.5">{profile?.lab_name || firstName} 🔬</h1>
        <p className="text-cyan-200 text-sm mt-2">
          {profile?.lab_type || 'Diagnostic Laboratory'} · Core Health Portal
        </p>

        <div className="mt-5 -mx-6 border-t border-white/15 divide-y divide-white/10">
          {(() => {
            const fields = [
              { label: 'Lab Name',        value: profile?.lab_name       || '—' },
              { label: 'Lab Types',       value: labTypes.length ? `${labTypes.length} type${labTypes.length > 1 ? 's' : ''}` : '—' },
              { label: 'License',         value: profile?.license_number || '—' },
              { label: 'Accreditations',  value: accreditations.length ? `${accreditations.length} certification${accreditations.length > 1 ? 's' : ''}` : '—' },
            ];
            const rows = [];
            for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
            return rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 divide-x divide-white/10 max-w-2xl">
                {row.map((c) => (
                  <div key={c.label} className="flex items-center gap-3 px-6 py-3 min-w-0">
                    <span className="flex-1 text-sm text-cyan-100 truncate">{c.label}</span>
                    <span className="text-base font-bold text-white shrink-0 truncate">{c.value}</span>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">
              {overdue.length} request{overdue.length > 1 ? 's' : ''} pending over {OVERDUE_HOURS}h
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {overdue.slice(0, 3).map((r: any) => r.patient_name).join(', ')}{overdue.length > 3 ? ` +${overdue.length - 3} more` : ''} — waiting to be started.
            </p>
          </div>
          <button onClick={() => navigate('/laboratory/reports')}
            className="text-xs font-bold text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors shrink-0">
            Review
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/laboratory/reports', { state: { openNewReport: true } })}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-sm hover:opacity-90 transition-opacity">
          <Plus size={15} strokeWidth={2.5} />
          New Report
        </button>
        <button onClick={() => navigate('/laboratory/reports')}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
          <ClipboardList size={15} strokeWidth={2.5} />
          View All Reports
        </button>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h3>
        {recent.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-3xl mb-2">🔬</p>
            <p className="text-sm">No lab requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map((r: any) => {
              const st = STATUS_STYLE[r.status];
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                      {r.patient_name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">Dr. {r.doctor_name} · {formatDate(r.updated_at || r.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st?.badge}`}>{st?.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Profile + services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Lab details */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Laboratory Profile</h3>
            <button onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-100 px-3 py-1.5 rounded-lg transition-colors">
              <Pencil size={12} strokeWidth={2.5} /> Edit Profile
            </button>
          </div>

          <div className="space-y-3">
            {infoItems.map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start text-sm">
                <span className="text-gray-500 w-36 shrink-0">{label}</span>
                <span className="text-gray-900 font-medium text-right break-words max-w-[200px]">
                  {value || <span className="text-gray-300">Not provided</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Lab types pills */}
          {labTypes.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">🧪 Laboratory Types</p>
              <div className="flex flex-wrap gap-1.5">
                {labTypes.map((t: string) => (
                  <span key={t} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Accreditations pills */}
          {accreditations.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">⭐ Accreditations</p>
              <div className="flex flex-wrap gap-1.5">
                {accreditations.map((a: string) => (
                  <span key={a} className="text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full font-medium">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Services */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Services Offered</h3>
          {services.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">🧪</p>
              <p className="text-sm">No services listed yet.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s: string) => (
                <span key={s} className="inline-flex items-center gap-1.5 bg-cyan-50 border border-cyan-100 text-cyan-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                  🧬 {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EditLabProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['me'] })}
        />
      )}

      {/* Info tip */}
      <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl border border-cyan-100 p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">Core Health — Laboratory Portal</p>
            <p className="text-sm text-gray-600 mt-1">
              Features for test request management, result uploads, and doctor referrals are coming in the next update. Your profile is now visible to doctors and patients on the Core Health network.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
