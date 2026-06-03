import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supplierApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Suppliers() {
  const qc = useQueryClient();
  const formModal = useModal<any>();
  const deleteModal = useModal<any>();

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: supplierApi.getAll });
  const { register, handleSubmit, reset } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      formModal.data ? supplierApi.update(formModal.data.id, data) : supplierApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(formModal.data ? 'Supplier updated' : 'Supplier added');
      formModal.close(); reset();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => supplierApi.remove(deleteModal.data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier deleted');
      deleteModal.close();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save'),
  });

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'contact', header: 'Contact Person' },
    { key: 'phone', header: 'Phone' },
    { key: 'email', header: 'Email' },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1 px-2" onClick={() => { reset(r); formModal.open(r); }}>Edit</button>
        <button className="btn-danger text-xs py-1 px-2" onClick={() => deleteModal.open(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        action={<button className="btn-primary" onClick={() => { reset({}); formModal.open(null); }}>+ Add Supplier</button>}
      />
      <Table columns={columns} data={suppliers} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={formModal.data ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="space-y-4">
          <div><label className="label">Name *</label><input className="input" {...register('name', { required: true })} /></div>
          <div><label className="label">Contact Person</label><input className="input" {...register('contact')} /></div>
          <div><label className="label">Phone</label><input className="input" {...register('phone')} /></div>
          <div><label className="label">Email</label><input type="email" className="input" {...register('email')} /></div>
          <div><label className="label">Address</label><textarea className="input" rows={2} {...register('address')} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModal.isOpen} onClose={deleteModal.close}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Supplier" message={`Delete "${deleteModal.data?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
