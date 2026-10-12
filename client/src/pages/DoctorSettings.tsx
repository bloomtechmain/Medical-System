import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, userApi } from '../services/api';
import PageHeader from '../components/common/PageHeader';

export default function DoctorSettings() {
  const { t } = useTranslation('doctorCore');
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
      specialization: profile.specialization || '',
      license_number: profile.license_number || '',
      hospital_affiliation: profile.hospital_affiliation || '',
      consultation_fee: profile.consultation_fee ?? '',
      years_experience: profile.years_experience ?? '',
      medical_school: profile.medical_school || '',
      bio: profile.bio || '',
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
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('settings.sections.professional')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('settings.fields.specialization')}</label>
              <input className="input" placeholder={t('settings.placeholders.specialization')} {...register('specialization')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.licenseNumber')}</label>
              <input className="input" placeholder={t('settings.placeholders.licenseNumber')} {...register('license_number')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.hospitalAffiliation')}</label>
              <input className="input" placeholder={t('settings.placeholders.hospitalAffiliation')} {...register('hospital_affiliation')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.consultationFee')}</label>
              <input type="number" step="0.01" className="input" {...register('consultation_fee')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.yearsExperience')}</label>
              <input type="number" className="input" {...register('years_experience')} />
            </div>
            <div>
              <label className="label">{t('settings.fields.medicalSchool')}</label>
              <input className="input" placeholder={t('settings.placeholders.medicalSchool')} {...register('medical_school')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t('settings.fields.bio')}</label>
              <textarea className="input" rows={3} placeholder={t('settings.placeholders.bio')} {...register('bio')} />
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
