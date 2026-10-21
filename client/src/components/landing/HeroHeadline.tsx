import { useEffect, useState } from 'react';
import { ArrowRight, Heart } from 'lucide-react';
import { roleById, type RoleId } from './roles';

// Hero headline. The last line cycles through the places a record reaches,
// each in its own colour, so the sentence reads "connected to every doctor",
// "...every pharmacy", and so on.
const WORDS: { id: RoleId; word: string }[] = [
  { id: 'doctor',     word: 'doctor' },
  { id: 'pharmacist', word: 'pharmacy' },
  { id: 'laboratory', word: 'laboratory' },
  { id: 'org',        word: 'hospital' },
];

const FLOW: { id: RoleId; label: string }[] = [
  { id: 'doctor', label: 'Doctor' },
  { id: 'pharmacist', label: 'Pharmacy' },
  { id: 'laboratory', label: 'Lab' },
  { id: 'patient', label: 'You' },
];

export default function HeroHeadline() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI(v => (v + 1) % WORDS.length), 2400);
    return () => window.clearInterval(t);
  }, []);

  const w = WORDS[i];
  const r = roleById(w.id);

  return (
    <>
      <h1 className="font-display text-[44px] sm:text-6xl lg:text-[68px] leading-[1.04] tracking-tight text-suwela-navy">
        <span className="block">Your health,</span>
        <span className="block">connected to every</span>
        <span className="relative mt-3 block h-[1.25em]" aria-live="polite">
          <span key={w.id}
                className="sw-word absolute left-0 top-0 inline-flex items-center gap-3 sm:gap-4 rounded-full pl-2 pr-6 sm:pr-8 py-1.5 sm:py-2 text-white italic"
                style={{ background: `linear-gradient(120deg, ${r.color}, ${r.tint})`, boxShadow: `0 18px 40px -18px ${r.color}` }}>
            <span className="not-italic flex items-center justify-center w-[1em] h-[1em] rounded-full bg-white" style={{ color: r.color }}>
              <r.icon className="w-[0.55em] h-[0.55em]" strokeWidth={2.2} />
            </span>
            {w.word}.
          </span>
        </span>
      </h1>

      <p className="mt-8 text-lg sm:text-xl text-suwela-slate max-w-xl leading-relaxed">
        See a doctor, collect your medicine, get your lab results —
        <span className="text-suwela-navy font-semibold"> everything lands on one record that you control.</span>{' '}
        No files to carry, nothing to lose.
      </p>

      {/* the record's path, drawn small */}
      <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Doctor, pharmacy, laboratory, then back to you">
        {FLOW.map(({ id, label }, k) => {
          const f = roleById(id);
          const last = k === FLOW.length - 1;
          return (
            <span key={id} className="flex items-center gap-2">
              <span className="sw-pop inline-flex items-center gap-2 rounded-full bg-white pl-1 pr-3.5 py-1 shadow-sm"
                    style={{ animationDelay: `${0.3 + k * 0.15}s` }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: `linear-gradient(135deg, ${f.tint}, ${f.color})` }}>
                  {last ? <Heart className="w-4 h-4" fill="currentColor" /> : <f.icon className="w-4 h-4" />}
                </span>
                <span className="text-sm font-semibold text-suwela-ink">{label}</span>
              </span>
              {!last && <ArrowRight className="w-4 h-4 text-suwela-slate/60" />}
            </span>
          );
        })}
      </div>
    </>
  );
}
