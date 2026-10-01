import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { orderApi, supplierApi, medicineApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatCurrency, formatDate } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Orders() {
  const { t } = useTranslation('pharmacist');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const formModal = useModal();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: orders = [], isLoading } = useQuery({ queryKey: ['orders'], queryFn: orderApi.getAll });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: supplierApi.getAll });
  const { data: medicines = [] } = useQuery({ queryKey: ['medicines'], queryFn: () => medicineApi.getAll({}) });

  const { register, handleSubmit, control, reset } = useForm<any>({
    defaultValues: { items: [{ medicine_id: '', quantity: 1, unit_cost: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if ((location.state as any)?.autoOpen) {
      reset({ items: [{ medicine_id: '', quantity: 1, unit_cost: 0 }] });
      formModal.open();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useMutation({
    mutationFn: orderApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success(t('orders.toast.placed')); formModal.close(); reset(); },
    onError: (err: any) => toast.error(err.message || t('orders.toast.createFailed')),
  });

  const receiveMutation = useMutation({
    mutationFn: orderApi.receive,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['medicines'] }); toast.success(t('orders.toast.received')); },
    onError: (err: any) => toast.error(err.message || t('orders.toast.receiveFailed')),
  });

  const columns = [
    { key: 'id', header: '#' },
    { key: 'supplier_name', header: t('orders.columns.supplier') },
    { key: 'total_amount', header: tc('fields.total'), render: (r: any) => formatCurrency(r.total_amount) },
    { key: 'status', header: tc('fields.status'), render: (r: any) => (
      <span className={`badge ${STATUS_COLORS[r.status]}`}>{t(`orders.status.${r.status}`, { defaultValue: r.status })}</span>
    )},
    { key: 'ordered_at', header: tc('fields.date'), render: (r: any) => formatDate(r.ordered_at) },
    { key: 'actions', header: '', render: (r: any) => r.status === 'pending' && (
      <button className="btn-secondary text-xs py-1 px-2" onClick={() => receiveMutation.mutate(r.id)}>
        {t('orders.markReceived')}
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title={t('orders.pageTitle')}
        action={<button className="btn-primary" onClick={() => { reset({ items: [{ medicine_id: '', quantity: 1, unit_cost: 0 }] }); formModal.open(); }}>{t('orders.newButton')}</button>}
      />
      <Table columns={columns} data={orders} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={t('orders.modal.title')} size="xl">
        <form onSubmit={handleSubmit((d: any) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('orders.modal.supplier')}</label>
              <select className="input" {...register('supplier_id', { required: true })}>
                <option value="">{t('orders.modal.selectSupplier')}</option>
                {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('orders.modal.notes')}</label>
              <input className="input" {...register('notes')} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t('orders.modal.orderItems')}</label>
              <button type="button" className="btn-secondary text-xs py-1 px-2"
                onClick={() => append({ medicine_id: '', quantity: 1, unit_cost: 0 })}>
                {t('orders.modal.addItem')}
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-5">
                    <select className="input" {...register(`items.${i}.medicine_id`, { required: true })}>
                      <option value="">{t('orders.modal.selectMedicine')}</option>
                      {(medicines as any[]).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <input type="number" className="input" placeholder={t('orders.modal.qtyPlaceholder')} min={1} {...register(`items.${i}.quantity`, { required: true, min: 1 })} />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <input type="number" step="0.01" className="input" placeholder={t('orders.modal.unitCostPlaceholder')} {...register(`items.${i}.unit_cost`, { required: true })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-center">
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>{tc('actions.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('orders.modal.placing') : t('orders.modal.placeOrder')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
