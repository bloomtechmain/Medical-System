import { FormEvent, useState } from 'react';
import { ArrowRight, EyeOff, HeartHandshake, Lock, PenLine, Quote, Star, UserPen, type LucideIcon } from 'lucide-react';
import { SitePage, PageHero, SectionHeading, Reveal } from '../../components/site/SiteLayout';
import { SiteCard, IconChip } from '../../components/site/Cards';
import { TONES, type Tone } from '../../components/site/tones';
import { Leaf } from '../../components/landing/Shapes';
import { contactApi } from '../../services/api';

const sendError = (err: any): string => err?.response?.data?.message || 'Could not send right now. Please try again, or email help@suwale.com.';

const GRADIENT_BTN = { backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' };

// Placeholder stories for the layout. Replace with real, consented stories
// once submissions are collected and approved.
const STORIES: { name: string; role: string; city: string; tone: Tone; quote: string }[] = [
  { name: 'Nimali P.', role: 'Patient', city: 'Colombo', tone: 'green',
    quote: 'My lab results used to take days and a second trip to the hospital. Now they show up on my phone, and my doctor already has them before I call.' },
  { name: 'Dr. Ruwan S.', role: 'General Practitioner', city: 'Kandy', tone: 'blue',
    quote: 'I see patients at my own clinic and at a hospital. Switching dashboards instead of juggling paper files has given me back an hour every day.' },
  { name: 'Sanduni W.', role: 'Pharmacist', city: 'Galle', tone: 'purple',
    quote: 'Prescriptions arrive typed and clear. No more guessing handwriting, and I can check stock before the patient even reaches the counter.' },
  { name: 'Kasun D.', role: 'Lab Manager', city: 'Kurunegala', tone: 'deep',
    quote: 'Requests come in digitally and our reports go straight to the doctor who asked. Phone calls asking "is it ready yet?" have almost stopped.' },
  { name: 'Mrs. Fernando', role: 'Caregiver', city: 'Negombo', tone: 'orange',
    quote: 'I look after my mother. Having every consultation and prescription in one place makes visiting new specialists so much less stressful.' },
  { name: 'Dr. Aruni J.', role: 'Clinic Owner', city: 'Matara', tone: 'green',
    quote: 'Setting up our clinic took an afternoon. The team got their own accounts and we were booking patients the same week.' },
];

const TIPS: { icon: LucideIcon; tone: Tone; title: string; desc: string }[] = [
  { icon: Lock,    tone: 'green',  title: 'Your privacy comes first',   desc: 'Never include medical record numbers, diagnoses you would rather keep private, or other people\'s details.' },
  { icon: EyeOff,  tone: 'purple', title: 'Stay anonymous if you like', desc: 'We can publish your story with just your initials.' },
  { icon: UserPen, tone: 'blue',   title: 'You stay in control',        desc: 'We will contact you before publishing anything, and you can withdraw at any time.' },
];

const ROLES = ['Patient', 'Caregiver / family member', 'Doctor', 'Pharmacist', 'Laboratory staff', 'Hospital / clinic staff', 'Other'];

export default function ShareStory() {
  const [form, setForm] = useState({ name: '', email: '', role: '', city: '', title: '', story: '' });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [consent, setConsent] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await contactApi.story({ ...form, rating, anonymous, consent });
      setSent(true);
    } catch (err) {
      setError(sendError(err));
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-2xl border border-suwela-line bg-suwela-paper px-4 py-3 text-sm text-suwela-ink placeholder-suwela-slate/60 outline-none transition focus:bg-white focus:border-suwela-green focus:ring-4 focus:ring-suwela-mint/20';
  const label = 'text-sm font-semibold text-suwela-navy';

  return (
    <SitePage>
      <PageHero
        eyebrow="Real people, real care"
        title="Every story makes"
        highlight="healthcare better."
        subtitle="Has Suwela made a difference to you, your family or your practice? Tell us — your experience helps others and shapes what we build next."
      >
        <a href="#share" className="inline-flex items-center gap-2 rounded-full text-white text-lg font-semibold px-7 py-4 shadow-[0_16px_30px_-12px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform" style={GRADIENT_BTN}>
          <PenLine className="w-5 h-5" /> Share your story
        </a>
      </PageHero>

      {/* ── Stories wall ──────────────────────────────────────────── */}
      <section className="pt-8 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Community voices" title="Stories from across Sri Lanka" subtitle="Patients, doctors, pharmacists and lab teams on what connected care means to them." />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {STORIES.map((s, i) => {
              const t = TONES[s.tone];
              return (
                <Reveal key={s.name} delay={(i % 3) * 100} className="h-full">
                  <SiteCard tone={s.tone}>
                    <figure className="relative flex flex-col h-full">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
                            style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})`, boxShadow: `0 12px 24px -12px ${t.to}` }}>
                        <Quote className="w-5 h-5" fill="currentColor" />
                      </span>
                      <blockquote className="mt-5 font-display text-xl leading-snug text-suwela-navy">{s.quote}</blockquote>
                      <div className="mt-4 mb-5 flex gap-0.5 text-amber-400">
                        {[0, 1, 2, 3, 4].map(n => <Star key={n} className="w-4 h-4" fill="currentColor" />)}
                      </div>
                      <figcaption className="mt-auto pt-5 border-t border-suwela-line flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full text-white font-bold flex items-center justify-center"
                             style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
                          {s.name.replace(/^(Dr|Mrs)\.\s*/, '')[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-suwela-ink text-sm">{s.name}</p>
                          <p className="text-xs text-suwela-slate">{s.role} · {s.city}</p>
                        </div>
                      </figcaption>
                    </figure>
                  </SiteCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Form ──────────────────────────────────────────────────── */}
      <section id="share" className="relative overflow-hidden py-20 lg:py-24 bg-gradient-to-b from-[#EAF6FF] to-[#EDFBF4] rounded-t-[56px] scroll-mt-24">
        <Leaf from="#43CE9F" to="#13A58F" className="absolute -left-16 top-24 w-64 h-64 opacity-10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2">
            <SectionHeading eyebrow="Your turn" title="Share your experience" center={false} />
            <p className="-mt-6 text-lg text-suwela-slate leading-relaxed">It only takes a few minutes. Our team reads every story, and with your permission we may feature it on this page.</p>
            <ul className="mt-8 space-y-4">
              {TIPS.map(tip => (
                <li key={tip.title} className="group flex gap-4 rounded-[24px] bg-white/80 p-4 shadow-sm hover:shadow-md transition-shadow">
                  <IconChip icon={tip.icon} tone={tip.tone} size="sm" className="transition-transform group-hover:-rotate-6" />
                  <div>
                    <p className="font-semibold text-suwela-ink text-sm">{tip.title}</p>
                    <p className="text-sm text-suwela-slate mt-0.5 leading-relaxed">{tip.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-[36px] bg-white shadow-[0_40px_80px_-40px_rgba(14,44,82,0.45)] p-7 sm:p-10">
              {sent ? (
                <div className="text-center py-10 fade-up">
                  <div className="relative w-24 h-24 mx-auto">
                    <span className="absolute inset-0 rounded-full bg-suwela-mint/30 sw-ring" />
                    <span className="relative w-24 h-24 rounded-full flex items-center justify-center text-white shadow-xl" style={{ backgroundImage: 'linear-gradient(135deg, #5EDDB0, #13A58F)' }}>
                      <HeartHandshake className="w-11 h-11" />
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-3xl text-suwela-navy">Thank you{form.name && !anonymous ? `, ${form.name.split(' ')[0]}` : ''}!</h3>
                  <p className="mt-3 text-suwela-slate max-w-sm mx-auto">Your story has been received. We'll be in touch at <span className="font-semibold text-suwela-ink">{form.email}</span> before anything is published.</p>
                  <button onClick={() => { setSent(false); setForm({ name: '', email: '', role: '', city: '', title: '', story: '' }); setRating(0); setConsent(false); }}
                          className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-suwela-green">
                    Share another story <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <label className="block">
                      <span className={label}>Your name</span>
                      <input required value={form.name} onChange={set('name')} className={`${input} mt-1.5`} placeholder="Nimali Perera" />
                    </label>
                    <label className="block">
                      <span className={label}>Email</span>
                      <input required type="email" value={form.email} onChange={set('email')} className={`${input} mt-1.5`} placeholder="you@example.com" />
                    </label>
                    <label className="block">
                      <span className={label}>I am a…</span>
                      <select required value={form.role} onChange={set('role')} className={`${input} mt-1.5`}>
                        <option value="" disabled>Select one</option>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={label}>City <span className="text-suwela-slate font-normal">(optional)</span></span>
                      <input value={form.city} onChange={set('city')} className={`${input} mt-1.5`} placeholder="Colombo" />
                    </label>
                  </div>

                  <div>
                    <span className={label}>How would you rate your experience?</span>
                    <div className="mt-1.5 flex gap-1" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button type="button" key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                                className={`transition-transform hover:scale-110 ${(hover || rating) >= n ? 'text-amber-400' : 'text-suwela-line'}`}>
                          <Star className="w-8 h-8" fill="currentColor" strokeWidth={1} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className={label}>Give your story a title</span>
                    <input required value={form.title} onChange={set('title')} className={`${input} mt-1.5`} placeholder="Getting my results without the second trip" />
                  </label>

                  <label className="block">
                    <span className={`flex justify-between ${label}`}>
                      Your story <span className={`font-normal ${form.story.length > 1000 ? 'text-rose-500' : 'text-suwela-slate'}`}>{form.story.length}/1000</span>
                    </span>
                    <textarea required rows={6} maxLength={1000} value={form.story} onChange={set('story')} className={`${input} mt-1.5 resize-none`}
                              placeholder="What happened, and how did Suwela help?" />
                  </label>

                  <div className="space-y-3">
                    <label className="flex items-start gap-3 text-sm text-suwela-slate cursor-pointer">
                      <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-suwela-line accent-[#13A58F]" />
                      Publish with my initials only
                    </label>
                    <label className="flex items-start gap-3 text-sm text-suwela-slate cursor-pointer">
                      <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-suwela-line accent-[#13A58F]" />
                      I agree that Suwela may contact me about this story and, with my approval, publish it.
                    </label>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button disabled={sending}
                          className="w-full rounded-full text-white text-lg font-semibold py-4 shadow-[0_16px_30px_-12px_rgba(19,165,143,0.8)] hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:hover:translate-y-0"
                          style={GRADIENT_BTN}>
                    {sending ? 'Sending…' : 'Submit my story'}
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
