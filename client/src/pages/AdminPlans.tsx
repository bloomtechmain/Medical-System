import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Pencil, Star, Archive, ArchiveRestore, Trash2, Users as UsersIcon, Search } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import PlanCard from '../components/plans/PlanCard';
import PlanEditorModal from '../components/plans/PlanEditorModal';
import AssignPlanModal from '../components/plans/AssignPlanModal';
import { planApi } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Plan, PlanAudience, PlanFeatureDefinition, PlanSubscriber } from '../types';
import { PLAN_AUDIENCES, formatPrice } from '../constants/plans';
import { formatDate } from '../utils/helpers';

// Migration 014: the main dashboard's control over packages — define them per
// dashboard type, set what each includes, and see/change who is on which.

const PAGE = 50;

export default function AdminPlans() {
  const { t } = useTranslation('plans');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'subscribers' ? 'subscribers' : 'packages';
  const audience = (PLAN_AUDIENCES.includes(params.get('audience') as PlanAudience) ? params.get('audience') : 'doctor') as PlanAudience;

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const { data: catalog = [] } = useQuery<{ audience: PlanAudience; features: PlanFeatureDefinition[] }[]>({
    queryKey: ['plan-catalog'],
    queryFn: planApi.catalog,
    staleTime: Infinity,
  });
  const { data: plans = [], isLoading } = useQuery<Plan[]>({ queryKey: ['admin-plans'], queryFn: planApi.listAll });

  const featuresFor = (a: PlanAudience) => catalog.find(c => c.audience === a)?.features ?? [];

  return (
    <div className="max-w-7xl">
      <PageHeader title={t('admin.title')} description={t('admin.subtitle')} />

      <div className="flex gap-2 mb-5 border-b border-gray-200">
        {(['packages', 'subscribers'] as const).map(key => (
          <button
            key={key}
            onClick={() => setParam({ tab: key === 'packages' ? null : key })}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {key === 'packages' ? t('admin.tabPackages') : t('admin.tabSubscribers')}
          </button>
        ))}
      </div>

      {tab === 'packages' ? (
        <PackagesTab
          audience={audience}
          onAudience={a => setParam({ audience: a })}
          plans={plans.filter(p => p.audience === audience)}
          features={featuresFor(audience)}
          loading={isLoading}
          onShowSubscribers={p => setParam({ tab: 'subscribers', audience: p.audience, plan_id: String(p.id) })}
          invalidate={() => {
            qc.invalidateQueries({ queryKey: ['admin-plans'] });
            qc.invalidateQueries({ queryKey: ['plan-summary'] });
            qc.invalidateQueries({ queryKey: ['public-plans'] });
          }}
        />
      ) : (
        <SubscribersTab plans={plans} params={params} setParam={setParam} />
      )}
    </div>
  );
}

// ── Packages ─────────────────────────────────────────────────────────────────

