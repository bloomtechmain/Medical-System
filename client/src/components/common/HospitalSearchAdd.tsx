import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { orgApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';

interface HospitalSearchAddProps {
  onAdd: (org: any) => void;
  excludeIds: number[];
  placeholder?: string;
}

export default function HospitalSearchAdd({ onAdd, excludeIds, placeholder }: HospitalSearchAddProps) {
  const { t } = useTranslation('doctorPatients');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 350);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-hospitals-clinics', dq],
    queryFn:  () => orgApi.searchHospitalsClinics(dq),
    enabled:  open && dq.trim().length >= 2,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = (results as any[]).filter(r => !excludeIds.includes(r.id));

  return (
    <div className="relative" ref={ref}>
      <input
        className="input text-sm py-2 w-full"
        placeholder={placeholder || (t('appointments.hospitals.searchPlaceholder') as string)}
        value={q}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && dq.trim().length >= 2 && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-48 overflow-y-auto">
          {isFetching ? (
            <li className="px-4 py-3 text-sm text-gray-400">{t('appointments.hospitals.searching')}</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400">{t('appointments.hospitals.noResults')}</li>
          ) : filtered.map((org: any) => (
            <li key={org.id} onClick={() => { onAdd(org); setQ(''); setOpen(false); }}
              className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2">
              <Building2 size={14} strokeWidth={2} className="text-primary-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{org.name}</p>
                <p className="text-xs text-gray-400 capitalize">{org.org_type}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
