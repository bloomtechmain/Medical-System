import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, AlertTriangle, ArrowRightLeft, ChevronRight, CreditCard } from 'lucide-react';
import { billingApi } from '../../services/api';
import { BillingOverview } from '../../types';
import Countdown from './Countdown';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';

// Migration 016: the top of the main admin dashboard — who is locked for
// payment, who expires within 7 days (live countdowns), and package changes
// waiting for a decision. Everything links to the Billing page.

export default function AdminBillingAlerts() {
  const { t } = useTranslation('billing');
  const { data } = useQuery<BillingOverview>({
    queryKey: ['billing-overview'],
    queryFn: billingApi.overview,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  const { counts } = data;
  const anything = counts.suspended || counts.expiring || counts.pending_requests;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={16} className="text-primary-600" /> {t('dashboard.title')}
        </h2>
        <Link to="/admin/billing" className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-full">
          {t('dashboard.open')} →
        </Link>
      </div>

      {!anything ? (
        <p className="px-5 py-5 text-sm text-emerald-700 bg-emerald-50/60">{t('dashboard.allClear', { count: counts.active })}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <Column
            to="/admin/billing#due" Icon={Lock} tone="text-red-600 bg-red-50" count={counts.suspended}
            title={t('dashboard.dueNow')} empty={t('dashboard.none')}
            items={data.suspended.slice(0, 4).map(a => ({
              key: `${a.kind}-${a.id}`, name: a.name,
              sub: `${a.plan_name} · ${formatPrice(a.price_monthly, a.currency)}`,
              right: <span className="text-red-600">{t('dashboard.since', { date: formatDate(a.plan_expires_at) })}</span>,
            }))}
          />
          <Column
            to="/admin/billing#expiring" Icon={AlertTriangle} tone="text-amber-600 bg-amber-50" count={counts.expiring}
            title={t('dashboard.expiring')} empty={t('dashboard.none')}
            items={data.expiring.slice(0, 4).map(a => ({
              key: `${a.kind}-${a.id}`, name: a.name,
              sub: `${a.plan_name} · ${formatPrice(a.price_monthly, a.currency)}`,
              right: <Countdown to={a.plan_expires_at} className="text-amber-700 font-bold" />,
            }))}
          />
          <Column
            to="/admin/billing#requests" Icon={ArrowRightLeft} tone="text-violet-600 bg-violet-50" count={counts.pending_requests}
            title={t('dashboard.requests')} empty={t('dashboard.none')}
            items={[]}
            footer={counts.scheduled_changes ? t('dashboard.scheduled', { count: counts.scheduled_changes }) : undefined}
          />
        </div>
      )}
    </section>
  );
}

function Column({ to, Icon, tone, count, title, empty, items, footer }: {
  to: string; Icon: typeof Lock; tone: string; count: number; title: string; empty: string;
  items: { key: string; name: string; sub: string; right: React.ReactNode }[];
  footer?: string;
}) {
  return (
    <Link to={to} className="block px-5 py-4 hover:bg-gray-50/70 transition-colors">
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon size={17} /></span>
        <div className="flex-1">
          <p className="text-2xl font-bold text-gray-900 leading-none">{count}</p>
          <p className="text-xs font-semibold text-gray-500 mt-1">{title}</p>
        </div>
        <ChevronRight size={16} className="text-gray-300" />
      </div>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {items.map(i => (
            <li key={i.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="font-semibold text-gray-800 truncate block">{i.name}</span>
                <span className="text-gray-400 truncate block">{i.sub}</span>
              </span>
              <span className="shrink-0 text-right">{i.right}</span>
            </li>
          ))}
        </ul>
      ) : count === 0 ? <p className="mt-3 text-xs text-gray-400">{empty}</p> : null}
      {footer && <p className="mt-2 text-xs text-sky-700">{footer}</p>}
    </Link>
  );
}
