import { useEffect, useState } from 'react';
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

  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [showDisablePrompt, setShowDisablePrompt] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const setupMutation = useMutation({
    mutationFn: () => authApi.mfaSetup(),
    onSuccess: (data: any) => setMfaSetupData(data),
    onError: (err: any) => toast.error(err.message || t('settings.mfa.invalidCode')),
  });

  const verifySetupMutation = useMutation({
    mutationFn: (code: string) => authApi.mfaVerifySetup(code),
    onSuccess: () => {
      toast.success(t('settings.mfa.setupSuccess'));
      setMfaSetupData(null);
      setMfaCode('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast.error(err.message || t('settings.mfa.invalidCode')),
  });

  const disableMutation = useMutation({
    mutationFn: (code: string) => authApi.mfaDisable(code),
    onSuccess: () => {
      toast.success(t('settings.mfa.disableSuccess'));
      setShowDisablePrompt(false);
      setDisableCode('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast.error(err.message || t('settings.mfa.invalidCode')),
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-3xl mt-6">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.sections.mfa')}</h3>
        <p className="text-sm text-gray-500">{t('settings.mfa.description')}</p>

        {me?.mfa_enabled ? (
          <>
            <p className="text-sm font-medium text-green-700">{t('settings.mfa.enabled')}</p>
            {!showDisablePrompt ? (
              <button type="button" onClick={() => setShowDisablePrompt(true)} className="btn-secondary px-4 py-2">
                {t('settings.mfa.disable')}
              </button>
            ) : (
              <div className="space-y-2 max-w-xs">
                <label className="label">{t('settings.mfa.disablePrompt')}</label>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  className="input text-center tracking-widest"
                  placeholder={t('settings.mfa.codePlaceholder')}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => disableMutation.mutate(disableCode)}
                    disabled={disableCode.length !== 6 || disableMutation.isPending}
                    className="btn-primary px-4 py-2"
                  >
                    {t('settings.mfa.disable')}
                  </button>
                  <button type="button" onClick={() => { setShowDisablePrompt(false); setDisableCode(''); }} className="btn-secondary px-4 py-2">
                    {t('settings.mfa.cancel')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : mfaSetupData ? (
          <div className="space-y-3 max-w-xs">
            <p className="text-sm text-gray-500">{t('settings.mfa.scanInstructions')}</p>
            <img src={mfaSetupData.qrCodeDataUrl} alt="MFA QR code" className="w-40 h-40 border border-gray-100 rounded-lg" />
            <p className="text-xs text-gray-400 break-all">{t('settings.mfa.manualEntry')} <span className="font-mono">{mfaSetupData.secret}</span></p>
            <input
              type="text" inputMode="numeric" maxLength={6}
              className="input text-center tracking-widest"
              placeholder={t('settings.mfa.codePlaceholder')}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => verifySetupMutation.mutate(mfaCode)}
                disabled={mfaCode.length !== 6 || verifySetupMutation.isPending}
                className="btn-primary px-4 py-2"
              >
                {t('settings.mfa.confirm')}
              </button>
              <button type="button" onClick={() => { setMfaSetupData(null); setMfaCode(''); }} className="btn-secondary px-4 py-2">
                {t('settings.mfa.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">{t('settings.mfa.disabled')}</p>
            <button type="button" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} className="btn-primary px-4 py-2">
              {t('settings.mfa.enable')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
