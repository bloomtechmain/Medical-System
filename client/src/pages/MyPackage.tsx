import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Package, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboardPlan } from '../hooks/useDashboardPlan';
import { planApi } from '../services/api';
import { Plan, PlanFeatureDefinition } from '../types';
import PlanCard from '../components/plans/PlanCard';

// Migration 014: the package behind the dashboard being viewed — what it
// includes, how much of each limit is used, and the other packages this
// dashboard could be on.
export default function MyPackage() {
  const { t } = useTranslation('plans');
  const { user } = useAuth();
  const { plan, usage, features, subject, loading } = useDashboardPlan();
  const [requested, setRequested] = useState<number | null>(null);

  const audience = plan?.audience;
  const { data: available } = useQuery<{ plans: Plan[]; features: PlanFeatureDefinition[] }>({
    queryKey: ['public-plans', audience],
    queryFn: () => planApi.listPublic(audience as string),
    enabled: !!audience,
  });

  // An organisation's package can only be changed by its owner.
  const membership = subject?.kind === 'organization' ? user?.memberships?.find(m => m.id === subject.id) : undefined;
  const canRequest = subject?.kind === 'user' || membership?.member_role === 'owner';

  const requestMutation = useMutation({
    mutationFn: (planId: number) => planApi.requestChange({
      plan_id: planId,
      organization_id: subject?.kind === 'organization' ? subject.id : null,
    }),
    onSuccess: (res: { message?: string }, planId) => {
      setRequested(planId);
      toast.success(res?.message || t('my.requestSent'), { duration: 6000 });
    },
    onError: (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed')),
  });

  if (user?.role === 'patient') {
    return <div className="card text-center text-gray-600">{t('my.patientFree')}</div>;
  }
  if (loading) return <div className="text-gray-400 text-sm">{t('picker.loading')}</div>;
  if (!plan) return <div className="card text-center text-gray-600">{t('my.none')}</div>;

  const allPlans = available?.plans ?? [];
  const featureDefs = features.length ? features : (available?.features ?? []);
  const tierOf = (p: Plan) => Math.max(0, allPlans.findIndex(x => x.id === p.id));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
          <Package className="text-primary-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('my.title')}</h1>
          <p className="text-sm text-gray-500">{t('my.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <p className="section-title mb-2">{t('current')}</p>
          <PlanCard plan={plan} features={featureDefs} tierIndex={tierOf(plan)} usage={usage} current />
        </div>

        <div className="lg:col-span-2">
          <p className="section-title mb-2">{t('my.compare')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allPlans.filter(p => p.id !== plan.id).map(p => (
              <PlanCard
                key={p.id}
                plan={p}
                features={featureDefs}
                tierIndex={tierOf(p)}
                footer={canRequest ? (
                  <button
                    type="button"
                    className={requested === p.id ? 'btn-secondary w-full' : 'btn-primary w-full'}
                    disabled={requestMutation.isPending || requested === p.id}
                    onClick={() => requestMutation.mutate(p.id)}
                  >
                    {requested === p.id ? t('my.requestSent') : t('my.request')}
                  </button>
                ) : <p className="text-xs text-gray-400">{t('my.ownerOnly')}</p>}
              />
            ))}
          </div>
          <p className="flex items-start gap-2 text-xs text-gray-500 mt-4">
            <Info size={14} className="shrink-0 mt-0.5" />
            {t('my.requestHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
