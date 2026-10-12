import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Package } from 'lucide-react';
import { userApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';

interface PharmacySearchDropdownProps {
  selected: any;
  onSelect: (item: any) => void;
}

export default function PharmacySearchDropdown({ selected, onSelect }: PharmacySearchDropdownProps) {
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [q, setQ]       = useState('');
  const dq              = useDebounce(q, 350);
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-pharm-consult', dq],
    queryFn:  () => userApi.searchPharmacists(dq),
    enabled:  open,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (selected) return (
    <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <Package size={14} strokeWidth={2} className="text-violet-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-violet-700">{selected.pharmacy_name || selected.name}</p>
          <p className="text-xs text-gray-400">{selected.pharmacy_address || selected.email}</p>
        </div>
      </div>
      <button type="button" onClick={() => { onSelect(null); setQ(''); }}
        className="text-gray-400 hover:text-red-500 text-xs font-medium">{tc('actions.change')}</button>
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          placeholder={t('pharmacySearch.placeholder')}
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-violet-400 rounded-full animate-spin" />}
      </div>
      {open && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto">
          {isFetching
            ? <li className="px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
                <span className="w-3.5 h-3.5 border-2 border-gray-200 border-t-violet-400 rounded-full animate-spin shrink-0" />
                {t('pharmacySearch.loading')}
              </li>
            : (results as any[]).length === 0
              ? <li className="px-4 py-3 text-sm text-gray-400">{t('pharmacySearch.noResults')}</li>
              : (results as any[]).map((p: any) => (
                <li key={p.id} onClick={() => { onSelect(p); setOpen(false); setQ(''); }}
                  className="px-4 py-2.5 hover:bg-violet-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                    <Package size={12} strokeWidth={2} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.pharmacy_name || p.name}</p>
                    <p className="text-xs text-gray-400">{p.pharmacy_address || p.email}</p>
                    {p.specialization_area && <p className="text-xs text-violet-600">{p.specialization_area}</p>}
                  </div>
                </li>
              ))
          }
        </ul>
      )}
    </div>
  );
}
