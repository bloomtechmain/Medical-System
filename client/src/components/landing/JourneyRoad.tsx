import { useEffect, useState, type ReactNode } from 'react';
import {
  CalendarCheck, Stethoscope, FileText, FlaskConical, ScanText, Pill, History, Check, ShoppingBag, ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { roleById, type RoleId } from './roles';
import { Leaf, Cross, Ring, Dots } from './Shapes';

// One visit, drawn as a chain of arrows: each step is a chevron that points to
// the next. The view below shows the chosen step as it looks in the app. It
// plays through on its own until someone picks a step.
interface Stop { title: string; actor: RoleId; icon: LucideIcon; what: string; scene: () => ReactNode }

const Card = ({ children }: { children: ReactNode }) => (
  <div className="sw-pop w-full max-w-[360px] rounded-[28px] bg-white p-5 shadow-[0_30px_60px_-25px_rgba(14,44,82,0.6)] rotate-[-2deg] transition-transform duration-500 hover:rotate-0 hover:scale-[1.03]">{children}</div>
);

const Row = ({ c, t, d }: { c: string; t: string; d: string }) => (
  <div className="flex items-center gap-2.5 rounded-2xl bg-suwela-paper px-3 py-2.5">
    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c, boxShadow: `0 0 0 4px ${c}22` }} />
    <span className="text-sm font-semibold text-suwela-ink whitespace-nowrap">{t}</span>
    <span className="ml-auto min-w-0 truncate text-[11px] text-suwela-slate">{d}</span>
  </div>
);

