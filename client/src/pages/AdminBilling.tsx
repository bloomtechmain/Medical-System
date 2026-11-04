import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Lock, AlertTriangle, CheckCircle2, Clock, ArrowRightLeft, Wallet, CalendarClock, Search, Receipt, History,
  ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
import Countdown from '../components/billing/Countdown';
import RecordPaymentModal from '../components/billing/RecordPaymentModal';
import DecideRequestModal from '../components/billing/DecideRequestModal';
import { billingApi } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { BillingAccount, BillingOverview, BillingStatus, PlanChangeRequest, SubscriptionPayment } from '../types';
import { PLAN_AUDIENCES, formatPrice } from '../constants/plans';
import { formatDate, formatDateTime } from '../utils/helpers';

// Migration 016: the main admin's billing desk — who has to pay now, who is
// about to, package change requests to decide, and every paid account with
// its payment history. "Mark payment received" lives on every row.

const STATUS_BADGE: Record<BillingStatus, string> = {
  suspended: 'badge-red', expiring: 'badge-yellow', active: 'badge-green', not_started: 'badge-blue', free: 'badge-gray',
};

const sumByCurrency = (rows: { currency: string; amount: number }[]): string =>
  rows.length ? rows.map(r => formatPrice(r.amount, r.currency)).join(' + ') : 'LKR 0';

const overdueBy = (date: string | null): string => {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  return days <= 0 ? '' : String(days);
};

