import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, X, Stethoscope, Send, Calendar, Clock, XCircle, Building2,
} from 'lucide-react';
import { appointmentApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { useDebounce } from '../hooks/useDebounce';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtTime = (t: string): string => {
  const [hStr, m] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
};

const fmtDateShort = (dateStr: string): { weekday: string; day: number; month: string } => {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    weekday: WEEKDAY[d.getDay()],
    day: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
};

interface SearchDropdownProps {
  label: string;
  placeholder: string;
  fetchFn: (q: string) => Promise<any>;
  queryKey: string;
  selected: any;
  onSelect: (item: any) => void;
  renderItem: (item: any) => React.ReactNode;
  renderSelected: (item: any) => React.ReactNode;
}

function SearchDropdown({ label, placeholder, fetchFn, queryKey, selected, onSelect, renderItem, renderSelected }: SearchDropdownProps) {
  const { t } = useTranslation('patientReports');
  const [q, setQ]       = useState('');
  const dq              = useDebounce(q, 350);
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: [queryKey, dq],
    queryFn:  () => fetchFn(dq),
    enabled:  open && dq.length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl px-3.5 py-2.5">
          {renderSelected(selected)}
          <button type="button" onClick={() => { onSelect(null); setQ(''); }}
            className="text-gray-400 hover:text-red-500 ml-2 text-xs font-semibold">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            placeholder={placeholder} value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />}
          {open && dq.length >= 1 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-52 overflow-y-auto">
              {(results as any[]).length === 0 && !isFetching
                ? <li className="px-4 py-3 text-sm text-gray-400">{t('bookDoctor.modal.noDoctorsFound', { query: dq })}</li>
                : (results as any[]).map((item: any) => (
                  <li key={item.id}
                    onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                    className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0">
                    {renderItem(item)}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface BookModalProps { onClose: () => void; onBooked: () => void; }

function BookAppointmentModal({ onClose, onBooked }: BookModalProps) {
  const { t } = useTranslation('patientReports');
  const { t: tc } = useTranslation('common');
  const [doctor, setDoctor]     = useState<any>(null);
  const [orgId, setOrgId]       = useState<number | null | undefined>(undefined); // undefined = not yet chosen
  const [selDate, setSelDate]   = useState<string | null>(null);
  const [selSlot, setSelSlot]   = useState<{ start_time: string; end_time: string } | null>(null);
  const [reason, setReason]     = useState('');
  const [error, setError]       = useState('');

  const doctorOrgs: any[] = doctor?.organizations || [];
  // Only one possible location (or none) — skip the picker and go straight to slots.
  const orgChosen = doctorOrgs.length <= 1 || orgId !== undefined;
  const effectiveOrgId = doctorOrgs.length === 0 ? null : doctorOrgs.length === 1 ? doctorOrgs[0].id : orgId ?? null;

  const { data: slotData, isLoading: loadingSlots } = useQuery({
    queryKey: ['doctor-slots', doctor?.id, effectiveOrgId],
    queryFn:  () => appointmentApi.getDoctorSlots(doctor.id, 14, effectiveOrgId),
    enabled:  !!doctor && orgChosen,
  });

  const days: any[] = slotData?.days || [];
  const selectedDay = days.find(d => d.date === selDate);

  const mutation = useMutation({
    mutationFn: () => appointmentApi.create({
      doctor_id: doctor.id,
      organization_id: effectiveOrgId,
      appointment_date: selDate,
      start_time: selSlot!.start_time,
      reason: reason.trim() || null,
    }),
    onSuccess: () => { toast.success(t('bookDoctor.modal.bookedSuccess', { doctor: doctor.name })); onBooked(); onClose(); },
    onError: (err: any) => setError(err.message || t('bookDoctor.modal.errors.bookFailed')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor)  return setError(t('bookDoctor.modal.errors.selectDoctor'));
    if (!selSlot) return setError(t('bookDoctor.modal.errors.selectDateTime'));
    setError('');
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-primary-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Calendar size={16} className="text-white" />
            </div>
            <p className="text-sm font-bold text-white">{t('bookDoctor.modal.title')}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <SearchDropdown
            label={t('bookDoctor.modal.doctorLabel')}
            placeholder={t('bookDoctor.modal.doctorSearchPlaceholder')}
            fetchFn={userApi.searchDoctors}
            queryKey="patient-search-doctors"
            selected={doctor}
            onSelect={(d: any) => { setDoctor(d); setOrgId(undefined); setSelDate(null); setSelSlot(null); }}
            renderItem={(d: any) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                  <Stethoscope size={13} strokeWidth={2} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Dr. {d.name}</p>
                  <p className="text-xs text-gray-400">{d.specialization || d.hospital_affiliation || d.email}</p>
                </div>
              </div>
            )}
            renderSelected={(d: any) => (
              <div className="flex items-center gap-2">
                <Stethoscope size={14} strokeWidth={2} className="text-primary-700" />
                <p className="text-sm font-semibold text-primary-700">Dr. {d.name}{d.specialization ? ` · ${d.specialization}` : ''}</p>
              </div>
            )}
          />

          {doctor && doctorOrgs.length > 1 && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('bookDoctor.modal.selectLocationLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {doctorOrgs.map((org: any) => (
                  <button
                    type="button" key={org.id}
                    onClick={() => { setOrgId(org.id); setSelDate(null); setSelSlot(null); }}
                    className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
                      orgId === org.id ? 'border-primary-500 bg-primary-600 text-white' : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50 text-gray-700'
                    }`}
                  >
                    <Building2 size={13} strokeWidth={2} /> {org.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {doctor && orgChosen && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('bookDoctor.modal.selectDateLabel')}</label>
              {loadingSlots ? (
                <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-sm">
                  <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />
                  {t('bookDoctor.modal.loadingAvailability')}
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map(d => {
                    const { weekday, day, month } = fmtDateShort(d.date);
                    const isSel = selDate === d.date;
                    return (
                      <button
                        type="button" key={d.date}
                        disabled={!d.is_available}
                        onClick={() => { setSelDate(d.date); setSelSlot(null); }}
                        className={`shrink-0 w-16 py-2.5 rounded-2xl border text-center transition-colors ${
                          !d.is_available ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                          : isSel ? 'border-primary-500 bg-primary-600 text-white shadow-sm'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50 text-gray-700'
                        }`}
                      >
                        <p className={`text-[10px] font-bold uppercase ${isSel ? 'text-primary-100' : 'text-gray-400'}`}>{weekday}</p>
                        <p className="text-base font-bold leading-tight">{day}</p>
                        <p className={`text-[10px] ${isSel ? 'text-primary-100' : 'text-gray-400'}`}>{month}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {!loadingSlots && days.every(d => !d.is_available) && (
                <p className="text-sm text-gray-400 text-center py-3">{t('bookDoctor.modal.noAvailability')}</p>
              )}
            </div>
          )}

          {selectedDay && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('bookDoctor.modal.selectTimeLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {selectedDay.slots.map((s: any) => (
                  <button
                    type="button" key={s.start_time}
                    onClick={() => setSelSlot(s)}
                    className={`px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                      selSlot?.start_time === s.start_time
                        ? 'border-primary-500 bg-primary-600 text-white'
                        : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50 text-gray-700'
                    }`}
                  >
                    {fmtTime(s.start_time)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selSlot && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                {t('bookDoctor.modal.reasonLabel')} <span className="text-gray-300 font-normal normal-case">{t('bookDoctor.modal.optional')}</span>
              </label>
              <textarea rows={2} className="input text-sm resize-none" placeholder={t('bookDoctor.modal.reasonPlaceholder')}
                value={reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} />
            </div>
          )}

          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button type="submit" disabled={mutation.isPending || !selSlot}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <Send size={14} strokeWidth={2.5} />
              {t('bookDoctor.modal.submitBtn')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">{tc('actions.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, { badge: string; icon: string; labelKey: string }> = {
  pending:   { badge: 'bg-yellow-100 text-yellow-700', labelKey: 'awaitingDoctor', icon: '⏳' },
  confirmed: { badge: 'bg-green-100  text-green-700',  labelKey: 'confirmed',      icon: '✅' },
  declined:  { badge: 'bg-red-100    text-red-600',    labelKey: 'declined',       icon: '❌' },
  cancelled: { badge: 'bg-gray-100   text-gray-500',   labelKey: 'cancelled',      icon: '🚫' },
  completed: { badge: 'bg-blue-100   text-blue-700',   labelKey: 'completed',      icon: '🏁' },
};

export default function BookDoctor() {
  const { t } = useTranslation('patientReports');
  const { t: tc } = useTranslation('common');
  const [booking, setBooking] = useState(false);
  const [filter, setFilter]   = useState('all');
  const qc = useQueryClient();

  const statusLabel = (key: string) => key === 'awaitingDoctor' ? t('bookDoctor.statusLabels.awaitingDoctor') : tc(`status.${key}`);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn:  appointmentApi.getAll,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => appointmentApi.updateStatus(id, 'cancelled'),
    onSuccess: () => { toast.success(t('bookDoctor.toast.cancelled')); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError:   (err: any) => toast.error(err.message || t('bookDoctor.toast.cancelFailed')),
  });

  const list = appointments as any[];
  const filtered = filter === 'all' ? list : list.filter(a => a.status === filter);

  const upcoming = useMemo(() =>
    list.filter(a => ['pending', 'confirmed'].includes(a.status)).length,
    [list]
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ['appointments'] });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('bookDoctor.pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('bookDoctor.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setBooking(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl shadow-sm hover:opacity-90 transition-opacity">
            <Plus size={15} strokeWidth={2.5} />
            {t('bookDoctor.bookBtn')}
          </button>
          <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)} className="input text-sm py-1.5 w-40">
            <option value="all">{t('bookDoctor.filters.all')}</option>
            <option value="pending">{t('bookDoctor.statusLabels.awaitingDoctor')}</option>
            <option value="confirmed">{tc('status.confirmed')}</option>
            <option value="completed">{tc('status.completed')}</option>
            <option value="declined">{tc('status.declined')}</option>
            <option value="cancelled">{tc('status.cancelled')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('bookDoctor.stats.upcoming'),  value: upcoming, icon: '📅', bg: 'bg-primary-50 border-primary-100' },
          { label: t('bookDoctor.stats.totalBooked'), value: list.length, icon: '🗓️', bg: 'bg-blue-50    border-blue-100'   },
          { label: tc('status.completed'), value: list.filter(a => a.status === 'completed').length, icon: '🏁', bg: 'bg-green-50  border-green-100'  },
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
          <span className="w-6 h-6 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin inline-block mb-2" />
          <p>{t('bookDoctor.loading')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🩺</span>
          <p className="text-gray-600 font-medium">{t('bookDoctor.empty.title')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('bookDoctor.empty.subtitle')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a: any) => {
            const st = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
            const canCancel = ['pending', 'confirmed'].includes(a.status);
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-xl shrink-0">
                      {st.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">Dr. {a.doctor_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{statusLabel(st.labelKey)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                        {a.doctor_specialization}
                        {a.organization_name && (
                          <span className="flex items-center gap-1"><Building2 size={10} strokeWidth={2} />{a.organization_name}</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} strokeWidth={2} />{formatDate(a.appointment_date)}</span>
                        <span className="flex items-center gap-1"><Clock size={12} strokeWidth={2} />{fmtTime(a.start_time.slice(0, 5))}</span>
                      </p>
                      {a.reason && <p className="text-xs text-gray-400 mt-1 italic">"{a.reason}"</p>}
                      {a.status === 'declined' && a.doctor_notes && (
                        <p className="text-xs text-red-500 mt-1">{t('bookDoctor.doctorNote', { note: a.doctor_notes })}</p>
                      )}
                    </div>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => { if (window.confirm(t('bookDoctor.cancelConfirm'))) cancelMutation.mutate(a.id); }}
                      className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-xl hover:bg-red-100 transition-colors shrink-0"
                    >
                      <XCircle size={12} strokeWidth={2.5} /> {tc('actions.cancel')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {booking && <BookAppointmentModal onClose={() => setBooking(false)} onBooked={refresh} />}
    </div>
  );
}
