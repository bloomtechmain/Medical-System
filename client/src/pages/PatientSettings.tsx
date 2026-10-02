import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, userApi } from '../services/api';
import PageHeader from '../components/common/PageHeader';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientSettings() {
  const { t } = useTranslation('patientSettings');
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
      date_of_birth: profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '',
      gender: profile.gender || '',
      blood_type: profile.blood_type || '',
      address: profile.address || '',
      emergency_contact_name: profile.emergency_contact_name || '',
      emergency_contact_phone: profile.emergency_contact_phone || '',
      allergies: profile.allergies || '',
      chronic_conditions: profile.chronic_conditions || '',
      insurance_provider: profile.insurance_provider || '',
      insurance_policy_number: profile.insurance_policy_number || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const { name, ...profileFields } = data;
      return userApi.updateMyProfile({ name, profile: profileFields });
    },
    onSuccess: () => {
      toast.success(t('toastSuccess'));
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast.error(err.message || t('toastError')),
  });

  if (isLoading) {
    return <div className="text-sm text-gray-400">{tc('actions.loading')}</div>;
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 max-w-3xl">
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('sections.account')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{tc('fields.name')}</label>
              <input className="input" {...register('name', { required: true })} />
            </div>
            <div>
              <label className="label">{tc('fields.phone')}</label>
              <input className="input" placeholder={t('placeholders.phone')} {...register('phone')} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('sections.health')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('fields.dateOfBirth')}</label>
              <input type="date" className="input" {...register('date_of_birth')} />
            </div>
            <div>
              <label className="label">{tc('fields.gender')}</label>
              <select className="input" {...register('gender')}>
                <option value="">{t('selectGenderPlaceholder')}</option>
                <option value="male">{tc('fields.male')}</option>
                <option value="female">{tc('fields.female')}</option>
                <option value="other">{tc('fields.other')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('fields.bloodType')}</label>
              <select className="input" {...register('blood_type')}>
                <option value="">{t('bloodTypeUnknown')}</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">{tc('fields.address')}</label>
              <input className="input" placeholder={t('placeholders.address')} {...register('address')} />
            </div>
            <div>
              <label className="label">{t('fields.emergencyContactName')}</label>
              <input className="input" placeholder={t('placeholders.emergencyContactName')} {...register('emergency_contact_name')} />
            </div>
            <div>
              <label className="label">{t('fields.emergencyContactPhone')}</label>
              <input className="input" placeholder={t('placeholders.emergencyContactPhone')} {...register('emergency_contact_phone')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t('fields.allergies')}</label>
              <input className="input" placeholder={t('placeholders.allergies')} {...register('allergies')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t('fields.chronicConditions')}</label>
              <input className="input" placeholder={t('placeholders.chronicConditions')} {...register('chronic_conditions')} />
            </div>
            <div>
              <label className="label">{t('fields.insuranceProvider')} <span className="text-gray-400 font-normal">{t('optional')}</span></label>
              <input className="input" placeholder={t('placeholders.insuranceProvider')} {...register('insurance_provider')} />
            </div>
            <div>
              <label className="label">{t('fields.insurancePolicyNumber')} <span className="text-gray-400 font-normal">{t('optional')}</span></label>
              <input className="input" placeholder={t('placeholders.insurancePolicyNumber')} {...register('insurance_policy_number')} />
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
