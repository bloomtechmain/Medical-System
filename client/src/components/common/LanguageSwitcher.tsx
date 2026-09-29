import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

/**
 * EN / SI toggle. Purely client-side — i18next-browser-languagedetector
 * persists the choice to localStorage, so no backend/account change is
 * involved and the preference is per-device, not per-account.
 */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('si') ? 'si' : 'en';

  const set = (lng: 'en' | 'si') => { if (lng !== current) i18n.changeLanguage(lng); };

  return (
    <div
      className={`flex items-center gap-0.5 bg-gray-100 rounded-xl p-0.5 ${compact ? '' : 'shrink-0'}`}
      role="group"
      aria-label="Language"
    >
      {!compact && <Languages size={13} strokeWidth={2} className="text-gray-400 mx-1.5 shrink-0" />}
      <button
        type="button"
        onClick={() => set('en')}
        className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors ${
          current === 'en' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => set('si')}
        className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors ${
          current === 'si' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        සිං
      </button>
    </div>
  );
}