const STOPS: Stop[] = [
  { title: 'Book a doctor', actor: 'patient', icon: CalendarCheck,
    what: 'Pick a doctor and a time that suits you. The doctor sees the booking straight away.',
    scene: () => (
      <Card>
        <p className="text-xs font-semibold text-suwela-slate uppercase tracking-wider">October</p>
        <div className="grid grid-cols-7 gap-1.5 mt-3 text-center text-xs">
          {Array.from({ length: 14 }, (_, d) => (
            <span key={d} className={`rounded-lg py-1.5 ${d === 9 ? 'text-white font-bold' : 'text-suwela-ink bg-suwela-paper'}`}
                  style={d === 9 ? { backgroundColor: '#13A58F' } : undefined}>{d + 12}</span>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          {['9:00', '9:30', '10:15'].map(t => (
            <span key={t} className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold ${t === '9:30' ? 'text-white' : 'bg-suwela-paper text-suwela-slate'}`}
                  style={t === '9:30' ? { backgroundColor: '#0E2C52' } : undefined}>{t}</span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl p-2.5 text-sm font-semibold text-suwela-forest" style={{ backgroundColor: '#43CE9F22' }}>
          <Check className="w-4 h-4" /> Booked with Dr. Perera
        </div>
      </Card>
    ) },
  { title: 'Consultation', actor: 'doctor', icon: Stethoscope,
    what: 'Symptoms, diagnosis, vitals and the treatment plan are written once, on your own record.',
    scene: () => (
      <Card>
        <p className="font-display text-lg text-suwela-navy">Consultation note</p>
        <div className="mt-3 space-y-2 text-sm">
          <p><span className="text-suwela-slate">Symptoms · </span><span className="font-semibold text-suwela-ink">Fever, 3 days</span></p>
          <p><span className="text-suwela-slate">Diagnosis · </span><span className="font-semibold text-suwela-ink">Viral fever</span></p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[['BP', '120/80'], ['Temp', '38.2°'], ['Pulse', '88']].map(([k, v]) => (
            <div key={k} className="rounded-2xl p-2.5 text-center" style={{ backgroundColor: '#5CC6FF22' }}>
              <p className="text-[10px] font-semibold text-suwela-slate uppercase">{k}</p>
              <p className="text-sm font-bold text-suwela-navy">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 h-2 w-3/4 rounded bg-suwela-line" /><div className="mt-2 h-2 w-1/2 rounded bg-suwela-line" />
      </Card>
    ) },
  { title: 'Prescription', actor: 'doctor', icon: FileText,
    what: 'Medicines go digitally to the pharmacy you choose — no handwriting to decode.',
    scene: () => (
      <Card>
        <p className="font-display text-2xl text-suwela-blue italic">Rx</p>
        <div className="mt-2 space-y-2">
          {[['Paracetamol 500mg', '1 × 3 · 5 days'], ['Vitamin C 250mg', '1 × 1 · 7 days']].map(([m, d]) => (
            <div key={m} className="flex items-center gap-3 rounded-2xl bg-suwela-paper p-3">
              <Pill className="w-5 h-5 text-suwela-purple" />
              <div><p className="text-sm font-semibold text-suwela-ink">{m}</p><p className="text-xs text-suwela-slate">{d}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-full py-2.5 text-center text-sm font-semibold text-white" style={{ backgroundColor: '#1598E9' }}>
          Sent to City Pharmacy ✓
        </div>
      </Card>
    ) },
  { title: 'Lab test', actor: 'laboratory', icon: FlaskConical,
    what: 'If tests are needed, the request lands in the lab’s queue with the doctor’s notes.',
    scene: () => (
      <Card>
        <p className="text-xs font-semibold text-suwela-slate uppercase tracking-wider">Lab queue</p>
        <div className="mt-3 space-y-2">
          {[['Full blood count', 'New', '#0279D1'], ['Lipid profile', 'Testing', '#EF7B2D'], ['Urine full report', 'Done', '#13A58F']].map(([t, s, c], k) => (
            <div key={t} className={`flex items-center gap-3 rounded-2xl p-3 ${k === 0 ? '' : 'bg-suwela-paper'}`}
                 style={k === 0 ? { backgroundColor: '#38B6F51a', boxShadow: '0 0 0 2px #38B6F5' } : undefined}>
              <FlaskConical className="w-5 h-5" style={{ color: c }} />
              <span className="text-sm font-semibold text-suwela-ink">{t}</span>
              <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: c }}>{s}</span>
            </div>
          ))}
        </div>
      </Card>
    ) },
  { title: 'Report ready', actor: 'laboratory', icon: ScanText,
    what: 'The lab uploads the result and it appears for both you and your doctor.',
    scene: () => (
      <Card>
        <div className="flex items-center gap-2">
          <p className="font-display text-lg text-suwela-navy">Full blood count</p>
          <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: '#EF7B2D' }}>New</span>
        </div>
        <div className="mt-4 space-y-3">
          {[['Haemoglobin', 72], ['White cells', 55], ['Platelets', 64]].map(([t, w]) => (
            <div key={t as string}>
              <div className="flex text-xs"><span className="text-suwela-slate">{t}</span><span className="ml-auto font-semibold text-suwela-forest">Normal</span></div>
              <div className="mt-1 h-2.5 rounded-full bg-suwela-paper overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: '#38B6F5' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    ) },
  { title: 'Pick up medicine', actor: 'pharmacist', icon: Pill,
    what: 'The pharmacy prepares your prescription from its own stock, ready when you arrive.',
    scene: () => (
      <Card>
        <div className="flex flex-col items-center text-center">
          <span className="relative w-24 h-24 rounded-[30px] flex items-center justify-center text-white" style={{ backgroundColor: '#6A4DB6' }}>
            <ShoppingBag className="w-12 h-12" strokeWidth={1.7} />
            <span className="absolute -right-2 -top-2 w-9 h-9 rounded-full flex items-center justify-center ring-4 ring-white" style={{ backgroundColor: '#13A58F' }}>
              <Check className="w-5 h-5" strokeWidth={3} />
            </span>
          </span>
          <p className="font-display text-xl text-suwela-navy mt-4">Ready for pickup</p>
          <p className="text-sm text-suwela-slate">City Pharmacy · 2 items</p>
        </div>
      </Card>
    ) },
  { title: 'Your timeline', actor: 'patient', icon: History,
    what: 'Every step lands on one timeline you can read, search and download as a PDF.',
    scene: () => (
      <Card>
        <p className="font-display text-lg text-suwela-navy">My timeline</p>
        <div className="mt-3 space-y-2">
          <Row c="#1598E9" t="Consultation" d="Dr. Perera" />
          <Row c="#6A4DB6" t="Prescription" d="City Pharmacy" />
          <Row c="#0279D1" t="Lab report" d="Full blood count" />
        </div>
        <div className="mt-4 rounded-full py-2.5 text-center text-sm font-semibold text-white" style={{ backgroundColor: '#13A58F' }}>
          Download health report (PDF)
        </div>
      </Card>
    ) },
];

// Arrow outlines. The first has a flat tail; the rest have a notch the
// previous arrow's point sits in.
const NOTCH = 26;
const ARROW_FIRST = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`;
const ARROW = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`;
const ARROW_DOWN = `polygon(0 0, 50% 18px, 100% 0, 100% calc(100% - 18px), 50% 100%, 0 calc(100% - 18px))`;
const ARROW_DOWN_FIRST = `polygon(0 0, 100% 0, 100% calc(100% - 18px), 50% 100%, 0 calc(100% - 18px))`;

export default function JourneyRoad() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setAuto(false);
  }, []);

  const stop = STOPS[i];
  const actor = roleById(stop.actor);
  const pick = (k: number) => { setI((k + STOPS.length) % STOPS.length); setAuto(false); };
  const next = () => { if (auto) setI(v => (v + 1) % STOPS.length); };

  const view = (
    <div key={i} className="sw-rise relative overflow-hidden rounded-[36px] text-white grid md:grid-cols-[1fr_1.05fr] gap-6 p-6 sm:p-10"
         style={{ backgroundColor: actor.color, backgroundImage: `linear-gradient(135deg, ${actor.color}, ${actor.tint})` }}>
      <Leaf from="#ffffff" to="#ffffff" className="absolute -left-14 -bottom-16 w-64 h-64 opacity-10 sw-float" />
      <Ring from="#ffffff" to="#ffffff" className="absolute right-[44%] top-8 w-14 h-14 opacity-20 sw-float" style={{ animationDelay: '1.5s' }} />
      <Cross from="#ffffff" to="#ffffff" className="absolute -right-6 -bottom-6 w-36 h-36 opacity-10 sw-float" style={{ animationDelay: '.8s' }} />
      <Dots color="#ffffff" className="absolute right-8 top-6 w-24 h-24 opacity-20" />

      <div className="relative flex flex-col">
        <span className="self-start inline-flex items-center gap-2 rounded-full bg-white/20 pl-1.5 pr-4 py-1.5 text-sm font-semibold">
          <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center" style={{ color: actor.color }}><actor.icon className="w-4 h-4" /></span>
          {actor.label}
        </span>
        <p className="mt-6 font-tech text-sm text-white/70">STEP {String(i + 1).padStart(2, '0')} / {String(STOPS.length).padStart(2, '0')}</p>
        <h3 className="font-display text-4xl sm:text-5xl mt-1 leading-tight">{stop.title}</h3>
        <p className="mt-4 text-lg text-white/90 leading-relaxed max-w-md">{stop.what}</p>
        <div className="mt-auto pt-8 flex items-center gap-3">
          <button onClick={() => pick(i - 1)} aria-label="Previous step"
                  className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={() => pick(i + 1)}
                  className="inline-flex items-center gap-2 rounded-full bg-white pl-5 pr-3 h-12 font-semibold transition-transform hover:translate-x-0.5"
                  style={{ color: actor.color }}>
            {i === STOPS.length - 1 ? 'Start again' : `Next: ${STOPS[i + 1].title}`} <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex items-center justify-center py-4 md:py-0 text-suwela-ink">
        <span className="absolute w-72 h-72 rounded-full bg-white/15" aria-hidden />
        <span className="absolute w-52 h-52 rounded-full bg-white/15 sw-ring" aria-hidden />
        {stop.scene()}
      </div>
    </div>
  );

  return (
    <div>
      {/* desktop: one row of arrows */}
      <div className="hidden lg:flex items-stretch" role="tablist" aria-label="Steps of a visit">
        {STOPS.map((s, k) => {
          const r = roleById(s.actor);
          const on = k === i;
          const done = k < i;
          return (
            <button key={s.title} role="tab" aria-selected={on} onClick={() => pick(k)}
                    className={`group relative flex-1 transition-transform duration-300 ${on ? '-translate-y-2 z-10' : 'hover:-translate-y-1'}`}
                    style={{ marginLeft: k ? -(NOTCH - 6) : 0, filter: on ? `drop-shadow(0 16px 18px ${r.color}66)` : undefined }}>
              <span className="relative flex flex-col items-start h-[150px] py-5 pr-10 transition-colors duration-300"
                    style={{
                      clipPath: k ? ARROW : ARROW_FIRST,
                      paddingLeft: k ? NOTCH + 14 : 22,
                      backgroundColor: on ? r.color : done ? `${r.tint}55` : `${r.tint}26`,
                      backgroundImage: on ? `linear-gradient(120deg, ${r.tint}, ${r.color})` : undefined,
                    }}>
                <span className="flex items-center gap-2">
                  <span className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${on ? 'bg-white' : ''}`}
                        style={on ? { color: r.color } : { backgroundColor: r.color, color: '#fff' }}>
                    {done ? <Check className="w-5 h-5" strokeWidth={3} /> : <s.icon className="w-5 h-5 sw-wiggle" />}
                  </span>
                  <span className={`font-tech text-xs font-bold ${on ? 'text-white/80' : 'text-suwela-slate'}`}>{String(k + 1).padStart(2, '0')}</span>
                </span>
                <span className={`mt-3 text-left font-semibold leading-tight ${on ? 'text-white' : 'text-suwela-navy'}`}>{s.title}</span>
                <span className={`mt-1 text-[11px] font-semibold ${on ? 'text-white/80' : ''}`} style={on ? undefined : { color: r.color }}>{r.label}</span>
                {on && (
                  <span className="absolute left-0 bottom-0 h-1.5 w-full bg-white/25">
                    <span key={`${i}-${auto}`} onAnimationEnd={next} className={`block h-full bg-white ${auto ? 'sw-fill' : 'w-full'}`} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* pointer from the chosen arrow down to the view */}
      <div className="hidden lg:block relative h-6">
        <span className="absolute top-2 w-0 h-0 transition-all duration-500 -translate-x-1/2"
              style={{ left: `${((i + 0.5) / STOPS.length) * 100}%`, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderBottom: `16px solid ${actor.color}` }} />
      </div>
      <div className="hidden lg:block">{view}</div>

      {/* phones and tablets: arrows stacked downwards, the view opens under the chosen one */}
      <div className="lg:hidden">
        {STOPS.map((s, k) => {
          const r = roleById(s.actor);
          const on = k === i;
          return (
            <div key={s.title} style={{ marginTop: k ? -12 : 0 }} className="relative">
              <button onClick={() => pick(k)} aria-expanded={on}
                      className="w-full flex items-center gap-4 px-5 text-left"
                      style={{
                        clipPath: k ? ARROW_DOWN : ARROW_DOWN_FIRST,
                        paddingTop: k ? 30 : 16, paddingBottom: 30,
                        backgroundColor: on ? r.color : `${r.tint}30`,
                        backgroundImage: on ? `linear-gradient(120deg, ${r.tint}, ${r.color})` : undefined,
                      }}>
                <span className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${on ? 'bg-white' : ''}`}
                      style={on ? { color: r.color } : { backgroundColor: r.color, color: '#fff' }}>
                  <s.icon className="w-6 h-6" />
                </span>
                <span className="min-w-0">
                  <span className={`block font-tech text-xs font-bold ${on ? 'text-white/80' : 'text-suwela-slate'}`}>{String(k + 1).padStart(2, '0')} · {r.label}</span>
                  <span className={`block font-semibold text-lg ${on ? 'text-white' : 'text-suwela-navy'}`}>{s.title}</span>
                </span>
              </button>
              {on && <div className="relative z-10 my-4">{view}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
