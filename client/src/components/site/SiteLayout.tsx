import { Link, NavLink, useLocation } from 'react-router-dom';
import { ReactNode, useEffect, useRef, useState } from 'react';

// Shared chrome for the public marketing pages (landing, explore, news, story,
// about, help). Every page opens on a dark teal hero, so the navbar starts
// transparent and turns solid once the visitor scrolls past it.

export const NAV_LINKS = [
  { to: '/explore',     label: 'Explore' },
  { to: '/news',        label: 'News' },
  { to: '/share-story', label: 'Share My Story' },
  { to: '/about',       label: 'About' },
  { to: '/help',        label: 'Help' },
];

export function Logo({ light = true, size = 'md' }: { light?: boolean; size?: 'md' | 'sm' }) {
  return (
    <Link to="/welcome" className="flex items-center gap-2.5 shrink-0">
      <div className={`${size === 'md' ? 'w-9 h-9' : 'w-7 h-7'} bg-gradient-to-br from-teal-400 to-teal-700 rounded-lg flex items-center justify-center shadow-sm`}>
        <svg className={`${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div>
        <span className={`font-bold text-lg leading-none block ${light ? 'text-white' : 'text-gray-900'}`}>Core Health</span>
        <span className={`text-xs leading-none ${light ? 'text-teal-200' : 'text-gray-400'}`}>by BloomTech</span>
      </div>
    </Link>
  );
}

export function GetStartedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="text-lg font-bold text-gray-900">How will you join Core Health?</p>
            <p className="text-sm text-gray-500 mt-0.5">Choose the option that fits you.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
          <Link to="/org-register" onClick={onClose}
            className="group text-left p-6 rounded-2xl border-2 border-teal-400 bg-teal-50 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-3xl mb-4 shadow-sm group-hover:scale-110 transition-transform duration-200">🏢</div>
            <p className="font-bold text-gray-900 text-lg mb-1.5">Register an Organization</p>
            <p className="text-sm text-gray-500 leading-relaxed">Hospital, clinic, pharmacy, or laboratory — bring your whole team onto Core Health.</p>
          </Link>
          <Link to="/register" onClick={onClose}
            className="group text-left p-6 rounded-2xl border-2 border-primary-400 bg-primary-50 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-3xl mb-4 shadow-sm group-hover:scale-110 transition-transform duration-200">🧑‍⚕️</div>
            <p className="font-bold text-gray-900 text-lg mb-1.5">Join as Patient or Doctor</p>
            <p className="text-sm text-gray-500 leading-relaxed">Create a personal account to manage your health records or your own practice.</p>
          </Link>
        </div>
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
    const onScroll = () => setScrolled(window.scrollY > 20);
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

  const solid = scrolled || menuOpen;

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${solid ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <Logo light={!solid} />

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `relative text-sm font-medium px-3.5 py-2 rounded-lg transition-colors ${
                  isActive
                    ? solid ? 'text-teal-700 bg-teal-50' : 'text-white bg-white/15'
                    : solid ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={`hidden sm:inline-block text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                solid ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Sign In
            </Link>
            <button
              onClick={() => setShowGetStarted(true)}
              className={`hidden sm:inline-block text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm ${
                solid ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-white text-teal-700 hover:bg-teal-50'
              }`}
            >
              Get Started
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className={`lg:hidden w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${solid ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`lg:hidden overflow-hidden transition-all duration-300 ${menuOpen ? 'max-h-[480px] border-t border-gray-100' : 'max-h-0'}`}>
          <div className="px-4 py-4 space-y-1 bg-white">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `block px-4 py-3 rounded-xl text-sm font-medium ${isActive ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </NavLink>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-3">
              <Link to="/login" className="text-center text-sm font-semibold px-4 py-3 rounded-xl border border-gray-200 text-gray-700">Sign In</Link>
              <button onClick={() => { setMenuOpen(false); setShowGetStarted(true); }} className="text-sm font-semibold px-4 py-3 rounded-xl bg-teal-600 text-white">Get Started</button>
            </div>
          </div>
        </div>
      </nav>

      {showGetStarted && <GetStartedModal onClose={() => setShowGetStarted(false)} />}
    </>
  );
}

export function SiteFooter() {
  const columns = [
    { title: 'Platform', links: [
      { to: '/explore', label: 'Explore features' },
      { to: '/explore#organizations', label: 'For organizations' },
      { to: '/explore#roles', label: 'For individuals' },
      { to: '/news', label: 'News & updates' },
    ]},
    { title: 'Company', links: [
      { to: '/about', label: 'About us' },
      { to: '/share-story', label: 'Share your story' },
      { to: '/help#contact', label: 'Contact' },
    ]},
    { title: 'Support', links: [
      { to: '/help', label: 'Help centre' },
      { to: '/forgot-password', label: 'Reset password' },
      { to: '/terms', label: 'Terms of use' },
      { to: '/privacy', label: 'Privacy policy' },
    ]},
  ];

  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo light />
            <p className="mt-5 text-sm leading-relaxed max-w-sm">
              One secure platform connecting patients, doctors, pharmacies, laboratories, clinics and hospitals across Sri Lanka.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Row-level security', 'Patient-owned data', 'English · සිංහල'].map(t => (
                <span key={t} className="text-xs px-3 py-1 rounded-full border border-gray-800 bg-gray-900 text-gray-300">{t}</span>
              ))}
            </div>
          </div>
          {columns.map(col => (
            <div key={col.title}>
              <p className="text-white font-semibold text-sm mb-4">{col.title}</p>
              <ul className="space-y-2.5 text-sm">
                {col.links.map(l => (
                  <li key={l.label}><Link to={l.to} className="hover:text-teal-300 transition-colors">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Core Health by BloomTech. All rights reserved.</p>
          <p>Made in Sri Lanka 🇱🇰</p>
        </div>
      </div>
    </footer>
  );
}

// Dark teal page header used by every inner page, matching the landing hero.
export function PageHero({ eyebrow, title, highlight, subtitle, children }: {
  eyebrow: string;
  title: string;
  highlight?: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>
      <div className="absolute -top-10 right-0 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-10 w-80 h-80 bg-emerald-400/20 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-28 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-sm text-white/90 font-medium">{eyebrow}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mx-auto">
          {title}{' '}
          {highlight && <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-emerald-300">{highlight}</span>}
        </h1>
        <p className="mt-6 text-lg text-teal-100 max-w-2xl mx-auto leading-relaxed">{subtitle}</p>
        {children && <div className="mt-10">{children}</div>}
      </div>

      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none" className="w-full h-10 sm:h-14">
          <path d="M0 60L60 50C120 40 240 20 360 15C480 10 600 20 720 25C840 30 960 30 1080 25C1200 20 1320 10 1380 5L1440 0V60H0Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={`mb-12 ${center ? 'text-center' : ''}`}>
      <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">{eyebrow}</span>
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{title}</h2>
      {subtitle && <p className={`text-gray-500 mt-3 leading-relaxed ${center ? 'max-w-2xl mx-auto' : 'max-w-xl'}`}>{subtitle}</p>}
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
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 px-8 py-14 sm:px-14 text-center shadow-2xl">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute -bottom-20 -left-10 w-72 h-72 bg-emerald-400/10 rounded-full blur-2xl" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">{title}</h2>
            <p className="text-teal-100 mt-4 text-lg max-w-2xl mx-auto">{subtitle}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/org-register" className="inline-flex items-center justify-center gap-2 bg-white text-teal-800 font-semibold px-7 py-3.5 rounded-xl hover:bg-teal-50 transition-all shadow-lg hover:-translate-y-0.5">
                Register Your Organization
              </Link>
              <Link to="/register" className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-white/10 transition-colors">
                Create a Personal Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
