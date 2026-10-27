import { Link } from 'react-router-dom';
import { useState } from 'react';
import { SitePage, PageHero, SectionHeading, Reveal, CtaBand } from '../../components/site/SiteLayout';

const ROLES = [
  {
    id: 'patient', icon: '👤', label: 'Patients', accent: 'from-blue-500 to-cyan-500', chip: 'bg-blue-100 text-blue-700',
    headline: 'Your whole health story, in your pocket.',
    desc: 'Book doctors, see every consultation and lab result, and decide exactly who gets to read your records. Always free.',
    features: [
      'Book appointments with doctors and hospitals',
      'Consultation history and e-prescriptions in one timeline',
      'Lab reports delivered the moment they are published',
      'Approve or deny doctors asking to view your records',
      'Track vitals and download a full health report',
      'Send prescriptions to the pharmacy you choose',
    ],
    preview: { title: 'My Health', stats: [['3', 'Upcoming visits'], ['2', 'New lab reports'], ['1', 'Doctor request']], rows: [['Dr. Fernando', 'Tomorrow · 10:30', 'Booked'], ['Full Blood Count', 'Lanka Diagnostics', 'Ready'], ['Dr. Jayasuriya', 'Requests access', 'Pending']] },
  },
  {
    id: 'doctor', icon: '🩺', label: 'Doctors', accent: 'from-teal-500 to-emerald-500', chip: 'bg-teal-100 text-teal-700',
    headline: 'Spend your time on patients, not paperwork.',
    desc: 'Run your appointments, write prescriptions, order lab tests and see a patient\'s history — with their consent — from one dashboard.',
    features: [
      'Weekly availability and appointment requests',
      'Digital consultations and prescriptions, with photo upload',
      'Order lab tests and get results back automatically',
      'Request access to a patient\'s full medical history',
      'Work across your own practice and affiliated hospitals',
      'Switch between dashboards without signing out',
    ],
    preview: { title: 'Good morning, Dr. Silva', stats: [['8', 'Consultations'], ['3', 'Lab results'], ['12', 'Prescriptions']], rows: [['Nimali Perera', '9:00 AM', 'Completed'], ['Kamal Bandara', '10:30 AM', 'In progress'], ['Sunethra Silva', '11:00 AM', 'Waiting']] },
  },
  {
    id: 'pharmacist', icon: '💊', label: 'Pharmacies', accent: 'from-purple-500 to-violet-500', chip: 'bg-purple-100 text-purple-700',
    headline: 'Prescriptions in, medicines out — no guesswork.',
    desc: 'Receive prescriptions straight from the doctor, dispense against live stock, and keep suppliers, orders and sales under control.',
    features: [
      'Prescriptions sent in by patients and doctors',
      'Medicine catalogue with live inventory levels',
      'Supplier management and purchase orders',
      'Point-of-sale and sales analytics',
      'Low-stock and expiry visibility',
      'Team accounts for every pharmacist on staff',
    ],
    preview: { title: 'City Pharmacy', stats: [['14', 'Prescriptions'], ['6', 'Low stock'], ['Rs 82k', 'Sales today']], rows: [['Amoxicillin 500mg', 'Rx · Dr. Silva', 'Dispensed'], ['Metformin 850mg', '12 left', 'Reorder'], ['PO-1042', 'Hemas Pharma', 'Shipped']] },
  },
  {
    id: 'laboratory', icon: '🔬', label: 'Laboratories', accent: 'from-cyan-500 to-sky-500', chip: 'bg-cyan-100 text-cyan-700',
    headline: 'Results that reach the right doctor, instantly.',
    desc: 'Get test requests from doctors, publish reports to patients and the requesting doctor, and keep your test catalogue up to date.',
    features: [
      'Lab requests from doctors and patients',
      'Publish reports directly to the patient record',
      'Upload walk-in reports for patients without a request',
      'Test catalogue with your own pricing',
      'Vitals read automatically from uploaded reports',
      'Staff accounts with role-based access',
    ],
    preview: { title: 'Lanka Diagnostics', stats: [['21', 'Requests'], ['9', 'In progress'], ['12', 'Published']], rows: [['Lipid Profile', 'Dr. Silva', 'Processing'], ['HbA1c', 'Dr. Fernando', 'Published'], ['Urine Full Report', 'Walk-in', 'Received']] },
  },
];

