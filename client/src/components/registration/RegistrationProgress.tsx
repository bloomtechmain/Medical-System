import { Check, Clock3, X, Building2, ShieldCheck, FileCheck2 } from 'lucide-react';

// The three stages a professional registration goes through (migration 015):
//   1. submitted,
//   2. each hospital/clinic the doctor named certifies (or rejects) them,
//   3. the Suwela admin approves the account.
// Shown right after registering and whenever a waiting applicant tries to
// sign in, so "pending" always says *what* it is waiting for.

export interface Certification {
  organization_name: string;
  status: 'pending' | 'accepted' | 'declined' | string;
}

const certMeta = (status: string) =>
  status === 'accepted'
    ? { label: 'Certified', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Check }
    : status === 'declined'
      ? { label: 'Not confirmed', cls: 'bg-red-50 text-red-700 border-red-200', Icon: X }
      : { label: 'Waiting', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock3 };

function Step({ state, icon: Icon, title, children, last }: {
  state: 'done' | 'current' | 'upcoming';
  icon: typeof Check;
  title: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const dot = state === 'done'
    ? 'bg-emerald-500 text-white'
    : state === 'current'
      ? 'bg-blue-600 text-white ring-4 ring-blue-100'
      : 'bg-gray-100 text-gray-400';
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className={`absolute left-4 top-9 bottom-0 w-0.5 ${state === 'done' ? 'bg-emerald-300' : 'bg-gray-200'}`} aria-hidden />}
      <span className={`relative z-10 w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${dot}`}>
        {state === 'done' ? <Check className="w-4 h-4" strokeWidth={3} /> : <Icon className="w-4 h-4" />}
      </span>
      <div className="min-w-0 pt-1">
        <p className={`text-sm font-semibold ${state === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>{title}</p>
        {children && <div className="mt-1.5">{children}</div>}
      </div>
    </li>
  );
}

export default function RegistrationProgress({ certifications, unlistedAffiliation }: {
  certifications: Certification[];
  /** A workplace typed by hand because it isn't on Suwela — verified by the admin instead. */
  unlistedAffiliation?: string | null;
}) {
  const waiting = certifications.some(c => c.status === 'pending');
  const hasHospitalStep = certifications.length > 0 || !!unlistedAffiliation;

  return (
    <ol className="text-left" aria-label="Registration progress">
      <Step state="done" icon={FileCheck2} title="Registration submitted" />
      {hasHospitalStep && (
        <Step state={waiting ? 'current' : 'done'} icon={Building2} title="Hospital / clinic certification">
          <ul className="space-y-1.5">
            {certifications.map(c => {
              const m = certMeta(c.status);
              return (
                <li key={c.organization_name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-700 truncate">{c.organization_name}</span>
                  <span className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 font-medium ${m.cls}`}>
                    <m.Icon className="w-3 h-3" /> {m.label}
                  </span>
                </li>
              );
            })}
            {unlistedAffiliation && (
              <li className="text-xs text-gray-500">
                {unlistedAffiliation} isn't on Suwela yet, so the admin will check it with you directly.
              </li>
            )}
          </ul>
          {waiting && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              Each one has been notified and confirms from their dashboard.
            </p>
          )}
        </Step>
      )}
      <Step state={waiting ? 'upcoming' : 'current'} icon={ShieldCheck} title="Approval by the Suwela team" last>
        <p className="text-xs text-gray-500 leading-relaxed">
          {waiting
            ? 'Starts once your hospitals have responded.'
            : 'We check your licence number against the register. You will be emailed as soon as it is approved.'}
        </p>
      </Step>
    </ol>
  );
}
