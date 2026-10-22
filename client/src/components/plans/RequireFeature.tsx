import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useDashboardPlan } from '../../hooks/useDashboardPlan';

/**
 * Shows the section only if the current dashboard's package includes the
 * feature, otherwise an upgrade notice. The server refuses the underlying
 * requests too — this is so a locked section reads as "not in your package"
 * rather than as a page full of errors.
 */
export default function RequireFeature({ feature, children }: { feature: string; children: ReactNode }) {
  const { t } = useTranslation('plans');
  const location = useLocation();
  const { plan, has, features } = useDashboardPlan();

  if (has(feature)) return <>{children}</>;

  const dashboard = location.pathname.split('/')[1];
  const label = t(`feature.${plan?.audience}.${feature}`, {
    defaultValue: features.find(f => f.key === feature)?.label ?? feature,
  });

  return (
    <div className="max-w-lg mx-auto mt-10 card text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
        <Lock className="text-amber-500" size={26} />
      </div>
      <h2 className="text-lg font-bold text-gray-900">{t('locked.title', { feature: label })}</h2>
      <p className="text-sm text-gray-500 mt-2">{t('locked.body', { plan: plan?.name ?? '' })}</p>
      <Link to={`/${dashboard}/package`} className="btn-primary mt-6">{t('locked.viewPackages')}</Link>
    </div>
  );
}
