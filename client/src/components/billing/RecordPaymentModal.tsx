import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarCheck } from 'lucide-react';
import Modal from '../common/Modal';
import { billingApi } from '../../services/api';
import { BillingAccount, PaymentMethod } from '../../types';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';

// Migration 016: the admin's "payment received". Shows exactly what the
// payment will do — the new paid-until date — before it is saved.

const METHODS: PaymentMethod[] = ['bank_transfer', 'cash', 'card', 'online', 'cheque', 'other'];

const addMonths = (from: Date, months: number): Date => {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
};

export const invalidateBilling = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of ['billing-overview', 'billing-accounts', 'billing-requests', 'billing-payments', 'plan-subscribers', 'my-plan', 'my-billing']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
};

export default function RecordPaymentModal({ account, onClose }: { account: BillingAccount | null; onClose: () => void }) {
  const { t } = useTranslation('billing');
  const qc = useQueryClient();
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setMonths(1); setMethod('bank_transfer'); setReference(''); setNote('');
    setAmount(account ? String(account.next_plan_effective_at && account.plan_expires_at && account.next_plan_effective_at <= account.plan_expires_at
      ? account.next_plan_price ?? account.price_monthly : account.price_monthly) : '');
  }, [account]);

  // Same rule as the server: from the old end date if still covered, else from now.
  const preview = useMemo(() => {
    if (!account) return null;
    const now = new Date();
    const end = account.plan_expires_at ? new Date(account.plan_expires_at) : null;
    const lapsed = !!account.plan_suspended_at || !end || end <= now;
    const start = lapsed ? now : end!;
    return { start, end: addMonths(start, months), lapsed };
  }, [account, months]);

  const unitPrice = account ? Number(account.next_plan_price && account.next_plan_effective_at && account.plan_expires_at
    && account.next_plan_effective_at <= account.plan_expires_at ? account.next_plan_price : account.price_monthly) : 0;

  const save = useMutation({
    mutationFn: () => billingApi.recordPayment(account!.kind, account!.id, {
      months, method,
      amount: amount.trim() === '' ? undefined : Number(amount),
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    }),
    onSuccess: (res: { message?: string }) => {
      toast.success(res?.message || t('admin.toast.paymentRecorded'), { duration: 6000 });
      invalidateBilling(qc);
      onClose();
    },
    onError: (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed')),
  });

  return (
    <Modal isOpen={!!account} onClose={onClose} title={t('admin.payment.title')}>
      {account && preview && (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
            <p className="font-bold text-gray-900">{account.name}</p>
            <p className="text-xs text-gray-500">{account.contact ?? '—'} · {account.plan_name} · {formatPrice(account.price_monthly, account.currency)} {t('perMonth')}</p>
            <p className="text-xs mt-1.5">
              {account.plan_suspended_at || (account.plan_expires_at && new Date(account.plan_expires_at) <= new Date())
                ? <span className="text-red-600 font-semibold">{t('admin.payment.lapsedSince', { date: formatDate(account.plan_expires_at) })}</span>
                : account.plan_expires_at
                  ? <span className="text-gray-600">{t('admin.payment.coveredUntil', { date: formatDate(account.plan_expires_at) })}</span>
                  : <span className="text-gray-600">{t('admin.payment.noPeriod')}</span>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('admin.payment.months')}</label>
              <select className="input" value={months} onChange={e => {
                const m = Number(e.target.value);
                setMonths(m);
                setAmount(String(Math.round(unitPrice * m * 100) / 100));
              }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{t('admin.payment.monthsOption', { count: m })}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('admin.payment.amount', { currency: account.currency })}</label>
              <input className="input" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('admin.payment.method')}</label>
              <select className="input" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                {METHODS.map(m => <option key={m} value={m}>{t(`method.${m}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('admin.payment.reference')}</label>
              <input className="input" maxLength={120} value={reference} placeholder={t('admin.payment.referencePlaceholder')} onChange={e => setReference(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{t('admin.payment.note')}</label>
            <textarea className="input resize-none" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 flex items-start gap-2">
            <CalendarCheck size={16} className="shrink-0 mt-0.5" />
            <span>
              {t('admin.payment.preview', { from: formatDate(preview.start.toISOString()), to: formatDate(preview.end.toISOString()) })}
              {preview.lapsed && <> {t('admin.payment.unlocks')}</>}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? t('admin.saving') : t('admin.payment.save')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
