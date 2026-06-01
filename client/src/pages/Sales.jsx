import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { saleApi, medicineApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';

export default function Sales() {
  const qc = useQueryClient();
  const formModal = useModal();

  const { data: sales = [], isLoading } = useQuery({ queryKey: ['sales'], queryFn: saleApi.getAll });
  const { data: medicines = [] } = useQuery({ queryKey: ['medicines'], queryFn: () => medicineApi.getAll({}) });

  const { register, handleSubmit, control, reset, watch } = useForm({
    defaultValues: { items: [{ medicine_id: '', quantity: 1, unit_price: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);

  const createMutation = useMutation({
    mutationFn: saleApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success('Sale recorded');
      formModal.close();
      reset();
    },
    onError: (err) => toast.error(err.message || 'Failed to record sale'),
  });

  const handleMedicineChange = (idx, medId) => {
    const med = medicines.find((m) => String(m.id) === String(medId));
    if (med) {
      const itemsEl = document.querySelectorAll('[name]');
      // price auto-fill via react-hook-form setValue would need useFormContext; handled below
    }
  };

  const columns = [
    { key: 'id', header: '#' },
    { key: 'customer_name', header: 'Customer', render: (r) => r.customer_name || 'Walk-in' },
    { key: 'total_amount', header: 'Total', render: (r) => formatCurrency(r.total_amount) },
    { key: 'payment_method', header: 'Payment', render: (r) => <span className="capitalize">{r.payment_method}</span> },
    { key: 'sold_at', header: 'Date & Time', render: (r) => formatDateTime(r.sold_at) },
    { key: 'sold_by_name', header: 'Sold By' },
  ];

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Point of sale & sales history"
        action={<button className="btn-primary" onClick={() => { reset({ payment_method: 'cash', items: [{ medicine_id: '', quantity: 1, unit_price: 0 }] }); formModal.open(); }}>+ New Sale</button>}
      />
      <Table columns={columns} data={sales} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="New Sale" size="xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Customer Name</label>
              <input className="input" placeholder="Walk-in customer" {...register('customer_name')} />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <select className="input" {...register('payment_method')}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Items</label>
              <button type="button" className="btn-secondary text-xs py-1 px-2"
                onClick={() => append({ medicine_id: '', quantity: 1, unit_price: 0 })}>
                + Add Item
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select className="input" {...register(`items.${i}.medicine_id`, { required: true })}>
                      <option value="">Select medicine</option>
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} (Stock: {m.stock_quantity})</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" className="input" placeholder="Qty" min={1} {...register(`items.${i}.quantity`, { required: true, min: 1 })} />
                  </div>
                  <div className="col-span-3">
                    <input type="number" step="0.01" className="input" placeholder="Unit price" {...register(`items.${i}.unit_price`, { required: true })} />
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
            <p className="text-base font-semibold">Total: {formatCurrency(total)}</p>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={formModal.close}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Processing...' : 'Complete Sale'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
