import { FormEvent, useState } from 'react';
import { SitePage, PageHero, SectionHeading, Reveal } from '../../components/site/SiteLayout';
import { contactApi } from '../../services/api';

const sendError = (err: any): string => err?.response?.data?.message || 'Could not send right now. Please try again, or email help@suwale.com.';

// Placeholder stories for the layout. Replace with real, consented stories
// once submissions are collected and approved.
const STORIES = [
  { name: 'Nimali P.', role: 'Patient', city: 'Colombo', tone: 'from-blue-500 to-cyan-500',
    quote: 'My lab results used to take days and a second trip to the hospital. Now they show up on my phone, and my doctor already has them before I call.' },
  { name: 'Dr. Ruwan S.', role: 'General Practitioner', city: 'Kandy', tone: 'from-teal-500 to-emerald-500',
    quote: 'I see patients at my own clinic and at a hospital. Switching dashboards instead of juggling paper files has given me back an hour every day.' },
  { name: 'Sanduni W.', role: 'Pharmacist', city: 'Galle', tone: 'from-purple-500 to-violet-500',
    quote: 'Prescriptions arrive typed and clear. No more guessing handwriting, and I can check stock before the patient even reaches the counter.' },
  { name: 'Kasun D.', role: 'Lab Manager', city: 'Kurunegala', tone: 'from-cyan-500 to-sky-500',
    quote: 'Requests come in digitally and our reports go straight to the doctor who asked. Phone calls asking "is it ready yet?" have almost stopped.' },
  { name: 'Mrs. Fernando', role: 'Caregiver', city: 'Negombo', tone: 'from-rose-400 to-pink-500',
    quote: 'I look after my mother. Having every consultation and prescription in one place makes visiting new specialists so much less stressful.' },
  { name: 'Dr. Aruni J.', role: 'Clinic Owner', city: 'Matara', tone: 'from-amber-400 to-orange-500',
    quote: 'Setting up our clinic took an afternoon. The team got their own accounts and we were booking patients the same week.' },
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

  const input = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10';

  return (
    <SitePage>
      <PageHero
        eyebrow="Real people, real care"
        title="Every story makes"
        highlight="healthcare better."
        subtitle="Has Core Health made a difference to you, your family or your practice? Tell us — your experience helps others and shapes what we build next."
      >
        <a href="#share" className="inline-flex items-center gap-2 bg-white text-teal-800 font-semibold px-7 py-3.5 rounded-xl hover:bg-teal-50 transition-all shadow-lg hover:-translate-y-0.5">
          ✍️ Share your story
        </a>
      </PageHero>

      {/* ── Stories wall ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Community voices" title="Stories from across Sri Lanka" subtitle="Patients, doctors, pharmacists and lab teams on what connected care means to them." />
          <div className="columns-1 md:columns-2 lg:columns-3 gap-6 [&>*]:mb-6">
            {STORIES.map((s, i) => (
              <Reveal key={s.name} delay={(i % 3) * 100} className="break-inside-avoid">
                <figure className="relative rounded-3xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-xl transition-shadow duration-300">
                  <svg className="w-10 h-10 text-teal-100" fill="currentColor" viewBox="0 0 32 32"><path d="M10 8C5.6 8 2 11.6 2 16v8h8v-8H6c0-2.2 1.8-4 4-4V8zm16 0c-4.4 0-8 3.6-8 8v8h8v-8h-4c0-2.2 1.8-4 4-4V8z" /></svg>
                  <blockquote className="mt-3 text-gray-700 leading-relaxed">{s.quote}</blockquote>
                  <div className="mt-2 text-amber-400 text-sm tracking-wider">★★★★★</div>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${s.tone} text-white font-semibold flex items-center justify-center`}>{s.name.replace(/^(Dr|Mrs)\.\s*/, '')[0]}</div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.role} · {s.city}</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form ──────────────────────────────────────────────────── */}
      <section id="share" className="py-20 bg-gradient-to-br from-teal-100 via-emerald-50 to-teal-100 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Your turn</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">Share your experience</h2>
            <p className="text-gray-500 mt-4 leading-relaxed">It only takes a few minutes. Our team reads every story, and with your permission we may feature it on this page.</p>
            <ul className="mt-8 space-y-5">
              {[
                ['🔒', 'Your privacy comes first', 'Never include medical record numbers, diagnoses you would rather keep private, or other people\'s details.'],
                ['🙈', 'Stay anonymous if you like', 'We can publish your story with just your initials.'],
                ['✏️', 'You stay in control', 'We will contact you before publishing anything, and you can withdraw at any time.'],
              ].map(([icon, t, d]) => (
                <li key={t} className="flex gap-4">
                  <div className="w-11 h-11 shrink-0 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-lg">{icon}</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t}</p>
                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-3xl bg-white border border-gray-100 shadow-xl p-7 sm:p-10">
              {sent ? (
                <div className="text-center py-10 fade-up">
                  <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-4xl shadow-lg">💚</div>
                  <h3 className="mt-6 text-2xl font-bold text-gray-900">Thank you{form.name && !anonymous ? `, ${form.name.split(' ')[0]}` : ''}!</h3>
                  <p className="mt-3 text-gray-500 max-w-sm mx-auto">Your story has been received. We'll be in touch at <span className="font-medium text-gray-700">{form.email}</span> before anything is published.</p>
                  <button onClick={() => { setSent(false); setForm({ name: '', email: '', role: '', city: '', title: '', story: '' }); setRating(0); setConsent(false); }}
                    className="mt-8 text-sm font-semibold text-teal-700 hover:text-teal-800">Share another story →</button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Your name</span>
                      <input required value={form.name} onChange={set('name')} className={`${input} mt-1.5`} placeholder="Nimali Perera" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Email</span>
                      <input required type="email" value={form.email} onChange={set('email')} className={`${input} mt-1.5`} placeholder="you@example.com" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">I am a…</span>
                      <select required value={form.role} onChange={set('role')} className={`${input} mt-1.5`}>
                        <option value="" disabled>Select one</option>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">City <span className="text-gray-400 font-normal">(optional)</span></span>
                      <input value={form.city} onChange={set('city')} className={`${input} mt-1.5`} placeholder="Colombo" />
                    </label>
                  </div>

                  <div>
                    <span className="text-sm font-medium text-gray-700">How would you rate your experience?</span>
                    <div className="mt-1.5 flex gap-1" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button type="button" key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                          className={`text-3xl transition-transform hover:scale-110 ${(hover || rating) >= n ? 'text-amber-400' : 'text-gray-200'}`}>★</button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Give your story a title</span>
                    <input required value={form.title} onChange={set('title')} className={`${input} mt-1.5`} placeholder="Getting my results without the second trip" />
                  </label>

                  <label className="block">
                    <span className="flex justify-between text-sm font-medium text-gray-700">
                      Your story <span className={`font-normal ${form.story.length > 1000 ? 'text-rose-500' : 'text-gray-400'}`}>{form.story.length}/1000</span>
                    </span>
                    <textarea required rows={6} maxLength={1000} value={form.story} onChange={set('story')} className={`${input} mt-1.5 resize-none`}
                      placeholder="What happened, and how did Core Health help?" />
                  </label>

                  <div className="space-y-3">
                    <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                      Publish with my initials only
                    </label>
                    <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                      I agree that Core Health may contact me about this story and, with my approval, publish it.
                    </label>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button disabled={sending} className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold py-3.5 shadow-lg shadow-teal-600/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0">
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
