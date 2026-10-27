import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Package, HeartPulse } from 'lucide-react';
import { planApi } from '../../services/api';
import { PlanSummary } from '../../types';
import { formatPrice } from '../../constants/plans';

const BAR_COLORS = ['bg-gray-300', 'bg-primary-500', 'bg-amber-500', 'bg-purple-500', 'bg-teal-500'];

/** Admin dashboard: how many accounts are on each package, per dashboard type. */
export default function PlanSummaryCard() {
  const { t } = useTranslation('plans');
  const { data } = useQuery<PlanSummary>({ queryKey: ['plan-summary'], queryFn: planApi.summary });
  if (!data) return null;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-primary-600" />
          <div>
            <h3 className="font-semibold text-gray-900">{t('summary.title')}</h3>
            <p className="text-xs text-gray-500">{t('summary.subtitle')}</p>
          </div>
        </div>
        <Link to="/admin/plans" className="text-xs font-semibold text-primary-700 hover:underline whitespace-nowrap">
          {t('summary.manage')} →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.audiences.map(a => (
          <div key={a.audience} className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-baseline justify-between mb-2">
              <Link
                to={`/admin/plans?tab=subscribers&audience=${a.audience}`}
                className="text-sm font-semibold text-gray-800 hover:text-primary-700"
              >
                {t(`audience.${a.audience}`)}
              </Link>
              <span className="text-lg font-bold text-gray-900">{a.total}</span>
            </div>

            {/* One bar, split by package */}
            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-3">
              {a.total > 0 && a.plans.map((p, i) => p.subscribers > 0 && (
                <span key={p.plan_id} className={BAR_COLORS[i % BAR_COLORS.length]} style={{ width: `${(p.subscribers / a.total) * 100}%` }} />
              ))}
            </div>

            <ul className="space-y-1.5">
              {a.plans.map((p, i) => (
                <li key={p.plan_id}>
                  <Link
                    to={`/admin/plans?tab=subscribers&audience=${a.audience}&plan_id=${p.plan_id}`}
                    className="flex items-center justify-between gap-2 text-sm hover:bg-gray-50 rounded-lg px-1 -mx-1"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                      <span className="truncate text-gray-700">{p.name}</span>
                      <span className="text-xs text-gray-400">{formatPrice(p.price_monthly, p.currency)}</span>
                    </span>
                    <span className="font-semibold text-gray-900">{p.subscribers}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {a.estimated_monthly_revenue > 0 && (
              <p className="text-[11px] text-gray-400 mt-3">
                {t('summary.estimated', { amount: formatPrice(a.estimated_monthly_revenue, a.plans[0]?.currency ?? 'LKR') })}
              </p>
            )}
          </div>
        ))}

        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 flex items-center gap-3">
          <HeartPulse size={22} className="text-blue-500 shrink-0" />
          <p className="text-sm text-blue-800">{t('summary.patients', { count: data.patients.total })}</p>
        </div>
      </div>
    </div>
  );
}
