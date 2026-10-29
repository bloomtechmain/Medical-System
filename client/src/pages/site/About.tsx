import { Link } from 'react-router-dom';
import {
  ArrowRight, Code2, Compass, Handshake, HeadphonesIcon, HeartHandshake, MapPin, Palette, ShieldCheck,
  Stethoscope, Target, UserCheck, Zap, type LucideIcon,
} from 'lucide-react';
import { SitePage, PageHero, SectionHeading, Reveal, CtaBand } from '../../components/site/SiteLayout';
import { SiteCard, IconChip } from '../../components/site/Cards';
import { TONES, TONE_CYCLE, type Tone } from '../../components/site/tones';
import { Leaf, Cross } from '../../components/landing/Shapes';

const VALUES: { icon: LucideIcon; tone: Tone; title: string; desc: string }[] = [
  { icon: UserCheck,      tone: 'green',  title: 'Patients own their data',  desc: 'No doctor sees a patient\'s records without the patient saying yes.' },
  { icon: ShieldCheck,    tone: 'blue',   title: 'Security is not optional', desc: 'Row-level isolation between organizations, short-lived sessions, and an audit log on every record access.' },
  { icon: Handshake,      tone: 'purple', title: 'Built with clinicians',    desc: 'Every workflow is designed alongside the doctors, pharmacists and lab teams who use it every day.' },
  { icon: MapPin,         tone: 'orange', title: 'Made for Sri Lanka',       desc: 'Local languages, local pricing in rupees, and the way care is actually delivered here.' },
  { icon: HeartHandshake, tone: 'deep',   title: 'Free for every patient',   desc: 'Access to your own health records should never depend on what you can afford.' },
  { icon: Zap,            tone: 'green',  title: 'Simple by default',        desc: 'Each role sees only the tools it needs. Nothing more, nothing less.' },
];

const MILESTONES = [
  { title: 'The problem', desc: 'Paper files, handwritten prescriptions and lab results carried by hand between hospitals, labs and pharmacies.' },
  { title: 'The idea', desc: 'One record that follows the patient, shared securely between every provider they visit — with their consent.' },
  { title: 'First release', desc: 'Patients, doctors, pharmacies and laboratories connected on a single platform with role-based dashboards.' },
  { title: 'Organizations', desc: 'Hospitals and clinics join as private workspaces with their own teams, doctor panels and channeling.' },
  { title: 'Today', desc: 'Sinhala support, dashboard switching, downloadable health reports and packages for every provider.' },
];

const STATS = [
  { value: '4', label: 'Care roles connected' },
  { value: '2', label: 'Languages — English & සිංහල' },
  { value: 'Free', label: 'For every patient' },
  { value: '24/7', label: 'Access to your records' },
];

const TEAMS: { icon: LucideIcon; tone: Tone; name: string; desc: string }[] = [
  { icon: Code2,          tone: 'blue',   name: 'Engineering',          desc: 'Builds and runs the platform, from the database to your dashboard.' },
  { icon: Palette,        tone: 'purple', name: 'Product & Design',     desc: 'Turns real clinic workflows into screens that make sense.' },
  { icon: Stethoscope,    tone: 'green',  name: 'Clinical Advisory',    desc: 'Doctors and pharmacists who keep us honest about how care works.' },
  { icon: HeadphonesIcon, tone: 'orange', name: 'Support & Onboarding', desc: 'Helps every organization go live and every user get unstuck.' },
];

