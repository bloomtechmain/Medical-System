import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, AlertTriangle, Lock, CalendarClock, ArrowRightLeft, Info } from 'lucide-react';
import Countdown from './Countdown';
import { BillingState, Plan } from '../../types';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';

// Migration 016: where an account stands in its monthly billing cycle —
// free, covered until a date, about to expire (with a live countdown), or
// locked for non-payment — plus any package change scheduled for the next
// period.

const THEME = {
  free:        { box: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  not_started: { box: 'bg-sky-50 border-sky-200',         icon: 'bg-sky-100 text-sky-700',         Icon: Clock },
  active:      { box: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  expiring:    { box: 'bg-amber-50 border-amber-200',     icon: 'bg-amber-100 text-amber-700',     Icon: AlertTriangle },
  suspended:   { box: 'bg-red-50 border-red-200',         icon: 'bg-red-100 text-red-700',         Icon: Lock },
} as const;

export default function BillingStatusCard({ billing, plan, instructions }: {
  billing: BillingState;
  plan: Plan | null;
  instructions?: string;
}) {
  const { t } = useTranslation('billing');
  const theme = THEME[billing.status];
  const price = plan ? `${formatPrice(plan.price_monthly, plan.currency)}${plan.price_monthly > 0 ? ` ${t('perMonth')}` : ''}` : '';
  // How far through a ~30-day period the account is, for the bar.
  const pct = billing.days_left != null ? Math.max(4, Math.min(100, (billing.days_left / 30) * 100)) : 100;

  return (
    <div className={`rounded-2xl border p-5 ${theme.box}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${theme.icon}`}>
          <theme.Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{t(`status.${billing.status}`)}</p>
          <h2 className="text-lg font-bold text-gray-900 mt-0.5">
            {billing.status === 'free' && t('card.freeTitle')}
            {billing.status === 'not_started' && t('card.notStartedTitle')}
            {billing.status === 'active' && t('card.activeTitle', { date: formatDate(billing.expires_at) })}
            {billing.status === 'expiring' && <>{t('card.expiringTitle')} <Countdown to={billing.expires_at} className="text-amber-700" /></>}
            {billing.status === 'suspended' && t('card.suspendedTitle', { date: formatDate(billing.expires_at) })}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {billing.status === 'free' && t('card.freeBody')}
            {billing.status === 'not_started' && t('card.notStartedBody', { plan: plan?.name, price })}
            {billing.status === 'active' && t('card.activeBody', { plan: plan?.name, price, days: billing.days_left })}
            {billing.status === 'expiring' && t('card.expiringBody', { plan: plan?.name, price, date: formatDate(billing.expires_at) })}
            {billing.status === 'suspended' && t('card.suspendedBody', { plan: plan?.name, price })}
          </p>

          {(billing.status === 'active' || billing.status === 'expiring') && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-white/80 overflow-hidden">
                <div
                  className={`h-full rounded-full ${billing.status === 'expiring' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                <CalendarClock size={12} /> {t('card.daysLeft', { count: billing.days_left ?? 0 })}
              </p>
            </div>
          )}

          {billing.next_plan && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-800 bg-white/80 border border-primary-100 rounded-xl px-3 py-1.5">
              <ArrowRightLeft size={14} />
              {t('card.nextPlan', {
                plan: billing.next_plan.name,
                date: formatDate(billing.next_plan_effective_at),
                price: formatPrice(billing.next_plan.price_monthly, billing.next_plan.currency),
              })}
            </p>
          )}

          {instructions && (billing.status === 'expiring' || billing.status === 'suspended' || billing.status === 'not_started') && (
            <div className="mt-4 flex items-start gap-2 text-sm text-gray-700 bg-white/80 border border-white rounded-xl px-3.5 py-3">
              <Info size={16} className="shrink-0 mt-0.5 text-gray-400" />
              <div>
                <p className="font-semibold text-gray-900">{t('card.howToPay')}</p>
                <p className="mt-0.5 whitespace-pre-line">{instructions}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
