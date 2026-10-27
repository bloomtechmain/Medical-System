import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Infinity as InfinityIcon } from 'lucide-react';
import { Plan, PlanFeatureDefinition } from '../../types';
import { formatPrice, tierStyle } from '../../constants/plans';

interface Props {
  plan: Plan;
  features: PlanFeatureDefinition[];
  tierIndex: number;
  selected?: boolean;
  current?: boolean;
  usage?: Record<string, number>;
  footer?: ReactNode;
  onClick?: () => void;
}

/** One package: price, then every catalogue feature as included / not / its limit. */
export default function PlanCard({ plan, features, tierIndex, selected, current, usage, footer, onClick }: Props) {
  const { t } = useTranslation('plans');
  const style = tierStyle(tierIndex);
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative text-left flex flex-col rounded-2xl border-2 bg-white p-5 transition-all duration-200 w-full
        ${selected ? 'border-primary-500 ring-2 ring-primary-200 shadow-md' : style.ring}
        ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`badge ${style.badge}`}>{plan.name}</span>
        {current && <span className="badge-green">{t('current')}</span>}
        {!current && tierIndex === 1 && <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">{t('recommended')}</span>}
      </div>

      <div className="mt-2 mb-1">
        <span className={`text-2xl font-bold ${style.accent}`}>
          {plan.price_monthly === 0 ? t('free') : formatPrice(plan.price_monthly, plan.currency)}
        </span>
        {plan.price_monthly > 0 && <span className="text-sm text-gray-400 ml-1">{t('perMonth')}</span>}
      </div>
      {plan.price_yearly != null && plan.price_yearly > 0 && (
        <p className="text-xs text-gray-400">{t('perYear', { price: formatPrice(plan.price_yearly, plan.currency) })}</p>
      )}
      {plan.description && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{plan.description}</p>}

      <ul className="mt-4 space-y-2 flex-1">
        {features.map(f => {
          const value = plan.features[f.key];
          const label = t(`feature.${plan.audience}.${f.key}`, { defaultValue: f.label });
          if (f.type === 'boolean') {
            return (
              <li key={f.key} className={`flex items-start gap-2 text-sm ${value ? 'text-gray-700' : 'text-gray-400'}`}>
                {value
                  ? <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  : <X size={16} className="text-gray-300 shrink-0 mt-0.5" />}
                <span className={value ? '' : 'line-through decoration-gray-300'}>{label}</span>
              </li>
            );
          }
          const used = usage?.[f.key];
          return (
            <li key={f.key} className="flex items-start gap-2 text-sm text-gray-700">
              {value === null
                ? <InfinityIcon size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                : <span className="w-4 shrink-0 text-center text-xs font-bold text-gray-500 mt-0.5">#</span>}
              <span className="flex-1">
                <span className="font-semibold">{value === null ? t('unlimited') : value}</span>{' '}
                <span className="text-gray-500">{label}</span>
                {used !== undefined && (
                  <span className="block text-xs text-gray-400">
                    {value === null ? t('usedUnlimited', { used }) : t('usedOf', { used, limit: value })}
                  </span>
                )}
                {used !== undefined && typeof value === 'number' && value > 0 && (
                  <span className="block h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${used >= value ? 'bg-red-500' : used / value > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (used / value) * 100)}%` }}
                    />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {footer && <div className="mt-5">{footer}</div>}
    </Wrapper>
  );
}
