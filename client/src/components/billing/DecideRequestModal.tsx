import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import { billingApi } from '../../services/api';
import { PlanChangeRequest } from '../../types';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';
import { invalidateBilling } from './RecordPaymentModal';

// Migration 016: an admin approves or rejects an upgrade/downgrade request.
// Approval defaults to "from the next billing period"; "now" is there for the
// cases where waiting makes no sense (e.g. the account asked to upgrade
// mid-month and has already paid the difference).

export default function DecideRequestModal({ request, mode, onClose }: {
  request: PlanChangeRequest | null;
  mode: 'approve' | 'reject';
  onClose: () => void;
}) {
  const { t } = useTranslation('billing');
  const qc = useQueryClient();
  const [timing, setTiming] = useState<'next_period' | 'now'>('next_period');
  const [note, setNote] = useState('');
  useEffect(() => { setTiming('next_period'); setNote(''); }, [request, mode]);

  const running = !!request?.plan_expires_at && !request.plan_suspended_at && new Date(request.plan_expires_at) > new Date()
    && (request.from_plan_price ?? 0) > 0;

  const decide = useMutation({
    mutationFn: () => mode === 'approve'
      ? billingApi.approveRequest(request!.id, { timing: running ? timing : 'now', note: note.trim() || undefined })
      : billingApi.rejectRequest(request!.id, note.trim() || undefined),
    onSuccess: (res: { message?: string }) => {
      toast.success(res?.message || t('admin.toast.decided'));
      invalidateBilling(qc);
      onClose();
    },
    onError: (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed')),
  });

  return (
    <Modal isOpen={!!request} onClose={onClose} title={mode === 'approve' ? t('admin.decide.approveTitle') : t('admin.decide.rejectTitle')}>
      {request && (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 text-sm">
            <p className="font-bold text-gray-900">{request.account_name}</p>
            <p className="text-gray-600 mt-0.5">
              {t(`direction.${request.direction}`)}: <b>{request.from_plan_name ?? '—'}</b> ({formatPrice(request.from_plan_price ?? 0, request.currency)})
              {' → '}<b>{request.to_plan_name}</b> ({formatPrice(request.to_plan_price, request.currency)})
            </p>
            {request.message && <p className="text-xs text-gray-500 mt-1.5 italic">“{request.message}”</p>}
          </div>

          {mode === 'approve' && (running ? (
            <fieldset className="space-y-2">
              <legend className="label">{t('admin.decide.when')}</legend>
              <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 cursor-pointer has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50/50">
                <input type="radio" className="mt-1" checked={timing === 'next_period'} onChange={() => setTiming('next_period')} />
                <span className="text-sm">
                  <b>{t('admin.decide.nextPeriod', { date: formatDate(request.plan_expires_at) })}</b>
                  <span className="block text-xs text-gray-500">{t('admin.decide.nextPeriodHint')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 cursor-pointer has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50/50">
                <input type="radio" className="mt-1" checked={timing === 'now'} onChange={() => setTiming('now')} />
                <span className="text-sm">
                  <b>{t('admin.decide.now')}</b>
                  <span className="block text-xs text-gray-500">{t('admin.decide.nowHint')}</span>
                </span>
              </label>
            </fieldset>
          ) : (
            <p className="text-sm text-gray-600">{t('admin.decide.immediate')}</p>
          ))}

          <div>
            <label className="label">{mode === 'approve' ? t('admin.decide.noteOptional') : t('admin.decide.reason')}</label>
            <textarea className="input resize-none" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.cancel')}</button>
            <button type="button" className={mode === 'approve' ? 'btn-primary' : 'btn-danger'} disabled={decide.isPending} onClick={() => decide.mutate()}>
              {decide.isPending ? t('admin.saving') : mode === 'approve' ? t('admin.decide.approve') : t('admin.decide.reject')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