const JOURNEY = [
  { icon: '📅', title: 'Book', desc: 'The patient books a doctor or hospital channeling slot.' },
  { icon: '🩺', title: 'Consult', desc: 'The doctor records the consultation and diagnosis.' },
  { icon: '🧪', title: 'Lab request', desc: 'Tests are sent digitally to the chosen laboratory.' },
  { icon: '📄', title: 'Results', desc: 'The lab publishes the report to patient and doctor.' },
  { icon: '💊', title: 'Prescribe', desc: 'An e-prescription goes straight to the pharmacy.' },
  { icon: '✅', title: 'Dispense', desc: 'The pharmacy dispenses and the record is complete.' },
];

const ORGS = [
  { icon: '🏥', name: 'Hospitals', desc: 'Channeling, doctor panels, lab requests and patient record access for inpatient and outpatient care.', points: ['Doctor panels & specializations', 'Channeling schedules', 'Team & staff management'], border: 'hover:border-blue-300', glow: 'bg-blue-50' },
  { icon: '🩺', name: 'Clinics', desc: 'From single-doctor practices to multi-specialty centres — everything a private clinic needs.', points: ['Multiple doctors', 'Appointments & consultations', 'Lab requests'], border: 'hover:border-teal-300', glow: 'bg-teal-50' },
  { icon: '💊', name: 'Pharmacies', desc: 'Prescription fulfilment, stock control, suppliers and sales in one workspace.', points: ['Inventory & catalogue', 'Purchase orders', 'Sales analytics'], border: 'hover:border-purple-300', glow: 'bg-purple-50' },
  { icon: '🔬', name: 'Laboratories', desc: 'Diagnostic labs connected to every doctor and hospital on the network.', points: ['Request inbox', 'Report publishing', 'Test catalogue'], border: 'hover:border-cyan-300', glow: 'bg-cyan-50' },
];

// Mirrors the seeded packages in server/migrations/014_subscription_plans.sql.
const PLANS: Record<string, { name: string; price: number; desc: string }[]> = {
  Doctors:      [{ name: 'Free', price: 0, desc: 'The essentials for an independent practice.' }, { name: 'Professional', price: 2500, desc: 'Lab orders, e-prescriptions and more patients.' }, { name: 'Premium', price: 6000, desc: 'Unlimited consultations, bookings and affiliations.' }],
  Clinics:      [{ name: 'Free', price: 0, desc: 'A single-doctor private practice.' }, { name: 'Standard', price: 3500, desc: 'Lab requests, record access and more doctors.' }, { name: 'Premium', price: 8000, desc: 'Unlimited doctors and staff.' }],
  Hospitals:    [{ name: 'Starter', price: 0, desc: 'Channeling for a small hospital.' }, { name: 'Business', price: 15000, desc: 'Lab requests, record access and a larger doctor panel.' }, { name: 'Enterprise', price: 40000, desc: 'Unlimited doctors and staff.' }],
  Pharmacies:   [{ name: 'Free', price: 0, desc: 'Dispense prescriptions and run a small catalogue.' }, { name: 'Standard', price: 4000, desc: 'Purchase orders, sales analytics and inventory reports.' }, { name: 'Premium', price: 9000, desc: 'Unlimited catalogue, suppliers and staff.' }],
  Laboratories: [{ name: 'Free', price: 0, desc: 'Receive requests and publish a limited number of reports.' }, { name: 'Standard', price: 4000, desc: 'More reports, walk-in uploads, bigger catalogue.' }, { name: 'Premium', price: 9000, desc: 'Unlimited reports, tests and staff.' }],
};

