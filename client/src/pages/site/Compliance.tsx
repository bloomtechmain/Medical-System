import { Link } from 'react-router-dom';
import {
  ArrowRight, Award, Baby, BadgeCheck, BellRing, CreditCard, HeartHandshake, Lock, Network, Scale,
  ShieldCheck, Unlock, type LucideIcon,
} from 'lucide-react';
import { SitePage, PageHero, SectionHeading, Reveal, CtaBand } from '../../components/site/SiteLayout';
import { SiteCard } from '../../components/site/Cards';
import { TONES, TONE_CYCLE, type Tone } from '../../components/site/tones';

type Item = { icon: LucideIcon; tone: Tone; name: string; desc: string };

const CORE_RULES: Item[] = [
  { icon: Scale,     tone: 'blue',   name: 'FTC Act',                          desc: 'Reasonable privacy and security practices, and no misleading claims.' },
  { icon: BellRing,  tone: 'orange', name: 'FTC Health Breach Notification Rule', desc: 'Users and regulators are told promptly if health data is ever breached.' },
  { icon: Lock,      tone: 'purple', name: 'HITECH Act',                       desc: 'Stronger safeguards and breach rules for electronic health records.' },
  { icon: Unlock,    tone: 'green',  name: '21st Century Cures Act',           desc: 'No blocking of a patient\'s access to their own electronic health information.' },
];

const SITUATIONAL_RULES: Item[] = [
  { icon: Baby,           tone: 'green',  name: 'COPPA',   desc: 'Extra protection for the data of children under 13.' },
  { icon: HeartHandshake, tone: 'purple', name: 'OARFPA',  desc: 'Confidentiality for substance use disorder treatment records.' },
  { icon: CreditCard,     tone: 'blue',   name: 'PCI DSS', desc: 'Secure handling of credit and debit card payments.' },
];

const STANDARDS: { icon: LucideIcon; name: string; desc: string }[] = [
  { icon: ShieldCheck, name: 'ISO 27001',      desc: 'Information security management' },
  { icon: BadgeCheck,  name: 'ISO 13485',      desc: 'Quality management for medical software' },
  { icon: Award,       name: 'HITRUST CSF',    desc: 'HIPAA, SOC 2, NIST and ISO in one framework' },
  { icon: Network,     name: 'NIST CSF',       desc: 'Cybersecurity best practice for health systems' },
];

function RuleGrid({ items, cols }: { items: Item[]; cols: string }) {
  return (
    <div className={`grid sm:grid-cols-2 ${cols} gap-5`}>
      {items.map((r, i) => (
        <Reveal key={r.name} delay={i * 80} className="h-full">
          <SiteCard tone={r.tone} icon={r.icon} title={r.name}>
            <p className="relative mt-2 text-sm text-suwela-slate leading-relaxed">{r.desc}</p>
          </SiteCard>
        </Reveal>
      ))}
    </div>
  );
}

export default function Compliance() {
  return (
    <SitePage>
      <PageHero
        eyebrow="Compliance"
        title="Built around the rules that"
        highlight="protect health data."
        subtitle="The laws and industry standards that guide how Suwela stores, shares and secures your information."
      />

      {/* ── Core regulations ─────────────────────────────────────── */}
      <section id="regulations" className="pt-8 pb-20 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Regulations" title="Health data privacy & security" />
          <RuleGrid items={CORE_RULES} cols="lg:grid-cols-4" />
        </div>
      </section>

      {/* ── Situational regulations ──────────────────────────────── */}
      <section className="py-20 lg:py-24 bg-gradient-to-b from-[#EAF6FF] to-[#EDFBF4] rounded-[56px]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="When they apply" title="Rules for specific services" subtitle="These come into play for children's data, addiction treatment and card payments." />
          <RuleGrid items={SITUATIONAL_RULES} cols="lg:grid-cols-3" />
        </div>
      </section>

      {/* ── Voluntary / industry standards ───────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Industry standards" title="Voluntary standards we look to" />
        </div>
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto rounded-[44px] px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center"
               style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
            {STANDARDS.map((s, i) => {
              const t = TONES[TONE_CYCLE[i]];
              return (
                <Reveal key={s.name} delay={i * 80}>
                  <span className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center text-white"
                        style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
                    <s.icon className="w-7 h-7 sw-wiggle" strokeWidth={1.9} />
                  </span>
                  <p className="mt-4 font-display text-2xl text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(90deg, ${t.from}, #ffffff)` }}>{s.name}</p>
                  <p className="mt-1 text-sm text-white/70">{s.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
        <p className="mt-10 text-center text-suwela-slate px-4">
          Questions about how we handle your data?{' '}
          <Link to="/privacy" className="group inline-flex items-center gap-1 font-semibold text-suwela-navy underline underline-offset-4 decoration-suwela-mint decoration-2">
            Read our privacy policy <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </p>
      </section>

      <CtaBand title="Your health data, handled with care" subtitle="Join patients and providers across Sri Lanka on a platform built with privacy first." />
    </SitePage>
  );
}
