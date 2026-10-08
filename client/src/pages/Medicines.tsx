import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { medicineApi, supplierApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { useDebounce } from '../hooks/useDebounce';
import { formatCurrency, formatDate, stockStatus } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Medicines() {
  const { t } = useTranslation('pharmacist');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const formModal = useModal<any>();
  const deleteModal = useModal<any>();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState((location.state as any)?.search || '');
  const debouncedSearch = useDebounce(search);

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ['medicines', debouncedSearch],
    queryFn: () => medicineApi.getAll({ search: debouncedSearch }),
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: supplierApi.getAll });

  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    const state = location.state as any;
    if (state?.autoOpen) {
      reset({});
      formModal.open(null);
    }
    if (state?.autoOpen || state?.search) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing a medicine no longer sends an absolute stock_quantity (see
  // medicineController.update) — only a relative adjustment, applied as a
  // separate call so a sale recorded between loading and saving this form
  // is never silently overwritten.
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (formModal.data) {
        const { stock_delta, ...rest } = data;
        const updated = await medicineApi.update(formModal.data.id, rest);
        const delta = parseInt(stock_delta, 10) || 0;
        return delta !== 0 ? medicineApi.adjustStock(formModal.data.id, delta) : updated;
      }
      return medicineApi.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success(formModal.data ? t('medicines.toast.updated') : t('medicines.toast.added'));
      formModal.close();
      reset();
    },
    onError: (err: any) => toast.error(err.message || t('medicines.toast.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => medicineApi.remove(deleteModal.data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success(t('medicines.toast.deleted'));
      deleteModal.close();
    },
    onError: (err: any) => toast.error(err.message || t('medicines.toast.deleteFailed')),
  });

  const handleEdit = (med: any) => { reset(med); formModal.open(med); };
  const handleAdd = () => { reset({}); formModal.open(null); };

  const columns = [
    { key: 'name', header: tc('fields.name') },
    { key: 'category', header: t('medicines.columns.category') },
    { key: 'stock_quantity', header: t('medicines.columns.stock'), render: (r: any) => {
      const s = stockStatus(r.stock_quantity, r.reorder_level);
      return <span className={`badge ${s.color}`}>{r.stock_quantity} ({s.label})</span>;
    }},
    { key: 'price', header: tc('fields.price'), render: (r: any) => formatCurrency(r.price) },
    { key: 'expiry_date', header: t('medicines.columns.expiry'), render: (r: any) => formatDate(r.expiry_date) },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1 px-2" onClick={() => handleEdit(r)}>{tc('actions.edit')}</button>
        <button className="btn-danger text-xs py-1 px-2" onClick={() => deleteModal.open(r)}>{tc('actions.delete')}</button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title={t('medicines.pageTitle')}
        description={t('medicines.pageDescription')}
        action={<button className="btn-primary" onClick={handleAdd}>{t('medicines.addButton')}</button>}
      />

      <div className="mb-4">
        <input className="input max-w-xs" placeholder={t('medicines.searchPlaceholder')} value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
      </div>

      <Table columns={columns} data={medicines} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={formModal.data ? t('medicines.modal.editTitle') : t('medicines.modal.addTitle')} size="lg">
        <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{t('medicines.modal.name')}</label>
            <input className="input" {...register('name', { required: true })} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.genericName')}</label>
            <input className="input" {...register('generic_name')} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.category')}</label>
            <input className="input" {...register('category')} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.unit')}</label>
            <select className="input" {...register('unit')}>
              <option value="tablet">{t('medicines.modal.units.tablet')}</option>
              <option value="capsule">{t('medicines.modal.units.capsule')}</option>
              <option value="syrup">{t('medicines.modal.units.syrup')}</option>
              <option value="injection">{t('medicines.modal.units.injection')}</option>
              <option value="cream">{t('medicines.modal.units.cream')}</option>
              <option value="drops">{t('medicines.modal.units.drops')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('medicines.modal.sellingPrice')}</label>
            <input type="number" step="0.01" className="input" {...register('price', { required: true })} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.costPrice')}</label>
            <input type="number" step="0.01" className="input" {...register('cost_price')} />
          </div>
          <div>
            {formModal.data ? (
              <>
                <label className="label">{t('medicines.modal.stockQuantity')} ({formModal.data.stock_quantity} {t('medicines.modal.currentSuffix', { defaultValue: 'current' })})</label>
                <input type="number" className="input" placeholder="+/- adjustment" {...register('stock_delta')} />
              </>
            ) : (
              <>
                <label className="label">{t('medicines.modal.stockQuantity')}</label>
                <input type="number" className="input" {...register('stock_quantity')} />
              </>
            )}
          </div>
          <div>
            <label className="label">{t('medicines.modal.reorderLevel')}</label>
            <input type="number" className="input" {...register('reorder_level')} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.expiryDate')}</label>
            <input type="date" className="input" {...register('expiry_date')} />
          </div>
          <div>
            <label className="label">{t('medicines.modal.supplier')}</label>
            <select className="input" {...register('supplier_id')}>
              <option value="">{t('medicines.modal.noneOption')}</option>
              {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">{t('medicines.modal.description')}</label>
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

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={() => deleteMutation.mutate()}
        title={t('medicines.deleteDialog.title')}
        message={t('medicines.deleteDialog.message', { name: deleteModal.data?.name })}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
