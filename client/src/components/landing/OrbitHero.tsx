import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ROLES, roleById, type RoleId } from './roles';

// Hero illustration: the emblem in the middle, every kind of user circling it.
// Hover or tap a bubble to stop the orbit and read about that role.
const ORBIT = ROLES.filter(r => r.id !== 'admin');

export default function OrbitHero() {
  const [active, setActive] = useState<RoleId | null>(null);
  const shown = roleById(active ?? 'doctor');

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className={`relative aspect-square ${active ? 'sw-orbit-paused' : ''}`}>
        {/* soft coloured disc behind everything */}
        <div className="absolute inset-[6%] rounded-full bg-gradient-to-br from-sky-100 via-white to-emerald-100" />
        <div className="absolute inset-[6%] rounded-full border-[3px] border-dashed border-suwela-blue/25" />
        <div className="absolute inset-[24%] rounded-full border-2 border-suwela-mint/40" />

        {/* centre: emblem with pulsing rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="absolute w-[34%] aspect-square rounded-full bg-suwela-mint/30 sw-ring" />
          <span className="absolute w-[34%] aspect-square rounded-full bg-suwela-sky/30 sw-ring" style={{ animationDelay: '1.6s' }} />
          <div className="relative w-[34%] aspect-square rounded-full bg-white shadow-[0_20px_50px_-15px_rgba(2,121,209,0.45)] flex items-center justify-center">
            <img src="/brand/suwela-emblem.png" alt="Suwela" className="w-[62%] h-[62%] object-contain" />
          </div>
        </div>

        {/* orbiting role bubbles */}
        <div className="absolute inset-0 sw-orbit">
          {ORBIT.map((r, i) => {
            const a = (i / ORBIT.length) * Math.PI * 2 - Math.PI / 2;
            const left = 50 + 44 * Math.cos(a);
            const top = 50 + 44 * Math.sin(a);
            const on = active === r.id;
            return (
              <div key={r.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                <div className="sw-orbit-keep">
                  <button
                    onMouseEnter={() => setActive(r.id)} onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(r.id)} onBlur={() => setActive(null)}
                    onClick={() => setActive(on ? null : r.id)}
                    aria-label={r.label}
                    className="group flex flex-col items-center gap-2 focus:outline-none">
                    <span className={`relative flex items-center justify-center w-16 h-16 sm:w-[88px] sm:h-[88px] rounded-[28px] text-white transition-all duration-300 ${on ? 'scale-[1.15] rotate-6' : 'group-hover:scale-110'}`}
                          style={{ background: `linear-gradient(135deg, ${r.tint}, ${r.color})`, boxShadow: `0 16px 30px -12px ${r.color}` }}>
                      <r.icon className="w-8 h-8 sm:w-10 sm:h-10 sw-wiggle" strokeWidth={1.9} />
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white" style={{ boxShadow: `0 0 0 4px ${r.tint}66` }} />
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white text-xs sm:text-sm font-semibold text-suwela-ink shadow-sm whitespace-nowrap">
                      {r.short}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* role card */}
      <div key={shown.id} className="sw-rise relative mt-4 mx-auto max-w-md rounded-3xl bg-white p-5 shadow-[0_24px_60px_-25px_rgba(14,44,82,0.4)] flex gap-4 items-start">
        <span className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-white"
              style={{ background: `linear-gradient(135deg, ${shown.tint}, ${shown.color})` }}>
          <shown.icon className="w-7 h-7" />
        </span>
        <div>
          <p className="font-bold text-suwela-navy">{active ? shown.label : 'Tap a bubble to meet each role'}</p>
          <p className="text-sm text-suwela-slate mt-1 leading-relaxed">{shown.pitch}</p>
          <Link to="/login" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:gap-2.5 transition-all" style={{ color: shown.color }}>
            Sign in as {shown.label.toLowerCase()} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
