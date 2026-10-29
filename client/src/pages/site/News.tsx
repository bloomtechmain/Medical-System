import { useEffect, useState } from 'react';
import {
  ArrowRight, BarChart3, BadgeCheck, Clock, Languages, Microscope, Package, PartyPopper, Repeat, ShieldCheck, X,
  type LucideIcon,
} from 'lucide-react';
import { SitePage, PageHero, Reveal } from '../../components/site/SiteLayout';
import { TONES, type Tone } from '../../components/site/tones';
import { Tilt } from '../../components/landing/Features';
import { Leaf } from '../../components/landing/Shapes';
import { contactApi } from '../../services/api';

type Category = 'Product' | 'Security' | 'Community' | 'Company';

interface Article {
  id: string;
  category: Category;
  date: string;
  readMins: number;
  title: string;
  excerpt: string;
  body: string[];
  tone: Tone;
  icon: LucideIcon;
}

// Release notes and announcements. Kept in the client for now; move to the
// API once there is a CMS or admin screen for publishing them.
const ARTICLES: Article[] = [
  {
    id: 'packages', category: 'Product', date: '2026-10-22', readMins: 3, icon: Package, tone: 'green',
    title: 'Introducing packages for doctors, clinics, hospitals, pharmacies and labs',
    excerpt: 'Every provider now starts free and can upgrade when they need more. Patients stay free, forever.',
    body: [
      'Today we are launching packages across Suwela. Every doctor, clinic, hospital, pharmacy and laboratory starts on a free package with the essentials, and can move to a paid tier when their practice grows.',
      'Paid tiers unlock features like lab orders, e-prescriptions, purchase orders, sales analytics and larger teams. Limits are enforced on the server and shown clearly in your dashboard, so you always know where you stand.',
      'Patients are not affected. Every patient feature — bookings, records, lab reports and health reports — remains completely free.',
    ],
  },
  {
    id: 'switcher', category: 'Product', date: '2026-10-14', readMins: 2, icon: Repeat, tone: 'blue',
    title: 'One login, every dashboard: meet the dashboard switcher',
    excerpt: 'Doctors who own a clinic or work at a hospital can now move between dashboards without signing out.',
    body: [
      'Many of our doctors wear more than one hat. They run a private practice, own a clinic and consult at a hospital — sometimes all in the same day.',
      'With the new dashboard switcher you can jump between your personal and organization dashboards from the top bar. Suwela remembers your last choice, and asks you which one to open when you first sign in.',
    ],
  },
  {
    id: 'health-report', category: 'Product', date: '2026-10-14', readMins: 2, icon: BarChart3, tone: 'purple',
    title: 'Your downloadable health report now includes vitals and lab results',
    excerpt: 'Take a complete picture of your health to any appointment — even one outside Suwela.',
    body: [
      'Patients can already download a summary of their consultations and prescriptions. Starting today the report also includes your recorded vitals and every published lab result.',
      'Open your dashboard, choose "Download health report", and you will get a neatly formatted PDF you can print or share with any doctor.',
    ],
  },
  {
    id: 'approval', category: 'Company', date: '2026-10-14', readMins: 2, icon: BadgeCheck, tone: 'orange',
    title: 'Faster organization approvals',
    excerpt: 'A dedicated approval queue means new hospitals, clinics, pharmacies and labs go live sooner.',
    body: [
      'Every organization that joins Suwela is reviewed by our team before it goes live — it is how we keep the network trustworthy for patients.',
      'We have rebuilt the review process around a dedicated approval queue. As soon as your organization is approved, you will receive a verification email to activate your account.',
    ],
  },
  {
    id: 'security', category: 'Security', date: '2026-10-08', readMins: 4, icon: ShieldCheck, tone: 'deep',
    title: 'Stronger account security across Suwela',
    excerpt: 'Short-lived sessions, longer passwords and self-service password reset.',
    body: [
      'Medical records deserve serious protection. This month we shipped a set of account security improvements.',
      'Sessions now use short-lived access tokens that refresh automatically, and can be revoked instantly. The minimum password length has been raised to 10 characters, and you can now change your password from settings or reset it yourself by email.',
      'Every access to a medical record is also written to an audit log, so we can always answer who looked at what, and when.',
    ],
  },
  {
    id: 'sinhala', category: 'Community', date: '2026-09-28', readMins: 2, icon: Languages, tone: 'orange',
    title: 'Suwela now speaks Sinhala — සිංහලෙන්',
    excerpt: 'Switch the whole app to Sinhala from the language menu in a single tap.',
    body: [
      'Healthcare should be understood by everyone. Suwela can now be used fully in Sinhala, alongside English.',
      'Pick your language from the language switcher. Your choice is remembered on that device.',
    ],
  },
  {
    id: 'lab-workflow', category: 'Product', date: '2026-09-18', readMins: 3, icon: Microscope, tone: 'blue',
    title: 'Paperless lab requests, from doctor to lab to patient',
    excerpt: 'Doctors order tests digitally; labs publish results straight back to the patient record.',
    body: [
      'Gone are the handwritten request slips. Doctors can now choose a laboratory and order tests in a few clicks during a consultation.',
      'The laboratory receives the request instantly, and when the report is published it appears for both the patient and the requesting doctor. Labs can also upload walk-in reports for patients who come without a request.',
    ],
  },
];

