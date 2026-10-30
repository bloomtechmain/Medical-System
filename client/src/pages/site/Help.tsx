import { Link } from 'react-router-dom';
import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, FileText, Hospital, KeyRound, Mail, MailCheck, Package, Plus, Rocket, Search,
  SearchX, ShieldCheck, Stethoscope, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { SitePage, PageHero, SectionHeading } from '../../components/site/SiteLayout';
import { SUPPORT_EMAIL } from '../../components/site/siteConfig';
import { IconChip } from '../../components/site/Cards';
import { TONES, type Tone } from '../../components/site/tones';
import { Tilt } from '../../components/landing/Features';
import { Leaf, Cross } from '../../components/landing/Shapes';
import { contactApi } from '../../services/api';

const sendError = (err: any): string => err?.response?.data?.message || `Could not send right now. Please try again, or email ${SUPPORT_EMAIL}.`;

const GRADIENT_BTN = { backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' };

type Topic = 'Getting started' | 'Patients' | 'Doctors' | 'Organizations' | 'Account & security' | 'Packages';

const TOPICS: { id: Topic; icon: LucideIcon; tone: Tone; desc: string }[] = [
  { id: 'Getting started',    icon: Rocket,      tone: 'deep',   desc: 'Creating an account and first steps' },
  { id: 'Patients',           icon: UserRound,   tone: 'green',  desc: 'Bookings, records and lab reports' },
  { id: 'Doctors',            icon: Stethoscope, tone: 'blue',   desc: 'Consultations, prescriptions, labs' },
  { id: 'Organizations',      icon: Hospital,    tone: 'orange', desc: 'Hospitals, clinics, pharmacies, labs' },
  { id: 'Account & security', icon: ShieldCheck, tone: 'purple', desc: 'Passwords, privacy and your data' },
  { id: 'Packages',           icon: Package,     tone: 'green',  desc: 'Free and paid packages' },
];
const topicOf = (id: Topic) => TOPICS.find(t => t.id === id)!;

// Every answer below was checked against the app's screens and API. Menu
// names in quotes match the sidebar labels in locales/en/common.json.
const FAQS: { topic: Topic; q: string; a: string[] }[] = [
  { topic: 'Getting started', q: 'Who can use Suwela?', a: [
    'Patients and doctors create their own personal account.',
    'Hospitals, clinics, pharmacies and laboratories register as an organization.',
    'The organization owner then creates accounts for their staff.',
  ]},
  { topic: 'Getting started', q: 'How do I create an account?', a: [
    'Click "Get Started" at the top of any page.',
    'Choose "Join as Patient or Doctor" for a personal account.',
    'Choose "Register an Organization" for a hospital, clinic, pharmacy or lab.',
    'Open the email we send you to verify your address.',
  ]},
  { topic: 'Getting started', q: 'I didn\'t receive my verification email.', a: [
    'Check your spam or promotions folder.',
    'Try signing in — if your email is not verified yet, the sign-in page lets you resend it.',
    'You can resend up to 5 times an hour.',
    'Registered an organization? The email is only sent after our team approves it.',
  ]},
  { topic: 'Getting started', q: 'Can I use Suwela in Sinhala?', a: [
    'Yes — Suwela is available in English and Sinhala.',
    'Use the language switcher in the top bar of the app to change at any time.',
  ]},
  { topic: 'Getting started', q: 'I belong to more than one dashboard. Which one opens?', a: [
    'If you have more than one dashboard, Suwela asks which one to open when you sign in.',
    'It remembers your choice for next time.',
    'Use the dashboard switcher in the top bar to change at any time.',
  ]},

  { topic: 'Patients', q: 'How do I book an appointment?', a: [
    'Open "Book Doctor" in the sidebar.',
    'Choose a doctor and pick one of their free time slots.',
    'Your booking stays pending until the doctor confirms or declines it.',
    'You get a notification when the doctor responds.',
  ]},
  { topic: 'Patients', q: 'Can I cancel an appointment?', a: [
    'Yes — you can cancel a booking while it is pending or after it has been confirmed.',
  ]},
  { topic: 'Patients', q: 'Where can I see my lab results?', a: [
    'Open "Lab Tests" in the sidebar.',
    'A report appears as soon as the laboratory publishes it.',
    'The doctor who requested the test can see it too.',
    'You can message the lab about a request.',
  ]},
  { topic: 'Patients', q: 'Can I request a lab test myself?', a: [
    'Yes — from "Lab Tests" you can send a request to a laboratory.',
    'You can attach a doctor\'s referral (PDF or image) if you have one.',
  ]},
  { topic: 'Patients', q: 'A doctor asked to see my records. What does that mean?', a: [
    'Doctors cannot see your records unless you allow it.',
    'Each request names what the doctor wants: lab reports, medical history, personal health reports, contact information, vitals, or your full health record.',
    'Open "Doctor Requests" in the sidebar to accept or decline.',
    'Only accept requests from doctors who are treating you.',
  ]},
  { topic: 'Patients', q: 'How do I upload my own medical reports?', a: [
    'Open "My Reports" in the sidebar and upload the file.',
    'PDF and image files (JPEG, PNG, WebP, TIFF, BMP) are accepted, up to 20 MB each.',
    'Suwela reads vitals from the report automatically where it can.',
  ]},
  { topic: 'Patients', q: 'How do I send my prescription to a pharmacy?', a: [
    'Open the consultation in "Consultations".',
    'Choose a pharmacy and send the prescription.',
    'Track it as the pharmacy moves it through Preparing → Dispensed → Delivered.',
    'You can cancel it any time before the pharmacy dispenses it.',
    'You can also message the pharmacy about your order.',
  ]},
  { topic: 'Patients', q: 'Can I download my health records?', a: [
    'Yes — click the "Health Report" button on your dashboard.',
    'You get a PDF with your vitals, consultations, lab tests and uploaded documents.',
  ]},
  { topic: 'Patients', q: 'Do patients pay anything?', a: [
    'No — every patient feature on Suwela is free.',
  ]},

  { topic: 'Doctors', q: 'How do I write a prescription?', a: [
    'Open "Consultations" and create a consultation for your patient.',
    'Add the diagnosis and medicines, then save.',
    'You can upload a photo of a written prescription — medicines on it are filled in automatically.',
    'You or the patient can then send it to a pharmacy.',
  ]},
  { topic: 'Doctors', q: 'How do I order lab tests?', a: [
    'Open "Lab Reports" in the sidebar.',
    'Choose a laboratory and the tests you need.',
    'The lab receives the request immediately.',
    'The result comes back to you and the patient when the lab publishes it.',
  ]},
  { topic: 'Doctors', q: 'How do I set when patients can book me?', a: [
    'Open "Appointments" in the sidebar.',
    'Set your weekly availability — the days and times you see patients.',
    'Add date overrides for days off or changed hours.',
    'Patients can only book inside your available slots.',
  ]},
  { topic: 'Doctors', q: 'How do I handle appointment requests?', a: [
    'New requests appear in "Appointments", with a badge in the sidebar.',
    'Confirm or decline each pending request.',
    'After the visit, mark the appointment as completed.',
    'A confirmed appointment can still be cancelled if needed.',
  ]},
  { topic: 'Doctors', q: 'How do I see a patient\'s medical history?', a: [
    'Open "Access Requests" in the sidebar and search for the patient.',
    'Send a request for the information you need.',
    'Once the patient accepts, you can view it.',
  ]},
  { topic: 'Doctors', q: 'I work at a hospital and my own clinic. Do I need two accounts?', a: [
    'No — one account is enough.',
    'Use the dashboard switcher in the top bar to move between your personal and organization dashboards.',
  ]},
  { topic: 'Doctors', q: 'How do I start channeling at a hospital or clinic?', a: [
    'Send a join request to the hospital or clinic, optionally with the weekly hours you plan to offer.',
    'Nothing changes until the owner accepts.',
    'You can leave an organization yourself at any time.',
    'If the organization wants to remove you, you are asked to accept first.',
  ]},

  { topic: 'Organizations', q: 'How long does organization approval take?', a: [
    'Every new organization is reviewed by our team before it goes live.',
    'Until then, signing in shows that your account is waiting for approval.',
    'Once approved, you receive a verification email to activate the account.',
  ]},
  { topic: 'Organizations', q: 'How do I add staff to my organization?', a: [
    'Open "Team" in the sidebar.',
    'Enter the person\'s name, email and a password to create their login.',
    'Their account is active immediately — no extra approval needed.',
    'Each member only gets access to what their role needs.',
  ]},
  { topic: 'Organizations', q: 'How do I remove a team member?', a: [
    'Open "Team" and remove the member.',
    'Most members are removed immediately.',
    'Doctors are different: they are asked to accept the removal first.',
  ]},
  { topic: 'Organizations', q: 'Can other organizations see our data?', a: [
    'No — each organization is an isolated workspace.',
    'Data is separated at the database level with row-level security.',
  ]},
  { topic: 'Organizations', q: 'Pharmacies: how do prescriptions reach us?', a: [
    'A patient or their doctor sends the prescription to your pharmacy.',
    'It appears in "Prescriptions" in your sidebar.',
    'Move it through Preparing → Dispensed → Delivered.',
    'The patient is notified at each step, and the doctor once it is dispensed.',
    'You can message the patient about the order.',
  ]},
  { topic: 'Organizations', q: 'Pharmacies: how do we manage stock?', a: [
    '"Medicines" holds your catalogue and "Inventory" shows stock levels.',
    'Low-stock and expiry information is shown on your dashboard and inventory.',
    'Manage suppliers in "Suppliers" and purchase orders in "Orders".',
    'Record sales in "Sales".',
  ]},
  { topic: 'Organizations', q: 'Laboratories: how do we publish results?', a: [
    'Incoming requests from doctors and patients appear in "Lab Reports".',
    'Upload the report (PDF or image, up to 20 MB) to publish it to the patient and the requesting doctor.',
    'Patient walked in without a request? Upload their report directly.',
    'Keep your tests and prices up to date in "Test Catalog".',
  ]},

  { topic: 'Account & security', q: 'I forgot my password.', a: [
    'Click "Forgot password" on the sign-in page.',
    'We email you a secure link to set a new one.',
    'The link expires after 60 minutes and can only be used once.',
  ]},
  { topic: 'Account & security', q: 'How do I change my password?', a: [
    'Go to "Settings" and change your password.',
    'Passwords must be at least 10 characters long.',
  ]},
  { topic: 'Account & security', q: 'Who can see my medical records?', a: [
    'You, and only the doctors whose access requests you accepted.',
    'Organizations cannot see each other\'s data.',
    'Access to medical records is written to an audit log.',
  ]},
  { topic: 'Account & security', q: 'My account says it has been deactivated.', a: [
    'A deactivated account cannot sign in.',
    'Contact our support team using the form below so we can look into it.',
  ]},
  { topic: 'Account & security', q: 'Are there limits on uploads?', a: [
    'Medical reports: PDF or image, up to 20 MB per file.',
    'Prescription photos: up to 10 MB per file.',
    'Each account also has a daily and a total storage allowance.',
  ]},

  { topic: 'Packages', q: 'What is included in the free package?', a: [
    'Every doctor, clinic, hospital, pharmacy and laboratory starts on a free package.',
    'It covers the essentials for your type of practice.',
    'See the Explore page for what each package includes.',
  ]},
  { topic: 'Packages', q: 'How do I upgrade my package?', a: [
    'Open "Package" in your dashboard sidebar.',
    'See your current usage and request a package change.',
    'Our team reviews the request and applies the new package.',
  ]},
];


const PREVIEW_COUNT = 6;

const QUICK_LINKS: { to: string; icon: LucideIcon; tone: Tone; title: string; desc: string }[] = [
  { to: '/forgot-password', icon: KeyRound,    tone: 'orange', title: 'Reset your password', desc: 'Get a secure link by email.' },
  { to: '/privacy',         icon: ShieldCheck, tone: 'green',  title: 'Privacy policy',      desc: 'How we handle your health data.' },
  { to: '/terms',           icon: FileText,    tone: 'blue',   title: 'Terms of use',        desc: 'The rules for using Suwela.' },
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter(f =>
      (!topic || f.topic === topic) &&
      (!q || f.q.toLowerCase().includes(q) || f.a.some(p => p.toLowerCase().includes(q)))
    );
  }, [query, topic]);

  // With no topic or search, only a preview of the list is shown.
  const filtering = topic !== null || query.trim() !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await contactApi.support(msg);
      setSent(true);
    } catch (err) {
      setError(sendError(err));
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-2xl border border-suwela-line bg-suwela-paper px-4 py-3 text-sm text-suwela-ink placeholder-suwela-slate/60 outline-none transition focus:bg-white focus:border-suwela-green focus:ring-4 focus:ring-suwela-mint/20';

  return (
    <SitePage>
      <PageHero
        eyebrow="Help centre"
        title="How can we"
        highlight="help you?"
        subtitle="Search our answers, browse by topic, or talk to our support team."
      >
        <div className="max-w-xl mx-auto relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-suwela-slate" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            placeholder="Search e.g. “lab results”, “password”, “booking”"
            className="w-full rounded-full pl-14 pr-5 py-4 bg-white text-suwela-ink placeholder-suwela-slate/60 shadow-[0_16px_40px_-18px_rgba(14,44,82,0.45)] outline-none focus:ring-4 focus:ring-suwela-mint/40"
          />
        </div>
      </PageHero>

      {/* ── Topics ───────────────────────────────────────────────── */}
      <section className="pt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-3 gap-4">
          {TOPICS.map(t => {
            const active = topic === t.id;
            const c = TONES[t.tone];
            return (
              <button key={t.id} onClick={() => { setTopic(active ? null : t.id); setOpenQ(null); }} className="block text-left">
                <Tilt className={`rounded-[28px] p-5 transition-shadow ${active ? 'shadow-[0_24px_44px_-24px_rgba(14,44,82,0.5)]' : 'ring-1 ring-suwela-line hover:shadow-[0_20px_40px_-26px_rgba(14,44,82,0.45)]'}`}
                      style={active
                        ? { backgroundColor: c.to, backgroundImage: `linear-gradient(150deg, ${c.from}, ${c.to})` }
                        : { backgroundColor: '#fff', backgroundImage: `linear-gradient(180deg, ${c.wash} 0%, #ffffff 70%)` }}>
                  <c.Shape from={active ? '#ffffff' : c.from} to={active ? '#ffffff' : c.to}
                           className={`absolute -right-6 -top-6 w-24 h-24 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125 ${active ? 'opacity-20' : 'opacity-15'}`} />
                  <div className="relative flex items-center gap-4">
                    {active
                      ? <span className="w-12 h-12 shrink-0 rounded-2xl bg-white shadow-md flex items-center justify-center" style={{ color: c.to }}><t.icon className="w-6 h-6" /></span>
                      : <IconChip icon={t.icon} tone={t.tone} size="sm" className="!w-12 !h-12" />}
                    <div>
                      <p className={`font-semibold ${active ? 'text-white' : 'text-suwela-ink'}`}>{t.id}</p>
                      <p className={`text-xs mt-0.5 hidden sm:block ${active ? 'text-white/80' : 'text-suwela-slate'}`}>{t.desc}</p>
                    </div>
                  </div>
                </Tilt>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
            <div>
              <span className="font-tech text-[11px] uppercase tracking-[0.25em] text-suwela-green">FAQ</span>
              <h2 className="font-display text-4xl text-suwela-navy mt-1">{topic ?? 'Frequently asked questions'}</h2>
            </div>
            {(topic || query) && (
              <button onClick={() => { setTopic(null); setQuery(''); }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-suwela-paper px-4 py-2 text-sm font-semibold text-suwela-navy hover:bg-suwela-line transition-colors">
                Clear filters <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center rounded-[32px] border-2 border-dashed border-suwela-line py-14 px-6">
              <span className="mx-auto w-16 h-16 rounded-[20px] bg-suwela-paper flex items-center justify-center text-suwela-slate"><SearchX className="w-8 h-8" /></span>
              <p className="mt-4 font-display text-2xl text-suwela-navy">No answers match “{query}”</p>
              <p className="mt-1 text-sm text-suwela-slate">Try different words, or <a href="#contact" className="font-semibold text-suwela-green hover:underline">ask our team</a>.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(filtering || showAll ? results : results.slice(0, PREVIEW_COUNT)).map(f => {
                const open = openQ === f.q;
                const t = topicOf(f.topic);
                const c = TONES[t.tone];
                return (
                  <div key={f.q}
                       className={`group relative overflow-hidden rounded-[28px] bg-white transition-all duration-300 ${open ? 'shadow-[0_24px_50px_-30px_rgba(14,44,82,0.5)]' : 'ring-1 ring-suwela-line hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(14,44,82,0.45)]'}`}
                       style={open ? { backgroundImage: `linear-gradient(180deg, ${c.wash} 0%, #ffffff 70%)` } : undefined}>
                    <c.Shape from={c.from} to={c.to}
                             className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 transition-all duration-700 ${open ? 'opacity-20 rotate-45' : 'opacity-0 group-hover:opacity-10'}`} />

                    <button onClick={() => setOpenQ(open ? null : f.q)} aria-expanded={open} className="relative w-full flex items-center gap-4 text-left px-5 py-5">
                      <IconChip icon={t.icon} tone={t.tone} size="sm" className="transition-transform duration-300 group-hover:-rotate-6" />
                      <span className="flex-1 min-w-0">
                        {!topic && <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-1.5" style={{ backgroundColor: c.wash, color: c.to }}>{f.topic}</span>}
                        <span className="block font-semibold text-suwela-ink">{f.q}</span>
                      </span>
                      <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${open ? 'text-white rotate-45 shadow-md' : 'bg-suwela-paper text-suwela-slate group-hover:text-suwela-navy'}`}
                            style={open ? { backgroundColor: c.to } : undefined}>
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                    </button>
                    <div className={`relative grid transition-all duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <ul className="mx-5 sm:ml-[4.75rem] mb-6 space-y-2.5 rounded-2xl bg-white/90 ring-1 ring-suwela-line p-4">
                          {f.a.map(point => (
                            <li key={point} className="flex gap-3 text-sm text-suwela-slate leading-relaxed">
                              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c.to}1F`, color: c.to }}>
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              </span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filtering && results.length > PREVIEW_COUNT && (
                <div className="pt-4 text-center">
                  <button
                    onClick={() => { setShowAll(s => !s); if (showAll) document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="inline-flex items-center gap-2 rounded-full bg-suwela-navy text-white font-semibold px-7 py-3.5 hover:brightness-125 transition shadow-[0_16px_30px_-14px_rgba(14,44,82,0.8)]"
                  >
                    {showAll ? 'Show fewer questions' : `Show all ${results.length} questions`}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Quick links ──────────────────────────────────────────── */}
      <section className="pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-3 gap-5">
          {QUICK_LINKS.map(l => {
            const c = TONES[l.tone];
            return (
              <Link key={l.to} to={l.to} className="block">
                <Tilt className="flex items-center gap-4 rounded-[28px] p-5 ring-1 ring-suwela-line hover:shadow-[0_20px_40px_-26px_rgba(14,44,82,0.45)]"
                      style={{ backgroundColor: '#fff', backgroundImage: `linear-gradient(180deg, ${c.wash} 0%, #ffffff 70%)` }}>
                  <IconChip icon={l.icon} tone={l.tone} size="sm" />
                  <span className="flex-1">
                    <span className="block font-semibold text-suwela-ink">{l.title}</span>
                    <span className="block text-xs text-suwela-slate">{l.desc}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: c.to }} />
                </Tilt>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────── */}
      <section id="contact" className="px-4 sm:px-6 lg:px-8 pb-20 scroll-mt-24">
        <div className="relative overflow-hidden max-w-7xl mx-auto rounded-[44px] px-6 py-14 sm:px-12"
             style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
          <Leaf from="#43CE9F" to="#13A58F" className="absolute -left-12 -bottom-12 w-64 h-64 opacity-25 sw-float" />
          <Cross from="#5CC6FF" to="#1598E9" className="absolute right-10 -top-10 w-40 h-40 opacity-20" />
          <div className="relative grid lg:grid-cols-5 gap-12">
            <div className="lg:col-span-2 text-white">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-suwela-mint">
                <Mail className="w-4 h-4" /> Contact us
              </span>
              <h2 className="font-display text-4xl sm:text-5xl leading-[1.08] mt-5">Still need help?</h2>
              <p className="mt-5 text-lg text-white/75 leading-relaxed">Our support team is here for patients, providers and organizations. We usually reply within one working day.</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="group mt-8 flex items-center gap-4 rounded-3xl bg-white/[0.08] p-4 hover:bg-white/15 transition-colors">
                <IconChip icon={Mail} tone="green" size="sm" />
                <span className="flex-1">
                  <span className="block text-xs text-white/60">Email</span>
                  <span className="block font-semibold">{SUPPORT_EMAIL}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-suwela-mint transition-transform group-hover:translate-x-1" />
              </a>
            </div>

            <div className="lg:col-span-3 rounded-[36px] bg-white p-7 sm:p-10 shadow-2xl">
              {sent ? (
                <div className="text-center py-12 fade-up">
                  <div className="relative w-24 h-24 mx-auto">
                    <span className="absolute inset-0 rounded-full bg-suwela-mint/30 sw-ring" />
                    <span className="relative w-24 h-24 rounded-full flex items-center justify-center text-white shadow-xl" style={{ backgroundImage: 'linear-gradient(135deg, #5EDDB0, #13A58F)' }}>
                      <MailCheck className="w-11 h-11" />
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-3xl text-suwela-navy">Message sent</h3>
                  <p className="mt-3 text-suwela-slate">Thanks {msg.name.split(' ')[0]} — we'll reply to {msg.email} soon.</p>
                  <button onClick={() => { setSent(false); setMsg({ name: '', email: '', subject: '', message: '' }); }}
                          className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-suwela-green">
                    Send another message <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <SectionHeading eyebrow="Send a message" title="We'll get back to you" center={false} />
                  <div className="grid sm:grid-cols-2 gap-5 -mt-6">
                    <input required placeholder="Your name" value={msg.name} onChange={e => setMsg(m => ({ ...m, name: e.target.value }))} className={input} />
                    <input required type="email" placeholder="Email address" value={msg.email} onChange={e => setMsg(m => ({ ...m, email: e.target.value }))} className={input} />
                  </div>
                  <select required value={msg.subject} onChange={e => setMsg(m => ({ ...m, subject: e.target.value }))} className={input}>
                    <option value="" disabled>What do you need help with?</option>
                    {TOPICS.map(t => <option key={t.id}>{t.id}</option>)}
                    <option>Partnership or sales</option>
                    <option>Something else</option>
                  </select>
                  <textarea required rows={5} placeholder="Tell us what's going on. Please don't include medical details." value={msg.message}
                            onChange={e => setMsg(m => ({ ...m, message: e.target.value }))} className={`${input} resize-none`} />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button disabled={sending}
                          className="w-full rounded-full text-white text-lg font-semibold py-4 shadow-[0_16px_30px_-12px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:hover:translate-y-0"
                          style={GRADIENT_BTN}>
                    {sending ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
