import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, userApi } from '../services/api';
import PageHeader from '../components/common/PageHeader';

export default function AdminSettings() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: authApi.me });

  const { register, handleSubmit, reset } = useForm<any>();

  useEffect(() => {
    if (!me) return;
    reset({ name: me.name || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const mutation = useMutation({
    mutationFn: (data: any) => userApi.updateMyProfile({ name: data.name }),
    onSuccess: () => {
      toast.success(t('settings.toastSuccess'));
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast.error(err.message || t('settings.toastError')),
  });

  if (isLoading) {
    return <div className="text-sm text-gray-400">{tc('actions.loading')}</div>;
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 max-w-3xl">
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('settings.sections.account')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{tc('fields.name')}</label>
              <input className="input" {...register('name', { required: true })} />
            </div>
            <div>
              <label className="label">{tc('fields.email')}</label>
              <input className="input" value={me?.email || ''} disabled />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button type="submit" className="btn-primary px-6 py-2.5" disabled={mutation.isPending}>
            {mutation.isPending ? tc('actions.saving') : tc('actions.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
