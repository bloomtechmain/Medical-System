import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, userApi } from '../services/api';
import PageHeader from '../components/common/PageHeader';

export default function LaboratorySettings() {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const profile = (me?.profile as any) || {};

  const { register, handleSubmit, reset } = useForm<any>();

  useEffect(() => {
    if (!me) return;
    reset({
      name: me.name || '',
      phone: profile.phone || '',
      lab_name: profile.lab_name || '',
      lab_type: profile.lab_type || '',
      license_number: profile.license_number || '',
      accreditation: profile.accreditation || '',
      address: profile.address || '',
      services_offered: profile.services_offered || '',
      operating_hours: profile.operating_hours || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const { name, ...profileFields } = data;
      return userApi.updateMyProfile({ name, profile: profileFields });
    },
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
              <label className="label">{tc('fields.phone')}</label>
              <input className="input" {...register('phone')} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('settings.sections.laboratory')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('settings.fields.labName')}</label>
              <input className="input" placeholder={t('settings.placeholders.labName')} {...register('lab_name')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.labType')}</label>
              <input className="input" placeholder={t('settings.placeholders.labType')} {...register('lab_type')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.licenseNumber')}</label>
              <input className="input" placeholder={t('settings.placeholders.licenseNumber')} {...register('license_number')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.accreditation')}</label>
              <input className="input" placeholder={t('settings.placeholders.accreditation')} {...register('accreditation')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.operatingHours')}</label>
              <input className="input" placeholder={t('settings.placeholders.operatingHours')} {...register('operating_hours')} />
            </div>
            <div>
              <label className="label">{tc('fields.address')}</label>
              <input className="input" {...register('address')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t('settings.fields.servicesOffered')}</label>
              <textarea className="input" rows={3} placeholder={t('settings.placeholders.servicesOffered')} {...register('services_offered')} />
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