function PackagesTab({ audience, onAudience, plans, features, loading, onShowSubscribers, invalidate }: {
  audience: PlanAudience;
  onAudience: (a: PlanAudience) => void;
  plans: Plan[];
  features: PlanFeatureDefinition[];
  loading: boolean;
  onShowSubscribers: (p: Plan) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation('plans');
  const [editing, setEditing] = useState<Plan | null | 'new'>(null);

  const onError = (err: { message?: string }) => toast.error(err.message || t('admin.toast.failed'));
  const makeDefault = useMutation({
    mutationFn: (p: Plan) => planApi.makeDefault(p.id),
    onSuccess: () => { invalidate(); toast.success(t('admin.toast.defaultChanged')); },
    onError,
  });
  const toggleActive = useMutation({
    mutationFn: (p: Plan) => planApi.update(p.id, { is_active: !p.is_active }),
    onSuccess: () => { invalidate(); toast.success(t('admin.toast.saved')); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (p: Plan) => planApi.remove(p.id),
    onSuccess: () => { invalidate(); toast.success(t('admin.toast.deleted')); },
    onError,
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {PLAN_AUDIENCES.map(a => (
            <button
              key={a}
              onClick={() => onAudience(a)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                a === audience ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {t(`audience.${a}`)}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> {t('admin.newPackage')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('picker.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((p, i) => (
            <div key={p.id} className={p.is_active ? '' : 'opacity-70'}>
              <PlanCard
                plan={p}
                features={features}
                tierIndex={i}
                footer={
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.is_default && <span className="badge-blue">{t('default')}</span>}
                      {!p.is_active && <span className="badge-gray">{t('archived')}</span>}
                      <button
                        type="button"
                        onClick={() => onShowSubscribers(p)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                      >
                        <UsersIcon size={13} /> {t('admin.subscribers', { count: p.subscribers ?? 0 })}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setEditing(p)}>
                        <Pencil size={13} /> {t('admin.edit')}
                      </button>
                      {!p.is_default && (
                        <button
                          className="btn-secondary !px-3 !py-1.5 text-xs"
                          disabled={makeDefault.isPending}
                          onClick={() => window.confirm(t('admin.confirmDefault', { name: p.name, audience: t(`audience.${p.audience}`) })) && makeDefault.mutate(p)}
                        >
                          <Star size={13} /> {t('admin.makeDefault')}
                        </button>
                      )}
                      {!p.is_default && (
                        <button className="btn-secondary !px-3 !py-1.5 text-xs" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(p)}>
                          {p.is_active ? <><Archive size={13} /> {t('admin.archive')}</> : <><ArchiveRestore size={13} /> {t('admin.restore')}</>}
                        </button>
                      )}
                      {!p.is_default && (p.subscribers ?? 0) === 0 && (
                        <button
                          className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:bg-red-50"
                          disabled={remove.isPending}
                          onClick={() => window.confirm(t('admin.confirmDelete', { name: p.name })) && remove.mutate(p)}
                        >
                          <Trash2 size={13} /> {t('admin.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                }
              />
            </div>
          ))}
        </div>
      )}

      <PlanEditorModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        audience={audience}
        features={features}
        plan={editing === 'new' ? null : editing}
      />
    </>
  );
}

// ── Subscribers ──────────────────────────────────────────────────────────────

function SubscribersTab({ plans, params, setParam }: {
  plans: Plan[];
  params: URLSearchParams;
  setParam: (changes: Record<string, string | null>) => void;
}) {
  const { t } = useTranslation('plans');
  const audience = params.get('audience') ?? '';
  const planId = params.get('plan_id') ?? '';
  const kind = params.get('kind') ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 350);
  const [limit, setLimit] = useState(PAGE);
  const [assigning, setAssigning] = useState<PlanSubscriber | null>(null);

  const filters = useMemo(() => ({
    audience: audience || undefined, plan_id: planId || undefined, kind: kind || undefined, q: q || undefined, limit, offset: 0,
  }), [audience, planId, kind, q, limit]);

  const { data, isLoading } = useQuery<{ total: number; rows: PlanSubscriber[] }>({
    queryKey: ['plan-subscribers', filters],
    queryFn: () => planApi.subscribers(filters),
    placeholderData: prev => prev,
  });
  const rows = data?.rows ?? [];
  const planOptions = plans.filter(p => !audience || p.audience === audience);

  const statusBadge = (s: PlanSubscriber) => {
    if (s.is_active) return <span className="badge-green">{t('admin.table.active')}</span>;
    if (!s.approved_at) return <span className="badge-yellow">{t('admin.table.pending')}</span>;
    return <span className="badge-gray">{t('admin.table.inactive')}</span>;
  };

  return (
    <>
      <div className="card !p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select className="input" value={audience} onChange={e => { setParam({ audience: e.target.value, plan_id: null }); setLimit(PAGE); }}>
          <option value="">{t('admin.filters.allTypes')}</option>
          {PLAN_AUDIENCES.map(a => <option key={a} value={a}>{t(`audience.${a}`)}</option>)}
        </select>
        <select className="input" value={planId} onChange={e => { setParam({ plan_id: e.target.value }); setLimit(PAGE); }}>
          <option value="">{t('admin.filters.allPackages')}</option>
          {planOptions.map(p => (
            <option key={p.id} value={p.id}>{audience ? p.name : `${t(`audienceOne.${p.audience}`)} — ${p.name}`}</option>
          ))}
        </select>
        <select className="input" value={kind} onChange={e => { setParam({ kind: e.target.value }); setLimit(PAGE); }}>
          <option value="">{t('admin.filters.allKinds')}</option>
          <option value="user">{t('admin.filters.individuals')}</option>
          <option value="organization">{t('admin.filters.organizations')}</option>
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder={t('admin.filters.search')} value={search} onChange={e => { setSearch(e.target.value); setLimit(PAGE); }} />
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">{t('admin.table.account')}</th>
                <th className="px-4 py-3">{t('admin.table.type')}</th>
                <th className="px-4 py-3">{t('admin.table.package')}</th>
                <th className="px-4 py-3">{t('admin.table.status')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('admin.table.since')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('admin.table.changed')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t('admin.table.empty')}</td></tr>
              )}
              {rows.map(s => (
                <tr key={`${s.kind}-${s.id}`} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.contact ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-gray">{t(`audienceOne.${s.audience}`)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{s.plan_name}</p>
                    <p className="text-xs text-gray-500">
                      {formatPrice(s.price_monthly, s.currency)}{s.price_monthly > 0 ? ` ${t('perMonth')}` : ''}
                      {s.on_default ? ` · ${t('admin.table.onDefault')}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">{statusBadge(s)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(s.plan_changed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-secondary !px-3 !py-1.5 text-xs whitespace-nowrap" onClick={() => setAssigning(s)}>
                      {t('admin.table.actions')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{t('admin.table.showing', { shown: rows.length, total: data.total })}</span>
            {rows.length < data.total && (
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setLimit(l => l + PAGE)}>
                {t('admin.table.loadMore')}
              </button>
            )}
          </div>
        )}
      </div>

      <AssignPlanModal subscriber={assigning} plans={plans} onClose={() => setAssigning(null)} />
    </>
  );
}
