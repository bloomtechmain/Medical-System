import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { saleApi, medicineApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';

export default function Sales() {
  const { t } = useTranslation('pharmacist');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const formModal = useModal();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: sales = [], isLoading } = useQuery({ queryKey: ['sales'], queryFn: saleApi.getAll });
  const { data: medicines = [] } = useQuery({ queryKey: ['medicines'], queryFn: () => medicineApi.getAll({}) });

  const { register, handleSubmit, control, reset, watch } = useForm<any>({
    defaultValues: { items: [{ medicine_id: '', quantity: 1, unit_price: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const total = items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unit_price || 0), 0);

  useEffect(() => {
    if ((location.state as any)?.autoOpen) {
      reset({ payment_method: 'cash', items: [{ medicine_id: '', quantity: 1, unit_price: 0 }] });
      formModal.open();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useMutation({
    mutationFn: saleApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success(t('sales.toast.recorded'));
      formModal.close();
      reset();
    },
    onError: (err: any) => toast.error(err.message || t('sales.toast.recordFailed')),
  });

  const columns = [
    { key: 'id', header: '#' },
    { key: 'customer_name', header: t('sales.columns.customer'), render: (r: any) => r.customer_name || t('sales.columns.walkIn') },
    { key: 'total_amount', header: tc('fields.total'), render: (r: any) => formatCurrency(r.total_amount) },
    { key: 'payment_method', header: t('sales.columns.payment'), render: (r: any) => <span className="capitalize">{t(`sales.payment.${r.payment_method}`, { defaultValue: r.payment_method })}</span> },
    { key: 'sold_at', header: t('sales.columns.dateTime'), render: (r: any) => formatDateTime(r.sold_at) },
    { key: 'sold_by_name', header: t('sales.columns.soldBy') },
  ];

  return (
    <div>
      <PageHeader
        title={t('sales.pageTitle')}
        description={t('sales.pageDescription')}
        action={<button className="btn-primary" onClick={() => { reset({ payment_method: 'cash', items: [{ medicine_id: '', quantity: 1, unit_price: 0 }] }); formModal.open(); }}>{t('sales.newButton')}</button>}
      />
      <Table columns={columns} data={sales} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={t('sales.modal.title')} size="xl">
        <form onSubmit={handleSubmit((d: any) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('sales.modal.customerName')}</label>
              <input className="input" placeholder={t('sales.modal.customerPlaceholder')} {...register('customer_name')} />
            </div>
            <div>
              <label className="label">{t('sales.modal.paymentMethod')}</label>
              <select className="input" {...register('payment_method')}>
                <option value="cash">{t('sales.payment.cash')}</option>
                <option value="card">{t('sales.payment.card')}</option>
                <option value="online">{t('sales.payment.online')}</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t('sales.modal.items')}</label>
              <button type="button" className="btn-secondary text-xs py-1 px-2"
                onClick={() => append({ medicine_id: '', quantity: 1, unit_price: 0 })}>
                {t('sales.modal.addItem')}
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select className="input" {...register(`items.${i}.medicine_id`, { required: true })}>
                      <option value="">{t('sales.modal.selectMedicine')}</option>
                      {(medicines as any[]).map((m) => (
                        <option key={m.id} value={m.id}>{m.name} {t('sales.modal.stockSuffix', { count: m.stock_quantity })}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" className="input" placeholder={t('sales.modal.qtyPlaceholder')} min={1} {...register(`items.${i}.quantity`, { required: true, min: 1 })} />
                  </div>
                  <div className="col-span-3">
                    <input type="number" step="0.01" className="input" placeholder={t('sales.modal.unitPricePlaceholder')} {...register(`items.${i}.unit_price`, { required: true })} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-base font-semibold">{t('sales.modal.total', { amount: formatCurrency(total) })}</p>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={formModal.close}>{tc('actions.cancel')}</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('sales.modal.processing') : t('sales.modal.complete')}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
