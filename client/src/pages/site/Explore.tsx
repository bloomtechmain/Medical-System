import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowRight, CalendarDays, CircleCheckBig, FileText, FlaskConical, Globe, Hospital, Lock, Pill,
  ScrollText, Stethoscope, TestTube, UserRound, HandHeart, type LucideIcon,
} from 'lucide-react';
import { SitePage, PageHero, SectionHeading, Reveal, CtaBand } from '../../components/site/SiteLayout';
import { SiteCard, IconChip, CheckItem } from '../../components/site/Cards';
import { TONES, type Tone } from '../../components/site/tones';

const ROLES: {
  id: string; icon: LucideIcon; tone: Tone; label: string; single: string; headline: string; desc: string; features: string[];
  preview: { title: string; stats: string[][]; rows: string[][] };
}[] = [
  {
    id: 'patient', icon: UserRound, tone: 'green', label: 'Patients', single: 'patient',
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
    id: 'doctor', icon: Stethoscope, tone: 'blue', label: 'Doctors', single: 'doctor',
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
    id: 'pharmacist', icon: Pill, tone: 'purple', label: 'Pharmacies', single: 'pharmacy',
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
    id: 'laboratory', icon: FlaskConical, tone: 'deep', label: 'Laboratories', single: 'laboratory',
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

const JOURNEY: { icon: LucideIcon; tone: Tone; title: string; desc: string }[] = [
  { icon: CalendarDays,   tone: 'green',  title: 'Book',        desc: 'The patient books a doctor or hospital channeling slot.' },
  { icon: Stethoscope,    tone: 'blue',   title: 'Consult',     desc: 'The doctor records the consultation and diagnosis.' },
  { icon: TestTube,       tone: 'deep',   title: 'Lab request', desc: 'Tests are sent digitally to the chosen laboratory.' },
  { icon: FileText,       tone: 'orange', title: 'Results',     desc: 'The lab publishes the report to patient and doctor.' },
  { icon: Pill,           tone: 'purple', title: 'Prescribe',   desc: 'An e-prescription goes straight to the pharmacy.' },
  { icon: CircleCheckBig, tone: 'green',  title: 'Dispense',    desc: 'The pharmacy dispenses and the record is complete.' },
];

// Colours follow the landing page's orbit: hospitals orange, clinics green,
// pharmacies purple, laboratories blue.
const ORGS: { icon: LucideIcon; tone: Tone; name: string; single: string; desc: string; points: string[] }[] = [
  { icon: Hospital,     tone: 'orange', name: 'Hospitals',    single: 'hospital',   desc: 'Channeling, doctor panels, lab requests and patient record access for inpatient and outpatient care.', points: ['Doctor panels & specializations', 'Channeling schedules', 'Team & staff management'] },
  { icon: Stethoscope,  tone: 'green',  name: 'Clinics',      single: 'clinic',     desc: 'From single-doctor practices to multi-specialty centres — everything a private clinic needs.', points: ['Multiple doctors', 'Appointments & consultations', 'Lab requests'] },
  { icon: Pill,         tone: 'purple', name: 'Pharmacies',   single: 'pharmacy',   desc: 'Prescription fulfilment, stock control, suppliers and sales in one workspace.', points: ['Inventory & catalogue', 'Purchase orders', 'Sales analytics'] },
  { icon: FlaskConical, tone: 'blue',   name: 'Laboratories', single: 'laboratory', desc: 'Diagnostic labs connected to every doctor and hospital on the network.', points: ['Request inbox', 'Report publishing', 'Test catalogue'] },
];

const TRUST: { icon: LucideIcon; tone: Tone; title: string; desc: string }[] = [
  { icon: Lock,       tone: 'green',  title: 'Row-level security', desc: 'Each organization can only ever see its own data.' },
  { icon: HandHeart,  tone: 'blue',   title: 'Consent first',      desc: 'Doctors see a patient\'s history only after the patient approves.' },
  { icon: ScrollText, tone: 'purple', title: 'Full audit trail',   desc: 'Every access to a medical record is logged.' },
  { icon: Globe,      tone: 'orange', title: 'Your language',      desc: 'Use Suwela in English or Sinhala.' },
];

// Mirrors the seeded packages in server/migrations/014_subscription_plans.sql.
const PLANS: Record<string, { name: string; price: number; desc: string }[]> = {
  Doctors:      [{ name: 'Free', price: 0, desc: 'The essentials for an independent practice.' }, { name: 'Professional', price: 2500, desc: 'Lab orders, e-prescriptions and more patients.' }, { name: 'Premium', price: 6000, desc: 'Unlimited consultations, bookings and affiliations.' }],
  Clinics:      [{ name: 'Free', price: 0, desc: 'A single-doctor private practice.' }, { name: 'Standard', price: 3500, desc: 'Lab requests, record access and more doctors.' }, { name: 'Premium', price: 8000, desc: 'Unlimited doctors and staff.' }],
  Hospitals:    [{ name: 'Starter', price: 0, desc: 'Channeling for a small hospital.' }, { name: 'Business', price: 15000, desc: 'Lab requests, record access and a larger doctor panel.' }, { name: 'Enterprise', price: 40000, desc: 'Unlimited doctors and staff.' }],
  Pharmacies:   [{ name: 'Free', price: 0, desc: 'Dispense prescriptions and run a small catalogue.' }, { name: 'Standard', price: 4000, desc: 'Purchase orders, sales analytics and inventory reports.' }, { name: 'Premium', price: 9000, desc: 'Unlimited catalogue, suppliers and staff.' }],
  Laboratories: [{ name: 'Free', price: 0, desc: 'Receive requests and publish a limited number of reports.' }, { name: 'Standard', price: 4000, desc: 'More reports, walk-in uploads, bigger catalogue.' }, { name: 'Premium', price: 9000, desc: 'Unlimited reports, tests and staff.' }],
};
const PLAN_TONE: Tone[] = ['green', 'blue', 'purple'];

const GRADIENT_BTN = { backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' };

const statusTone = (s: string) =>
  /complete|ready|publish|dispens|booked|shipped/i.test(s) ? 'bg-emerald-50 text-suwela-forest'
  : /progress|process|received/i.test(s) ? 'bg-sky-50 text-suwela-deep'
  : 'bg-amber-50 text-amber-700';

export default function Explore() {
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const [planTab, setPlanTab] = useState('Doctors');
  const role = ROLES.find(r => r.id === roleId)!;
  const rt = TONES[role.tone];

  return (
    <SitePage>
      <PageHero
        eyebrow="Explore the platform"
        title="Everything care needs,"
        highlight="all connected."
        subtitle="See how Suwela works for every person and organization in the care journey — from the first appointment to the last pill dispensed."
      >
        <div className="flex flex-wrap justify-center gap-3">
          {[['#roles', 'For individuals'], ['#journey', 'The care journey'], ['#organizations', 'For organizations'], ['#pricing', 'Packages']].map(([href, label]) => (
            <a key={href} href={href} className="px-5 py-2.5 rounded-full bg-white text-suwela-navy text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              {label}
            </a>
          ))}
        </div>
      </PageHero>

      {/* ── Role explorer ─────────────────────────────────────────── */}
      <section id="roles" className="pt-8 pb-20 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Built for every role" title="A dashboard made for you" subtitle="Each role gets its own workspace with exactly the tools it needs. Pick one to take a look." />

          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {ROLES.map(r => {
              const active = r.id === roleId;
              return (
                <button key={r.id} onClick={() => setRoleId(r.id)}
                        className={`flex items-center gap-2.5 pl-1.5 pr-5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                          active ? 'bg-suwela-navy text-white shadow-lg -translate-y-0.5' : 'bg-white text-suwela-slate ring-1 ring-suwela-line hover:text-suwela-navy hover:shadow-md'
                        }`}>
                  <IconChip icon={r.icon} tone={r.tone} size="sm" className="!w-9 !h-9 !rounded-full" />
                  {r.label}
                </button>
              );
            })}
          </div>

          <div key={role.id} className="grid lg:grid-cols-2 gap-12 items-center fade-up">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold" style={{ backgroundColor: rt.wash, color: rt.to }}>
                <role.icon className="w-4 h-4" /> {role.label}
              </span>
              <h3 className="font-display text-4xl leading-tight text-suwela-navy mt-5">{role.headline}</h3>
              <p className="text-lg text-suwela-slate mt-4 leading-relaxed">{role.desc}</p>
              <ul className="mt-8 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {role.features.map(f => <CheckItem key={f} tone={role.tone}>{f}</CheckItem>)}
              </ul>
              <Link to={role.id === 'patient' || role.id === 'doctor' ? '/register' : '/org-register'}
                    className="group mt-10 inline-flex items-center gap-2 rounded-full text-white font-semibold px-7 py-3.5 shadow-[0_16px_30px_-12px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform"
                    style={GRADIENT_BTN}>
                Get started as a {role.single}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Mock dashboard */}
            <div className="relative">
              <div className="absolute -inset-4 opacity-25 blur-2xl rounded-[48px]" style={{ backgroundImage: `linear-gradient(135deg, ${rt.from}, ${rt.to})` }} />
              <rt.Shape from={rt.from} to={rt.to} className="absolute -right-6 -top-8 w-28 h-28 opacity-70 sw-float hidden sm:block" />
              <div className="relative bg-white rounded-[32px] ring-1 ring-suwela-line shadow-[0_40px_80px_-40px_rgba(14,44,82,0.5)] overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3 bg-suwela-paper border-b border-suwela-line">
                  <span className="w-3 h-3 rounded-full bg-rose-300" /><span className="w-3 h-3 rounded-full bg-amber-300" /><span className="w-3 h-3 rounded-full bg-emerald-300" />
                  <span className="ml-3 font-tech text-xs text-suwela-slate">suwela.lk/{role.id}</span>
                </div>
                <div className="p-6">
                  <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${rt.from}, ${rt.to})` }}>
                    <rt.Shape from="#ffffff" to="#ffffff" className="absolute -right-4 -top-6 w-24 h-24 opacity-20" />
                    <p className="relative font-tech text-[10px] uppercase tracking-[0.25em] text-white/75">Dashboard</p>
                    <p className="relative font-display text-xl mt-1">{role.preview.title}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {role.preview.stats.map(([v, l]) => (
                      <div key={l} className="rounded-2xl p-3" style={{ backgroundColor: rt.wash }}>
                        <p className="text-xl font-bold" style={{ color: rt.to }}>{v}</p>
                        <p className="text-xs text-suwela-slate">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {role.preview.rows.map(([a, b, s]) => (
                      <div key={a} className="flex items-center justify-between rounded-2xl bg-suwela-paper px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundImage: `linear-gradient(135deg, ${rt.from}, ${rt.to})` }}>{a[0]}</div>
                          <div>
                            <p className="text-sm font-semibold text-suwela-ink">{a}</p>
                            <p className="text-xs text-suwela-slate">{b}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusTone(s)}`}>{s}</span>
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
      <section id="journey" className="py-20 lg:py-24 bg-gradient-to-b from-[#EAF6FF] to-[#EDFBF4] rounded-[56px] scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The care journey" title="One record follows the patient" subtitle="Every step happens on the same platform, so nothing is retyped, lost in a paper file, or stuck in someone's inbox." />
          <div className="relative">
            <div className="hidden lg:block absolute top-[52px] left-[8%] right-[8%] border-t-2 border-dashed border-suwela-sky/50" />
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 lg:gap-5">
              {JOURNEY.map((s, i) => (
                <Reveal key={s.title} delay={i * 90} className="h-full">
                  <div className="group relative h-full rounded-[28px] bg-white/80 backdrop-blur p-5 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    <div className="relative mx-auto w-fit">
                      <IconChip icon={s.icon} tone={s.tone} size="lg" className="transition-transform group-hover:-rotate-6" />
                      <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-suwela-navy text-white text-xs font-bold flex items-center justify-center ring-4 ring-white">{i + 1}</span>
                    </div>
                    <h3 className="mt-5 font-display text-xl text-suwela-navy">{s.title}</h3>
                    <p className="mt-2 text-sm text-suwela-slate leading-relaxed">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Organizations ─────────────────────────────────────────── */}
      <section id="organizations" className="py-20 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="For organizations" title="A private workspace for your team" subtitle="Every organization gets its own isolated tenant. Your data is separated from everyone else's at the database level." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ORGS.map((o, i) => (
              <Reveal key={o.name} delay={i * 80} className="h-full">
                <SiteCard tone={o.tone} icon={o.icon} title={o.name}>
                  <p className="relative mt-2 text-sm text-suwela-slate leading-relaxed">{o.desc}</p>
                  <ul className="relative mt-5 space-y-2.5">
                    {o.points.map(p => <CheckItem key={p} tone={o.tone}>{p}</CheckItem>)}
                  </ul>
                  <Link to="/org-register" className="relative mt-auto pt-6 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: TONES[o.tone].to }}>
                    Register your {o.single}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </SiteCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto rounded-[44px] p-8 sm:p-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8"
             style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
          {TRUST.map(t => (
            <div key={t.title} className="group flex gap-4">
              <IconChip icon={t.icon} tone={t.tone} size="sm" className="transition-transform group-hover:-rotate-6" />
              <div>
                <p className="font-semibold text-white">{t.title}</p>
                <p className="text-sm text-white/65 mt-1 leading-relaxed">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Packages" title="Free for patients. Fair for providers." subtitle="Every provider starts on a free package and upgrades only when they need more. Prices are per month in Sri Lankan rupees — save two months by paying yearly." />

          <div className="flex flex-wrap justify-center gap-1 mb-12 mx-auto w-fit rounded-full bg-white p-1.5 ring-1 ring-suwela-line shadow-sm">
            {Object.keys(PLANS).map(k => (
              <button key={k} onClick={() => setPlanTab(k)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${k === planTab ? 'bg-suwela-navy text-white' : 'text-suwela-slate hover:text-suwela-navy hover:bg-suwela-paper'}`}>
                {k}
              </button>
            ))}
          </div>

          <div key={planTab} className="grid md:grid-cols-3 gap-6 items-stretch fade-up">
            {PLANS[planTab].map((p, i) => {
              const to = planTab === 'Doctors' ? '/register' : '/org-register';
              const label = p.price === 0 ? 'Start free' : `Choose ${p.name}`;
              const price = p.price === 0 ? 'Free' : <>Rs {p.price.toLocaleString()}<span className="text-base font-sans font-medium opacity-60"> /mo</span></>;

              if (i === 1) {
                const t = TONES.blue;
                return (
                  <div key={p.name} className="relative md:-translate-y-3 overflow-hidden rounded-[32px] p-8 flex flex-col text-white shadow-[0_40px_70px_-35px_rgba(14,44,82,0.8)]"
                       style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
                    <t.Shape from={t.from} to={t.to} className="absolute -right-10 -top-10 w-44 h-44 opacity-30" />
                    <span className="relative self-start text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r from-[#FFB36B] to-[#EF7B2D] text-white">Most popular</span>
                    <p className="relative mt-5 font-semibold text-suwela-mint">{p.name}</p>
                    <p className="relative mt-3 font-display text-4xl">{price}</p>
                    <p className="relative mt-3 text-sm leading-relaxed flex-1 text-white/75">{p.desc}</p>
                    <Link to={to} className="relative mt-8 text-center font-semibold px-5 py-3.5 rounded-full bg-white text-suwela-navy hover:-translate-y-0.5 transition-transform shadow-xl">{label}</Link>
                  </div>
                );
              }

              const tone = PLAN_TONE[i];
              return (
                <SiteCard key={p.name} tone={tone} className="p-8">
                  <p className="relative font-semibold" style={{ color: TONES[tone].to }}>{p.name}</p>
                  <p className="relative mt-3 font-display text-4xl text-suwela-navy">{price}</p>
                  <p className="relative mt-3 text-sm leading-relaxed flex-1 text-suwela-slate">{p.desc}</p>
                  <Link to={to} className="relative mt-8 text-center font-semibold px-5 py-3.5 rounded-full bg-suwela-navy text-white hover:brightness-125 transition">{label}</Link>
                </SiteCard>
              );
            })}
          </div>
          <p className="mt-10 mx-auto w-fit flex items-center gap-2 rounded-full bg-emerald-50 text-suwela-forest font-semibold text-sm px-5 py-2.5">
            <UserRound className="w-4 h-4" /> Patients never pay — every patient feature is free, forever.
          </p>
        </div>
      </section>

      <CtaBand title="See it for yourself" subtitle="Create a free account in minutes. Organizations are reviewed by our team before going live." />
    </SitePage>
  );
}
