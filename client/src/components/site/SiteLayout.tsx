import { Link, NavLink, useLocation } from 'react-router-dom';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Building2, LogIn, Mail, Menu, Sparkles, UserPlus, X } from 'lucide-react';
import BrandMark from '../landing/BrandMark';
import { ShapeField, Floating, Leaf, Cross, Capsule, Ring } from '../landing/Shapes';
import { ROLES } from '../landing/roles';
import { NAV_LINKS, SUPPORT_EMAIL } from './siteConfig';

// Shared chrome for the public Suwela pages (landing, explore, news, story,
// about, help). Every page opens on the same light sky-to-mint hero as the
// landing page, so the navbar keeps dark text and only gains a white backing
// once the visitor scrolls.

const GRADIENT_BTN = { backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' };

export function Logo({ light = false, size = 'md' }: { light?: boolean; size?: 'md' | 'sm' }) {
  return (
    <Link to="/welcome" aria-label="Suwela home" className="shrink-0">
      <BrandMark tone={light ? 'light' : 'ink'} size={size} />
    </Link>
  );
}

export function GetStartedModal({ onClose }: { onClose: () => void }) {
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

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGetStarted, setShowGetStarted] = useState(false);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on navigation, and either jump to the #section the
  // link names or start the page at the top.
  useEffect(() => {
    setMenuOpen(false);
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <>
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled || menuOpen ? 'bg-white/90 backdrop-blur-md shadow-[0_6px_30px_-18px_rgba(14,44,82,0.4)]' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[76px] flex items-center justify-between gap-6">
          <Logo />

          <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/70 px-2 py-1.5 shadow-sm">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to}
                       className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                         isActive ? 'bg-suwela-navy text-white' : 'text-suwela-slate hover:text-suwela-navy hover:bg-suwela-paper'
                       }`}>
                {label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-suwela-navy px-4 py-2.5 rounded-full hover:bg-white">
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
            <button onClick={() => setShowGetStarted(true)}
                    className="text-sm font-semibold px-5 py-3 rounded-full text-white shadow-[0_10px_24px_-10px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform"
                    style={GRADIENT_BTN}>
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
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to}
                       className={({ isActive }) => `block rounded-2xl px-4 py-3 font-medium ${isActive ? 'bg-suwela-navy text-white' : 'text-suwela-ink hover:bg-suwela-paper'}`}>
                {label}
              </NavLink>
            ))}
            <Link to="/login" className="flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold text-suwela-navy hover:bg-suwela-paper sm:hidden">
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          </div>
        )}
      </nav>

      {showGetStarted && <GetStartedModal onClose={() => setShowGetStarted(false)} />}
    </>
  );
}

export function SiteFooter() {
  const columns = [
    { title: 'Platform', links: [
      { to: '/explore', label: 'Explore features' },
      { to: '/explore#organizations', label: 'For organisations' },
      { to: '/explore#pricing', label: 'Packages' },
      { to: '/news', label: 'News & updates' },
    ]},
    { title: 'Company', links: [
      { to: '/about', label: 'About us' },
      { to: '/share-story', label: 'Share your story' },
      { to: '/help#contact', label: 'Contact' },
    ]},
    { title: 'Accounts', links: [
      { to: '/login', label: 'Sign in' },
      { to: '/register', label: 'Patient or doctor sign-up' },
      { to: '/org-register', label: 'Register an organisation' },
      { to: '/forgot-password', label: 'Forgot password' },
    ]},
    { title: 'Support', links: [
      { to: '/help', label: 'Help centre' },
      { to: '/terms', label: 'Terms of service' },
      { to: '/privacy', label: 'Privacy policy' },
    ]},
  ];

  return (
    <footer className="text-white/65" style={{ backgroundColor: '#0E2C52' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <BrandMark tone="light" />
          <p className="mt-5 max-w-xs leading-relaxed">
            One connected record for patients, doctors, pharmacies, laboratories, hospitals and clinics.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors">
            <Mail className="w-4 h-4 text-suwela-mint" /> {SUPPORT_EMAIL}
          </a>
          <div className="mt-5 flex gap-2">
            {ROLES.filter(r => r.id !== 'admin').map(r => (
              <span key={r.id} className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${r.tint}, ${r.color})` }}>
                <r.icon className="w-5 h-5" />
              </span>
            ))}
          </div>
        </div>
        {columns.map(col => (
          <div key={col.title}>
            <p className="text-sm font-bold text-white mb-4">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map(l => (
                <li key={l.label}><Link to={l.to} className="hover:text-white">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-white/45">
          <p>© {new Date().getFullYear()} Suwela Medical Hub. Built by BloomTech.</p>
          <p>Made in Sri Lanka 🇱🇰</p>
        </div>
      </div>
    </footer>
  );
}

// Page header used by every inner page — the landing hero's sky-to-mint field
// and floating emblem shapes, with a serif display headline.
export function PageHero({ eyebrow, title, highlight, subtitle, children }: {
  eyebrow: string;
  title: string;
  highlight?: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <ShapeField className="relative overflow-hidden bg-gradient-to-b from-[#E6F5FF] via-[#F1FBF6] to-white pt-[76px]">
      <Floating depth={-30} dur={8} className="left-[3%] top-[22%] hidden sm:block"><Leaf from="#5EDDB0" to="#13A58F" className="w-16 h-16" /></Floating>
      <Floating depth={40} dur={9} delay={1} rot={12} className="right-[8%] top-[24%] hidden md:block"><Cross from="#5CC6FF" to="#1598E9" className="w-14 h-14" /></Floating>
      <Floating depth={-20} dur={7} delay={.5} className="left-[10%] bottom-[16%] hidden lg:block"><Capsule from="#A68BF0" to="#6A4DB6" className="w-16 h-16" /></Floating>
      <Floating depth={25} dur={10} delay={2} className="right-[4%] bottom-[18%] hidden md:block"><Ring from="#FFB36B" to="#EF7B2D" className="w-14 h-14" /></Floating>

      <div className="sw-rise relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-suwela-green shadow-sm">
          <Sparkles className="w-4 h-4" /> {eyebrow}
        </span>
        <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] text-suwela-navy mt-6 max-w-4xl mx-auto">
          {title}{' '}
          {highlight && <em className="text-transparent bg-clip-text bg-gradient-to-r from-suwela-blue to-suwela-green">{highlight}</em>}
        </h1>
        <p className="mt-6 text-lg text-suwela-slate max-w-2xl mx-auto leading-relaxed">{subtitle}</p>
        {children && <div className="mt-10">{children}</div>}
      </div>
    </ShapeField>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={`mb-12 ${center ? 'text-center mx-auto max-w-3xl' : ''}`}>
      <span className="inline-flex items-center gap-2 rounded-full bg-suwela-paper px-4 py-1.5 text-sm font-semibold text-suwela-green shadow-sm">
        <Sparkles className="w-4 h-4" /> {eyebrow}
      </span>
      <h2 className="font-display text-4xl sm:text-5xl leading-[1.08] text-suwela-navy mt-5">{title}</h2>
      {subtitle && <p className={`text-lg text-suwela-slate mt-4 leading-relaxed ${center ? '' : 'max-w-xl'}`}>{subtitle}</p>}
    </div>
  );
}

// Fades children up into place the first time they scroll into view.
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
    >
      {children}
    </div>
  );
}

export function CtaBand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ShapeField className="relative overflow-hidden rounded-[44px] text-white px-8 py-14 sm:px-14 text-center"
                    style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
          <Floating depth={-25} dur={9} className="-right-10 -top-16"><Leaf from="#43CE9F" to="#13A58F" className="w-72 h-72 opacity-30" /></Floating>
          <Floating depth={-15} dur={8} delay={.4} className="left-8 bottom-6 hidden sm:block"><Capsule from="#A68BF0" to="#6A4DB6" className="w-16 h-16 opacity-60" /></Floating>
          <div className="relative">
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.08]">{title}</h2>
            <p className="text-white/75 mt-5 text-lg max-w-2xl mx-auto">{subtitle}</p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/org-register" className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-suwela-navy text-lg font-semibold px-7 py-4 hover:-translate-y-0.5 transition-transform shadow-xl">
                <Building2 className="w-5 h-5" /> Register your organisation
              </Link>
              <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 text-lg font-semibold px-7 py-4 hover:bg-white/20 transition-colors">
                <UserPlus className="w-5 h-5" /> Create a personal account
              </Link>
            </div>
          </div>
        </ShapeField>
      </div>
    </section>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-suwela-ink overflow-x-hidden">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
