import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { planApi } from '../../services/api';
import { Plan, PlanAudience, PlanFeatureDefinition } from '../../types';
import PlanCard from './PlanCard';

interface Props {
  audience: PlanAudience;
  value: number | null;
  onChange: (plan: Plan) => void;
}

/**
 * Package selection at registration. Selects the default (free) package on
 * load so a user who does not engage with the choice still submits a valid
 * one — the server would fall back to the default anyway.
 */
export default function PlanPicker({ audience, value, onChange }: Props) {
  const { t } = useTranslation('plans');
  const { data, isLoading, isError } = useQuery<{ plans: Plan[]; features: PlanFeatureDefinition[] }>({
    queryKey: ['public-plans', audience],
    queryFn: () => planApi.listPublic(audience),
    staleTime: 5 * 60_000,
  });
  const plans = useMemo(() => data?.plans ?? [], [data]);

  useEffect(() => {
    if (value === null && plans.length) onChange(plans.find(p => p.is_default) ?? plans[0]);
  }, [plans, value, onChange]);

  if (isLoading) return <p className="text-sm text-gray-400 py-6 text-center">{t('picker.loading')}</p>;
  if (isError || !plans.length) return <p className="text-sm text-amber-600 py-4">{t('picker.error')}</p>;

  return (
    <div className={`grid grid-cols-1 gap-4 ${plans.length >= 3 ? 'md:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2' : ''}`}>
      {plans.map((plan, i) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          features={data?.features ?? []}
          tierIndex={i}
          selected={value === plan.id}
          onClick={() => onChange(plan)}
          footer={
            <span className={`block w-full text-center text-sm font-semibold rounded-xl py-2 ${value === plan.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {value === plan.id ? t('picker.selected') : t('picker.select')}
            </span>
          }
        />
      ))}
    </div>
  );
}
