import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Package, Plus, X, Send, MessageCircle } from 'lucide-react';
import { prescriptionAssignmentApi } from '../../services/api';
import PharmacySearchDropdown from './PharmacySearchDropdown';
import ChatPanel from './ChatPanel';

interface Assignment {
  id: number;
  pharmacist_id: number;
  pharmacy_name: string;
  status: 'active' | 'preparing' | 'dispensed' | 'delivered' | 'cancelled';
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-amber-50 text-amber-700 border-amber-200',
  preparing: 'bg-blue-50 text-blue-700 border-blue-200',
  dispensed: 'bg-violet-50 text-violet-700 border-violet-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-400 border-gray-200 line-through',
};

interface PharmacyAssignmentsPanelProps {
  consultationId: number;
  assignments: Assignment[] | undefined;
  canManage: boolean;
  hasMedicines: boolean;
  onChanged: () => void;
}

export default function PharmacyAssignmentsPanel({ consultationId, assignments, canManage, hasMedicines, onChanged }: PharmacyAssignmentsPanelProps) {
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [error, setError]   = useState('');
  const [chatOpenId, setChatOpenId] = useState<number | null>(null);

  const assignMutation = useMutation({
    mutationFn: () => prescriptionAssignmentApi.assign(consultationId, picked.id),
    onSuccess: () => { setAdding(false); setPicked(null); setError(''); onChanged(); },
    onError:   (err: any) => setError(err.message || t('pharmacyAssignments.errorGeneric')),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => prescriptionAssignmentApi.cancel(id),
    onSuccess: () => { toast.success(t('pharmacyAssignments.cancelledToast')); onChanged(); },
    onError:   (err: any) => toast.error(err.message || t('pharmacyAssignments.errorGeneric')),
  });

  const visible    = assignments || [];
  const canForward = canManage && hasMedicines;

  if (!visible.length && !canForward) return null;

  return (
    <div className="space-y-2">
      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map(a => (
            <div key={a.id}>
              <div className={`flex items-center gap-1.5 text-xs font-medium pl-2.5 pr-2 py-1.5 rounded-xl border w-fit ${STATUS_STYLE[a.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                <Package size={11} strokeWidth={2} />
                <span>{a.pharmacy_name}</span>
                <span className="opacity-60">· {t(`pharmacyAssignments.status.${a.status}`)}</span>
                {a.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setChatOpenId(id => id === a.id ? null : a.id)}
                    title={t('pharmacyAssignments.chatBtn')}
                    className="ml-0.5 text-current opacity-60 hover:opacity-100"
                  >
                    <MessageCircle size={12} strokeWidth={2.5} />
                  </button>
                )}
                {canManage && ['active', 'preparing'].includes(a.status) && (
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate(a.id)}
                    disabled={cancelMutation.isPending}
                    title={t('pharmacyAssignments.cancelBtn')}
                    className="ml-0.5 text-current opacity-60 hover:opacity-100 hover:text-red-600"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {chatOpenId === a.id && (
                <div className="mt-2">
                  <ChatPanel
                    queryKey={['prescription-assignment-messages', a.id]}
                    fetchMessages={() => prescriptionAssignmentApi.getMessages(a.id)}
                    sendMessage={(body) => prescriptionAssignmentApi.sendMessage(a.id, body)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canForward && (
        adding ? (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
            <PharmacySearchDropdown selected={picked} onSelect={setPicked} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAdding(false); setPicked(null); setError(''); }}
                className="flex-1 text-xs font-semibold text-gray-500 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100">
                {tc('actions.cancel')}
              </button>
              <button type="button" disabled={!picked || assignMutation.isPending} onClick={() => assignMutation.mutate()}
                className="flex-1 text-xs font-bold text-white bg-violet-600 py-1.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
                {assignMutation.isPending && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <Send size={11} strokeWidth={2.5} /> {t('pharmacyAssignments.sendBtn')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700">
            <Plus size={12} strokeWidth={2.5} /> {visible.length > 0 ? t('pharmacyAssignments.sendAnotherBtn') : t('pharmacyAssignments.sendBtn')}
          </button>
        )
      )}
    </div>
  );
}
