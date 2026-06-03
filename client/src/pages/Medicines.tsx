import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { medicineApi, supplierApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { useDebounce } from '../hooks/useDebounce';
import { formatCurrency, formatDate, stockStatus } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Medicines() {
  const qc = useQueryClient();
  const formModal = useModal<any>();
  const deleteModal = useModal<any>();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ['medicines', debouncedSearch],
    queryFn: () => medicineApi.getAll({ search: debouncedSearch }),
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: supplierApi.getAll });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      formModal.data ? medicineApi.update(formModal.data.id, data) : medicineApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success(formModal.data ? 'Medicine updated' : 'Medicine added');
      formModal.close();
      reset();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => medicineApi.remove(deleteModal.data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      toast.success('Medicine deleted');
      deleteModal.close();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete'),
  });

  const handleEdit = (med: any) => { reset(med); formModal.open(med); };
  const handleAdd = () => { reset({}); formModal.open(null); };

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'category', header: 'Category' },
    { key: 'stock_quantity', header: 'Stock', render: (r: any) => {
      const s = stockStatus(r.stock_quantity, r.reorder_level);
      return <span className={`badge ${s.color}`}>{r.stock_quantity} ({s.label})</span>;
    }},
    { key: 'price', header: 'Price', render: (r: any) => formatCurrency(r.price) },
    { key: 'expiry_date', header: 'Expiry', render: (r: any) => formatDate(r.expiry_date) },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1 px-2" onClick={() => handleEdit(r)}>Edit</button>
        <button className="btn-danger text-xs py-1 px-2" onClick={() => deleteModal.open(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Medicines"
        description="Manage medicine inventory"
        action={<button className="btn-primary" onClick={handleAdd}>+ Add Medicine</button>}
      />

      <div className="mb-4">
        <input className="input max-w-xs" placeholder="Search medicines..." value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
      </div>

      <Table columns={columns} data={medicines} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={formModal.data ? 'Edit Medicine' : 'Add Medicine'} size="lg">
        <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: true })} />
          </div>
          <div>
            <label className="label">Generic Name</label>
            <input className="input" {...register('generic_name')} />
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" {...register('category')} />
          </div>
          <div>
            <label className="label">Unit</label>
            <select className="input" {...register('unit')}>
              <option value="tablet">Tablet</option>
              <option value="capsule">Capsule</option>
              <option value="syrup">Syrup</option>
              <option value="injection">Injection</option>
              <option value="cream">Cream</option>
              <option value="drops">Drops</option>
            </select>
          </div>
          <div>
            <label className="label">Selling Price (LKR) *</label>
            <input type="number" step="0.01" className="input" {...register('price', { required: true })} />
          </div>
          <div>
            <label className="label">Cost Price (LKR)</label>
            <input type="number" step="0.01" className="input" {...register('cost_price')} />
          </div>
          <div>
            <label className="label">Stock Quantity</label>
            <input type="number" className="input" {...register('stock_quantity')} />
          </div>
          <div>
            <label className="label">Reorder Level</label>
            <input type="number" className="input" {...register('reorder_level')} />
          </div>
          <div>
            <label className="label">Expiry Date</label>
            <input type="date" className="input" {...register('expiry_date')} />
          </div>
          <div>
            <label className="label">Supplier</label>
            <select className="input" {...register('supplier_id')}>
              <option value="">— None —</option>
              {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea className="input" rows={2} {...register('description')} />
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Medicine"
        message={`Are you sure you want to delete "${deleteModal.data?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
