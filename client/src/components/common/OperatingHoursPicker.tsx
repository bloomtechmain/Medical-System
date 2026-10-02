import { useEffect, useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseValue(value: string): { days: string[]; from: string; to: string } {
  const match = value.match(/^(.*?):\s*(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\s*$/);
  if (!match) return { days: [], from: '', to: '' };
  const days = match[1].split(',').map(d => d.trim()).filter(d => DAYS.includes(d));
  return { days, from: match[2], to: match[3] };
}

function composeValue(days: string[], from: string, to: string): string {
  if (!days.length || !from || !to) return '';
  const ordered = DAYS.filter(d => days.includes(d));
  return `${ordered.join(', ')}: ${from}–${to}`;
}

interface OperatingHoursPickerProps {
  value: string;
  onChange: (value: string) => void;
  daysLabel?: string;
  fromLabel?: string;
  toLabel?: string;
}

export default function OperatingHoursPicker({ value, onChange, daysLabel = 'Open Days', fromLabel = 'Opens at', toLabel = 'Closes at' }: OperatingHoursPickerProps) {
  const initial = parseValue(value || '');
  const [days, setDays] = useState<string[]>(initial.days);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  // Re-sync if the parent resets `value` out from under us (e.g. form reset on data load)
  useEffect(() => {
    const parsed = parseValue(value || '');
    setDays(parsed.days);
    setFrom(parsed.from);
    setTo(parsed.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const toggleDay = (day: string) => {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setDays(next);
    onChange(composeValue(next, from, to));
  };

  const handleFrom = (v: string) => { setFrom(v); onChange(composeValue(days, v, to)); };
  const handleTo   = (v: string) => { setTo(v); onChange(composeValue(days, from, v)); };

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1.5">{daysLabel}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {DAYS.map(day => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            className={`w-11 h-9 rounded-lg text-xs font-semibold border transition-colors ${
              days.includes(day)
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'bg-white border-gray-300 text-gray-500 hover:border-teal-400'
            }`}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fromLabel}</label>
          <input type="time" value={from} onChange={e => handleFrom(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{toLabel}</label>
          <input type="time" value={to} onChange={e => handleTo(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
      </div>
    </div>
  );
}
