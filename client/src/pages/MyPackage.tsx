import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Package, ArrowUpCircle, ArrowDownCircle, Clock, XCircle, Receipt, History, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboardPlan } from '../hooks/useDashboardPlan';
import { planApi, billingApi } from '../services/api';
import { MyBilling, Plan, PlanChangeRequest, PlanFeatureDefinition } from '../types';
import PlanCard from '../components/plans/PlanCard';
import BillingStatusCard from '../components/billing/BillingStatusCard';
import Modal from '../components/common/Modal';
import { formatDate } from '../utils/helpers';
import { formatPrice } from '../constants/plans';

// Migration 014 + 016: the package behind the dashboard on screen — where it
// stands in its monthly billing cycle, what it includes, the packages it can
// move to (an upgrade/downgrade request the admin approves, effective from
// the next billing period), and the history of payments and requests.

const REQUEST_BADGE: Record<string, string> = {
  pending: 'badge-yellow', approved: 'badge-blue', applied: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray',
};

export default function MyPackage() {
  const { t } = useTranslation('plans');
  const { t: tb } = useTranslation('billing');
  const { user } = useAuth();
  const qc = useQueryClient();
  const { plan, usage, features, subject, loading, billing, openRequest, organizationId, refetch } = useDashboardPlan();
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const [message, setMessage] = useState('');

  const audience = plan?.audience;
  const { data: available } = useQuery<{ plans: Plan[]; features: PlanFeatureDefinition[] }>({
    queryKey: ['public-plans', audience],
    queryFn: () => planApi.listPublic(audience as string),
    enabled: !!audience,
  });
  const { data: mine } = useQuery<MyBilling>({
    queryKey: ['my-billing', organizationId ?? 'personal'],
    queryFn: () => billingApi.mine(organizationId),
    enabled: !!plan,
  });

  // An organisation's package can only be changed by its owner.
  const membership = subject?.kind === 'organization' ? user?.memberships?.find(m => m.id === subject.id) : undefined;
  const canRequest = subject?.kind === 'user' || membership?.member_role === 'owner'
    || (subject?.kind === 'organization' && user?.organization?.id === subject.id);

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['my-billing'] });
  };

  const requestMutation = useMutation({
    mutationFn: (p: Plan) => planApi.requestChange({
      plan_id: p.id,
      organization_id: subject?.kind === 'organization' ? subject.id : null,
      message: message.trim() || undefined,
    }),
    onSuccess: (res: { message?: string }) => {
      toast.success(res?.message || t('my.requestSent'), { duration: 7000 });
      setChoosing(null);
      setMessage('');
      refresh();
    },
    onError: (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed')),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => billingApi.cancelRequest(id),
    onSuccess: () => { toast.success(tb('my.cancelled')); refresh(); },
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
  const isUpgrade = (p: Plan) => p.price_monthly > plan.price_monthly || (p.price_monthly === plan.price_monthly && p.sort_order > plan.sort_order);
  // When an approved change will start: the end of the period already paid
  // for, or straight after approval when there is no paid period running.
  const runningPaid = billing?.status === 'active' || billing?.status === 'expiring';

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
          <Package className="text-primary-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('my.title')}</h1>
          <p className="text-sm text-gray-500">{tb('my.subtitle')}</p>
        </div>
      </div>

      {billing && <BillingStatusCard billing={billing} plan={plan} instructions={mine?.instructions} />}

      {openRequest && (
        <OpenRequest request={openRequest} canCancel={canRequest} cancelling={cancelMutation.isPending} onCancel={() => cancelMutation.mutate(openRequest.id)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <p className="section-title mb-2">{t('current')}</p>
          <PlanCard plan={plan} features={featureDefs} tierIndex={tierOf(plan)} usage={usage} current />
        </div>

        <div className="lg:col-span-2">
          <p className="section-title mb-2">{tb('my.changePackage')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allPlans.filter(p => p.id !== plan.id).map(p => {
              const up = isUpgrade(p);
              const pendingThis = openRequest?.to_plan_id === p.id;
              return (
                <PlanCard
                  key={p.id}
                  plan={p}
                  features={featureDefs}
                  tierIndex={tierOf(p)}
                  footer={!canRequest ? <p className="text-xs text-gray-400">{t('my.ownerOnly')}</p> : (
                    <button
                      type="button"
                      className={pendingThis ? 'btn-secondary w-full' : up ? 'btn-primary w-full' : 'btn-secondary w-full'}
                      disabled={!!openRequest}
                      title={openRequest && !pendingThis ? tb('my.oneAtATime') : undefined}
                      onClick={() => { setChoosing(p); setMessage(''); }}
                    >
                      {pendingThis
                        ? (openRequest!.status === 'approved' ? tb('my.scheduled') : t('my.requestSent'))
                        : up ? <><ArrowUpCircle size={15} /> {tb('my.upgradeTo', { plan: p.name })}</>
                          : <><ArrowDownCircle size={15} /> {tb('my.downgradeTo', { plan: p.name })}</>}
                    </button>
                  )}
                />
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-4">{tb('my.howChangesWork')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <p className="section-title mb-3 flex items-center gap-2"><Receipt size={15} /> {tb('my.payments')}</p>
          {!mine?.payments.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">{tb('my.noPayments')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mine.payments.map(p => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{formatPrice(p.amount, p.currency)} · {p.plan_name}</p>
                    <p className="text-xs text-gray-500">
                      {tb('my.coveredPeriod', { from: formatDate(p.period_start), to: formatDate(p.period_end) })} · {tb(`method.${p.method}`)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <p className="section-title mb-3 flex items-center gap-2"><History size={15} /> {tb('my.requests')}</p>
          {!mine?.requests.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">{tb('my.noRequests')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mine.requests.map(r => (
                <li key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {tb(`direction.${r.direction}`)}: {r.from_plan_name ?? '—'} → {r.to_plan_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(r.created_at)}
                      {r.effective_at && r.status !== 'rejected' && r.status !== 'cancelled' ? ` · ${tb('my.effective', { date: formatDate(r.effective_at) })}` : ''}
                      {r.decision_note ? ` · ${r.decision_note}` : ''}
                    </p>
                  </div>
                  <span className={`${REQUEST_BADGE[r.status]} shrink-0`}>{tb(`requestStatus.${r.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal
        isOpen={!!choosing}
        onClose={() => setChoosing(null)}
        title={choosing ? (isUpgrade(choosing) ? tb('my.confirmUpgradeTitle', { plan: choosing.name }) : tb('my.confirmDowngradeTitle', { plan: choosing.name })) : ''}
      >
        {choosing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] font-bold uppercase text-gray-400">{tb('my.from')}</p>
                <p className="font-bold text-gray-900">{plan.name}</p>
                <p className="text-xs text-gray-500">{formatPrice(plan.price_monthly, plan.currency)} {plan.price_monthly > 0 ? tb('perMonth') : ''}</p>
              </div>
              <div className="rounded-xl bg-primary-50 border border-primary-100 p-3">
                <p className="text-[11px] font-bold uppercase text-primary-500">{tb('my.to')}</p>
                <p className="font-bold text-gray-900">{choosing.name}</p>
                <p className="text-xs text-gray-500">{formatPrice(choosing.price_monthly, choosing.currency)} {choosing.price_monthly > 0 ? tb('perMonth') : ''}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 flex items-start gap-2">
              <Clock size={15} className="shrink-0 mt-0.5 text-gray-400" />
              {runningPaid
                ? tb('my.whenNextPeriod', { date: formatDate(billing?.expires_at) })
                : tb('my.whenApproved')}
            </p>
            <div>
              <label className="label">{tb('my.messageLabel')}</label>
              <textarea className="input resize-none" rows={2} maxLength={300} value={message}
                placeholder={tb('my.messagePlaceholder')} onChange={e => setMessage(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setChoosing(null)}>{t('admin.cancel')}</button>
              <button type="button" className="btn-primary" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate(choosing)}>
                {requestMutation.isPending ? t('admin.saving') : tb('my.sendRequest')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OpenRequest({ request, canCancel, cancelling, onCancel }: {
  request: PlanChangeRequest; canCancel: boolean; cancelling: boolean; onCancel: () => void;
}) {
  const { t } = useTranslation('billing');
  const approved = request.status === 'approved';
  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-3 ${approved ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${approved ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
        {approved ? <CheckCircle2 size={19} /> : <Clock size={19} />}
      </div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-bold text-gray-900">
          {approved
            ? t('my.approvedTitle', { plan: request.to_plan_name, date: formatDate(request.effective_at) })
            : t('my.pendingTitle', { direction: t(`direction.${request.direction}`).toLowerCase(), plan: request.to_plan_name })}
        </p>
        <p className="text-xs text-gray-600">{approved ? t('my.approvedBody') : t('my.pendingBody', { date: formatDate(request.created_at) })}</p>
      </div>
      {canCancel && (
        <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={cancelling} onClick={onCancel}>
          <XCircle size={14} /> {t('my.cancelRequest')}
        </button>
      )}
    </div>
  );
}
