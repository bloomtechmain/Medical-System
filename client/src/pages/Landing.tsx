import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';

const STATS = [
  { value: '10,000+', label: 'Patients Served' },
  { value: '500+',    label: 'Healthcare Providers' },
  { value: '200+',    label: 'Organizations' },
  { value: '99.9%',   label: 'Uptime' },
];

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    title: 'Unified Health Records',
    desc: 'All patient history, consultations, prescriptions, and lab reports in one secure place.',
    color: 'from-teal-500 to-emerald-500',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    title: 'Smart Lab Integration',
    desc: 'Doctors request lab tests digitally. Results flow directly back with zero paperwork.',
    color: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Privacy by Design',
    desc: 'Row-level security and controlled data sharing. Patients own their data.',
    color: 'from-purple-500 to-violet-500',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: 'Multi-Tenant Organizations',
    desc: 'Hospitals, pharmacies, labs, and clinics each get their own isolated workspace.',
    color: 'from-orange-500 to-rose-500',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
  },
];

const ORG_TYPES = [
  { id: 'hospital',   icon: '🏥', label: 'Hospital',   desc: 'Full-service inpatient & outpatient management', color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50' },
  { id: 'clinic',     icon: '🩺', label: 'Clinic',     desc: 'Doctor-owned clinics and multi-specialty centres', color: 'border-teal-200 hover:border-teal-400 hover:bg-teal-50' },
  { id: 'pharmacy',   icon: '💊', label: 'Pharmacy',   desc: 'Inventory, prescriptions, and dispensing workflows', color: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50' },
  { id: 'laboratory', icon: '🔬', label: 'Laboratory', desc: 'Diagnostic labs connected to the clinical network', color: 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50' },
];

const ROLES = [
  { icon: '👤', label: 'Patient',     desc: 'Manage your health records, consultations & lab reports', color: 'text-blue-600 bg-blue-100' },
  { icon: '🩺', label: 'Doctor',      desc: 'Write prescriptions, request labs, view patient histories', color: 'text-teal-600 bg-teal-100' },
  { icon: '💊', label: 'Pharmacist',  desc: 'Process prescriptions, manage inventory and orders',      color: 'text-purple-600 bg-purple-100' },
  { icon: '🔬', label: 'Laboratory',  desc: 'Receive lab requests and upload patient reports',          color: 'text-cyan-600 bg-cyan-100' },
];

function useCountUp(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true); },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">

      {/* ── Navbar ───────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-700 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <span className={`font-bold text-lg leading-none ${scrolled ? 'text-gray-900' : 'text-white'}`}>Core Health</span>
              <p className={`text-xs leading-none mt-0.5 ${scrolled ? 'text-gray-400' : 'text-teal-200'}`}>by BloomTech</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                scrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-white text-teal-700 hover:bg-teal-50 transition-colors shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Decorative blobs */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-10 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left content */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-sm text-white/90 font-medium">Sri Lanka's Unified Healthcare Platform</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Healthcare,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-emerald-300">
                  Connected.
                </span>
              </h1>

              <p className="text-lg text-teal-100 mb-10 max-w-lg leading-relaxed">
                Core Health unifies hospitals, clinics, pharmacies, and laboratories on one secure platform —
                giving every patient, doctor, and pharmacist seamless access to the care they need.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/org-register"
                  className="group flex items-center justify-center gap-2.5 bg-white text-teal-800 font-semibold px-6 py-3.5 rounded-xl hover:bg-teal-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Register Your Organization
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  to="/login"
                  className="group flex items-center justify-center gap-2.5 bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/20 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Sign In / Join as User
                </Link>
              </div>

              <p className="mt-5 text-sm text-teal-300/80">
                Already registered your organization?{' '}
                <Link to="/login" className="text-teal-200 underline underline-offset-2 hover:text-white">Sign in here</Link>
              </p>
            </div>

            {/* Right: dashboard preview card */}
            <div className="hidden lg:block">
              <div className="relative">
                {/* Main card */}
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Dashboard</p>
                      <p className="text-white font-semibold text-lg">Good morning, Dr. Silva</p>
                    </div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <span className="text-xl">🩺</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {[
                      { label: 'Active Patients', value: '24', icon: '👥', color: 'bg-blue-500/20 text-blue-300' },
                      { label: 'Today\'s Consultations', value: '8', icon: '📋', color: 'bg-teal-500/20 text-teal-300' },
                      { label: 'Pending Lab Results', value: '3', icon: '🔬', color: 'bg-purple-500/20 text-purple-300' },
                      { label: 'Prescriptions', value: '12', icon: '💊', color: 'bg-orange-500/20 text-orange-300' },
                    ].map(({ label, value, icon, color }) => (
                      <div key={label} className="bg-white/10 rounded-xl p-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm mb-2 ${color}`}>{icon}</div>
                        <p className="text-2xl font-bold text-white">{value}</p>
                        <p className="text-white/50 text-xs">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/10 rounded-xl p-3">
                    <p className="text-white/60 text-xs font-medium mb-2">Recent Patients</p>
                    {[
                      { name: 'Nimali Perera', time: '9:00 AM', status: 'Completed' },
                      { name: 'Kamal Bandara', time: '10:30 AM', status: 'In Progress' },
                      { name: 'Sunethra Silva', time: '11:00 AM', status: 'Waiting' },
                    ].map(({ name, time, status }) => (
                      <div key={name} className="flex items-center justify-between py-1.5 border-b border-white/10 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-xs text-white font-semibold">
                            {name[0]}
                          </div>
                          <div>
                            <p className="text-white text-xs font-medium">{name}</p>
                            <p className="text-white/40 text-xs">{time}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          status === 'Completed' ? 'bg-emerald-500/20 text-emerald-300' :
                          status === 'In Progress' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-xl px-3 py-2 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-semibold text-gray-700">Lab Result Ready</span>
                </div>
                <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-sm">🔒</span>
                  <span className="text-xs font-semibold text-gray-700">HIPAA Compliant</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60L60 50C120 40 240 20 360 15C480 10 600 20 720 25C840 30 960 30 1080 25C1200 20 1320 10 1380 5L1440 0V60H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <div ref={statsRef} className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-teal-700">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Two Portals ───────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Get Started</span>
            <h2 className="text-3xl font-bold text-gray-900 mt-2">Two ways to join Core Health</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Whether you're representing a healthcare organization or joining as an individual — we have you covered.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Organization card */}
            <div className="relative bg-gradient-to-br from-teal-700 to-teal-900 rounded-2xl p-8 overflow-hidden shadow-xl group hover:-translate-y-1 transition-transform duration-200">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-12 translate-x-12" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
              <div className="relative">
                <div className="w-14 h-14 bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl flex items-center justify-center mb-5 text-2xl">
                  🏥
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Organization Portal</h3>
                <p className="text-teal-200 mb-2 text-sm leading-relaxed">
                  Register your hospital, clinic, pharmacy, or diagnostic laboratory.
                  Get a private tenant workspace with full management tools.
                </p>
                <div className="mt-4 mb-6 space-y-2">
                  {['Hospital & Multi-specialty Clinics', 'Pharmacies & Dispensaries', 'Diagnostic Laboratories'].map(t => (
                    <div key={t} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-teal-100 text-sm">{t}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/org-register"
                  className="inline-flex items-center gap-2 bg-white text-teal-800 font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-50 transition-colors text-sm shadow-sm"
                >
                  Register Organization
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <p className="text-teal-300/70 text-xs mt-3">Pending admin review after registration</p>
              </div>
            </div>

            {/* User card */}
            <div className="flex flex-col gap-4">
              {/* Login */}
              <div className="bg-white rounded-2xl p-7 border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex-1">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    🔑
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Sign In</h3>
                    <p className="text-gray-500 text-sm mb-4">Already have an account? Access your dashboard instantly.</p>
                    <Link
                      to="/login"
                      className="inline-flex items-center gap-2 bg-teal-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-700 transition-colors text-sm"
                    >
                      Sign In to Core Health
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Register */}
              <div className="bg-white rounded-2xl p-7 border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex-1">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    ✨
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">New User Registration</h3>
                    <p className="text-gray-500 text-sm mb-4">Register as a patient, doctor, pharmacist, or lab technician.</p>
                    <Link
                      to="/register"
                      className="inline-flex items-center gap-2 border-2 border-teal-600 text-teal-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-50 transition-colors text-sm"
                    >
                      Create Your Account
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Features</span>
            <h2 className="text-3xl font-bold text-gray-900 mt-2">Everything healthcare needs</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Built for the full care pathway — from first consultation to prescription fulfillment and beyond.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon, title, desc, bg, text }) => (
              <div key={title} className="group p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                <div className={`w-11 h-11 ${bg} ${text} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Organization Types ───────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Organization Types</span>
            <h2 className="text-3xl font-bold text-gray-900 mt-2">Who can join?</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Four types of healthcare organizations, each with purpose-built tools and isolated data.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ORG_TYPES.map(({ icon, label, desc, color }) => (
              <Link key={label} to="/org-register" className={`block bg-white border-2 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${color}`}>
                <div className="text-3xl mb-3">{icon}</div>
                <h3 className="font-bold text-gray-900 mb-1">{label}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              to="/org-register"
              className="inline-flex items-center gap-2 bg-teal-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
            >
              Register Your Organization
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── User Roles ───────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">For Everyone</span>
              <h2 className="text-3xl font-bold text-gray-900 mt-2 mb-4">One platform, every role</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Core Health serves all stakeholders in the healthcare journey. Each role gets a tailored dashboard and the exact tools they need — nothing more, nothing less.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 bg-teal-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
              >
                Join as an Individual
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {ROLES.map(({ icon, label, desc, color }) => (
                <div key={label} className="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 ${color}`}>{icon}</div>
                  <h3 className="font-semibold text-gray-900 mb-1">{label}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">How It Works</span>
          <h2 className="text-3xl font-bold text-gray-900 mt-2 mb-12">Up and running in minutes</h2>

          <div className="relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-1/4 right-1/4 h-0.5 bg-teal-200" />

            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { step: '01', icon: '📝', title: 'Register', desc: 'Sign up as an organization or individual user. Fill in your details in minutes.' },
                { step: '02', icon: '✅', title: 'Get Approved', desc: 'Our admin team reviews organization registrations. Individual users get instant access.' },
                { step: '03', icon: '🚀', title: 'Go Live', desc: 'Access your role-tailored dashboard and start managing healthcare workflows.' },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="relative flex flex-col items-center">
                  <div className="w-16 h-16 bg-white border-2 border-teal-200 rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-4 relative z-10">
                    {icon}
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold z-20">
                    {step.slice(-1)}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="py-20 bg-teal-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to transform your healthcare workflow?</h2>
          <p className="text-teal-200 mb-8 text-lg">Join Core Health today. No setup fees. Free for patients.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/org-register"
              className="inline-flex items-center justify-center gap-2 bg-white text-teal-800 font-semibold px-7 py-3.5 rounded-xl hover:bg-teal-50 transition-colors shadow-lg"
            >
              Register Your Organization
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-white/10 transition-colors"
            >
              Create a Personal Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-700 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-white">Core Health</span>
                <span className="text-gray-500 text-sm ml-1.5">by BloomTech</span>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
              <Link to="/register" className="hover:text-white transition-colors">Register</Link>
              <Link to="/org-register" className="hover:text-white transition-colors">Organizations</Link>
            </div>
            <p className="text-xs text-gray-600">© 2024 Core Health by BloomTech. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
