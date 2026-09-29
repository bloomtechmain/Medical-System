import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { supplierApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Suppliers() {
  const { t } = useTranslation('pharmacist');
  const { t: tc } = useTranslation('common');
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
      toast.success(formModal.data ? t('suppliers.toast.updated') : t('suppliers.toast.added'));
      formModal.close(); reset();
    },
    onError: (err: any) => toast.error(err.message || t('suppliers.toast.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => supplierApi.remove(deleteModal.data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(t('suppliers.toast.deleted'));
      deleteModal.close();
    },
    onError: (err: any) => toast.error(err.message || t('suppliers.toast.saveFailed')),
  });

  const columns = [
    { key: 'name', header: tc('fields.name') },
    { key: 'contact', header: t('suppliers.columns.contactPerson') },
    { key: 'phone', header: tc('fields.phone') },
    { key: 'email', header: tc('fields.email') },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1 px-2" onClick={() => { reset(r); formModal.open(r); }}>{tc('actions.edit')}</button>
        <button className="btn-danger text-xs py-1 px-2" onClick={() => deleteModal.open(r)}>{tc('actions.delete')}</button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title={t('suppliers.pageTitle')}
        action={<button className="btn-primary" onClick={() => { reset({}); formModal.open(null); }}>{t('suppliers.addButton')}</button>}
      />
      <Table columns={columns} data={suppliers} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title={formModal.data ? t('suppliers.modal.editTitle') : t('suppliers.modal.addTitle')}>
        <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="space-y-4">
          <div><label className="label">{t('suppliers.modal.name')}</label><input className="input" {...register('name', { required: true })} /></div>
          <div><label className="label">{t('suppliers.modal.contactPerson')}</label><input className="input" {...register('contact')} /></div>
          <div><label className="label">{tc('fields.phone')}</label><input className="input" {...register('phone')} /></div>
          <div><label className="label">{tc('fields.email')}</label><input type="email" className="input" {...register('email')} /></div>
          <div><label className="label">{t('suppliers.modal.address')}</label><textarea className="input" rows={2} {...register('address')} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>{tc('actions.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tc('actions.saving') : tc('actions.save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModal.isOpen} onClose={deleteModal.close}
        onConfirm={() => deleteMutation.mutate()}
        title={t('suppliers.deleteDialog.title')} message={t('suppliers.deleteDialog.message', { name: deleteModal.data?.name })}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
