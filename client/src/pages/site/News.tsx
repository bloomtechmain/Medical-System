import { useEffect, useState } from 'react';
import { SitePage, PageHero, Reveal } from '../../components/site/SiteLayout';
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
  cover: string;   // gradient classes
  emoji: string;
}

// Release notes and announcements. Kept in the client for now; move to the
// API once there is a CMS or admin screen for publishing them.
const ARTICLES: Article[] = [
  {
    id: 'packages', category: 'Product', date: '2026-10-22', readMins: 3, emoji: '📦',
    cover: 'from-teal-500 via-emerald-500 to-green-500',
    title: 'Introducing packages for doctors, clinics, hospitals, pharmacies and labs',
    excerpt: 'Every provider now starts free and can upgrade when they need more. Patients stay free, forever.',
    body: [
      'Today we are launching packages across Core Health. Every doctor, clinic, hospital, pharmacy and laboratory starts on a free package with the essentials, and can move to a paid tier when their practice grows.',
      'Paid tiers unlock features like lab orders, e-prescriptions, purchase orders, sales analytics and larger teams. Limits are enforced on the server and shown clearly in your dashboard, so you always know where you stand.',
      'Patients are not affected. Every patient feature — bookings, records, lab reports and health reports — remains completely free.',
    ],
  },
  {
    id: 'switcher', category: 'Product', date: '2026-10-14', readMins: 2, emoji: '🔀',
    cover: 'from-blue-500 via-cyan-500 to-teal-500',
    title: 'One login, every dashboard: meet the dashboard switcher',
    excerpt: 'Doctors who own a clinic or work at a hospital can now move between dashboards without signing out.',
    body: [
      'Many of our doctors wear more than one hat. They run a private practice, own a clinic and consult at a hospital — sometimes all in the same day.',
      'With the new dashboard switcher you can jump between your personal and organization dashboards from the top bar. Core Health remembers your last choice, and asks you which one to open when you first sign in.',
    ],
  },
  {
    id: 'health-report', category: 'Product', date: '2026-10-14', readMins: 2, emoji: '📊',
    cover: 'from-rose-400 via-pink-500 to-purple-500',
    title: 'Your downloadable health report now includes vitals and lab results',
    excerpt: 'Take a complete picture of your health to any appointment — even one outside Core Health.',
    body: [
      'Patients can already download a summary of their consultations and prescriptions. Starting today the report also includes your recorded vitals and every published lab result.',
      'Open your dashboard, choose "Download health report", and you will get a neatly formatted PDF you can print or share with any doctor.',
    ],
  },
  {
    id: 'approval', category: 'Company', date: '2026-10-14', readMins: 2, emoji: '✅',
    cover: 'from-amber-400 via-orange-500 to-rose-500',
    title: 'Faster organization approvals',
    excerpt: 'A dedicated approval queue means new hospitals, clinics, pharmacies and labs go live sooner.',
    body: [
      'Every organization that joins Core Health is reviewed by our team before it goes live — it is how we keep the network trustworthy for patients.',
      'We have rebuilt the review process around a dedicated approval queue. As soon as your organization is approved, you will receive a verification email to activate your account.',
    ],
  },
  {
    id: 'security', category: 'Security', date: '2026-10-08', readMins: 4, emoji: '🛡️',
    cover: 'from-slate-600 via-slate-700 to-gray-900',
    title: 'Stronger account security across Core Health',
    excerpt: 'Short-lived sessions, longer passwords and self-service password reset.',
    body: [
      'Medical records deserve serious protection. This month we shipped a set of account security improvements.',
      'Sessions now use short-lived access tokens that refresh automatically, and can be revoked instantly. The minimum password length has been raised to 10 characters, and you can now change your password from settings or reset it yourself by email.',
      'Every access to a medical record is also written to an audit log, so we can always answer who looked at what, and when.',
    ],
  },
  {
    id: 'sinhala', category: 'Community', date: '2026-09-28', readMins: 2, emoji: '🌐',
    cover: 'from-yellow-400 via-amber-500 to-orange-600',
    title: 'Core Health now speaks Sinhala — සිංහලෙන්',
    excerpt: 'Switch the whole app to Sinhala from the language menu in a single tap.',
    body: [
      'Healthcare should be understood by everyone. Core Health can now be used fully in Sinhala, alongside English.',
      'Pick your language from the language switcher. Your choice is remembered on that device.',
    ],
  },
  {
    id: 'lab-workflow', category: 'Product', date: '2026-09-18', readMins: 3, emoji: '🔬',
    cover: 'from-cyan-500 via-sky-500 to-indigo-500',
    title: 'Paperless lab requests, from doctor to lab to patient',
    excerpt: 'Doctors order tests digitally; labs publish results straight back to the patient record.',
    body: [
      'Gone are the handwritten request slips. Doctors can now choose a laboratory and order tests in a few clicks during a consultation.',
      'The laboratory receives the request instantly, and when the report is published it appears for both the patient and the requesting doctor. Labs can also upload walk-in reports for patients who come without a request.',
    ],
  },
];

