import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function fmtTime(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface ChatPanelProps {
  queryKey: unknown[];
  fetchMessages: () => Promise<any>;
  sendMessage: (body: string) => Promise<any>;
}

// Generic chat UI shared by lab-request messaging (patient/doctor/laboratory on
// a lab_requests row) and pharmacy messaging (patient/pharmacist on a
// prescription_assignments row) — identical shape, only the data source differs.
export default function ChatPanel({ queryKey, fetchMessages, sendMessage }: ChatPanelProps) {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchMessages,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage(body),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate(text.trim());
  };

  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white">
        <MessageCircle size={13} strokeWidth={2} className="text-gray-400" />
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('chat.title')}</p>
      </div>

      <div className="max-h-56 overflow-y-auto px-3 py-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('actions.loading')}</p>
        ) : (messages as any[]).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('chat.empty')}</p>
        ) : (
          (messages as any[]).map((m: any) => {
            const isOwn = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                  {!isOwn && <p className="text-[10px] font-bold opacity-70 mb-0.5">{m.sender_name}</p>}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>{fmtTime(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-white">
        <input
          type="text"
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          placeholder={t('chat.placeholder') as string}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-primary-600 text-white disabled:opacity-50"
        >
          <Send size={14} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}
