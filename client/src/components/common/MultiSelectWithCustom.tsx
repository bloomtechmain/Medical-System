import { useState } from 'react';
import { X, Plus, CheckCheck, Eraser } from 'lucide-react';

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

  // Requirement 2: "There should be one button like as select to all of
  // specializations!" A large hospital offers most of the list, and ticking
  // seventeen boxes one at a time is the thing being complained about.
  //
  // Union, not replace: a custom entry the user has already added must
  // survive selecting all of the predefined ones.
  const allSelected = options.length > 0 && options.every(o => selected.includes(o));
  const selectAll = () => onChange([...new Set([...selected, ...options])]);
  // Clears only the predefined options, leaving custom entries alone — they
  // were typed by hand and are the more expensive thing to lose.
  const clearPredefined = () => onChange(selected.filter(s => !options.includes(s)));

  // Anything selected that isn't in the predefined list is a custom entry — show
  // it as its own removable chip below the checkbox grid.
  const customSelected = selected.filter(s => !options.includes(s));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <p className="text-xs text-gray-400">
          {selected.length > 0
            ? `${selected.length} selected`
            : 'None selected'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={allSelected}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-default"
          >
            <CheckCheck size={13} strokeWidth={2.5} /> Select all
          </button>
          <button
            type="button"
            onClick={clearPredefined}
            disabled={selected.length === 0}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
          >
            <Eraser size={13} strokeWidth={2.5} /> Clear
          </button>
        </div>
      </div>

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