export default function AdminBilling() {
  const { t } = useTranslation('billing');
  const [paying, setPaying] = useState<BillingAccount | null>(null);
  const [historyOf, setHistoryOf] = useState<BillingAccount | null>(null);
  const [deciding, setDeciding] = useState<{ request: PlanChangeRequest; mode: 'approve' | 'reject' } | null>(null);

  const { data: overview, isLoading } = useQuery<BillingOverview>({
    queryKey: ['billing-overview'],
    queryFn: billingApi.overview,
    refetchInterval: 60_000,
  });
  const { data: requests = [] } = useQuery<PlanChangeRequest[]>({
    queryKey: ['billing-requests', 'open'],
    queryFn: () => billingApi.changeRequests('open'),
    refetchInterval: 60_000,
  });

  const c = overview?.counts;
  const tiles = [
    { key: 'suspended', label: t('admin.tiles.suspended'), value: c?.suspended, Icon: Lock, cls: 'text-red-700 bg-red-50 border-red-100', href: '#due' },
    { key: 'expiring', label: t('admin.tiles.expiring'), value: c?.expiring, Icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-100', href: '#expiring' },
    { key: 'active', label: t('admin.tiles.active'), value: c?.active, Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-100', href: '#accounts' },
    { key: 'requests', label: t('admin.tiles.requests'), value: (c?.pending_requests ?? 0), Icon: ArrowRightLeft, cls: 'text-violet-700 bg-violet-50 border-violet-100', href: '#requests' },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title={t('admin.title')} description={t('admin.subtitle')} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ key, label, value, Icon, cls, href }) => (
          <a key={key} href={href} className={`rounded-2xl border p-4 hover:shadow-sm transition-shadow ${cls}`}>
            <Icon size={18} />
            <p className="text-3xl font-bold mt-2 text-gray-900">{isLoading ? '—' : value ?? 0}</p>
            <p className="text-xs font-semibold mt-0.5">{label}</p>
          </a>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card !p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Wallet size={18} className="text-emerald-700" /></div>
          <div>
            <p className="text-xs text-gray-500">{t('admin.collectedThisMonth')}</p>
            <p className="text-lg font-bold text-gray-900">{overview ? sumByCurrency(overview.collected_this_month) : '—'}</p>
          </div>
        </div>
        <div className="card !p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center"><CalendarClock size={18} className="text-sky-700" /></div>
          <div>
            <p className="text-xs text-gray-500">{t('admin.dueNext30', { count: overview?.due_next_30_days.reduce((n, r) => n + r.accounts, 0) ?? 0 })}</p>
            <p className="text-lg font-bold text-gray-900">{overview ? sumByCurrency(overview.due_next_30_days) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Payment due now */}
      <section id="due" className="card !p-0 overflow-hidden scroll-mt-20">
        <SectionHead Icon={Lock} tone="text-red-600" title={t('admin.dueTitle')} hint={t('admin.dueHint')} count={overview?.suspended.length} />
        <AccountRows
          rows={overview?.suspended ?? []}
          empty={t('admin.dueEmpty')}
          renderWhen={a => (
            <div>
              <p className="text-red-600 font-semibold">{t('admin.expiredOn', { date: formatDate(a.plan_expires_at) })}</p>
              {overdueBy(a.plan_expires_at) && <p className="text-xs text-gray-500">{t('admin.overdueDays', { count: Number(overdueBy(a.plan_expires_at)) })}</p>}
            </div>
          )}
          onPay={setPaying}
          onHistory={setHistoryOf}
        />
      </section>

      {/* Expiring within 7 days */}
      <section id="expiring" className="card !p-0 overflow-hidden scroll-mt-20">
        <SectionHead Icon={AlertTriangle} tone="text-amber-600" title={t('admin.expiringTitle')} hint={t('admin.expiringHint')} count={overview?.expiring.length} />
        <AccountRows
          rows={overview?.expiring ?? []}
          empty={t('admin.expiringEmpty')}
          renderWhen={a => (
            <div>
              <p className="font-bold text-amber-700"><Countdown to={a.plan_expires_at} /></p>
              <p className="text-xs text-gray-500">{formatDateTime(a.plan_expires_at)}</p>
            </div>
          )}
          onPay={setPaying}
          onHistory={setHistoryOf}
        />
      </section>

      {/* Package change requests */}
      <section id="requests" className="card !p-0 overflow-hidden scroll-mt-20">
        <SectionHead Icon={ArrowRightLeft} tone="text-violet-600" title={t('admin.requestsTitle')} hint={t('admin.requestsHint')} count={requests.length} />
        {requests.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">{t('admin.requestsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map(r => (
              <li key={r.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.direction === 'upgrade' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                  {r.direction === 'upgrade' ? <ArrowUpCircle size={19} /> : <ArrowDownCircle size={19} />}
                </div>
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm font-bold text-gray-900">
                    {r.account_name} <span className="badge-gray ml-1">{t(`audience.${r.audience}`)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    {t(`direction.${r.direction}`)}: {r.from_plan_name ?? '—'} ({formatPrice(r.from_plan_price ?? 0, r.currency)})
                    {' → '}<b>{r.to_plan_name}</b> ({formatPrice(r.to_plan_price, r.currency)})
                  </p>
                  <p className="text-xs text-gray-400">
                    {t('admin.requestedOn', { date: formatDateTime(r.created_at), name: r.requested_by_name ?? r.account_name })}
                    {r.message ? ` · “${r.message}”` : ''}
                  </p>
                </div>
                {r.status === 'approved' ? (
                  <span className="badge-blue">{t('admin.scheduledFor', { date: formatDate(r.effective_at) })}</span>
                ) : (
                  <div className="flex gap-2">
                    <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setDeciding({ request: r, mode: 'approve' })}>{t('admin.decide.approve')}</button>
                    <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setDeciding({ request: r, mode: 'reject' })}>{t('admin.decide.reject')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Every account */}
      <AllAccounts onPay={setPaying} onHistory={setHistoryOf} />

      {/* Recent payments */}
      <section className="card !p-0 overflow-hidden">
        <SectionHead Icon={Receipt} tone="text-emerald-600" title={t('admin.recentPayments')} />
        {!overview?.recent_payments.length ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">{t('admin.noPayments')}</p>
        ) : (
          <PaymentList payments={overview.recent_payments} showAccount />
        )}
      </section>

      <RecordPaymentModal account={paying} onClose={() => setPaying(null)} />
      <DecideRequestModal request={deciding?.request ?? null} mode={deciding?.mode ?? 'approve'} onClose={() => setDeciding(null)} />
      <PaymentHistoryModal account={historyOf} onClose={() => setHistoryOf(null)} onPay={a => { setHistoryOf(null); setPaying(a); }} />
    </div>
  );
}

function SectionHead({ Icon, tone, title, hint, count }: { Icon: typeof Lock; tone: string; title: string; hint?: string; count?: number }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
      <Icon size={18} className={`${tone} mt-0.5`} />
      <div className="flex-1">
        <h2 className="text-sm font-bold text-gray-900">{title}{count ? <span className="ml-2 text-xs font-semibold text-gray-400">({count})</span> : null}</h2>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function AccountRows({ rows, empty, renderWhen, onPay, onHistory }: {
  rows: BillingAccount[];
  empty: string;
  renderWhen: (a: BillingAccount) => React.ReactNode;
  onPay: (a: BillingAccount) => void;
  onHistory: (a: BillingAccount) => void;
}) {
  const { t } = useTranslation('billing');
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-gray-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-5 py-2.5">{t('admin.table.account')}</th>
            <th className="px-5 py-2.5">{t('admin.table.package')}</th>
            <th className="px-5 py-2.5">{t('admin.table.when')}</th>
            <th className="px-5 py-2.5">{t('admin.table.lastPayment')}</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(a => (
            <tr key={`${a.kind}-${a.id}`} className="hover:bg-gray-50/60">
              <td className="px-5 py-3">
                <p className="font-semibold text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500">{a.contact ?? '—'} · {t(`audience.${a.audience}`)}</p>
              </td>
              <td className="px-5 py-3">
                <p className="font-semibold text-gray-900">{a.plan_name}</p>
                <p className="text-xs text-gray-500">{formatPrice(a.price_monthly, a.currency)} {t('perMonth')}</p>
                {a.next_plan_name && <p className="text-xs text-primary-700">→ {a.next_plan_name} {t('admin.fromDate', { date: formatDate(a.next_plan_effective_at) })}</p>}
              </td>
              <td className="px-5 py-3">{renderWhen(a)}</td>
              <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{a.last_payment_at ? formatDate(a.last_payment_at) : t('admin.never')}</td>
              <td className="px-5 py-3">
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => onHistory(a)} title={t('admin.history')}><History size={14} /></button>
                  <button className="btn-primary !px-3 !py-1.5 text-xs whitespace-nowrap" onClick={() => onPay(a)}>{t('admin.markPaid')}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllAccounts({ onPay, onHistory }: { onPay: (a: BillingAccount) => void; onHistory: (a: BillingAccount) => void }) {
  const { t } = useTranslation('billing');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'paid';
  const audience = params.get('audience') ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 350);
  const [limit, setLimit] = useState(50);

  const filters = useMemo(() => ({ status, audience: audience || undefined, q: q || undefined, limit }), [status, audience, q, limit]);
  const { data } = useQuery<{ total: number; rows: BillingAccount[] }>({
    queryKey: ['billing-accounts', filters],
    queryFn: () => billingApi.accounts(filters),
    placeholderData: prev => prev,
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setLimit(50);
  };

  return (
    <section id="accounts" className="card !p-0 overflow-hidden scroll-mt-20">
      <SectionHead Icon={Clock} tone="text-gray-600" title={t('admin.allTitle')} hint={t('admin.allHint')} />
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        {(['paid', 'suspended', 'expiring', 'active', 'not_started', 'free'] as const).map(s => (
          <button key={s} onClick={() => set('status', s === 'paid' ? '' : s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t(`admin.filter.${s}`)}
          </button>
        ))}
        <div className="flex-1" />
        <select className="input !py-1.5 !w-auto text-xs" value={audience} onChange={e => set('audience', e.target.value)}>
          <option value="">{t('admin.filter.allTypes')}</option>
          {PLAN_AUDIENCES.map(a => <option key={a} value={a}>{t(`audience.${a}`)}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input !py-1.5 pl-8 text-xs" placeholder={t('admin.filter.search')} value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-5 py-2.5">{t('admin.table.account')}</th>
              <th className="px-5 py-2.5">{t('admin.table.package')}</th>
              <th className="px-5 py-2.5">{t('admin.table.status')}</th>
              <th className="px-5 py-2.5">{t('admin.table.paidUntil')}</th>
              <th className="px-5 py-2.5">{t('admin.table.lastPayment')}</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">{t('admin.noAccounts')}</td></tr>
            )}
            {data?.rows.map(a => (
              <tr key={`${a.kind}-${a.id}`} className="hover:bg-gray-50/60">
                <td className="px-5 py-3">
                  <p className="font-semibold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.contact ?? '—'} · {t(`audience.${a.audience}`)}</p>
                </td>
                <td className="px-5 py-3">
                  <p className="font-semibold text-gray-900">{a.plan_name}</p>
                  <p className="text-xs text-gray-500">{formatPrice(a.price_monthly, a.currency)}{a.price_monthly > 0 ? ` ${t('perMonth')}` : ''}</p>
                </td>
                <td className="px-5 py-3"><span className={STATUS_BADGE[a.billing_status]}>{t(`status.${a.billing_status}`)}</span></td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {a.plan_expires_at ? (
                    <>
                      <p className="text-gray-900">{formatDate(a.plan_expires_at)}</p>
                      {a.billing_status !== 'suspended' && <p className="text-xs text-gray-500"><Countdown to={a.plan_expires_at} /></p>}
                    </>
                  ) : '—'}
                </td>
                <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{a.last_payment_at ? formatDate(a.last_payment_at) : t('admin.never')}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => onHistory(a)} title={t('admin.history')}><History size={14} /></button>
                    {a.price_monthly > 0 && (
                      <button className="btn-primary !px-3 !py-1.5 text-xs whitespace-nowrap" onClick={() => onPay(a)}>{t('admin.markPaid')}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>{t('admin.showing', { shown: data.rows.length, total: data.total })}</span>
          {data.rows.length < data.total && (
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setLimit(l => l + 50)}>{t('admin.loadMore')}</button>
          )}
        </div>
      )}
    </section>
  );
}

function PaymentList({ payments, showAccount }: { payments: SubscriptionPayment[]; showAccount?: boolean }) {
  const { t } = useTranslation('billing');
  return (
    <ul className="divide-y divide-gray-100">
      {payments.map(p => (
        <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">
              {formatPrice(p.amount, p.currency)}{showAccount ? ` · ${p.account_name}` : ''} <span className="text-gray-500 font-normal">· {p.plan_name}</span>
            </p>
            <p className="text-xs text-gray-500">
              {t('my.coveredPeriod', { from: formatDate(p.period_start), to: formatDate(p.period_end) })} · {t(`method.${p.method}`)}
              {p.reference ? ` · ${p.reference}` : ''}{p.recorded_by_name ? ` · ${t('admin.recordedBy', { name: p.recorded_by_name })}` : ''}
            </p>
          </div>
          <span className="text-xs text-gray-400 shrink-0">{formatDateTime(p.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

function PaymentHistoryModal({ account, onClose, onPay }: { account: BillingAccount | null; onClose: () => void; onPay: (a: BillingAccount) => void }) {
  const { t } = useTranslation('billing');
  const { data } = useQuery<{ payments: SubscriptionPayment[] }>({
    queryKey: ['billing-payments', account?.kind, account?.id],
    queryFn: () => billingApi.payments(account!.kind, account!.id),
    enabled: !!account,
  });
  return (
    <Modal isOpen={!!account} onClose={onClose} title={t('admin.historyTitle', { name: account?.name ?? '' })} size="lg">
      {account && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={STATUS_BADGE[account.billing_status]}>{t(`status.${account.billing_status}`)}</span>
            <span className="text-gray-600">{account.plan_name} · {formatPrice(account.price_monthly, account.currency)} {t('perMonth')}</span>
            {account.plan_expires_at && <span className="text-gray-500">· {t('admin.table.paidUntil')}: {formatDate(account.plan_expires_at)}</span>}
            <div className="flex-1" />
            {account.price_monthly > 0 && <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => onPay(account)}>{t('admin.markPaid')}</button>}
          </div>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {!data?.payments.length ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">{t('my.noPayments')}</p>
            ) : <PaymentList payments={data.payments} />}
          </div>
        </div>
      )}
    </Modal>
  );
}