const Check = ({ className = 'text-emerald-500' }: { className?: string }) => (
  <svg className={`w-5 h-5 shrink-0 ${className}`} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const statusTone = (s: string) =>
  /complete|ready|publish|dispens|booked|shipped/i.test(s) ? 'bg-emerald-100 text-emerald-700'
  : /progress|process|received/i.test(s) ? 'bg-blue-100 text-blue-700'
  : 'bg-amber-100 text-amber-700';

export default function Explore() {
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const [planTab, setPlanTab] = useState('Doctors');
  const role = ROLES.find(r => r.id === roleId)!;

  return (
    <SitePage>
      <PageHero
        eyebrow="Explore the platform"
        title="Everything care needs,"
        highlight="all connected."
        subtitle="See how Core Health works for every person and organization in the care journey — from the first appointment to the last pill dispensed."
      >
        <div className="flex flex-wrap justify-center gap-3">
          {[['#roles', 'For individuals'], ['#journey', 'The care journey'], ['#organizations', 'For organizations'], ['#pricing', 'Packages']].map(([href, label]) => (
            <a key={href} href={href} className="px-5 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-medium backdrop-blur-sm hover:bg-white/20 transition-colors">
              {label}
            </a>
          ))}
        </div>
      </PageHero>

      {/* ── Role explorer ─────────────────────────────────────────── */}
      <section id="roles" className="py-20 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Built for every role" title="A dashboard made for you" subtitle="Each role gets its own workspace with exactly the tools it needs. Pick one to take a look." />

          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {ROLES.map(r => (
              <button
                key={r.id}
                onClick={() => setRoleId(r.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition-all ${
                  r.id === roleId ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/25 -translate-y-0.5' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="text-lg">{r.icon}</span>{r.label}
              </button>
            ))}
          </div>

          <div key={role.id} className="grid lg:grid-cols-2 gap-12 items-center fade-up">
            <div>
              <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${role.chip}`}>{role.label}</span>
              <h3 className="text-3xl font-bold text-gray-900 mt-4">{role.headline}</h3>
              <p className="text-gray-500 mt-4 leading-relaxed">{role.desc}</p>
              <ul className="mt-8 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {role.features.map(f => (
                  <li key={f} className="flex gap-2.5 text-sm text-gray-700"><Check />{f}</li>
                ))}
              </ul>
              <Link to={role.id === 'patient' || role.id === 'doctor' ? '/register' : '/org-register'}
                className="mt-10 inline-flex items-center gap-2 bg-teal-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Get started as {role.label.toLowerCase().replace(/s$/, '').replace(/ie$/, 'y')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>

            {/* Mock dashboard */}
            <div className="relative">
              <div className={`absolute -inset-4 bg-gradient-to-br ${role.accent} opacity-20 blur-2xl rounded-[2rem]`} />
              <div className="relative bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="w-3 h-3 rounded-full bg-rose-300" /><span className="w-3 h-3 rounded-full bg-amber-300" /><span className="w-3 h-3 rounded-full bg-emerald-300" />
                  <span className="ml-3 text-xs text-gray-400">corehealth.lk/{role.id}</span>
                </div>
                <div className="p-6">
                  <div className={`rounded-2xl bg-gradient-to-br ${role.accent} p-5 text-white`}>
                    <p className="text-xs uppercase tracking-wider text-white/70">Dashboard</p>
                    <p className="text-lg font-semibold">{role.preview.title}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {role.preview.stats.map(([v, l]) => (
                      <div key={l} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xl font-bold text-gray-900">{v}</p>
                        <p className="text-xs text-gray-500">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-gray-100 divide-y divide-gray-100">
                    {role.preview.rows.map(([a, b, s]) => (
                      <div key={a} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">{a[0]}</div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{a}</p>
                            <p className="text-xs text-gray-400">{b}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusTone(s)}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Care journey ──────────────────────────────────────────── */}
      <section id="journey" className="py-20 bg-gradient-to-br from-teal-100 via-emerald-50 to-teal-100 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The care journey" title="One record follows the patient" subtitle="Every step happens on the same platform, so nothing is retyped, lost in a paper file, or stuck in someone's inbox." />
          <div className="relative">
            <div className="hidden lg:block absolute top-10 left-[8%] right-[8%] h-1 rounded-full bg-gradient-to-r from-teal-200 via-emerald-300 to-teal-200" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-6">
              {JOURNEY.map((s, i) => (
                <Reveal key={s.title} delay={i * 90}>
                  <div className="relative flex flex-col items-center text-center">
                    <div className="relative z-10 w-20 h-20 rounded-3xl bg-white border-2 border-teal-200 shadow-lg flex items-center justify-center text-3xl">
                      {s.icon}
                      <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shadow">{i + 1}</span>
                    </div>
                    <h3 className="mt-5 font-bold text-gray-900">{s.title}</h3>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Organizations ─────────────────────────────────────────── */}
      <section id="organizations" className="py-20 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="For organizations" title="A private workspace for your team" subtitle="Every organization gets its own isolated tenant. Your data is separated from everyone else's at the database level." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ORGS.map((o, i) => (
              <Reveal key={o.name} delay={i * 80}>
                <div className={`group h-full rounded-3xl border-2 border-gray-100 p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${o.border}`}>
                  <div className={`w-14 h-14 rounded-2xl ${o.glow} flex items-center justify-center text-3xl group-hover:scale-110 transition-transform`}>{o.icon}</div>
                  <h3 className="mt-5 text-xl font-bold text-gray-900">{o.name}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">{o.desc}</p>
                  <ul className="mt-5 space-y-2">
                    {o.points.map(p => <li key={p} className="flex gap-2 text-sm text-gray-700"><Check className="text-teal-500" />{p}</li>)}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────── */}
      <section className="py-16 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            ['🔒', 'Row-level security', 'Each organization can only ever see its own data.'],
            ['🙋', 'Consent first', 'Doctors see a patient\'s history only after the patient approves.'],
            ['📜', 'Full audit trail', 'Every access to a medical record is logged.'],
            ['🌐', 'Your language', 'Use Core Health in English or Sinhala.'],
          ].map(([icon, t, d]) => (
            <div key={t} className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-teal-500/15 border border-teal-500/20 flex items-center justify-center text-xl">{icon}</div>
              <div>
                <p className="font-semibold text-white">{t}</p>
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Packages" title="Free for patients. Fair for providers." subtitle="Every provider starts on a free package and upgrades only when they need more. Prices are per month in Sri Lankan rupees — save two months by paying yearly." />

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {Object.keys(PLANS).map(k => (
              <button key={k} onClick={() => setPlanTab(k)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${k === planTab ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {k}
              </button>
            ))}
          </div>

          <div key={planTab} className="grid md:grid-cols-3 gap-6 fade-up">
            {PLANS[planTab].map((p, i) => {
              const featured = i === 1;
              return (
                <div key={p.name} className={`relative rounded-3xl p-8 flex flex-col ${featured ? 'bg-gradient-to-br from-teal-700 to-emerald-800 text-white shadow-2xl md:-translate-y-3' : 'bg-white border border-gray-200'}`}>
                  {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full bg-amber-300 text-amber-900">Most popular</span>}
                  <p className={`font-semibold ${featured ? 'text-teal-100' : 'text-gray-500'}`}>{p.name}</p>
                  <p className="mt-3 text-4xl font-bold">
                    {p.price === 0 ? 'Free' : <>Rs {p.price.toLocaleString()}<span className={`text-base font-medium ${featured ? 'text-teal-200' : 'text-gray-400'}`}> /mo</span></>}
                  </p>
                  <p className={`mt-3 text-sm leading-relaxed flex-1 ${featured ? 'text-teal-100' : 'text-gray-500'}`}>{p.desc}</p>
                  <Link to={planTab === 'Doctors' ? '/register' : '/org-register'}
                    className={`mt-8 text-center font-semibold px-5 py-3 rounded-xl transition-colors ${featured ? 'bg-white text-teal-800 hover:bg-teal-50' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                    {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">👤 Patients never pay — every patient feature is free, forever.</p>
        </div>
      </section>

      <CtaBand title="See it for yourself" subtitle="Create a free account in minutes. Organizations are reviewed by our team before going live." />
    </SitePage>
  );
}
