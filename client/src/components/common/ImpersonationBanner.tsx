import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ImpersonationBanner() {
  const { t } = useTranslation('common');
  const { user, isImpersonating, exitImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating || !user) return null;

  const handleExit = () => {
    exitImpersonation();
    navigate('/');
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[999] bg-amber-400 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-semibold shadow-md">
      <Eye size={14} strokeWidth={2.5} />
      <span>{t('impersonation.viewingAs', { name: user.name, role: user.role })}</span>
      <button
        onClick={handleExit}
        className="flex items-center gap-1 bg-amber-950 text-amber-50 px-3 py-1 rounded-lg hover:bg-amber-900 transition-colors"
      >
        <LogOut size={12} strokeWidth={2.5} />
        {t('impersonation.exitButton')}
      </button>
    </div>
  );
}