const CATEGORIES: ('All' | Category)[] = ['All', 'Product', 'Security', 'Community', 'Company'];

const CATEGORY_TONE: Record<Category, string> = {
  Product: 'bg-teal-100 text-teal-700',
  Security: 'bg-slate-200 text-slate-700',
  Community: 'bg-amber-100 text-amber-700',
  Company: 'bg-rose-100 text-rose-700',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function ArticleReader({ article, onClose }: { article: Article; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <article className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl fade-up" onClick={e => e.stopPropagation()}>
        <div className={`relative h-48 bg-gradient-to-br ${article.cover} flex items-center justify-center`}>
          <span className="text-7xl drop-shadow-lg">{article.emoji}</span>
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 text-white hover:bg-black/30 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-8">
          <div className="flex items-center gap-3 text-xs">
            <span className={`px-2.5 py-1 rounded-full font-semibold ${CATEGORY_TONE[article.category]}`}>{article.category}</span>
            <span className="text-gray-400">{fmtDate(article.date)} · {article.readMins} min read</span>
          </div>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{article.title}</h2>
          <div className="mt-6 space-y-4 text-gray-600 leading-relaxed">
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
        highlight="Core Health"
        subtitle="Product updates, security improvements and stories from the people building connected healthcare in Sri Lanka."
      />

      {/* ── Featured ──────────────────────────────────────────────── */}
      <section className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <button onClick={() => setOpen(featured)} className="group w-full text-left grid lg:grid-cols-5 rounded-3xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-2xl transition-all duration-300">
              <div className={`lg:col-span-2 min-h-[240px] bg-gradient-to-br ${featured.cover} flex items-center justify-center relative overflow-hidden`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
                <span className="text-8xl drop-shadow-xl group-hover:scale-110 transition-transform duration-500">{featured.emoji}</span>
              </div>
              <div className="lg:col-span-3 p-8 sm:p-10 flex flex-col justify-center">
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2.5 py-1 rounded-full font-semibold bg-gray-900 text-white">Featured</span>
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${CATEGORY_TONE[featured.category]}`}>{featured.category}</span>
                  <span className="text-gray-400">{fmtDate(featured.date)}</span>
                </div>
                <h2 className="mt-5 text-2xl sm:text-3xl font-bold text-gray-900 leading-tight group-hover:text-teal-700 transition-colors">{featured.title}</h2>
                <p className="mt-4 text-gray-500 leading-relaxed">{featured.excerpt}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-teal-700 font-semibold text-sm">
                  Read the story
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </span>
              </div>
            </button>
          </Reveal>
        </div>
      </section>

      {/* ── Filter + grid ─────────────────────────────────────────── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <h2 className="text-2xl font-bold text-gray-900">Latest updates</h2>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${c === category ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <p className="text-center text-gray-400 py-16">No stories in this category yet.</p>
          ) : (
            <div key={category} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 fade-up">
              {list.map(a => (
                <button key={a.id} onClick={() => setOpen(a)} className="group text-left rounded-3xl border border-gray-100 bg-white overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
                  <div className={`h-40 bg-gradient-to-br ${a.cover} flex items-center justify-center`}>
                    <span className="text-5xl drop-shadow-lg group-hover:scale-110 transition-transform duration-500">{a.emoji}</span>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2.5 py-1 rounded-full font-semibold ${CATEGORY_TONE[a.category]}`}>{a.category}</span>
                      <span className="text-gray-400">{fmtDate(a.date)}</span>
                    </div>
                    <h3 className="mt-4 font-bold text-gray-900 leading-snug group-hover:text-teal-700 transition-colors">{a.title}</h3>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed flex-1">{a.excerpt}</p>
                    <p className="mt-5 text-xs text-gray-400">{a.readMins} min read</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Newsletter ────────────────────────────────────────────── */}
      <section className="pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 p-8 sm:p-12">
            <div className="absolute -top-10 -right-10 w-56 h-56 bg-white/5 rounded-full" />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white">Never miss an update</h2>
                <p className="mt-3 text-teal-100">Get new features and health-tech news in your inbox once a month. No spam, ever.</p>
              </div>
              {subscribed ? (
                <div className="rounded-2xl bg-white/10 border border-white/20 p-5 text-white fade-up">
                  <p className="font-semibold">🎉 You're on the list!</p>
                  <p className="text-sm text-teal-100 mt-1">We'll send the next update to {email}.</p>
                </div>
              ) : (
                <form onSubmit={subscribe} className="flex flex-col sm:flex-row gap-3 flex-wrap">
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                    className="flex-1 rounded-xl px-4 py-3.5 bg-white/95 text-gray-900 placeholder-gray-400 outline-none focus:ring-4 focus:ring-teal-300/40" />
                  <button disabled={sending} className="rounded-xl px-6 py-3.5 bg-white text-teal-800 font-semibold hover:bg-teal-50 transition-colors disabled:opacity-60">{sending ? 'Subscribing…' : 'Subscribe'}</button>
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
