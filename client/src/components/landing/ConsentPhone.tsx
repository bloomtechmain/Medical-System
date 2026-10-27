import { useState } from 'react';
import { BellRing, Check, FileText, FlaskConical, Lock, LockOpen, Pill, Stethoscope, X } from 'lucide-react';
import { Leaf, Dots } from './Shapes';

// The access-request moment, drawn as the patient's phone. The buttons on the
// phone really work: approve and the record folder unlocks and fans open;
// decline and it stays shut.
type Answer = 'waiting' | 'approved' | 'declined';

const FILES = [
  { icon: Stethoscope,  label: 'Consultations', color: '#1598E9' },
  { icon: FlaskConical, label: 'Lab reports',   color: '#0279D1' },
  { icon: Pill,         label: 'Prescriptions', color: '#6A4DB6' },
];

export default function ConsentPhone() {
  const [answer, setAnswer] = useState<Answer>('waiting');
  const open = answer === 'approved';

  return (
    <div className="relative min-h-[560px] flex items-center justify-center">
      {/* backdrop shapes */}
      <div className="absolute inset-x-6 top-10 bottom-10 rounded-[48px] bg-gradient-to-br from-emerald-100 via-sky-50 to-sky-100" />
      <Leaf from="#43CE9F" to="#13A58F" className="absolute -left-2 bottom-4 w-36 h-36 sw-float" style={{ animationDelay: '.5s' }} />
      <Dots color="#31B0F7" className="absolute right-4 top-2 w-24 h-24 opacity-40" />

      <div className="relative flex items-center gap-4 sm:gap-8">
        {/* phone */}
        <div className="relative w-[250px] sm:w-[270px] h-[520px] rounded-[44px] bg-suwela-navy p-3 shadow-[0_40px_80px_-30px_rgba(14,44,82,0.6)] rotate-[-3deg]">
          <div className="relative h-full rounded-[34px] bg-suwela-paper overflow-hidden">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-suwela-navy" />
            <div className="pt-10 px-4 flex items-center gap-2">
              <img src="/brand/suwela-emblem.png" alt="" className="w-7 h-7 object-contain" />
              <span className="font-bold text-suwela-navy">Suwela</span>
            </div>
            <p className="px-4 mt-4 text-xs text-suwela-slate font-semibold uppercase tracking-wider">Access requests</p>

            <div key={answer} className="sw-pop mx-3 mt-2 rounded-3xl bg-white p-4 shadow-md">
              <div className="flex items-center gap-3">
                <span className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-300 to-suwela-blue flex items-center justify-center text-white">
                  <Stethoscope className="w-6 h-6" />
                  {answer === 'waiting' && <BellRing className="absolute -top-2 -right-2 w-6 h-6 p-1 rounded-full bg-suwela-orange text-white sw-breathe" />}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-suwela-ink text-sm">Dr. Perera</p>
                  <p className="text-xs text-suwela-slate">General physician</p>
                </div>
              </div>
              <p className="text-sm text-suwela-ink mt-3 leading-snug">
                {answer === 'waiting' && 'Would like to view your earlier medical history.'}
                {answer === 'approved' && 'You approved this request. Your history is now shared.'}
                {answer === 'declined' && 'You declined. Nothing from your history was shared.'}
              </p>
              {answer === 'waiting' ? (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button onClick={() => setAnswer('declined')}
                          className="inline-flex items-center justify-center gap-1 rounded-2xl bg-rose-50 text-rose-600 font-semibold text-sm py-2.5 hover:bg-rose-100">
                    <X className="w-4 h-4" /> Decline
                  </button>
                  <button onClick={() => setAnswer('approved')}
                          className="inline-flex items-center justify-center gap-1 rounded-2xl text-white font-semibold text-sm py-2.5 hover:brightness-110"
                          style={{ backgroundColor: '#13A58F' }}>
                    <Check className="w-4 h-4" /> Approve
                  </button>
                </div>
              ) : (
                <button onClick={() => setAnswer('waiting')} className="mt-4 w-full rounded-2xl bg-suwela-paper text-suwela-navy font-semibold text-sm py-2.5 hover:bg-suwela-line">
                  Try again
                </button>
              )}
            </div>

            {/* faint list rows to make the phone feel lived-in */}
            <div className="mx-3 mt-3 space-y-2">
              {['#5EDDB0', '#A68BF0', '#FFB36B'].map(c => (
                <div key={c} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3">
                  <span className="w-9 h-9 rounded-xl" style={{ background: `${c}55` }} />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-2 w-3/4 rounded bg-suwela-line" />
                    <span className="block h-2 w-1/2 rounded bg-suwela-line/70" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* record folder */}
        <div className="relative w-[160px] sm:w-[220px] h-[260px] hidden min-[420px]:block">
          {FILES.map((f, k) => (
            <div key={f.label}
                 className="absolute left-3 right-3 top-12 h-32 rounded-2xl bg-white shadow-lg p-3 transition-all duration-700 ease-[cubic-bezier(.2,.8,.3,1.2)]"
                 style={{
                   transform: open ? `translate(${(k - 1) * 44}px, ${-90 - k * 8}px) rotate(${(k - 1) * 12}deg)` : 'translate(0,0)',
                   transitionDelay: `${k * 90}ms`,
                 }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white" style={{ background: f.color }}>
                <f.icon className="w-6 h-6" />
              </span>
              <p className="text-xs font-semibold text-suwela-ink mt-2">{f.label}</p>
            </div>
          ))}
          <div className={`absolute inset-x-0 bottom-0 h-44 rounded-[32px] flex flex-col items-center justify-center gap-2 transition-colors duration-500 ${
            open ? 'bg-gradient-to-br from-suwela-mint to-suwela-green' : answer === 'declined' ? 'bg-gradient-to-br from-rose-300 to-rose-500' : 'bg-gradient-to-br from-slate-300 to-slate-400'}`}>
            <span key={answer} className="sw-pop w-20 h-20 rounded-full bg-white/25 flex items-center justify-center text-white">
              {open ? <LockOpen className="w-10 h-10" /> : <Lock className="w-10 h-10" />}
            </span>
            <span className="text-white text-base font-bold flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Your record
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
