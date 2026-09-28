import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Calendar, Clock, CheckCircle2, XCircle, X, Settings, ClipboardList, Ban,
} from 'lucide-react';
import { appointmentApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60];

const fmtTime = (t: string): string => {
  const [hStr, m] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const STATUS_STYLE: Record<string, { badge: string; label: string; icon: string }> = {
  pending:   { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending Response', icon: '⏳' },
  confirmed: { badge: 'bg-green-100  text-green-700',  label: 'Confirmed',        icon: '✅' },
  declined:  { badge: 'bg-red-100    text-red-600',    label: 'Declined',         icon: '❌' },
  cancelled: { badge: 'bg-gray-100   text-gray-500',   label: 'Cancelled',        icon: '🚫' },
  completed: { badge: 'bg-blue-100   text-blue-700',   label: 'Completed',        icon: '🏁' },
};

interface DeclineModalProps { onClose: () => void; onConfirm: (notes: string) => void; }

function DeclineModal({ onClose, onConfirm }: DeclineModalProps) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">Decline Appointment</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <textarea
          rows={3} autoFocus className="input text-sm resize-none w-full"
          placeholder="Let the patient know why (optional)…"
          value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={() => onConfirm(notes)} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
            Decline
          </button>
          <button onClick={onClose} className="btn-secondary px-4">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Requests + appointment list ─────────────────────────────────────────────
function AppointmentsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [declineTarget, setDeclineTarget] = useState<number | null>(null);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn:  appointmentApi.getAll,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, extra }: { id: number; status: string; extra?: Record<string, unknown> }) =>
      appointmentApi.updateStatus(id, status, extra),
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        confirmed: 'Appointment confirmed', declined: 'Appointment declined',
        cancelled: 'Appointment cancelled', completed: 'Appointment marked completed',
      };
      toast.success(labels[vars.status] || 'Updated');
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update appointment'),
  });

  const list = appointments as any[];
  const pendingCount   = list.filter(a => a.status === 'pending').length;
  const confirmedCount = list.filter(a => a.status === 'confirmed').length;
  const completedCount = list.filter(a => a.status === 'completed').length;
  const filtered = filter === 'all' ? list : list.filter(a => a.status === filter);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Requests', value: pendingCount,   icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Confirmed',        value: confirmedCount, icon: '✅', bg: 'bg-green-50  border-green-100'  },
          { label: 'Completed',        value: completedCount, icon: '🏁', bg: 'bg-blue-50   border-blue-100'   },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)} className="input text-sm py-1.5 w-40">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="declined">Declined</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <span className="w-6 h-6 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin inline-block mb-2" />
          <p>Loading appointments…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📅</span>
          <p className="text-gray-600 font-medium">No appointments here</p>
          <p className="text-sm text-gray-400 mt-1">Booking requests from patients will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a: any) => {
            const st = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
            const busy = statusMutation.isPending && statusMutation.variables?.id === a.id;
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-xl shrink-0">
                      {st.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{a.patient_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} strokeWidth={2} />{formatDate(a.appointment_date)}</span>
                        <span className="flex items-center gap-1"><Clock size={12} strokeWidth={2} />{fmtTime(a.start_time.slice(0, 5))}</span>
                      </p>
                      {a.reason && <p className="text-xs text-gray-400 mt-1 italic">"{a.reason}"</p>}
                      {a.doctor_notes && <p className="text-xs text-gray-400 mt-1">Your note: {a.doctor_notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {a.status === 'pending' && (
                      <>
                        <button disabled={busy}
                          onClick={() => statusMutation.mutate({ id: a.id, status: 'confirmed' })}
                          className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                          <CheckCircle2 size={12} strokeWidth={2.5} /> Accept
                        </button>
                        <button disabled={busy}
                          onClick={() => setDeclineTarget(a.id)}
                          className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                          <XCircle size={12} strokeWidth={2.5} /> Decline
                        </button>
                      </>
                    )}
                    {a.status === 'confirmed' && (
                      <>
                        <button disabled={busy}
                          onClick={() => statusMutation.mutate({ id: a.id, status: 'completed' })}
                          className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                          <CheckCircle2 size={12} strokeWidth={2.5} /> Mark Completed
                        </button>
                        <button disabled={busy}
                          onClick={() => { if (window.confirm('Cancel this confirmed appointment?')) statusMutation.mutate({ id: a.id, status: 'cancelled' }); }}
                          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                          <Ban size={12} strokeWidth={2.5} /> Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {declineTarget != null && (
        <DeclineModal
          onClose={() => setDeclineTarget(null)}
          onConfirm={(notes) => {
            statusMutation.mutate({ id: declineTarget, status: 'declined', extra: { doctor_notes: notes.trim() || undefined } });
            setDeclineTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── Availability settings ───────────────────────────────────────────────────
interface DayForm { enabled: boolean; start: string; end: string; slot: number; }
const DEFAULT_DAY: DayForm = { enabled: false, start: '09:00', end: '17:00', slot: 30 };

function AvailabilityPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState<DayForm[]>(() => Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })));
  const [loaded, setLoaded] = useState(false);

  const { data: weekly } = useQuery({
    queryKey: ['doctor-weekly-availability'],
    queryFn:  appointmentApi.getWeeklyAvailability,
  });

  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const from = toDateStr(next7[0]);
  const to   = toDateStr(next7[6]);

  const { data: overrides = [] } = useQuery({
    queryKey: ['doctor-overrides', from, to],
    queryFn:  () => appointmentApi.getOverrides(from, to),
  });

  useEffect(() => {
    if (loaded || weekly === undefined) return;
    const next = Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }));
    for (const row of weekly as any[]) {
      next[row.day_of_week] = {
        enabled: true,
        start: row.start_time.slice(0, 5),
        end: row.end_time.slice(0, 5),
        slot: row.slot_duration_minutes,
      };
    }
    setForm(next);
    setLoaded(true);
  }, [weekly, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const schedule = form
        .map((d, day_of_week) => ({ ...d, day_of_week }))
        .filter(d => d.enabled)
        .map(d => ({ day_of_week: d.day_of_week, start_time: d.start, end_time: d.end, slot_duration_minutes: d.slot }));
      return appointmentApi.setWeeklyAvailability(schedule);
    },
    onSuccess: () => { toast.success('Weekly availability saved'); qc.invalidateQueries({ queryKey: ['doctor-weekly-availability'] }); },
    onError:   (err: any) => toast.error(err.message || 'Failed to save availability'),
  });

  const overrideMutation = useMutation({
    mutationFn: (data: { date: string; is_available: boolean; reason?: string }) => appointmentApi.setOverride(data),
    onSuccess: () => { toast.success('Availability updated for that day'); qc.invalidateQueries({ queryKey: ['doctor-overrides'] }); },
    onError:   (err: any) => toast.error(err.message || 'Failed to update that day'),
  });

  const clearOverrideMutation = useMutation({
    mutationFn: (id: number) => appointmentApi.deleteOverride(id),
    onSuccess: () => { toast.success('Reverted to default schedule'); qc.invalidateQueries({ queryKey: ['doctor-overrides'] }); },
    onError:   (err: any) => toast.error(err.message || 'Failed to reset that day'),
  });

  const updateDay = (i: number, patch: Partial<DayForm>) =>
    setForm(f => f.map((d, idx) => idx === i ? { ...d, ...patch } : d));

  const invalid = (d: DayForm) => d.enabled && d.start >= d.end;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm font-bold text-gray-900">Default Weekly Hours</p>
            <p className="text-xs text-gray-400 mt-0.5">Turn on the days you normally see patients, and set your hours for each.</p>
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || form.some(invalid)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 px-4 py-2 rounded-xl disabled:opacity-50 shrink-0"
          >
            {saveMutation.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            Save
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {form.map((d, i) => (
            <div key={i} className={`flex items-center gap-3 flex-wrap rounded-xl border p-3 ${d.enabled ? 'border-primary-100 bg-primary-50/30' : 'border-gray-100'}`}>
              <button
                type="button" role="switch" aria-checked={d.enabled}
                onClick={() => updateDay(i, { enabled: !d.enabled })}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${d.enabled ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${d.enabled ? 'translate-x-4' : ''}`} />
              </button>
              <p className={`text-sm font-semibold w-24 shrink-0 ${d.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{WEEKDAYS[i]}</p>

              {d.enabled ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="time" value={d.start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateDay(i, { start: e.target.value })}
                    className="input text-sm py-1.5 w-28" />
                  <span className="text-gray-400 text-sm">to</span>
                  <input type="time" value={d.end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateDay(i, { end: e.target.value })}
                    className="input text-sm py-1.5 w-28" />
                  <select value={d.slot} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateDay(i, { slot: parseInt(e.target.value, 10) })}
                    className="input text-sm py-1.5 w-32">
                    {SLOT_OPTIONS.map(m => <option key={m} value={m}>{m} min slots</option>)}
                  </select>
                  {invalid(d) && <span className="text-xs text-red-500">End time must be after start time</span>}
                </div>
              ) : (
                <p className="text-xs text-gray-300">Not available</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-bold text-gray-900">This Week's Exceptions</p>
        <p className="text-xs text-gray-400 mt-0.5">Override your default schedule for a specific upcoming day — e.g. block a day off, or open a normally-closed day.</p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {next7.map(d => {
            const dateStr = toDateStr(d);
            const dow = d.getDay();
            const override = (overrides as any[]).find(o => toDateStr(new Date(o.override_date)) === dateStr);
            const defaultAvailable = form[dow].enabled;
            const effectiveAvailable = override ? override.is_available : defaultAvailable;
            const busy = overrideMutation.isPending || clearOverrideMutation.isPending;

            return (
              <div key={dateStr} className={`rounded-xl border p-3 ${effectiveAvailable ? 'border-green-100 bg-green-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{WEEKDAY_SHORT[dow]} {d.getDate()}</p>
                    <p className="text-[11px] text-gray-400">{effectiveAvailable ? 'Available' : 'Not available'}{override ? ' (override)' : ' (default)'}</p>
                  </div>
                  <span className="text-lg">{effectiveAvailable ? '🟢' : '⚪'}</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button disabled={busy || effectiveAvailable && !override}
                    onClick={() => overrideMutation.mutate({ date: dateStr, is_available: true })}
                    className="flex-1 text-[11px] font-bold text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-40 py-1.5 rounded-lg transition-colors">
                    Open
                  </button>
                  <button disabled={busy || !effectiveAvailable && !override}
                    onClick={() => overrideMutation.mutate({ date: dateStr, is_available: false, reason: 'Unavailable' })}
                    className="flex-1 text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-40 py-1.5 rounded-lg transition-colors">
                    Block
                  </button>
                  {override && (
                    <button disabled={busy}
                      onClick={() => clearOverrideMutation.mutate(override.id)}
                      className="flex-1 text-[11px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 py-1.5 rounded-lg transition-colors">
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DoctorAppointments() {
  const [tab, setTab] = useState<'appointments' | 'availability'>('appointments');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage booking requests and set the hours patients can book you</p>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        <button
          onClick={() => setTab('appointments')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
            tab === 'appointments' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <ClipboardList size={15} strokeWidth={2} /> Requests &amp; Bookings
        </button>
        <button
          onClick={() => setTab('availability')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
            tab === 'availability' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Settings size={15} strokeWidth={2} /> Availability Settings
        </button>
      </div>

      {tab === 'appointments' ? <AppointmentsPanel /> : <AvailabilityPanel />}
    </div>
  );
}
