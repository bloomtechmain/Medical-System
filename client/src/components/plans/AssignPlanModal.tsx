import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import { planApi } from '../../services/api';
import { MyPlan, Plan, PlanSubscriber } from '../../types';
import { formatDateTime } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';

interface Props {
  subscriber: PlanSubscriber | null;
  plans: Plan[];
  onClose: () => void;
}

interface HistoryRow {
  id: number;
  reason: 'registration' | 'admin_change';
  note: string | null;
  created_at: string;
  previous_plan_name: string | null;
  plan_name: string | null;
  assigned_by_name: string | null;
}

/** Move one account to another package, with its history and current usage. */
export default function AssignPlanModal({ subscriber, plans, onClose }: Props) {
  const { t } = useTranslation('plans');
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    setPlanId(subscriber?.plan_id ?? null);
    setNote('');
  }, [subscriber]);

  const key = subscriber ? [subscriber.kind, subscriber.id] : [];
  const { data: history = [] } = useQuery<HistoryRow[]>({
    queryKey: ['plan-history', ...key],
    queryFn: () => planApi.history(subscriber!.kind, subscriber!.id),
    enabled: !!subscriber,
  });
  const { data: usage } = useQuery<MyPlan>({
    queryKey: ['plan-usage', ...key],
    queryFn: () => planApi.usage(subscriber!.kind, subscriber!.id),
    enabled: !!subscriber,
  });

  const assign = useMutation({
    mutationFn: () => planApi.assign(subscriber!.kind, subscriber!.id, { plan_id: planId!, note: note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-subscribers'] });
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      qc.invalidateQueries({ queryKey: ['plan-summary'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(t('admin.toast.assigned'));
      onClose();
    },
    onError: (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed')),
  });

  const options = plans.filter(p => p.audience === subscriber?.audience);

  return (
    <Modal isOpen={!!subscriber} onClose={onClose} size="lg" title={t('admin.assign.title', { name: subscriber?.name ?? '' })}>
      {subscriber && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                className={`text-left rounded-xl border-2 p-3 transition-colors ${planId === p.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-500">{formatPrice(p.price_monthly, p.currency)}</span>
                </div>
                <div className="flex gap-1.5 mt-1">
                  {p.id === subscriber.plan_id && <span className="badge-green">{t('current')}</span>}
                  {p.is_default && <span className="badge-blue">{t('default')}</span>}
                  {!p.is_active && <span className="badge-gray">{t('archived')}</span>}
                </div>
              </button>
            ))}
          </div>

          <div>
            <label className="label">{t('admin.assign.note')}</label>
            <input className="input" maxLength={500} placeholder={t('admin.assign.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.cancel')}</button>
            <button
              type="button"
              className="btn-primary"
              disabled={!planId || planId === subscriber.plan_id || assign.isPending}
              onClick={() => assign.mutate()}
            >
              {t('admin.assign.confirm')}
            </button>
          </div>

          {usage?.plan && Object.keys(usage.usage).length > 0 && (
            <div>
              <p className="section-title mb-2">{t('admin.assign.usage')}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {usage.features.filter(f => f.type === 'limit' && f.key in usage.usage).map(f => {
                  const limit = usage.plan!.features[f.key];
                  const used = usage.usage[f.key];
                  return (
                    <li key={f.key} className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                      <span className="text-gray-500">{t(`feature.${subscriber.audience}.${f.key}`, { defaultValue: f.label })}</span>
                      <span className={`block font-semibold ${typeof limit === 'number' && used >= limit ? 'text-red-600' : 'text-gray-900'}`}>
                        {limit === null ? t('usedUnlimited', { used }) : t('usedOf', { used, limit })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <p className="section-title mb-2">{t('admin.assign.history')}</p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">{t('admin.assign.noHistory')}</p>
            ) : (
              <ol className="space-y-2">
                {history.map(h => (
                  <li key={h.id} className="text-sm border-l-2 border-gray-200 pl-3">
                    <p className="text-gray-800">
                      {h.previous_plan_name ? <>{h.previous_plan_name} → </> : null}
                      <span className="font-semibold">{h.plan_name ?? '—'}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDateTime(h.created_at)} ·{' '}
                      {h.reason === 'registration' ? t('admin.assign.registration') : t('admin.assign.by', { name: h.assigned_by_name ?? '—' })}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
