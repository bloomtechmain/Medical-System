import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

// Decorative shapes borrowed from the Suwela emblem — the leaf, the cross and
// the S-curve — plus a capsule for the pharmacy side. Each takes a pair of
// colours and draws its own gradient.
type ShapeProps = { from: string; to: string; className?: string; style?: CSSProperties };

function Grad({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}

export function Leaf({ from, to, className, style }: ShapeProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs><Grad id={id} from={from} to={to} /></defs>
      <path d="M8,92 C8,40 40,8 92,8 C92,60 60,92 8,92 Z" fill={`url(#${id})`} />
      <path d="M20,80 C40,58 58,40 78,22" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Cross({ from, to, className, style }: ShapeProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs><Grad id={id} from={from} to={to} /></defs>
      <path d="M36,6 h28 a6,6 0 0 1 6,6 v24 h24 a6,6 0 0 1 6,6 v16 a6,6 0 0 1 -6,6 h-24 v24 a6,6 0 0 1 -6,6 h-28 a6,6 0 0 1 -6,-6 v-24 h-24 a6,6 0 0 1 -6,-6 v-16 a6,6 0 0 1 6,-6 h24 v-24 a6,6 0 0 1 6,-6 z"
            fill={`url(#${id})`} />
    </svg>
  );
}

export function Capsule({ from, to, className, style }: ShapeProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs><Grad id={id} from={from} to={to} /></defs>
      <g transform="rotate(-40 50 50)">
        <rect x="10" y="32" width="80" height="36" rx="18" fill={`url(#${id})`} />
        <path d="M50,32 h22 a18,18 0 0 1 0,36 h-22 z" fill="#fff" fillOpacity=".35" />
        <rect x="20" y="40" width="20" height="6" rx="3" fill="#fff" fillOpacity=".5" />
      </g>
    </svg>
  );
}

export function Swoosh({ from, to, className, style }: ShapeProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 120 100" className={className} style={style} aria-hidden>
      <defs><Grad id={id} from={from} to={to} /></defs>
      <path d="M100,18 C70,2 22,10 22,38 C22,62 98,48 98,72 C98,94 50,100 16,84" stroke={`url(#${id})`} strokeWidth="16" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Ring({ from, to, className, style }: ShapeProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs><Grad id={id} from={from} to={to} /></defs>
      <circle cx="50" cy="50" r="38" stroke={`url(#${id})`} strokeWidth="12" fill="none" />
    </svg>
  );
}

export function Dots({ color, className, style }: { color: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      {Array.from({ length: 25 }, (_, i) => (
        <circle key={i} cx={10 + (i % 5) * 20} cy={10 + Math.floor(i / 5) * 20} r="3.4" fill={color} />
      ))}
    </svg>
  );
}

// One floating shape: parallax depth, float timing, starting tilt. Hover it
// and it grows and turns (see .sw-shape in index.css).
export function Floating({ children, depth = 12, dur = 7, delay = 0, rot = 0, className = '' }: {
  children: ReactNode; depth?: number; dur?: number; delay?: number; rot?: number; className?: string;
}) {
  return (
    <div className={`sw-shape absolute ${className}`} style={{ '--depth': depth } as CSSProperties}>
      <div className="sw-float" style={{ '--sw-dur': `${dur}s`, '--sw-rot': `${rot}deg`, animationDelay: `${delay}s` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

// Wraps a section so its Floating children follow the pointer.
export function ShapeField({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
        el.style.setProperty('--my', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);
  return <div ref={ref} className={className} style={style}>{children}</div>;
}
