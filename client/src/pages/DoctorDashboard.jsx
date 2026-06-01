import { useQuery } from '@tanstack/react-query';
import { authApi, userApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: () => userApi.getPatients(),
  });

  const profile = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Doctor';

  const stats = [
    { label: 'Registered Patients', value: patients.length, icon: '👥', color: 'blue'  },
    { label: 'Specialization',      value: profile?.specialization || '—', icon: '🩺', color: 'teal'  },
    { label: 'Experience',          value: profile?.years_experience ? `${profile.years_experience} yrs` : '—', icon: '📅', color: 'purple'},
    { label: 'Consultation Fee',    value: profile?.consultation_fee ? `LKR ${Number(profile.consultation_fee).toLocaleString()}` : '—', icon: '💰', color: 'green' },
  ];

  const colorMap = {
    blue:   'bg-blue-50   border-blue-100   text-blue-600',
    teal:   'bg-teal-50   border-teal-100   text-teal-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
    green:  'bg-green-50  border-green-100  text-green-600',
  };

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-900 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-200 text-sm font-medium">Welcome,</p>
            <h1 className="text-2xl font-bold mt-0.5">Dr. {firstName} 🩺</h1>
            <p className="text-primary-200 text-sm mt-2">
              {profile?.specialization || 'Medical Professional'} · Core Health Portal
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-center bg-white/10 rounded-xl p-4">
            <span className="text-4xl">👨‍⚕️</span>
            <p className="text-xs mt-1 text-primary-200">Doctor</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${colorMap[s.color]}`}>
            <div className="text-2xl mb-2">{s.icon}</div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-sm font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Profile + patients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Professional profile */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Professional Profile</h3>
          <div className="space-y-3">
            {[
              { label: 'Full Name',    value: me?.name },
              { label: 'Email',        value: me?.email },
              { label: 'Phone',        value: profile?.phone },
              { label: 'License No.', value: profile?.license_number },
              { label: 'Medical School', value: profile?.medical_school },
              { label: 'Affiliation', value: profile?.hospital_affiliation },
              { label: 'Experience',  value: profile?.years_experience ? `${profile.years_experience} years` : null },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500 w-32 shrink-0">{label}</span>
                <span className="text-gray-900 font-medium text-right">{value || <span className="text-gray-400">Not provided</span>}</span>
              </div>
            ))}
          </div>
          {profile?.bio && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">About / Bio</p>
              <p className="text-sm text-gray-700">{profile.bio}</p>
            </div>
          )}
        </div>

        {/* Patient list */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Registered Patients <span className="text-gray-400 font-normal">({patients.length})</span>
          </h3>
          {patients.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p className="text-sm">No patients registered yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {patients.slice(0, 15).map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-gradient-to-r from-teal-50 to-primary-50 rounded-xl border border-primary-100 p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">Core Health — Doctor Portal</p>
            <p className="text-sm text-gray-600 mt-1">
              More features including prescription management, appointment scheduling, and patient medical history will be available in the next update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
