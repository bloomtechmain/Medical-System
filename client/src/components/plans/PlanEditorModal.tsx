import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ShieldCheck, LayoutDashboard } from 'lucide-react';
import Modal from '../common/Modal';
import { planApi } from '../../services/api';
import { Plan, PlanAudience, PlanFeatureDefinition, PlanFeatureValues } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  audience: PlanAudience;
  features: PlanFeatureDefinition[];
  /** null = create a new package */
  plan: Plan | null;
}

interface FormState {
  name: string;
  code: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  currency: string;
  sort_order: string;
  features: PlanFeatureValues;
}

const blankFeatures = (defs: PlanFeatureDefinition[]): PlanFeatureValues =>
  Object.fromEntries(defs.map(d => [d.key, d.fallback]));

const toForm = (plan: Plan | null, defs: PlanFeatureDefinition[]): FormState => ({
  name: plan?.name ?? '',
  code: plan?.code ?? '',
  description: plan?.description ?? '',
  price_monthly: String(plan?.price_monthly ?? 0),
  price_yearly: plan?.price_yearly == null ? '' : String(plan.price_yearly),
  currency: plan?.currency ?? 'LKR',
  sort_order: String(plan?.sort_order ?? 0),
  features: { ...blankFeatures(defs), ...(plan?.features ?? {}) },
});

/** Create or edit a package: its price and every catalogue feature/limit. */
export default function PlanEditorModal({ isOpen, onClose, audience, features, plan }: Props) {
  const { t } = useTranslation('plans');
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(plan, features));

  useEffect(() => { if (isOpen) setForm(toForm(plan, features)); }, [isOpen, plan, features]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));
  const setFeature = (key: string, value: boolean | number | null) =>
    setForm(f => ({ ...f, features: { ...f.features, [key]: value } }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_monthly: Number(form.price_monthly) || 0,
        price_yearly: form.price_yearly === '' ? null : Number(form.price_yearly),
        currency: form.currency.trim().toUpperCase() || 'LKR',
        sort_order: Number(form.sort_order) || 0,
        features: form.features,
      };
      return plan
        ? planApi.update(plan.id, body)
        : planApi.create({ ...body, audience, code: form.code.trim().toLowerCase() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      qc.invalidateQueries({ queryKey: ['plan-summary'] });
      qc.invalidateQueries({ queryKey: ['public-plans'] });
      qc.invalidateQueries({ queryKey: ['my-plan'] });
      toast.success(plan ? t('admin.toast.saved') : t('admin.toast.created'));
      onClose();
    },
    onError: (err: { message?: string; errors?: { msg: string }[] }) =>
      toast.error(err.errors?.[0]?.msg || err.message || t('admin.toast.failed')),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={plan ? `${t('admin.edit')} — ${plan.name}` : `${t('admin.newPackage')} — ${t(`audienceOne.${audience}`)}`}
    >
      <form
        className="space-y-6"
        onSubmit={e => { e.preventDefault(); save.mutate(); }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('admin.fields.name')}</label>
            <input className="input" required maxLength={80} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">{t('admin.fields.code')}</label>
            <input
              className="input disabled:bg-gray-50 disabled:text-gray-400"
              required={!plan}
              disabled={!!plan}
              pattern="[a-z0-9_-]{2,40}"
              value={form.code}
              onChange={e => set('code', e.target.value)}
            />
            {!plan && <p className="text-xs text-gray-400 mt-1">{t('admin.fields.codeHint')}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('admin.fields.description')}</label>
            <textarea className="input resize-none" rows={2} maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label">{t('admin.fields.priceMonthly')}</label>
            <input className="input" type="number" min={0} step="0.01" value={form.price_monthly} onChange={e => set('price_monthly', e.target.value)} />
          </div>
          <div>
            <label className="label">{t('admin.fields.priceYearly')}</label>
            <input className="input" type="number" min={0} step="0.01" value={form.price_yearly} onChange={e => set('price_yearly', e.target.value)} />
          </div>
          <div>
            <label className="label">{t('admin.fields.currency')}</label>
            <input className="input uppercase" maxLength={3} minLength={3} value={form.currency} onChange={e => set('currency', e.target.value)} />
          </div>
          <div>
            <label className="label">{t('admin.fields.sortOrder')}</label>
            <input className="input" type="number" min={0} max={1000} value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
          </div>
        </div>

        <div>
          <p className="section-title mb-3">{t('my.features')}</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl">
            {features.map(def => {
              const value = form.features[def.key];
              const label = t(`feature.${audience}.${def.key}`, { defaultValue: def.label });
              return (
                <div key={def.key} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-500">{def.description}</p>
                    <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                      {def.enforcedBy === 'server'
                        ? <><ShieldCheck size={12} /> {t('admin.serverEnforced')}</>
                        : <><LayoutDashboard size={12} /> {t('admin.dashboardEnforced')}</>}
                    </p>
                  </div>
                  {def.type === 'boolean' ? (
                    <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={value === true}
                        onChange={e => setFeature(def.key, e.target.checked)}
                      />
                      <span className="w-10 h-6 rounded-full bg-gray-200 peer-checked:bg-primary-600 relative transition-colors
                        after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform
                        peer-checked:after:translate-x-4" />
                      <span className="text-xs font-medium text-gray-600 w-20">{value ? t('included') : t('notIncluded')}</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        className="input w-28 disabled:bg-gray-50 disabled:text-gray-300"
                        disabled={value === null}
                        value={value === null ? '' : String(value ?? 0)}
                        onChange={e => setFeature(def.key, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={value === null}
                          onChange={e => setFeature(def.key, e.target.checked ? null : 0)}
                        />
                        {t('admin.fields.unlimited')}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
