import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function MiniCalendar({ highlightDates = [], title = 'My Schedule' }) {
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const yr = view.getFullYear();
  const mo = view.getMonth();

  const firstDayRaw  = new Date(yr, mo, 1).getDay();
  const mondayOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const daysInMonth  = new Date(yr, mo + 1, 0).getDate();
  const daysInPrev   = new Date(yr, mo, 0).getDate();

  const cells = [];
  for (let i = mondayOffset - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, cur: true });
  while (cells.length < 42)
    cells.push({ day: cells.length - mondayOffset - daysInMonth + 1, cur: false });

  const isToday = (c) =>
    c.cur && c.day === today.getDate() && mo === today.getMonth() && yr === today.getFullYear();

  const isHighlight = (c) => {
    if (!c.cur) return false;
    const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
    return highlightDates.includes(ds);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 select-none">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{title}</p>
          <p className="text-[15px] font-bold text-gray-900">{MONTHS[mo]} {yr}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setView(new Date(yr, mo - 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>
          <button
            onClick={() => setView(new Date(yr, mo + 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className={`text-center text-[10px] font-bold py-0.5 ${
            d === 'Sat' || d === 'Sun' ? 'text-rose-400' : 'text-gray-400'
          }`}>
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isTd  = isToday(cell);
          const isHl  = isHighlight(cell);
          const isWkd = i % 7 >= 5;
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              <div className={`
                w-7 h-7 flex items-center justify-center text-[12px] rounded-full font-medium transition-colors
                ${!cell.cur ? 'text-gray-200' : ''}
                ${cell.cur && !isTd && !isHl && isWkd  ? 'text-rose-400 hover:bg-rose-50 cursor-pointer' : ''}
                ${cell.cur && !isTd && !isHl && !isWkd ? 'text-gray-600 hover:bg-gray-100 cursor-pointer' : ''}
                ${isTd  ? 'bg-[#3B82F6] text-white font-bold shadow-md shadow-blue-200' : ''}
                ${isHl && !isTd ? 'bg-primary-100 text-primary-700 font-semibold' : ''}
              `}>
                {cell.day}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {highlightDates.length > 0 && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-[#3B82F6] rounded-full" />
            <span className="text-[10px] text-gray-400 font-medium">Today</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-primary-200 rounded-full" />
            <span className="text-[10px] text-gray-400 font-medium">Visit</span>
          </div>
        </div>
      )}
    </div>
  );
}