export default function About() {
  return (
    <SitePage>
      <PageHero
        eyebrow="About Suwela"
        title="We're connecting"
        highlight="Sri Lankan healthcare."
        subtitle="Suwela Medical Hub is built by BloomTech to bring patients, doctors, pharmacies, laboratories, clinics and hospitals together on one secure platform."
      />

      {/* ── Mission & vision ─────────────────────────────────────── */}
      <section className="pt-8 pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <SectionHeading eyebrow="Why we exist" title="Care shouldn't stop at the hospital door." center={false} />
            <p className="-mt-6 text-lg text-suwela-slate leading-relaxed">
              A patient might see a GP, visit a lab across town, fill a prescription at their local pharmacy and follow up with a specialist at a hospital.
              Too often, each of those steps lives on a different piece of paper.
            </p>
            <p className="mt-4 text-lg text-suwela-slate leading-relaxed">
              Suwela gives every step the same digital home, so the right information reaches the right person at the right moment — and the patient stays in control of who sees it.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-5">
            <Reveal delay={100} className="h-full">
              <div className="group relative h-full overflow-hidden rounded-[32px] p-7 text-white shadow-[0_24px_44px_-24px_#13A58F]"
                   style={{ backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(150deg, #5EDDB0, #13A58F)' }}>
                <Leaf from="#ffffff" to="#ffffff" className="absolute -right-8 -top-8 w-32 h-32 opacity-20 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
                <span className="relative w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-suwela-green">
                  <Target className="w-7 h-7 sw-wiggle" />
                </span>
                <h3 className="relative mt-6 font-display text-2xl">Our mission</h3>
                <p className="relative mt-2 text-white/85 text-sm leading-relaxed">Give every person in Sri Lanka secure, lifelong access to their own health record, and give every provider the tools to act on it.</p>
              </div>
            </Reveal>
            <Reveal delay={200} className="h-full sm:mt-10">
              <div className="group relative h-full overflow-hidden rounded-[32px] p-7 text-white shadow-[0_24px_44px_-24px_#0E2C52]"
                   style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(150deg, #123E6E, #0E2C52)' }}>
                <Cross from="#5CC6FF" to="#1598E9" className="absolute -right-8 -top-8 w-32 h-32 opacity-30 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
                <span className="relative w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-suwela-blue">
                  <Compass className="w-7 h-7 sw-wiggle" />
                </span>
                <h3 className="relative mt-6 font-display text-2xl">Our vision</h3>
                <p className="relative mt-2 text-white/75 text-sm leading-relaxed">A healthcare system where no test is repeated and no prescription is misread because information couldn't travel.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto rounded-[44px] px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center"
             style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
          {STATS.map((s, i) => {
            const t = TONES[TONE_CYCLE[i]];
            return (
              <div key={s.label}>
                <p className="font-display text-5xl text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(90deg, ${t.from}, #ffffff)` }}>{s.value}</p>
                <p className="mt-2 text-sm text-white/70">{s.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Values ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="What we believe" title="The principles behind every feature" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={(i % 3) * 90} className="h-full">
                <SiteCard tone={v.tone} icon={v.icon} title={v.title}>
                  <p className="relative mt-2 text-sm text-suwela-slate leading-relaxed">{v.desc}</p>
                </SiteCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey timeline ─────────────────────────────────────── */}
      <section className="py-20 lg:py-24 bg-gradient-to-b from-[#EAF6FF] to-[#EDFBF4] rounded-[56px]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Our journey" title="How we got here" />
          <ol className="relative ml-6 border-l-2 border-dashed border-suwela-sky/50 space-y-6">
            {MILESTONES.map((m, i) => {
              const tone = TONE_CYCLE[i % TONE_CYCLE.length];
              const t = TONES[tone];
              const last = i === MILESTONES.length - 1;
              return (
                <Reveal key={m.title} delay={i * 80}>
                  <li className="relative ml-10">
                    <span className="absolute -left-[62px] top-5 w-11 h-11 rounded-2xl text-white font-bold flex items-center justify-center ring-4 ring-[#EEF8FB]"
                          style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})`, boxShadow: `0 10px 20px -10px ${t.to}` }}>
                      {i + 1}
                    </span>
                    <div className="rounded-[28px] bg-white p-6 shadow-sm hover:shadow-xl hover:translate-x-1 transition-all duration-300">
                      <p className="font-tech text-[11px] uppercase tracking-[0.25em]" style={{ color: t.to }}>{last ? 'Now' : `Step ${i + 1}`}</p>
                      <h3 className="mt-1 font-display text-2xl text-suwela-navy">{m.title}</h3>
                      <p className="mt-2 text-sm text-suwela-slate leading-relaxed">{m.desc}</p>
                    </div>
                  </li>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── Team ─────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The team" title="The people behind Suwela" subtitle="A team at BloomTech working with healthcare professionals across the island." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TEAMS.map((t, i) => (
              <Reveal key={t.name} delay={i * 80} className="h-full">
                <SiteCard tone={t.tone} className="items-center text-center">
                  <IconChip icon={t.icon} tone={t.tone} size="lg" className="!rounded-full" />
                  <h3 className="relative font-display text-xl text-suwela-navy mt-5">{t.name}</h3>
                  <p className="relative mt-2 text-sm text-suwela-slate leading-relaxed">{t.desc}</p>
                </SiteCard>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-suwela-slate">
            Want to work with us or partner with Suwela?{' '}
            <Link to="/help#contact" className="group inline-flex items-center gap-1 font-semibold text-suwela-navy underline underline-offset-4 decoration-suwela-mint decoration-2">
              Get in touch <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </p>
        </div>
      </section>

      <CtaBand title="Join the connected care network" subtitle="Whether you run a hospital or just want your records in one place, there's a place for you on Suwela." />
    </SitePage>
  );
}
