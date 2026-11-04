import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { labCatalogApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatCurrency } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';

export default function LaboratoryCatalog() {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const formModal = useModal<any>();
  const [search, setSearch] = useState('');

  const { data: tests = [], isLoading } = useQuery({ queryKey: ['lab-catalog'], queryFn: labCatalogApi.getMine });
  const { register, handleSubmit, reset } = useForm();

  const filtered = (tests as any[]).filter((r: any) =>
    !search.trim() || r.test_name.toLowerCase().includes(search.toLowerCase()) || r.test_code.toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      formModal.data ? labCatalogApi.update(formModal.data.id, data) : labCatalogApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-catalog'] });
      toast.success(formModal.data ? t('catalog.toast.updated') : t('catalog.toast.added'));
      formModal.close();
      reset();
    },
    onError: (err: any) => toast.error(err.message || t('catalog.toast.saveFailed')),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => labCatalogApi.toggleActive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lab-catalog'] }); toast.success(t('catalog.toast.statusUpdated')); },
    onError: (err: any) => toast.error(err.message || t('catalog.toast.saveFailed')),
  });

  const handleEdit = (row: any) => { reset(row); formModal.open(row); };
  const handleAdd  = () => { reset({}); formModal.open(null); };

  const columns = [
    { key: 'test_code', header: t('catalog.columns.code') },
    { key: 'test_name', header: t('catalog.columns.testName') },
    { key: 'price', header: tc('fields.price'), render: (r: any) => formatCurrency(r.price) },
    { key: 'turnaround_hours', header: t('catalog.columns.turnaround'), render: (r: any) => r.turnaround_hours ? t('catalog.columns.hoursValue', { count: r.turnaround_hours }) : '—' },
    { key: 'is_active', header: tc('fields.status'), render: (r: any) => (
      <span className={`badge ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
        {r.is_active ? tc('status.active') : t('catalog.inactive')}
      </span>
    )},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1 px-2" onClick={() => handleEdit(r)}>{tc('actions.edit')}</button>
        <button className="btn-danger text-xs py-1 px-2" onClick={() => toggleMutation.mutate(r.id)}>
          {r.is_active ? t('catalog.deactivateButton') : t('catalog.activateButton')}
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title={t('catalog.pageTitle')}
        description={t('catalog.pageDescription')}
        action={
          <button
            type="button"
            onClick={handleAdd}
            className="group inline-flex items-center gap-2.5 rounded-xl pl-2 pr-5 py-2 text-sm font-semibold text-white
                       bg-gradient-to-r from-[#1598E9] to-[#13A58F] shadow-md shadow-teal-600/20
                       transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-600/30
                       active:translate-y-0 active:shadow-sm
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/30
                             transition-transform duration-200 group-hover:rotate-90">
              <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
            </span>
            {t('catalog.addButton')}
          </button>
        }
      />

      <div className="mb-4">
        <input className="input max-w-xs" placeholder={t('catalog.searchPlaceholder')} value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
      </div>

      <Table columns={columns} data={filtered} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={formModal.data ? t('catalog.modal.editTitle') : t('catalog.modal.addTitle')}>
        <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('catalog.modal.testCode')}</label>
            <input className="input" placeholder={t('catalog.modal.testCodePlaceholder')} {...register('test_code', { required: true })} />
          </div>
          <div>
            <label className="label">{t('catalog.modal.testName')}</label>
            <input className="input" placeholder={t('catalog.modal.testNamePlaceholder')} {...register('test_name', { required: true })} />
          </div>
          <div>
            <label className="label">{t('catalog.modal.price')}</label>
            <input type="number" step="0.01" min="0" className="input" {...register('price', { required: true })} />
          </div>
          <div>
            <label className="label">{t('catalog.modal.turnaroundHours')} <span className="text-gray-400 font-normal">{t('catalog.modal.optional')}</span></label>
            <input type="number" min="0" className="input" {...register('turnaround_hours')} />
          </div>
          <div className="col-span-2">
            <label className="label">{t('catalog.modal.description')} <span className="text-gray-400 font-normal">{t('catalog.modal.optional')}</span></label>
            <textarea className="input" rows={2} {...register('description')} />
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>{tc('actions.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tc('actions.saving') : tc('actions.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
