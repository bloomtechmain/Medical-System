import { Link } from 'react-router-dom';
import { FormEvent, useMemo, useState } from 'react';
import { SitePage, PageHero, SectionHeading } from '../../components/site/SiteLayout';

type Topic = 'Getting started' | 'Patients' | 'Doctors' | 'Organizations' | 'Account & security' | 'Packages';

const TOPICS: { id: Topic; icon: string; desc: string }[] = [
  { id: 'Getting started',    icon: '🚀', desc: 'Creating an account and first steps' },
  { id: 'Patients',           icon: '👤', desc: 'Bookings, records and lab reports' },
  { id: 'Doctors',            icon: '🩺', desc: 'Consultations, prescriptions, labs' },
  { id: 'Organizations',      icon: '🏥', desc: 'Hospitals, clinics, pharmacies, labs' },
  { id: 'Account & security', icon: '🔒', desc: 'Passwords, privacy and your data' },
  { id: 'Packages',           icon: '📦', desc: 'Free and paid packages' },
];

// Full class names per topic so Tailwind keeps them in the build.
const TOPIC_TONE: Record<Topic, { bar: string; soft: string; border: string; glow: string; icon: string; chip: string; button: string; check: string }> = {
  'Getting started':    { bar: 'bg-teal-500',    soft: 'from-teal-50',    border: 'border-teal-200',    glow: 'bg-teal-300',    icon: 'bg-teal-50',    chip: 'bg-teal-50 text-teal-700',       button: 'bg-teal-600',    check: 'text-teal-500' },
  'Patients':           { bar: 'bg-blue-500',    soft: 'from-blue-50',    border: 'border-blue-200',    glow: 'bg-blue-300',    icon: 'bg-blue-50',    chip: 'bg-blue-50 text-blue-700',       button: 'bg-blue-600',    check: 'text-blue-500' },
  'Doctors':            { bar: 'bg-emerald-500', soft: 'from-emerald-50', border: 'border-emerald-200', glow: 'bg-emerald-300', icon: 'bg-emerald-50', chip: 'bg-emerald-50 text-emerald-700', button: 'bg-emerald-600', check: 'text-emerald-500' },
  'Organizations':      { bar: 'bg-purple-500',  soft: 'from-purple-50',  border: 'border-purple-200',  glow: 'bg-purple-300',  icon: 'bg-purple-50',  chip: 'bg-purple-50 text-purple-700',   button: 'bg-purple-600',  check: 'text-purple-500' },
  'Account & security': { bar: 'bg-amber-500',   soft: 'from-amber-50',   border: 'border-amber-200',   glow: 'bg-amber-300',   icon: 'bg-amber-50',   chip: 'bg-amber-50 text-amber-700',     button: 'bg-amber-500',   check: 'text-amber-500' },
  'Packages':           { bar: 'bg-rose-500',    soft: 'from-rose-50',    border: 'border-rose-200',    glow: 'bg-rose-300',    icon: 'bg-rose-50',    chip: 'bg-rose-50 text-rose-700',       button: 'bg-rose-500',    check: 'text-rose-500' },
};

