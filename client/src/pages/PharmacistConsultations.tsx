import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { consultationApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  active:    { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
  dispensed: { badge: 'bg-green-100  text-green-700',  label: 'Dispensed' },
  completed: { badge: 'bg-gray-100   text-gray-500',   label: 'Completed' },
};

interface DetailModalProps {
  c: any;
  onClose: () => void;
  onDispense: (id: number) => void;
}

function DetailModal({ c, onClose, onDispense }: DetailModalProps) {
  const [showOCR, setShowOCR] = useState(false);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Assigned Prescription</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[c.status]?.badge}`}>
              {STATUS_STYLE[c.status]?.label}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-4">
          {/* Patient & doctor info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Patient',       value: c.patient_name },
              { label: 'Doctor',        value: c.doctor_display_name ? `Dr. ${c.doctor_display_name}` : '—' },
              { label: 'Visit Date',    value: formatDate(c.visit_date) },
              { label: 'Patient Email', value: c.patient_email },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value || '—'}</p>
              </div>
            ))}
          </div>

          {/* Patient health info */}
          {(c.blood_type || c.allergies) && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700 mb-2">⚠️ Patient Health Info</p>
              <div className="flex gap-4 text-sm">
                {c.blood_type && <span className="text-gray-700">Blood: <strong>{c.blood_type}</strong></span>}
                {c.allergies  && <span className="text-gray-700">Allergies: <strong>{c.allergies}</strong></span>}
              </div>
            </div>
          )}

          {/* Medical details */}
          {[
            { label: 'Symptoms',   value: c.sick_description,      color: 'bg-orange-50 border-orange-100 text-orange-800' },
            { label: 'Diagnosis',  value: c.diagnosis,             color: 'bg-blue-50   border-blue-100   text-blue-800'   },
            { label: 'Treatment',  value: c.treatment_description, color: 'bg-teal-50   border-teal-100   text-teal-800'   },
          ].filter(r => r.value).map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <p className="text-xs font-bold uppercase opacity-60 mb-1">{label}</p>
              <p className="text-sm">{value}</p>
            </div>
          ))}

          {/* Prescription image */}
          {c.prescription_file && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Prescription Image</p>
              <a href={`${API_BASE}/uploads/prescriptions/${c.prescription_file}`} target="_blank" rel="noreferrer">
                <img src={`${API_BASE}/uploads/prescriptions/${c.prescription_file}`} alt="Prescription"
                  className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50 hover:opacity-90 cursor-zoom-in" />
                <p className="text-xs text-primary-600 mt-1 text-center">Click to open full size</p>
              </a>
            </div>
          )}

          {/* Medicines to dispense */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Medicines to Dispense ({c.medicines?.length || 0})
            </p>
            {!c.medicines?.length ? (
              <p className="text-sm text-gray-400 italic">No medicines listed.</p>
            ) : (
              <div className="space-y-2">
                {c.medicines.map((m: any) => (
                  <div key={m.id} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <span className="text-lg">💊</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">{m.medicine_name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {m.dosage    && <span className="text-xs bg-blue-50   text-blue-700   px-2 py-0.5 rounded-full">{m.dosage}</span>}
                        {m.frequency && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{m.frequency}</span>}
                        {m.duration  && <span className="text-xs bg-green-50  text-green-700  px-2 py-0.5 rounded-full">{m.duration}</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.source === 'ocr' ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                      {m.source === 'ocr' ? '🔍' : '✏️'} {m.source}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* OCR text */}
          {c.ocr_text && (
            <div>
              <button onClick={() => setShowOCR(!showOCR)} className="text-xs text-gray-400 hover:text-gray-600">
                {showOCR ? '▲ Hide' : '▼ Show'} raw OCR text
              </button>
              {showOCR && (
                <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                  {c.ocr_text}
                </pre>
              )}
            </div>
          )}

          {/* Dispense action */}
          {c.status === 'active' && (
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => { onDispense(c.id); onClose(); }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                ✅ Mark as Dispensed — Notify Patient
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                This will notify the patient that their medicines are ready to collect.
              </p>
            </div>
          )}
          {c.status === 'dispensed' && (
            <div className="pt-3 border-t border-gray-100 bg-green-50 rounded-xl p-3 text-center">
              <p className="text-sm text-green-700 font-semibold">✅ Medicines dispensed · Patient has been notified</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PharmacistConsultations() {
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState('all');
  const qc = useQueryClient();

  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ['pharmacist-consultations'],
    queryFn: consultationApi.getAll,
  });

  const dispenseMutation = useMutation({
    mutationFn: (id: number) => consultationApi.updateStatus(id, 'dispensed'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacist-consultations'] });
      toast.success('Marked as dispensed — patient notified!');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const filtered = filter === 'all' ? consultations : consultations.filter((c: any) => c.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assigned Prescriptions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Prescriptions assigned to your pharmacy by doctors</p>
        </div>
        <select
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
          className="input text-sm py-1.5 w-36"
        >
          <option value="all">All</option>
          <option value="active">Pending</option>
          <option value="dispensed">Dispensed</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Assigned', value: consultations.length,                                                            icon: '📋', bg: 'bg-purple-50 border-purple-100' },
          { label: 'Pending',        value: consultations.filter((c: any) => c.status === 'active').length,    icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Dispensed',      value: consultations.filter((c: any) => c.status === 'dispensed').length, icon: '✅', bg: 'bg-green-50  border-green-100'  },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading prescriptions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">💊</span>
          <p className="text-gray-600 font-medium">No {filter !== 'all' ? filter : ''} prescriptions</p>
          <p className="text-sm text-gray-400 mt-1">Prescriptions assigned by doctors will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c: any) => {
            const st = STATUS_STYLE[c.status];
            return (
              <div key={c.id} onClick={async () => {
                try { setSelected(await consultationApi.getOne(c.id)); } catch { toast.error('Failed to load'); }
              }} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">
                      {c.patient_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{c.patient_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st?.badge}`}>{st?.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.doctor_display_name ? `Dr. ${c.doctor_display_name}` : 'Doctor'} · {formatDate(c.visit_date)}
                      </p>
                      {c.diagnosis && <p className="text-sm text-gray-600 mt-1 line-clamp-1">Dx: {c.diagnosis}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {c.medicine_count > 0 && (
                          <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                            💊 {c.medicine_count} medicine{c.medicine_count > 1 ? 's' : ''}
                          </span>
                        )}
                        {c.prescription_file && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">📄 Rx Image</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {c.status === 'active' && (
                    <button
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); dispenseMutation.mutate(c.id); }}
                      className="shrink-0 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Dispense ✅
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <DetailModal
          c={selected}
          onClose={() => setSelected(null)}
          onDispense={(id: number) => dispenseMutation.mutate(id)}
        />
      )}
    </div>
  );
}
