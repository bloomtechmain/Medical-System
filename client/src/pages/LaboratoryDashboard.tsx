import { useQuery } from '@tanstack/react-query';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

export default function LaboratoryDashboard() {
  const { user } = useAuth();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });

  const profile    = me?.profile as any;
  const firstName  = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Lab';

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

      {/* Profile + services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Lab details */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Laboratory Profile</h3>

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