const CATEGORIES: ('All' | Category)[] = ['All', 'Product', 'Security', 'Community', 'Company'];

const CATEGORY_TONE: Record<Category, Tone> = { Product: 'green', Security: 'deep', Community: 'orange', Company: 'purple' };

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function CategoryPill({ category }: { category: Category }) {
  const t = TONES[CATEGORY_TONE[category]];
  return <span className="px-3 py-1 rounded-full font-semibold" style={{ backgroundColor: t.wash, color: t.to }}>{category}</span>;
}

// Gradient cover with the emblem shape and a white icon tile, like the landing page's coloured feature squares.
function Cover({ article, size }: { article: Article; size: 'lg' | 'md' }) {
  const t = TONES[article.tone];
  const Icon = article.icon;
  const big = size === 'lg';
  return (
    <div className="relative overflow-hidden flex items-center justify-center h-full"
         style={{ backgroundColor: t.to, backgroundImage: `linear-gradient(150deg, ${t.from}, ${t.to})` }}>
      <t.Shape from="#ffffff" to="#ffffff"
               className={`absolute opacity-20 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125 ${big ? '-right-12 -bottom-12 w-72 h-72' : '-right-6 -top-6 w-32 h-32'}`} />
      <span className={`relative flex items-center justify-center bg-white shadow-xl transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110 ${big ? 'w-28 h-28 rounded-[32px]' : 'w-16 h-16 rounded-[20px]'}`}
            style={{ color: t.to }}>
        <Icon className={`${big ? 'w-14 h-14' : 'w-8 h-8'} sw-wiggle`} strokeWidth={1.8} />
      </span>
    </div>
  );
}

