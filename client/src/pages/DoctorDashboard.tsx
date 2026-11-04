import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Stethoscope, FlaskConical, Clock, Activity, Plus, AlertTriangle, Send, Eye, Users,
  CalendarClock, UserSearch, Package, TrendingUp, TrendingDown, CheckCircle2, ChevronRight, Sparkles, ClipboardList,
} from 'lucide-react';
import { authApi, accessRequestApi, consultationApi, labApi, labViewRequestApi, appointmentApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDashboardPlan } from '../hooks/useDashboardPlan';
import { formatDate, formatDateTime, firstNameOf } from '../utils/helpers';
import { formatPrice } from '../constants/plans';
import DashboardWelcome, { WelcomeStats } from '../components/dashboard/DashboardWelcome';
import Countdown from '../components/billing/Countdown';

// The doctor's overview: what today looks like, what is waiting on someone,
// how the practice is trending, and the state of the account (package,
// profile). The patient list lives on its own page (DoctorPatients) — this
// component used to be rendered for both routes.

const DAY = 86_400_000;

const daysSince = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY));
};

const waitColor = (days: number): string => {
  if (days >= 7) return 'bg-red-100 text-red-700';
  if (days >= 3) return 'bg-orange-100 text-orange-700';
  return 'bg-amber-100 text-amber-700';
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function KpiTile({ icon: Icon, label, value, sub, tone, to }: {
  icon: typeof Users; label: string; value: string | number; sub?: React.ReactNode; tone: string; to?: string;
}) {
  const body = (
    <>
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-3 ${tone}`}>
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <p className="text-3xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{label}</p>
      {sub && <div className="text-xs text-gray-500 mt-1.5">{sub}</div>}
    </>
  );
  return to
    ? <Link to={to} className="ios-stat-tile block hover:shadow-md transition-shadow">{body}</Link>
    : <div className="ios-stat-tile">{body}</div>;
}

/**
 * Consultations per day over the last 14 days. One series, so one hue and no
 * legend; thin bars rounded at the data end and anchored to the baseline, a
 * hover tooltip per bar, and the full series in the aria-label.
 */
function ConsultationTrend({ days, label }: {
  days: { day: string; count: number }[];
  label: (d: { day: string; count: number }) => string;
}) {
  const max = Math.max(1, ...days.map(d => d.count));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-32 border-b border-gray-200" role="img" aria-label={days.map(label).join('; ')}>
        {days.map(d => (
          <div key={d.day} className="group relative flex-1 h-full flex items-end justify-center">
            <div
              className="w-3/5 rounded-t-[4px] bg-primary-500 group-hover:bg-primary-700 transition-colors"
              style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : '2px', opacity: d.count ? 1 : 0.3 }}
            />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {label(d)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
        <span>{formatDate(days[0]?.day)}</span>
        <span>{formatDate(days[days.length - 1]?.day)}</span>
      </div>
    </div>
  );
}

export default function DoctorDashboard() {
  const { t } = useTranslation('doctorCore');
  const { t: tb } = useTranslation('billing');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { plan, billing } = useDashboardPlan('doctor');

  const { data: me }      = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: requests = [] as any[] } = useQuery({ queryKey: ['access-requests'], queryFn: accessRequestApi.getAll });
  const { data: labRequests = [] } = useQuery({ queryKey: ['lab-requests'], queryFn: labApi.getAll });
  const { data: labViewRequests = [] } = useQuery({ queryKey: ['lab-view-requests'], queryFn: labViewRequestApi.getAll });
  const { data: consultations = [] } = useQuery({ queryKey: ['doctor-consultations'], queryFn: consultationApi.getAll });
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: appointmentApi.getAll });

  const profile   = me?.profile;
  const firstName = firstNameOf(me?.name || user?.name, 'Doctor');

  const pendingLabResults = (labRequests as any[])
    .filter((r: any) => r.status !== 'completed')
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const agingConsultations = (consultations as any[])
    .filter((c: any) => c.status === 'active')
    .sort((a: any, b: any) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime());
  const pendingAccessRequests = (requests as any[]).filter((r: any) => r.status === 'pending');
  const pendingViewRequests   = (labViewRequests as any[]).filter((r: any) => r.status === 'pending');

  // ── Today ──────────────────────────────────────────────────────────────────
  const today = isoDay(new Date());
  const todays = (appointments as any[])
    .filter(a => String(a.appointment_date).slice(0, 10) === today && ['confirmed', 'pending'].includes(a.status))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const nowHm = new Date().toTimeString().slice(0, 5);
  const nextUp = todays.find(a => a.status === 'confirmed' && String(a.end_time ?? a.start_time).slice(0, 5) >= nowHm);
  const apptRequests = (appointments as any[]).filter(a => a.status === 'pending').length;

  // ── Practice numbers ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const sameDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59).getTime();
    const cs = consultations as any[];
    const at = (c: any) => new Date(c.visit_date).getTime();
    const thisMonth = cs.filter(c => at(c) >= monthStart);
    const lastMonthToDate = cs.filter(c => at(c) >= lastMonthStart && at(c) <= sameDayLastMonth).length;
    const firstSeen = new Map<number, number>();
    for (const c of cs) {
      if (!c.patient_id) continue;
      firstSeen.set(c.patient_id, Math.min(firstSeen.get(c.patient_id) ?? Infinity, at(c)));
    }
    const newPatients = [...firstSeen.values()].filter(ts => ts >= monthStart).length;
    const days = Array.from({ length: 14 }, (_, i) => {
      const key = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i));
      return { day: key, count: cs.filter(c => String(c.visit_date).slice(0, 10) === key).length };
    });
    const diag = new Map<string, number>();
    for (const c of thisMonth) {
      const k = (c.diagnosis ?? '').trim();
      if (k) diag.set(k, (diag.get(k) ?? 0) + 1);
    }
    return {
      patients: firstSeen.size,
      newPatients,
      thisMonth: thisMonth.length,
      lastMonthToDate,
      days,
      fortnight: days.reduce((n, d) => n + d.count, 0),
      topDiagnoses: [...diag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [consultations]);
  const trend = stats.lastMonthToDate
    ? Math.round(((stats.thisMonth - stats.lastMonthToDate) / stats.lastMonthToDate) * 100)
    : null;

  // ── Profile completeness: what patients see when they look a doctor up ─────
  const profileFields = [
    { key: 'specialization', ok: !!profile?.specialization },
    { key: 'license', ok: !!profile?.license_number },
    { key: 'phone', ok: !!profile?.phone },
    { key: 'fee', ok: !!profile?.consultation_fee },
    { key: 'bio', ok: !!profile?.bio },
    { key: 'school', ok: !!profile?.medical_school },
    { key: 'experience', ok: !!profile?.years_experience },
  ];
  const completeness = Math.round((profileFields.filter(f => f.ok).length / profileFields.length) * 100);
  const missing = profileFields.filter(f => !f.ok).slice(0, 3);

  const recentActivity = [
    ...(labRequests as any[]).filter((r: any) => r.status === 'completed').map((r: any) => ({
      at: r.updated_at || r.created_at, icon: '🧪',
      title: t('doctorDashboard.recent.labResultReady', { name: r.patient_name }), sub: r.test_description,
    })),
    ...(consultations as any[]).filter((c: any) => c.status === 'delivered' || c.status === 'completed').map((c: any) => ({
      at: c.updated_at || c.visit_date, icon: '💊',
      title: t('doctorDashboard.recent.prescriptionDelivered', { name: c.patient_name }), sub: c.pharmacy_name,
    })),
    ...(requests as any[]).filter((r: any) => r.status !== 'pending' && r.responded_at).map((r: any) => ({
      at: r.responded_at, icon: r.status === 'accepted' ? '✅' : '❌',
      title: t('doctorDashboard.recent.accessRequestResponse', { name: r.patient_name, status: r.status }), sub: r.access_type?.replace('_', ' '),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  const recentPatients = Object.values(
    (consultations as any[]).reduce((acc: Record<number, any>, c: any) => {
      if (!acc[c.patient_id] || new Date(c.visit_date) > new Date(acc[c.patient_id].visit_date)) acc[c.patient_id] = c;
      return acc;
    }, {})
  )
    .sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
    .slice(0, 6);

  const waitingOnOthers = pendingLabResults.length + pendingAccessRequests.length + pendingViewRequests.length;

  const actionBtn = 'flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors';

  return (
    <div className="space-y-6 p-4 md:p-0">

      {/* Welcome */}
      <DashboardWelcome
        role="doctor"
        eyebrow={t('doctorDashboard.welcome.greeting')}
        title={t('doctorDashboard.welcome.namePrefix', { name: firstName })}
        subtitle={`${profile?.specialization || t('doctorDashboard.welcome.defaultSpecialization')} · Suwela`}
      >
        <WelcomeStats
          items={[
            { label: t('doctorDashboard.overview.todayAppointments'), value: todays.length },
            { label: t('doctorDashboard.overview.activeTreatments'), value: agingConsultations.length },
            { label: t('doctorDashboard.welcome.pendingRequests'), value: pendingAccessRequests.length },
          ]}
        />
      </DashboardWelcome>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate('/doctor/consultations', { state: { autoOpen: true } })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.newConsultation')}
        </button>
        <button
          onClick={() => navigate('/doctor/lab-requests', { state: { autoOpen: true } })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-2xl hover:bg-primary-100 transition-colors"
        >
          <FlaskConical size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.newLabRequest')}
        </button>
        <button onClick={() => navigate('/doctor/patients')} className={actionBtn}>
          <UserSearch size={15} strokeWidth={2.5} /> {t('doctorDashboard.overview.findPatient')}
        </button>
        <button onClick={() => navigate('/doctor/appointments')} className={actionBtn}>
          <CalendarClock size={15} strokeWidth={2.5} /> {t('doctorDashboard.overview.schedule')}
          {apptRequests > 0 && <span className="ml-1 text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5">{apptRequests}</span>}
        </button>
        <button onClick={() => navigate('/doctor/requests')} className={actionBtn}>
          <Send size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.viewRequests')}
        </button>
      </div>

      {/* Today + account */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="ios-tile p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <CalendarClock size={12} strokeWidth={2.5} /> {t('doctorDashboard.overview.todayTitle')}
              </p>
              <p className="text-base font-bold text-gray-900">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <Link to="/doctor/appointments" className="text-xs font-semibold text-primary-600 hover:underline">
              {t('doctorDashboard.overview.openSchedule')} →
            </Link>
          </div>

          {todays.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Sparkles size={22} strokeWidth={1.5} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">{t('doctorDashboard.overview.noAppointmentsToday')}</p>
              {apptRequests > 0 && (
                <Link to="/doctor/appointments" className="inline-block mt-2 text-xs font-semibold text-primary-600 hover:underline">
                  {t('doctorDashboard.overview.pendingBookings', { count: apptRequests })}
                </Link>
              )}
            </div>
          ) : (
            <ol className="space-y-2">
              {todays.map(a => {
                const isNext = nextUp?.id === a.id;
                const past = String(a.end_time ?? a.start_time).slice(0, 5) < nowHm;
                return (
                  <li key={a.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                    isNext ? 'border-primary-300 bg-primary-50/60' : past ? 'border-gray-100 bg-gray-50/60 opacity-70' : 'border-gray-100 bg-white'}`}>
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-sm font-bold text-gray-900 tabular-nums">{String(a.start_time).slice(0, 5)}</p>
                      <p className="text-[10px] text-gray-400 tabular-nums">{String(a.end_time ?? '').slice(0, 5)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{a.patient_name}</p>
                      <p className="text-xs text-gray-500 truncate">{a.reason || a.organization_name || t('doctorDashboard.overview.noReason')}</p>
                    </div>
                    {isNext && <span className="badge-blue">{t('doctorDashboard.overview.nextUp')}</span>}
                    {a.status === 'pending' && <span className="badge-yellow">{t('doctorDashboard.overview.awaitingConfirm')}</span>}
                    {a.patient_id && (
                      <button onClick={() => navigate(`/doctor/patients/${a.patient_id}`)} className="btn-ghost !px-2 !py-1" title={t('patientsPage.openProfile')}>
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="space-y-4">
          {/* Package & billing */}
          {plan && (
            <Link to="/doctor/package" className="ios-tile p-5 block hover:shadow-md transition-shadow">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Package size={12} strokeWidth={2.5} /> {t('doctorDashboard.overview.package')}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold text-gray-900">{plan.name}</p>
                <span className="text-xs text-gray-500">
                  {formatPrice(plan.price_monthly, plan.currency)}{plan.price_monthly > 0 ? ` ${tb('perMonth')}` : ''}
                </span>
              </div>
              {billing && (
                <p className={`text-xs font-semibold mt-1.5 ${
                  billing.status === 'suspended' ? 'text-red-600' : billing.status === 'expiring' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {billing.status === 'expiring' && <>{tb('status.expiring')} · <Countdown to={billing.expires_at} /></>}
                  {billing.status === 'active' && tb('card.activeTitle', { date: formatDate(billing.expires_at) })}
                  {billing.status === 'suspended' && tb('status.suspended')}
                  {billing.status === 'free' && tb('status.free')}
                  {billing.status === 'not_started' && tb('status.not_started')}
                </p>
              )}
            </Link>
          )}

          {/* Profile completeness */}
          <div className="ios-tile p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('doctorDashboard.overview.profileTitle')}</p>
              <span className={`text-sm font-bold ${completeness === 100 ? 'text-emerald-600' : 'text-gray-900'}`}>{completeness}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full rounded-full ${completeness === 100 ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${completeness}%` }} />
            </div>
            {completeness === 100 ? (
              <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1"><CheckCircle2 size={13} /> {t('doctorDashboard.overview.profileDone')}</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-2">
                  {t('doctorDashboard.overview.profileMissing', {
                    fields: missing.map(f => t(`doctorDashboard.overview.fields.${f.key}`)).join(', '),
                  })}
                </p>
                <Link to="/doctor/settings" className="inline-block mt-2 text-xs font-semibold text-primary-600 hover:underline">
                  {t('doctorDashboard.overview.completeProfile')} →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <KpiTile icon={Users} tone="bg-teal-50 text-teal-700" to="/doctor/patients"
          label={t('doctorDashboard.overview.kpi.patients')} value={stats.patients}
          sub={t('doctorDashboard.overview.kpi.newThisMonth', { count: stats.newPatients })} />
        <KpiTile icon={Stethoscope} tone="bg-blue-50 text-blue-700" to="/doctor/consultations"
          label={t('doctorDashboard.overview.kpi.consultationsMonth')} value={stats.thisMonth}
          sub={trend === null ? t('doctorDashboard.overview.kpi.noComparison') : (
            <span className={`inline-flex items-center gap-1 font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {t('doctorDashboard.overview.kpi.vsLastMonth', { pct: `${trend >= 0 ? '+' : ''}${trend}%` })}
            </span>
          )} />
        <KpiTile icon={FlaskConical} tone="bg-violet-50 text-violet-700" to="/doctor/lab-requests"
          label={t('doctorDashboard.overview.kpi.labsPending')} value={pendingLabResults.length}
          sub={pendingLabResults.length ? t('doctorDashboard.overview.kpi.oldest', { count: daysSince(pendingLabResults[0]?.created_at) }) : undefined} />
        <KpiTile icon={Clock} tone="bg-amber-50 text-amber-700" to="/doctor/requests"
          label={t('doctorDashboard.overview.kpi.waitingOnOthers')} value={waitingOnOthers}
          sub={t('doctorDashboard.overview.kpi.waitingHint')} />
      </div>

      {/* Trend + top diagnoses */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="ios-tile p-5 xl:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} strokeWidth={2.5} /> {t('doctorDashboard.overview.trendTitle')}
            </p>
            <p className="text-xs text-gray-500">{t('doctorDashboard.overview.trendTotal', { count: stats.fortnight })}</p>
          </div>
          <ConsultationTrend
            days={stats.days}
            label={d => t('doctorDashboard.overview.trendTooltip', { date: formatDate(d.day), count: d.count })}
          />
        </div>
        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <ClipboardList size={12} strokeWidth={2.5} /> {t('doctorDashboard.overview.topDiagnoses')}
          </p>
          {stats.topDiagnoses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('doctorDashboard.overview.noDiagnoses')}</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.topDiagnoses.map(([name, n]) => (
                <li key={name}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-800 truncate pr-2">{name}</span>
                    <span className="text-gray-500 tabular-nums">{n}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-400" style={{ width: `${(n / stats.topDiagnoses[0][1]) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Action centre: things waiting on someone ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <FlaskConical size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.pendingLabResults')}
          </p>
          {pendingLabResults.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingLabResults')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingLabResults.slice(0, 6).map((r: any) => {
                const d = daysSince(r.created_at);
                return (
                  <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.test_description} · {r.lab_name || t('doctorDashboard.alerts.labFallback')}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${waitColor(d)}`}>{t('doctorDashboard.alerts.waitingDays', { count: d })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.activeConsultationsAging')}
          </p>
          {agingConsultations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noAgingConsultations')}</p>
          ) : (
            <ul className="space-y-2">
              {agingConsultations.slice(0, 6).map((c: any) => {
                const d = daysSince(c.visit_date);
                return (
                  <li key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{c.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.diagnosis || t('doctorDashboard.alerts.noDiagnosisRecorded')}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${waitColor(d)}`}>{t('doctorDashboard.alerts.activeDays', { count: d })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Send size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.accessRequestsAwaitingPatient')}
          </p>
          {pendingAccessRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingAccessRequests')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingAccessRequests.slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 truncate capitalize">{r.access_type?.replace('_', ' ')}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('doctorDashboard.alerts.daysAgo', { count: daysSince(r.created_at) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Eye size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.reportViewRequestsAwaitingPatient')}
          </p>
          {pendingViewRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingViewRequests')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingViewRequests.slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 truncate">{r.test_description} · {r.lab_name || t('doctorDashboard.alerts.labFallback')}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('doctorDashboard.alerts.daysAgo', { count: daysSince(r.created_at) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Recently seen patients + activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ios-tile p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <Users size={12} strokeWidth={2.5} /> {t('doctorDashboard.recent.seenPatients')}
            </p>
            <Link to="/doctor/patients" className="text-xs font-semibold text-primary-600 hover:underline">
              {t('doctorDashboard.overview.viewAllPatients')} →
            </Link>
          </div>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.recent.noConsultations')}</p>
          ) : (
            <ul className="space-y-2">
              {recentPatients.map((c: any) => (
                <li key={c.patient_id}>
                  <button
                    onClick={() => navigate(`/doctor/patients/${c.patient_id}`)}
                    className="w-full flex items-center gap-3 text-left py-1.5 hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {c.patient_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{c.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{formatDate(c.visit_date)}{c.diagnosis ? ` · ${c.diagnosis}` : ''}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Activity size={12} strokeWidth={2.5} /> {t('doctorDashboard.recent.activity')}
          </p>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.recent.noActivity')}</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-base shrink-0">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 truncate">{a.sub}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400">{formatDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
