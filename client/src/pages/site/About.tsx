import { Link } from 'react-router-dom';
import { SitePage, PageHero, SectionHeading, Reveal, CtaBand } from '../../components/site/SiteLayout';

const VALUES = [
  { icon: '🙋', title: 'Patients own their data', desc: 'No doctor sees a patient\'s records without the patient saying yes.', tone: 'bg-blue-50 text-blue-600' },
  { icon: '🔒', title: 'Security is not optional', desc: 'Row-level isolation between organizations, short-lived sessions, and an audit log on every record access.', tone: 'bg-slate-100 text-slate-700' },
  { icon: '🤝', title: 'Built with clinicians', desc: 'Every workflow is designed alongside the doctors, pharmacists and lab teams who use it every day.', tone: 'bg-teal-50 text-teal-600' },
  { icon: '🇱🇰', title: 'Made for Sri Lanka', desc: 'Local languages, local pricing in rupees, and the way care is actually delivered here.', tone: 'bg-amber-50 text-amber-600' },
  { icon: '💚', title: 'Free for every patient', desc: 'Access to your own health records should never depend on what you can afford.', tone: 'bg-emerald-50 text-emerald-600' },
  { icon: '⚡', title: 'Simple by default', desc: 'Each role sees only the tools it needs. Nothing more, nothing less.', tone: 'bg-purple-50 text-purple-600' },
];

const MILESTONES = [
  { title: 'The problem', desc: 'Paper files, handwritten prescriptions and lab results carried by hand between hospitals, labs and pharmacies.' },
  { title: 'The idea', desc: 'One record that follows the patient, shared securely between every provider they visit — with their consent.' },
  { title: 'First release', desc: 'Patients, doctors, pharmacies and laboratories connected on a single platform with role-based dashboards.' },
  { title: 'Organizations', desc: 'Hospitals and clinics join as private workspaces with their own teams, doctor panels and channeling.' },
  { title: 'Today', desc: 'Sinhala support, dashboard switching, downloadable health reports and packages for every provider.' },
];

const STATS = [
  { value: '10,000+', label: 'Patients served' },
  { value: '500+', label: 'Healthcare providers' },
  { value: '200+', label: 'Organizations' },
  { value: '99.9%', label: 'Uptime' },
];

const TEAMS = [
  { icon: '💻', name: 'Engineering', desc: 'Builds and runs the platform, from the database to your dashboard.' },
  { icon: '🎨', name: 'Product & Design', desc: 'Turns real clinic workflows into screens that make sense.' },
  { icon: '🩺', name: 'Clinical Advisory', desc: 'Doctors and pharmacists who keep us honest about how care works.' },
  { icon: '🎧', name: 'Support & Onboarding', desc: 'Helps every organization go live and every user get unstuck.' },
];

export default function About() {
  return (
    <SitePage>
      <PageHero
        eyebrow="About Core Health"
        title="We're connecting"
        highlight="Sri Lankan healthcare."
        subtitle="Core Health is built by BloomTech to bring patients, doctors, pharmacies, laboratories, clinics and hospitals together on one secure platform."
      />

      {/* ── Mission & vision ─────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Why we exist</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2 leading-tight">Care shouldn't stop at the hospital door.</h2>
            <p className="mt-5 text-gray-500 leading-relaxed">
              A patient might see a GP, visit a lab across town, fill a prescription at their local pharmacy and follow up with a specialist at a hospital.
              Too often, each of those steps lives on a different piece of paper.
            </p>
            <p className="mt-4 text-gray-500 leading-relaxed">
              Core Health gives every step the same digital home, so the right information reaches the right person at the right moment — and the patient stays in control of who sees it.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-5">
            <Reveal delay={100}>
              <div className="h-full rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-700 p-7 text-white shadow-xl">
                <div className="text-3xl">🎯</div>
                <h3 className="mt-4 text-xl font-bold">Our mission</h3>
                <p className="mt-2 text-teal-50 text-sm leading-relaxed">Give every person in Sri Lanka secure, lifelong access to their own health record, and give every provider the tools to act on it.</p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="h-full rounded-3xl bg-gray-950 p-7 text-white shadow-xl sm:mt-10">
                <div className="text-3xl">🔭</div>
                <h3 className="mt-4 text-xl font-bold">Our vision</h3>
                <p className="mt-2 text-gray-300 text-sm leading-relaxed">A healthcare system where no test is repeated and no prescription is misread because information couldn't travel.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="py-14 bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-4xl font-bold text-white">{s.value}</p>
              <p className="mt-1 text-sm text-teal-100">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Values ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="What we believe" title="The principles behind every feature" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={(i % 3) * 90}>
                <div className="group h-full rounded-3xl border border-gray-100 p-7 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className={`w-12 h-12 rounded-2xl ${v.tone} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>{v.icon}</div>
                  <h3 className="mt-5 font-bold text-gray-900 text-lg">{v.title}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">{v.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey timeline ─────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-teal-100 via-emerald-50 to-teal-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Our journey" title="How we got here" />
          <ol className="relative border-l-2 border-teal-200 ml-4 space-y-10">
            {MILESTONES.map((m, i) => (
              <Reveal key={m.title} delay={i * 80}>
                <li className="ml-8">
                  <span className={`absolute -left-[13px] w-6 h-6 rounded-full border-4 border-white shadow ${i === MILESTONES.length - 1 ? 'bg-emerald-500 animate-pulse' : 'bg-teal-500'}`} />
                  <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Step {i + 1}</p>
                    <h3 className="mt-1 text-lg font-bold text-gray-900">{m.title}</h3>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{m.desc}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Team ─────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The team" title="The people behind Core Health" subtitle="A team at BloomTech working with healthcare professionals across the island." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TEAMS.map((t, i) => (
              <Reveal key={t.name} delay={i * 80}>
                <div className="h-full text-center rounded-3xl bg-gray-50 p-7 hover:bg-white hover:shadow-xl transition-all duration-300">
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-3xl shadow-lg">{t.icon}</div>
                  <h3 className="mt-5 font-bold text-gray-900">{t.name}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">{t.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-gray-500">
            Want to work with us or partner with Core Health? <Link to="/help#contact" className="font-semibold text-teal-700 hover:underline">Get in touch →</Link>
          </p>
        </div>
      </section>

      <CtaBand title="Join the connected care network" subtitle="Whether you run a hospital or just want your records in one place, there's a place for you on Core Health." />
    </SitePage>
  );
}