// Every answer below was checked against the app's screens and API. Menu
// names in quotes match the sidebar labels in locales/en/common.json.
const FAQS: { topic: Topic; q: string; a: string[] }[] = [
  { topic: 'Getting started', q: 'Who can use Core Health?', a: [
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
  { topic: 'Getting started', q: 'Can I use Core Health in Sinhala?', a: [
    'Yes — Core Health is available in English and Sinhala.',
    'Use the language switcher in the top bar of the app to change at any time.',
  ]},
  { topic: 'Getting started', q: 'I belong to more than one dashboard. Which one opens?', a: [
    'If you have more than one dashboard, Core Health asks which one to open when you sign in.',
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
    'Core Health reads vitals from the report automatically where it can.',
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
    'No — every patient feature on Core Health is free.',
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

export default function Help() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter(f =>
      (!topic || f.topic === topic) &&
      (!q || f.q.toLowerCase().includes(q) || f.a.some(p => p.toLowerCase().includes(q)))
    );
  }, [query, topic]);

  // With no topic or search, only a preview of the list is shown.
  const filtering = topic !== null || query.trim() !== '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // TODO: send to a support endpoint once the API has one.
    setSent(true);
  };

  const input = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10';

  return (
    <SitePage>
      <PageHero
        eyebrow="Help centre"
        title="How can we"
        highlight="help you?"
        subtitle="Search our answers, browse by topic, or talk to our support team."
      >
        <div className="max-w-xl mx-auto relative">
          <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            placeholder="Search e.g. “lab results”, “password”, “booking”"
            className="w-full rounded-2xl pl-14 pr-5 py-4 bg-white text-gray-900 placeholder-gray-400 shadow-2xl outline-none focus:ring-4 focus:ring-teal-300/40"
          />
        </div>
      </PageHero>

      {/* ── Topics ───────────────────────────────────────────────── */}
      <section className="pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-3 gap-4">
          {TOPICS.map(t => {
            const active = topic === t.id;
            return (
              <button key={t.id}
                onClick={() => { setTopic(active ? null : t.id); setOpenQ(null); }}
                className={`text-left rounded-2xl border-2 p-5 transition-all duration-200 hover:-translate-y-0.5 ${active ? 'border-teal-500 bg-teal-50 shadow-lg' : 'border-gray-100 hover:border-teal-200 hover:shadow-md'}`}>
                <div className="flex items-center gap-4">
                  <span className="w-12 h-12 shrink-0 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-2xl">{t.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{t.id}</p>
                    <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">{t.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
            <div>
              <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">FAQ</span>
              <h2 className="text-3xl font-bold text-gray-900 mt-1">{topic ?? 'Frequently asked questions'}</h2>
            </div>
            {(topic || query) && (
              <button onClick={() => { setTopic(null); setQuery(''); }} className="text-sm font-semibold text-teal-700 hover:text-teal-800">Clear filters ✕</button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center rounded-3xl border-2 border-dashed border-gray-200 py-14 px-6">
              <p className="text-4xl">🤔</p>
              <p className="mt-3 font-semibold text-gray-900">No answers match “{query}”</p>
              <p className="mt-1 text-sm text-gray-500">Try different words, or <a href="#contact" className="text-teal-700 font-semibold hover:underline">ask our team</a>.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(filtering || showAll ? results : results.slice(0, PREVIEW_COUNT)).map(f => {
                const open = openQ === f.q;
                const tone = TOPIC_TONE[f.topic];
                const icon = TOPICS.find(t => t.id === f.topic)?.icon;
                return (
                  <div key={f.q} className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                    open ? `${tone.border} bg-gradient-to-br ${tone.soft} via-white to-white shadow-lg` : 'border-gray-100 bg-white hover:-translate-y-0.5 hover:shadow-lg hover:border-gray-200'
                  }`}>
                    {/* Topic-coloured accent bar and corner glow */}
                    <span className={`absolute left-0 inset-y-0 w-1.5 ${tone.bar} transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} />
                    <span className={`pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full blur-2xl transition-opacity duration-500 ${tone.glow} ${open ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'}`} />

                    <button onClick={() => setOpenQ(open ? null : f.q)} aria-expanded={open} className="relative w-full flex items-center gap-4 text-left pl-6 pr-5 py-5">
                      <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl shadow-sm transition-transform duration-300 group-hover:scale-110 ${tone.icon}`}>{icon}</span>
                      <span className="flex-1 min-w-0">
                        {!topic && <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-1.5 ${tone.chip}`}>{f.topic}</span>}
                        <span className="block font-semibold text-gray-900">{f.q}</span>
                      </span>
                      <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${open ? `${tone.button} text-white rotate-45 shadow-md` : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" /></svg>
                      </span>
                    </button>
                    <div className={`relative grid transition-all duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <ul className="ml-6 sm:ml-[5.25rem] mr-6 mb-6 space-y-2.5 rounded-xl bg-white/80 border border-gray-100 p-4">
                          {f.a.map(point => (
                            <li key={point} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                              <svg className={`w-4 h-4 mt-0.5 shrink-0 ${tone.check}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
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
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-600 text-teal-700 font-semibold px-6 py-3 hover:bg-teal-50 transition-colors"
                  >
                    {showAll ? 'Show fewer questions' : `Show all ${results.length} questions`}
                    <svg className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
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
          {[
            { to: '/forgot-password', icon: '🔑', title: 'Reset your password', desc: 'Get a secure link by email.' },
            { to: '/privacy', icon: '🛡️', title: 'Privacy policy', desc: 'How we handle your health data.' },
            { to: '/terms', icon: '📜', title: 'Terms of use', desc: 'The rules for using Core Health.' },
          ].map(l => (
            <Link key={l.to} to={l.to} className="group flex items-center gap-4 rounded-2xl bg-gray-50 p-5 hover:bg-white hover:shadow-lg transition-all">
              <span className="text-2xl">{l.icon}</span>
              <span className="flex-1">
                <span className="block font-semibold text-gray-900 group-hover:text-teal-700">{l.title}</span>
                <span className="block text-xs text-gray-500">{l.desc}</span>
              </span>
              <svg className="w-4 h-4 text-gray-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────── */}
      <section id="contact" className="py-20 bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2 text-white">
            <span className="text-sm font-semibold text-teal-300 uppercase tracking-wider">Contact us</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-2">Still need help?</h2>
            <p className="mt-4 text-teal-100 leading-relaxed">Our support team is here for patients, providers and organizations. We usually reply within one working day.</p>
            <div className="mt-8 space-y-4">
              {[
                ['✉️', 'Email', 'support@corehealth.lk'],
                ['📞', 'Phone', '+94 11 000 0000'],
                ['🕘', 'Hours', 'Mon – Fri, 8:30 AM – 5:30 PM'],
                ['📍', 'Office', 'BloomTech, Colombo, Sri Lanka'],
              ].map(([icon, label, value]) => (
                <div key={label} className="flex items-center gap-4 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-sm p-4">
                  <span className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-xl">{icon}</span>
                  <div>
                    <p className="text-xs text-teal-200">{label}</p>
                    <p className="font-semibold">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-3xl bg-white p-7 sm:p-10 shadow-2xl">
            {sent ? (
              <div className="text-center py-12 fade-up">
                <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-4xl shadow-lg">📨</div>
                <h3 className="mt-6 text-2xl font-bold text-gray-900">Message sent</h3>
                <p className="mt-3 text-gray-500">Thanks {msg.name.split(' ')[0]} — we'll reply to {msg.email} soon.</p>
                <button onClick={() => { setSent(false); setMsg({ name: '', email: '', subject: '', message: '' }); }} className="mt-8 text-sm font-semibold text-teal-700">Send another message →</button>
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
                <button className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold py-3.5 shadow-lg shadow-teal-600/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  Send message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </SitePage>
  );
}
