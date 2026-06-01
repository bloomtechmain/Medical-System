import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { orderApi, supplierApi, medicineApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatCurrency, formatDate } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';

const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Orders() {
  const qc = useQueryClient();
  const formModal = useModal();

  const { data: orders = [], isLoading } = useQuery({ queryKey: ['orders'], queryFn: orderApi.getAll });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: supplierApi.getAll });
  const { data: medicines = [] } = useQuery({ queryKey: ['medicines'], queryFn: () => medicineApi.getAll({}) });

  const { register, handleSubmit, control, reset } = useForm({
    defaultValues: { items: [{ medicine_id: '', quantity: 1, unit_cost: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: orderApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Order placed'); formModal.close(); reset(); },
    onError: (err) => toast.error(err.message || 'Failed to create order'),
  });

  const receiveMutation = useMutation({
    mutationFn: orderApi.receive,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['medicines'] }); toast.success('Order received — stock updated'); },
    onError: (err) => toast.error(err.message || 'Failed to receive order'),
  });

  const columns = [
    { key: 'id', header: '#' },
    { key: 'supplier_name', header: 'Supplier' },
    { key: 'total_amount', header: 'Total', render: (r) => formatCurrency(r.total_amount) },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={`badge ${STATUS_COLORS[r.status]}`}>{r.status}</span>
    )},
    { key: 'ordered_at', header: 'Date', render: (r) => formatDate(r.ordered_at) },
    { key: 'actions', header: '', render: (r) => r.status === 'pending' && (
      <button className="btn-secondary text-xs py-1 px-2" onClick={() => receiveMutation.mutate(r.id)}>
        Mark Received
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        action={<button className="btn-primary" onClick={() => { reset({ items: [{ medicine_id: '', quantity: 1, unit_cost: 0 }] }); formModal.open(); }}>+ New Order</button>}
      />
      <Table columns={columns} data={orders} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="New Purchase Order" size="xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier *</label>
              <select className="input" {...register('supplier_id', { required: true })}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" {...register('notes')} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Order Items</label>
              <button type="button" className="btn-secondary text-xs py-1 px-2"
                onClick={() => append({ medicine_id: '', quantity: 1, unit_cost: 0 })}>
                + Add Item
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select className="input" {...register(`items.${i}.medicine_id`, { required: true })}>
                      <option value="">Select medicine</option>
                      {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" className="input" placeholder="Qty" min={1} {...register(`items.${i}.quantity`, { required: true, min: 1 })} />
                  </div>
                  <div className="col-span-3">
                    <input type="number" step="0.01" className="input" placeholder="Unit cost" {...register(`items.${i}.unit_cost`, { required: true })} />
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

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Placing...' : 'Place Order'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
