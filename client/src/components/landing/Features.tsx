import { useRef, type CSSProperties, type ReactNode } from 'react';
import {
  History, Pill, FlaskConical, CalendarDays, Languages, ScanText, Download, Users, Building2, KeyRound, ScrollText, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Leaf, Cross, Capsule, Ring, Swoosh } from './Shapes';

// Tile that leans toward the pointer.
function Tilt({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg) translateY(-4px)`;
  };
  const leave = () => { if (ref.current) ref.current.style.transform = ''; };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} style={style}
         className={`group relative overflow-hidden transition-transform duration-300 ease-out will-change-transform ${className}`}>
      {children}
    </div>
  );
}

const TILES: { icon: LucideIcon; title: string; text: string; from: string; to: string; bg: string; span: string; Shape: typeof Leaf }[] = [
  { icon: History, title: 'One medical timeline', text: 'Consultations, prescriptions and lab results in the order they happened — searchable, and yours to keep.',
    from: '#5EDDB0', to: '#13A58F', bg: 'bg-emerald-50', span: 'lg:col-span-2 lg:row-span-2', Shape: Leaf },
  { icon: Pill, title: 'Prescriptions that travel', text: 'Sent to one pharmacy or several, straight from the consultation.',
    from: '#A68BF0', to: '#6A4DB6', bg: 'bg-violet-50', span: '', Shape: Capsule },
  { icon: FlaskConical, title: 'Lab results, no chasing', text: 'Reports land on the record the moment the lab uploads them.',
    from: '#38B6F5', to: '#0279D1', bg: 'bg-sky-50', span: '', Shape: Ring },
  { icon: CalendarDays, title: 'Easy appointments', text: 'Book a doctor in a few taps and see your upcoming visits.',
    from: '#FFB36B', to: '#EF7B2D', bg: 'bg-orange-50', span: '', Shape: Cross },
  { icon: Languages, title: 'English & සිංහල', text: 'Switch language any time from your settings.',
    from: '#5CC6FF', to: '#1598E9', bg: 'bg-blue-50', span: '', Shape: Swoosh },
  { icon: ScanText, title: 'Old reports, read for you', text: 'Upload a scan — readings are picked out where possible.',
    from: '#5EDDB0', to: '#07947E', bg: 'bg-teal-50', span: '', Shape: Leaf },
  { icon: Download, title: 'Health report PDF', text: 'Download a tidy summary to carry or share.',
    from: '#A68BF0', to: '#6A4DB6', bg: 'bg-purple-50', span: '', Shape: Ring },
  { icon: Users, title: 'Teams for organisations', text: 'Hospitals, pharmacies and labs invite their own staff.',
    from: '#FFB36B', to: '#EF7B2D', bg: 'bg-amber-50', span: 'lg:col-span-2', Shape: Cross },
];

export function FeatureBento() {
  const [hero, ...rest] = TILES;
  const last = rest[rest.length - 1];
  const small = rest.slice(0, -1);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {/* lead tile: the timeline, with a little picture of it */}
      <Tilt className={`col-span-2 lg:row-span-2 rounded-[28px] sm:rounded-[32px] p-5 sm:p-8 ${hero.bg}`}>
        <hero.Shape from={hero.from} to={hero.to}
                    className="absolute -right-10 -bottom-10 w-56 h-56 sm:w-72 sm:h-72 opacity-25 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
        <div className="relative flex items-center gap-4">
          <span className="shrink-0 flex items-center justify-center rounded-[20px] w-14 h-14 sm:w-20 sm:h-20 text-white"
                style={{ backgroundColor: hero.to, backgroundImage: `linear-gradient(135deg, ${hero.from}, ${hero.to})`, boxShadow: `0 14px 28px -12px ${hero.to}` }}>
            <hero.icon className="w-7 h-7 sm:w-10 sm:h-10 sw-wiggle" strokeWidth={1.9} />
          </span>
          <h3 className="font-display text-suwela-navy text-2xl sm:text-4xl leading-tight">{hero.title}</h3>
        </div>
        <p className="relative text-suwela-slate mt-4 leading-relaxed sm:text-lg max-w-md">{hero.text}</p>
        <div className="relative mt-5 sm:mt-8 space-y-2.5 max-w-md">
          {[
            { c: '#1598E9', t: 'Consultation', d: 'Dr. Perera · fever, 3 days' },
            { c: '#6A4DB6', t: 'Prescription', d: 'Sent to City Pharmacy' },
            { c: '#0279D1', t: 'Lab report',   d: 'Full blood count' },
          ].map((row, j) => (
            <div key={row.t} className="flex items-center gap-3 rounded-2xl bg-white/90 px-3.5 py-3 shadow-sm transition-transform duration-300 group-hover:translate-x-2"
                 style={{ transitionDelay: `${j * 60}ms` }}>
              <span className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: row.c, boxShadow: `0 0 0 5px ${row.c}22` }} />
              <span className="text-sm font-semibold text-suwela-ink whitespace-nowrap">{row.t}</span>
              <span className="ml-auto min-w-0 truncate text-xs text-suwela-slate">{row.d}</span>
            </div>
          ))}
        </div>
      </Tilt>

      {/* the rest: solid colour squares, two across on a phone */}
      {small.map(({ icon: Icon, title, text, from, to, Shape }) => (
        <Tilt key={title}
              className="rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 text-white min-h-[188px] sm:min-h-[220px] flex flex-col active:scale-[0.97]"
              style={{ backgroundColor: to, backgroundImage: `linear-gradient(150deg, ${from}, ${to})`, boxShadow: `0 18px 36px -22px ${to}` }}>
          <Shape from="#ffffff" to="#ffffff"
                 className="absolute -right-6 -top-6 w-24 h-24 sm:w-32 sm:h-32 opacity-20 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
          <span className="relative flex items-center justify-center rounded-2xl w-12 h-12 sm:w-14 sm:h-14 bg-white shadow-md" style={{ color: to }}>
            <Icon className="w-6 h-6 sm:w-7 sm:h-7 sw-wiggle" strokeWidth={2} />
          </span>
          <h3 className="relative font-display text-lg sm:text-xl leading-tight mt-auto pt-4">{title}</h3>
          <p className="relative text-[13px] sm:text-sm text-white/85 mt-1 leading-snug">{text}</p>
        </Tilt>
      ))}

      {/* closing banner, full width on a phone */}
      <Tilt className="col-span-2 rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 text-white flex items-center gap-4 active:scale-[0.98]"
            style={{ backgroundColor: last.to, backgroundImage: `linear-gradient(120deg, ${last.from}, ${last.to})`, boxShadow: `0 18px 36px -22px ${last.to}` }}>
        <last.Shape from="#ffffff" to="#ffffff" className="absolute -right-6 -top-8 w-32 h-32 opacity-20 transition-transform duration-700 group-hover:rotate-45" />
        <span className="relative shrink-0 flex items-center justify-center rounded-2xl w-14 h-14 sm:w-16 sm:h-16 bg-white shadow-md" style={{ color: last.to }}>
          <last.icon className="w-7 h-7 sm:w-8 sm:h-8 sw-wiggle" strokeWidth={2} />
        </span>
        <span className="relative">
          <span className="block font-display text-xl leading-tight">{last.title}</span>
          <span className="block text-[13px] sm:text-sm text-white/85 mt-1">{last.text}</span>
        </span>
      </Tilt>
    </div>
  );
}

const TICKER: { icon: LucideIcon; label: string; color: string }[] = [
  { icon: CalendarDays, label: 'Appointments', color: '#EF7B2D' },
  { icon: Pill, label: 'Prescriptions', color: '#6A4DB6' },
  { icon: FlaskConical, label: 'Lab reports', color: '#0279D1' },
  { icon: History, label: 'Medical timeline', color: '#13A58F' },
  { icon: Languages, label: 'English & සිංහල', color: '#1598E9' },
  { icon: Building2, label: 'Hospitals & clinics', color: '#EF7B2D' },
  { icon: ShieldCheck, label: 'Patient consent', color: '#13A58F' },
  { icon: Download, label: 'PDF health reports', color: '#6A4DB6' },
];

export function Ticker() {
  const row = [...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden py-6" style={{ backgroundColor: '#0E2C52' }} aria-hidden>
      <div className="sw-marquee flex w-max gap-4">
        {row.map((t, k) => (
          <span key={k} className="flex items-center gap-3 rounded-full bg-white/[0.07] pl-2 pr-6 py-2">
            <span className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: t.color }}>
              <t.icon className="w-5 h-5" />
            </span>
            <span className="text-white text-lg font-semibold whitespace-nowrap">{t.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const SAFETY: { icon: LucideIcon; title: string; text: string; from: string; to: string; Shape: typeof Leaf }[] = [
  { icon: KeyRound, title: 'You hold the key', text: 'Doctors ask before they see your older history. You approve or decline, and the database enforces it.',
    from: '#5EDDB0', to: '#13A58F', Shape: Leaf },
  { icon: Building2, title: 'Every organisation in its own room', text: 'Each pharmacy and lab keeps its stock, prices and sales in a private space nobody else can open.',
    from: '#A68BF0', to: '#6A4DB6', Shape: Capsule },
  { icon: ScrollText, title: 'Sensitive actions are logged', text: 'Important changes leave a trail, and administrators sign in with a one-time code.',
    from: '#5CC6FF', to: '#1598E9', Shape: Cross },
];

export function SafetyCards() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {SAFETY.map(({ icon: Icon, title, text, from, to, Shape }) => (
        <Tilt key={title} className="rounded-[32px] bg-white p-8 shadow-[0_20px_50px_-30px_rgba(14,44,82,0.35)]">
          <div className="relative h-36 flex items-center justify-center">
            <Shape from={from} to={to} className="absolute w-36 h-36 opacity-20 transition-transform duration-700 group-hover:rotate-[60deg] group-hover:scale-110" />
            <span className="absolute w-28 h-28 rounded-full sw-ring" style={{ background: `${from}55` }} />
            <span className="relative w-24 h-24 rounded-[30px] flex items-center justify-center text-white"
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 18px 36px -14px ${to}` }}>
              <Icon className="w-11 h-11 sw-wiggle" strokeWidth={1.8} />
            </span>
          </div>
          <h3 className="font-display text-2xl text-suwela-navy mt-6 text-center">{title}</h3>
          <p className="text-suwela-slate mt-3 leading-relaxed text-center">{text}</p>
        </Tilt>
      ))}
    </div>
  );
}
