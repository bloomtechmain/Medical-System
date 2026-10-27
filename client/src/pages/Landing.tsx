import { Link } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Building2, Check, Heart, LogIn, Menu, Sparkles, UserPlus, X } from 'lucide-react';
import BrandMark from '../components/landing/BrandMark';
import OrbitHero from '../components/landing/OrbitHero';
import HeroHeadline from '../components/landing/HeroHeadline';
import JourneyRoad from '../components/landing/JourneyRoad';
import ConsentPhone from '../components/landing/ConsentPhone';
import RoleExplorer from '../components/landing/RoleExplorer';
import { FeatureBento, Ticker, SafetyCards } from '../components/landing/Features';
import { ShapeField, Floating, Leaf, Cross, Capsule, Ring, Swoosh, Dots } from '../components/landing/Shapes';
import { ROLES } from '../components/landing/roles';

// Public front door for Suwela Medical Hub. Every action here is a link into
// the existing auth routes (/login, /register, /org-register) — this page
// adds no behaviour of its own.

const NAV = [
  { href: '#journey',  label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#sign-in',  label: 'Sign in' },
  { href: '#orgs',     label: 'For organisations' },
];

function Badge({ children, color = '#13A58F' }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-sm" style={{ color }}>
      <Sparkles className="w-4 h-4" /> {children}
    </span>
  );
}

function SectionHead({ badge, color, title, children }: { badge: string; color?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-12 text-center mx-auto max-w-3xl">
      <Badge color={color}>{badge}</Badge>
      <h2 className="font-display text-4xl sm:text-5xl leading-[1.08] text-suwela-navy mt-5">{title}</h2>
      {children && <p className="mt-5 text-lg text-suwela-slate leading-relaxed">{children}</p>}
    </div>
  );
}

function GetStartedModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = [
    { to: '/register', title: 'As a person', text: 'Patients and doctors create a personal account.', ids: ['patient', 'doctor'], color: '#13A58F' },
    { to: '/org-register', title: 'As an organisation', text: 'Hospitals, clinics, pharmacies and laboratories. Reviewed before going live.', ids: ['org', 'pharmacist', 'laboratory'], color: '#6A4DB6' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-suwela-navy/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="gs-title"
           className="sw-pop relative bg-white w-full sm:max-w-2xl rounded-t-[36px] sm:rounded-[36px] overflow-hidden"
           onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <Leaf from="#43CE9F" to="#13A58F" className="absolute -right-8 -top-8 w-40 h-40 opacity-20" />
        <div className="relative flex items-start justify-between px-7 pt-7">
          <div>
            <img src="/brand/suwela-emblem.png" alt="" className="w-12 h-12 object-contain" />
            <p id="gs-title" className="font-display text-3xl text-suwela-navy mt-3">How are you joining?</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full bg-suwela-paper flex items-center justify-center text-suwela-slate hover:text-suwela-navy">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative grid sm:grid-cols-2 gap-4 p-7">
          {options.map(o => (
            <Link key={o.to} to={o.to} onClick={onClose}
                  className="group relative rounded-[28px] bg-suwela-paper p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-xl">
              <span className="flex -space-x-3">
                {ROLES.filter(r => o.ids.includes(r.id)).map(r => (
                  <span key={r.id} className="w-14 h-14 rounded-2xl ring-4 ring-white flex items-center justify-center text-white transition-transform group-hover:-rotate-6"
                        style={{ background: `linear-gradient(135deg, ${r.tint}, ${r.color})` }}>
                    <r.icon className="w-7 h-7" />
                  </span>
                ))}
              </span>
              <p className="font-bold text-lg text-suwela-ink mt-5">{o.title}</p>
              <p className="text-sm text-suwela-slate mt-1 leading-relaxed">{o.text}</p>
              <ArrowUpRight className="absolute top-6 right-6 w-6 h-6 transition-all group-hover:translate-x-1 group-hover:-translate-y-1" style={{ color: o.color }} />
            </Link>
          ))}
        </div>
        <p className="relative px-7 pb-7 text-suwela-slate">
          Already have an account?{' '}
          <Link to="/login" onClick={onClose} className="font-semibold text-suwela-navy underline underline-offset-4 decoration-suwela-mint decoration-2">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGetStarted, setShowGetStarted] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-suwela-paper text-suwela-ink overflow-x-hidden">

      {/* ── Navbar ───────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled || menuOpen ? 'bg-white/90 backdrop-blur-md shadow-[0_6px_30px_-18px_rgba(14,44,82,0.4)]' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[76px] flex items-center justify-between gap-6">
          <Link to="/" aria-label="Suwela home"><BrandMark /></Link>

          <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/70 px-2 py-1.5 shadow-sm">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className="rounded-full px-4 py-2 text-sm font-medium text-suwela-slate hover:text-suwela-navy hover:bg-suwela-paper transition-colors">{n.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-suwela-navy px-4 py-2.5 rounded-full hover:bg-white">
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
            <button onClick={() => setShowGetStarted(true)}
                    className="text-sm font-semibold px-5 py-3 rounded-full text-white shadow-[0_10px_24px_-10px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform"
                    style={{ backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
              Get started
            </button>
            <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu" aria-expanded={menuOpen}
                    className="lg:hidden w-11 h-11 rounded-full flex items-center justify-center text-suwela-navy bg-white shadow-sm">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lg:hidden px-4 pb-4 space-y-1">
            {NAV.map(n => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                 className="block rounded-2xl px-4 py-3 font-medium text-suwela-ink hover:bg-suwela-paper">{n.label}</a>
            ))}
            <Link to="/login" className="flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold text-suwela-navy hover:bg-suwela-paper sm:hidden">
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <ShapeField className="relative overflow-hidden bg-gradient-to-b from-[#E6F5FF] via-[#F1FBF6] to-suwela-paper pt-[76px]">
        {/* floating, pointer-following shapes from the emblem */}
        <Floating depth={-30} dur={8} className="left-[1%] top-[9%] hidden sm:block"><Leaf from="#5EDDB0" to="#13A58F" className="w-20 h-20" /></Floating>
        <Floating depth={40} dur={9} delay={1} rot={12} className="left-[42%] top-[10%] hidden lg:block"><Cross from="#5CC6FF" to="#1598E9" className="w-16 h-16" /></Floating>
        <Floating depth={-20} dur={7} delay={.5} className="left-[47%] bottom-[34%] hidden lg:block"><Capsule from="#A68BF0" to="#6A4DB6" className="w-24 h-24" /></Floating>
        <Floating depth={25} dur={10} delay={2} className="right-[2%] top-[14%] hidden md:block"><Ring from="#FFB36B" to="#EF7B2D" className="w-20 h-20" /></Floating>
        <Floating depth={-35} dur={8.5} delay={1.5} rot={-10} className="right-[4%] bottom-[10%] hidden md:block"><Swoosh from="#31B0F7" to="#43CE9F" className="w-28 h-24" /></Floating>
        <Floating depth={18} dur={11} className="left-[2%] bottom-[8%] hidden md:block"><Dots color="#31B0F7" className="w-24 h-24 opacity-40" /></Floating>
        <Floating depth={50} dur={6} delay={.8} className="left-[24%] top-[9%] hidden xl:block"><Cross from="#5EDDB0" to="#13A58F" className="w-9 h-9" /></Floating>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 lg:pt-14 pb-24 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="sw-rise relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white pl-1.5 pr-4 py-1.5 shadow-sm">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-suwela-mint to-suwela-green flex items-center justify-center">
                <Heart className="w-4 h-4 text-white" fill="currentColor" />
              </span>
              <span className="text-sm font-semibold text-suwela-navy">Sri Lanka’s connected medical hub</span>
            </span>
            <div className="mt-6"><HeroHeadline /></div>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link to="/login"
                    className="group inline-flex items-center justify-center gap-2.5 rounded-full text-white text-lg font-semibold pl-7 pr-3 py-3 hover:brightness-125 transition shadow-[0_16px_30px_-14px_rgba(14,44,82,0.8)]"
                    style={{ backgroundColor: '#0E2C52' }}>
                Sign in
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-suwela-sky to-suwela-green flex items-center justify-center transition-transform group-hover:translate-x-1">
                  <ArrowRight className="w-5 h-5" />
                </span>
              </Link>
              <button onClick={() => setShowGetStarted(true)}
                      className="inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-suwela-navy text-lg font-semibold px-7 py-4 shadow-sm hover:shadow-md transition">
                <UserPlus className="w-5 h-5" /> Create an account
              </button>
            </div>

            {/* small reassurances */}
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-suwela-slate">
              {['Free for patients', 'English & සිංහල', 'You choose who sees your history'].map(t => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-suwela-mint/25 text-suwela-green flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <OrbitHero />
        </div>

        {/* wave into the ticker */}
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-16" aria-hidden>
          <path d="M0,60 C240,10 480,90 720,50 C960,10 1200,70 1440,30 V80 H0 Z" fill="#0E2C52" />
        </svg>
      </ShapeField>

      <Ticker />

      {/* ── Journey ──────────────────────────────────────────────── */}
      <section id="journey" className="scroll-mt-24 relative py-24 lg:py-32 overflow-hidden">
        <Leaf from="#43CE9F" to="#13A58F" className="absolute -left-16 top-24 w-64 h-64 opacity-10" />
        <Cross from="#31B0F7" to="#1598E9" className="absolute -right-10 top-28 w-52 h-52 opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead badge="How it works" title={<>From <em className="text-suwela-blue">booking</em> to <em className="text-suwela-green">medicine</em>, in one visit.</>}>
            One visit, step by step — and what each step looks like inside Suwela.
          </SectionHead>
          <JourneyRoad />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-24 pt-24 lg:pt-32 pb-8 bg-white rounded-t-[56px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead badge="Features" color="#6A4DB6" title="Everything your care needs, in one place.">
            Built for the whole path of care — from the first appointment to the last pill.
          </SectionHead>
          <FeatureBento />
        </div>
      </section>

      {/* ── Consent ──────────────────────────────────────────────── */}
      <section id="consent" className="scroll-mt-24 py-24 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <Badge color="#13A58F">Your consent</Badge>
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.08] text-suwela-navy mt-5">
              Your history opens only when <span className="italic text-suwela-green">you</span> say yes.
            </h2>
            <p className="mt-6 text-lg text-suwela-slate leading-relaxed max-w-lg">
              A new doctor sees the visits they handle. To read anything older they must ask — and the request
              waits on your phone until you decide.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 text-suwela-forest font-semibold px-5 py-2.5">
              Go on — tap Approve or Decline on the phone.
            </p>
          </div>
          <ConsentPhone />
        </div>
      </section>

      {/* ── Sign-in hub ──────────────────────────────────────────── */}
      <section id="sign-in" className="scroll-mt-24 relative py-24 lg:py-32 bg-gradient-to-b from-[#EAF6FF] to-[#EDFBF4] overflow-hidden">
        <Ring from="#43CE9F" to="#13A58F" className="absolute -left-20 -top-20 w-80 h-80 opacity-10" />
        <Capsule from="#A68BF0" to="#6A4DB6" className="absolute -right-10 top-40 w-56 h-56 opacity-10 sw-float" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead badge="Sign in" color="#1598E9" title="One door for everyone.">
            Pick who you are to see what’s waiting for you. Everyone signs in on the same page — Suwela opens the right dashboard.
          </SectionHead>
          <RoleExplorer />
        </div>
      </section>

      {/* ── For organisations (the advert) ───────────────────────── */}
      <section id="orgs" className="scroll-mt-24 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ShapeField className="relative overflow-hidden rounded-[44px] text-white"
                      style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
            <Floating depth={-25} dur={9} className="-right-10 -top-16"><Leaf from="#43CE9F" to="#13A58F" className="w-80 h-80 opacity-30" /></Floating>
            <Floating depth={30} dur={7} delay={1} className="left-[46%] bottom-6 hidden lg:block"><Cross from="#5CC6FF" to="#1598E9" className="w-20 h-20 opacity-70" /></Floating>
            <Floating depth={-15} dur={8} delay={.4} className="right-8 bottom-6"><Capsule from="#A68BF0" to="#6A4DB6" className="w-20 h-20 opacity-60" /></Floating>
            <Floating depth={20} dur={10} delay={2} className="left-[46%] top-10 hidden lg:block"><Ring from="#FFB36B" to="#EF7B2D" className="w-14 h-14 opacity-70" /></Floating>

            <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-12 p-8 sm:p-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-suwela-mint">
                  <Building2 className="w-4 h-4" /> For organisations
                </span>
                <h2 className="font-display text-4xl sm:text-5xl leading-[1.08] mt-5">
                  Bring your hospital, clinic, pharmacy or lab onto Suwela.
                </h2>
                <p className="mt-5 text-lg text-white/75 leading-relaxed max-w-lg">
                  Your own workspace, your own team, your own stock — and prescriptions and test requests
                  that arrive already typed. No setup fee.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link to="/org-register"
                        className="inline-flex items-center gap-2 rounded-full bg-white text-suwela-navy text-lg font-semibold px-7 py-4 hover:-translate-y-0.5 transition-transform shadow-xl">
                    <Building2 className="w-5 h-5" /> Register your organisation
                  </Link>
                  <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-white/10 text-lg font-semibold px-7 py-4 hover:bg-white/20 transition-colors">
                    Already registered? Sign in
                  </Link>
                </div>
              </div>

              {/* org type tiles + onboarding steps */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {ROLES.filter(r => r.id === 'org' || r.id === 'pharmacist' || r.id === 'laboratory').map(r => (
                    <Link key={r.id} to="/org-register"
                          className="group rounded-3xl bg-white/10 p-4 flex flex-col items-center gap-3 hover:bg-white/20 transition-colors">
                      <span className="w-16 h-16 rounded-[22px] flex items-center justify-center text-white transition-transform group-hover:-translate-y-1 group-hover:rotate-6"
                            style={{ background: `linear-gradient(135deg, ${r.tint}, ${r.color})` }}>
                        <r.icon className="w-8 h-8" />
                      </span>
                      <span className="text-sm font-semibold text-center">{r.label}</span>
                    </Link>
                  ))}
                </div>
                {[
                  { t: 'Send your details', d: 'Organisation type, licence number and the owner’s account.' },
                  { t: 'We review it', d: 'The Suwela team checks the registration before anything goes live.' },
                  { t: 'Your workspace opens', d: 'Invite your staff and start receiving patients.' },
                ].map((s, i) => (
                  <div key={s.t} className="flex items-center gap-4 rounded-3xl bg-white/[0.07] p-4">
                    <span className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-suwela-sky to-suwela-mint text-suwela-navy font-bold text-lg flex items-center justify-center">{i + 1}</span>
                    <div>
                      <p className="font-semibold text-lg">{s.t}</p>
                      <p className="text-sm text-white/65">{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ShapeField>
        </div>
      </section>

      {/* ── Safety ───────────────────────────────────────────────── */}
      <section className="py-20 lg:py-24 bg-gradient-to-b from-suwela-paper to-[#EEF7F3]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead badge="Safe by design" color="#EF7B2D" title="Kept private where it matters.">
            Medical records, organisation data and accounts are kept apart, each with its own rules.
          </SectionHead>
          <SafetyCards />
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────── */}
      <section className="relative py-24 overflow-hidden bg-[#EEF7F3]">
        <Leaf from="#43CE9F" to="#13A58F" className="absolute left-[8%] top-10 w-24 h-24 opacity-30 sw-float" />
        <Cross from="#31B0F7" to="#1598E9" className="absolute right-[10%] bottom-12 w-20 h-20 opacity-30 sw-float" style={{ animationDelay: '1s' }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="relative w-28 h-28 mx-auto">
            <span className="absolute inset-0 rounded-full bg-suwela-mint/30 sw-ring" />
            <span className="relative w-28 h-28 rounded-full bg-white shadow-xl flex items-center justify-center">
              <img src="/brand/suwela-emblem.png" alt="" className="w-16 h-16 object-contain" />
            </span>
          </div>
          <h2 className="font-display text-4xl sm:text-5xl text-suwela-navy mt-8">Start with your next visit.</h2>
          <p className="text-lg text-suwela-slate mt-4">Patients join free. Doctors and organisations sign up in a few minutes.</p>
          <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full text-white text-lg font-semibold px-8 py-4 shadow-[0_16px_30px_-12px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform"
                  style={{ backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
              <UserPlus className="w-5 h-5" /> Create a personal account
            </Link>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-suwela-navy text-lg font-semibold px-8 py-4 shadow-sm hover:shadow-md transition">
              <LogIn className="w-5 h-5" /> Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="text-white/65" style={{ backgroundColor: '#0E2C52' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <BrandMark tone="light" />
            <p className="mt-5 max-w-xs leading-relaxed">
              One connected record for patients, doctors, pharmacies, laboratories, hospitals and clinics.
            </p>
            <div className="mt-5 flex gap-2">
              {ROLES.filter(r => r.id !== 'admin').map(r => (
                <span key={r.id} className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${r.tint}, ${r.color})` }}>
                  <r.icon className="w-5 h-5" />
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-white mb-4">Accounts</p>
            <ul className="space-y-2.5">
              <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
              <li><Link to="/register" className="hover:text-white">Patient or doctor sign-up</Link></li>
              <li><Link to="/org-register" className="hover:text-white">Register an organisation</Link></li>
              <li><Link to="/forgot-password" className="hover:text-white">Forgot password</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold text-white mb-4">Legal</p>
            <ul className="space-y-2.5">
              <li><Link to="/privacy" className="hover:text-white">Privacy policy</Link></li>
              <li><Link to="/terms" className="hover:text-white">Terms of service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-sm text-white/45">
            © {new Date().getFullYear()} Suwela Medical Hub. Built by BloomTech.
          </p>
        </div>
      </footer>

    </div>
  );
}
