import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, LogIn, UserPlus } from 'lucide-react';
import { ROLES, roleById, type RoleId } from './roles';
import { Leaf, Cross, Dots } from './Shapes';

// The sign-in hub. Every account type signs in through the same /login form;
// this section exists so people can find their own door first.
export default function RoleExplorer() {
  const [id, setId] = useState<RoleId>('patient');
  const r = roleById(id);

  return (
    <div>
      {/* big role picker */}
      <div role="tablist" aria-label="Account types" className="grid grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {ROLES.map(role => {
          const on = role.id === id;
          return (
            <button key={role.id} role="tab" aria-selected={on} onClick={() => setId(role.id)}
                    className={`group relative flex flex-col items-center gap-3 rounded-[28px] px-2 py-5 sm:py-6 transition-all duration-300 ${
                      on ? 'bg-white -translate-y-2' : 'bg-white/50 hover:bg-white hover:-translate-y-1'}`}
                    style={on ? { boxShadow: `0 24px 40px -20px ${role.color}` } : undefined}>
              <span className={`flex items-center justify-center rounded-[22px] text-white transition-all duration-300 ${on ? 'w-[72px] h-[72px] sm:w-20 sm:h-20' : 'w-14 h-14 sm:w-16 sm:h-16'}`}
                    style={{ background: `linear-gradient(135deg, ${role.tint}, ${role.color})` }}>
                <role.icon className={`${on ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-7 h-7 sm:w-8 sm:h-8'} sw-wiggle transition-all`} strokeWidth={1.9} />
              </span>
              <span className={`text-xs sm:text-sm font-semibold text-center leading-tight ${on ? 'text-suwela-navy' : 'text-suwela-slate'}`}>{role.label}</span>
              {on && <span className="absolute -bottom-2 w-10 h-1.5 rounded-full" style={{ background: role.color }} />}
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div key={id} role="tabpanel" className="sw-rise mt-8 grid lg:grid-cols-[1.1fr_1fr] rounded-[36px] overflow-hidden bg-white shadow-[0_30px_70px_-40px_rgba(14,44,82,0.5)]">
        <div className="relative p-7 sm:p-10">
          <h3 className="font-display text-4xl text-suwela-navy">{r.label}</h3>
          <p className="text-lg text-suwela-slate mt-3 leading-relaxed">{r.pitch}</p>

          <ul className="mt-6 grid sm:grid-cols-2 gap-3">
            {r.can.map(c => (
              <li key={c} className="flex gap-3 rounded-2xl p-3.5 text-sm text-suwela-ink" style={{ background: `${r.tint}1f` }}>
                <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: r.color }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl text-white font-semibold px-6 py-3.5 transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: r.color, backgroundImage: `linear-gradient(135deg, ${r.color}, ${r.tint})`, boxShadow: `0 14px 28px -12px ${r.color}` }}>
              <LogIn className="w-5 h-5" /> Sign in as {r.label.toLowerCase()}
            </Link>
            {r.register ? (
              <Link to={r.register.to} className="inline-flex items-center gap-2 rounded-2xl bg-suwela-paper text-suwela-navy font-semibold px-6 py-3.5 hover:bg-suwela-line transition-colors">
                <UserPlus className="w-5 h-5" /> {r.register.label}
              </Link>
            ) : (
              <span className="self-center text-sm text-suwela-slate">Admin accounts are created by the Suwela team.</span>
            )}
          </div>
        </div>

        {/* colourful sketch of the dashboard this role lands on */}
        <div className="relative overflow-hidden p-7 sm:p-10 flex items-center" style={{ backgroundColor: r.color, backgroundImage: `linear-gradient(140deg, ${r.tint}, ${r.color})` }}>
          <Leaf from="#ffffff" to="#ffffff" className="absolute -right-10 -top-10 w-56 h-56 opacity-15 sw-float" />
          <Cross from="#ffffff" to="#ffffff" className="absolute left-4 bottom-4 w-20 h-20 opacity-15 sw-float" style={{ animationDelay: '1.2s' }} />
          <Dots color="#ffffff" className="absolute right-8 bottom-6 w-20 h-20 opacity-30" />

          <div className="relative w-full rounded-3xl bg-white shadow-2xl overflow-hidden rotate-[1.5deg] transition-transform duration-500 hover:rotate-0 hover:scale-[1.02]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-suwela-line">
              <img src="/brand/suwela-emblem.png" alt="" className="w-5 h-5 object-contain" />
              <span className="text-xs font-bold text-suwela-navy">Suwela</span>
              <span className="ml-auto w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: r.color }}>
                <r.icon className="w-4 h-4" />
              </span>
            </div>
            <div className="grid grid-cols-[118px_1fr] min-h-[240px]">
              <div className="border-r border-suwela-line p-2.5 space-y-1">
                {r.nav.map((n, i) => (
                  <div key={n} className={`rounded-lg px-2.5 py-1.5 text-[11px] truncate ${i === 0 ? 'text-white font-semibold' : 'text-suwela-slate'}`}
                       style={i === 0 ? { backgroundColor: r.color } : undefined}>{n}</div>
                ))}
              </div>
              <div className="p-3.5 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(k => (
                    <div key={k} className="rounded-xl p-2.5" style={{ background: `${r.tint}${['33', '22', '14'][k]}` }}>
                      <div className="w-6 h-6 rounded-lg" style={{ background: r.color, opacity: 0.4 + k * 0.25 }} />
                      <div className="h-2 w-10 rounded bg-white mt-2" />
                    </div>
                  ))}
                </div>
                <svg viewBox="0 0 200 64" className="w-full h-16">
                  <path d="M0,52 C20,44 30,48 50,38 S80,40 100,28 S140,30 160,16 S190,14 200,10 V64 H0 Z" fill={r.tint} fillOpacity=".25" />
                  <path d="M0,52 C20,44 30,48 50,38 S80,40 100,28 S140,30 160,16 S190,14 200,10" fill="none" stroke={r.color} strokeWidth="3" strokeLinecap="round" />
                  <circle cx="160" cy="16" r="5" fill="#fff" stroke={r.color} strokeWidth="3" />
                </svg>
                {[0, 1].map(k => (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full" style={{ background: `${r.tint}55` }} />
                    <span className="flex-1 space-y-1">
                      <span className="block h-2 rounded bg-suwela-line" style={{ width: `${80 - k * 20}%` }} />
                      <span className="block h-2 rounded bg-suwela-line/60" style={{ width: `${50 - k * 10}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