function ArticleReader({ article, onClose }: { article: Article; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-suwela-navy/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <article className="sw-pop bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[36px] sm:rounded-[36px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="group relative h-52">
          <Cover article={article} size="lg" />
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/90 text-suwela-navy hover:bg-white flex items-center justify-center shadow">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8">
          <div className="flex items-center gap-3 text-xs">
            <CategoryPill category={article.category} />
            <span className="text-suwela-slate">{fmtDate(article.date)} · {article.readMins} min read</span>
          </div>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl text-suwela-navy leading-tight">{article.title}</h2>
          <div className="mt-6 space-y-4 text-suwela-slate text-lg leading-relaxed">
            {article.body.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      </article>
    </div>
  );
}

export default function News() {
  const [category, setCategory] = useState<'All' | Category>('All');
  const [open, setOpen] = useState<Article | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await contactApi.subscribe(email);
      setSubscribed(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not subscribe right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const [featured, ...rest] = ARTICLES;
  const list = category === 'All' ? rest : ARTICLES.filter(a => a.category === category);

  return (
    <SitePage>
      <PageHero
        eyebrow="Newsroom"
        title="What's new at"
        highlight="Suwela"
        subtitle="Product updates, security improvements and stories from the people building connected healthcare in Sri Lanka."
      />

      {/* ── Featured ──────────────────────────────────────────────── */}
      <section className="pt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <button onClick={() => setOpen(featured)} className="block w-full text-left">
              <Tilt className="grid lg:grid-cols-5 rounded-[40px] bg-white ring-1 ring-suwela-line hover:shadow-[0_40px_70px_-40px_rgba(14,44,82,0.5)]">
                <div className="lg:col-span-2 min-h-[260px]"><Cover article={featured} size="lg" /></div>
                <div className="lg:col-span-3 p-8 sm:p-10 flex flex-col justify-center"
                     style={{ backgroundImage: `linear-gradient(180deg, ${TONES[featured.tone].wash} 0%, #ffffff 60%)` }}>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="px-3 py-1 rounded-full font-semibold bg-suwela-navy text-white">Featured</span>
                    <CategoryPill category={featured.category} />
                    <span className="text-suwela-slate">{fmtDate(featured.date)}</span>
                  </div>
                  <h2 className="mt-5 font-display text-3xl sm:text-4xl text-suwela-navy leading-tight">{featured.title}</h2>
                  <p className="mt-4 text-lg text-suwela-slate leading-relaxed">{featured.excerpt}</p>
                  <span className="mt-6 inline-flex items-center gap-2 font-semibold" style={{ color: TONES[featured.tone].to }}>
                    Read the story <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Tilt>
            </button>
          </Reveal>
        </div>
      </section>

      {/* ── Filter + grid ─────────────────────────────────────────── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <h2 className="font-display text-3xl sm:text-4xl text-suwela-navy">Latest updates</h2>
            <div className="flex flex-wrap gap-1 rounded-full bg-white p-1.5 ring-1 ring-suwela-line shadow-sm w-fit">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${c === category ? 'bg-suwela-navy text-white' : 'text-suwela-slate hover:text-suwela-navy hover:bg-suwela-paper'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <p className="text-center text-suwela-slate py-16">No stories in this category yet.</p>
          ) : (
            <div key={category} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 fade-up">
              {list.map(a => (
                <button key={a.id} onClick={() => setOpen(a)} className="block h-full text-left">
                  <Tilt className="h-full flex flex-col rounded-[32px] bg-white ring-1 ring-suwela-line hover:shadow-[0_28px_50px_-28px_rgba(14,44,82,0.45)]">
                    <div className="h-44"><Cover article={a} size="md" /></div>
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <CategoryPill category={a.category} />
                        <span className="text-suwela-slate">{fmtDate(a.date)}</span>
                      </div>
                      <h3 className="mt-4 font-display text-xl text-suwela-navy leading-snug">{a.title}</h3>
                      <p className="mt-2 text-sm text-suwela-slate leading-relaxed flex-1">{a.excerpt}</p>
                      <div className="mt-5 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 text-suwela-slate"><Clock className="w-3.5 h-3.5" /> {a.readMins} min read</span>
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: TONES[a.tone].to }}>
                          Read <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  </Tilt>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Newsletter ────────────────────────────────────────────── */}
      <section className="pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[44px] p-8 sm:p-12"
               style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(135deg, #0E2C52, #123E6E 50%, #0B5E6E)' }}>
            <Leaf from="#43CE9F" to="#13A58F" className="absolute -right-12 -top-12 w-64 h-64 opacity-30 sw-float" />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="font-display text-3xl sm:text-4xl text-white">Never miss an update</h2>
                <p className="mt-3 text-white/75">Get new features and health-tech news in your inbox once a month. No spam, ever.</p>
              </div>
              {subscribed ? (
                <div className="rounded-3xl bg-white/10 p-5 text-white fade-up">
                  <p className="font-semibold inline-flex items-center gap-2"><PartyPopper className="w-5 h-5 text-suwela-mint" /> You're on the list!</p>
                  <p className="text-sm text-white/70 mt-1">We'll send the next update to {email}.</p>
                </div>
              ) : (
                <form onSubmit={subscribe} className="flex flex-col sm:flex-row gap-3 flex-wrap">
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                         className="flex-1 rounded-full px-5 py-3.5 bg-white text-suwela-ink placeholder-suwela-slate/60 outline-none focus:ring-4 focus:ring-suwela-mint/40" />
                  <button disabled={sending}
                          className="rounded-full px-7 py-3.5 text-white font-semibold shadow-[0_10px_24px_-10px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform disabled:opacity-60"
                          style={{ backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                    {sending ? 'Subscribing…' : 'Subscribe'}
                  </button>
                  {error && <p className="basis-full text-sm text-rose-200">{error}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {open && <ArticleReader article={open} onClose={() => setOpen(null)} />}
    </SitePage>
  );
}
