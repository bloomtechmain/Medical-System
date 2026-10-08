import { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface MultiSelectWithCustomProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  customPlaceholder?: string;
}

export default function MultiSelectWithCustom({ options, selected, onChange, customPlaceholder }: MultiSelectWithCustomProps) {
  const [custom, setCustom] = useState('');

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);

  const addCustom = () => {
    const v = custom.trim();
    if (!v || selected.includes(v)) return;
    onChange([...selected, v]);
    setCustom('');
  };

  const remove = (v: string) => onChange(selected.filter(s => s !== v));

  // Anything selected that isn't in the predefined list is a custom entry — show
  // it as its own removable chip below the checkbox grid.
  const customSelected = selected.filter(s => !options.includes(s));

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>

      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {customSelected.map(v => (
            <div key={v} className="flex items-center gap-1.5 bg-teal-50 border border-teal-100 text-teal-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
              {v}
              <button type="button" onClick={() => remove(v)} className="text-teal-400 hover:text-red-500">
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <input
          className="flex-1 border border-gray-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder={customPlaceholder || 'Add a custom entry...'}
          value={custom}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustom(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
        />
        <button type="button" onClick={addCustom}
          className="px-3 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 flex items-center gap-1 shrink-0">
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
