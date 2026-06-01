import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const STATUS_STYLE = {
  pending:     { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending',     icon: '⏳' },
  in_progress: { badge: 'bg-blue-100   text-blue-700',   label: 'In Progress', icon: '🔄' },
  completed:   { badge: 'bg-green-100  text-green-700',  label: 'Report Ready','icon': '✅' },
};

function ReportModal({ req: r, onClose }) {
  const isPDF = r.report_mimetype?.includes('pdf');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Lab Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">{r.lab_name} · {formatDate(r.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Requesting Doctor', value: r.doctor_name ? `Dr. ${r.doctor_name}` : '—' },
              { label: 'Laboratory',        value: r.lab_name || '—' },
              { label: 'Requested On',      value: formatDate(r.created_at) },
              { label: 'Lab Type',          value: r.lab_type?.split(',')[0] || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Tests */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
            <p className="text-xs font-bold text-cyan-700 mb-1">🧪 Tests Performed</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.test_description}</p>
          </div>

          {/* Report */}
          {r.report_notes && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs font-bold text-teal-700 mb-1">🔬 Lab Report Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.report_notes}</p>
            </div>
          )}

          {r.report_file && (
            <div>
              <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-4 bg-primary-50 border-2 border-primary-200 rounded-xl hover:bg-primary-100 transition-colors group">
                <span className="text-3xl">{isPDF ? '📄' : '🖼️'}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-primary-700">{isPDF ? 'Open Lab Report (PDF)' : 'View Lab Report Image'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Click to view or download your report</p>
                </div>
                <svg className="w-5 h-5 text-primary-500 group-hover:text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              {!isPDF && (
                <img src={`${API_BASE}/uploads/lab-reports/${r.report_file}`} alt="Lab Report"
                  className="mt-3 w-full max-h-72 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PatientLabReports() {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['patient-lab-reports'],
    queryFn:  labApi.getAll,
  });

  const openDetail = async (id) => {
    try { setSelected(await labApi.getOne(id)); }
    catch { toast.error('Failed to load'); }
  };

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lab Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">View your laboratory test requests and results</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input text-sm py-1.5 w-36">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Reports Ready</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tests',    value: reports.length,                                      icon: '🔬', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: 'In Progress',    value: reports.filter(r => r.status !== 'completed').length, icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Reports Ready',  value: reports.filter(r => r.status === 'completed').length, icon: '📋', bg: 'bg-green-50  border-green-100'  },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading lab reports...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">No lab reports yet</p>
          <p className="text-sm text-gray-400 mt-1">Your doctor will assign lab tests when needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.id} onClick={() => openDetail(r.id)}
                className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all cursor-pointer
                  ${r.status === 'completed' ? 'border-green-200 hover:border-green-300' : 'border-gray-100 hover:border-cyan-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0
                      ${r.status === 'completed' ? 'bg-green-100' : 'bg-cyan-100'}`}>
                      {st.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Dr. {r.doctor_name} · {formatDate(r.created_at)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                    </div>
                  </div>
                  {r.status === 'completed' && (
                    <button className="shrink-0 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                      View Report →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <ReportModal req={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
