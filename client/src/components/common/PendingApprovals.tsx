import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ShieldCheck, X, Check, Stethoscope, Pill, FlaskConical, Building2, Clock3, AlertTriangle } from 'lucide-react';
import { userApi } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';

// SEC-17 #2 made professional sign-ups inactive until an admin reviews them,
// but nothing ever listed them: a newly registered doctor looked exactly like
// a deactivated account in the user table, so registrations were never found
// and the applicant's "pending admin approval" message never resolved.
//
// Approving is also what sends the email-confirmation link (PRO-11) — it is
// pointless before the account can be used, and its 48-hour window would
// expire while the request sat here.

interface PendingUser {
  id: number;
  name: string;
  email: string;
  role: 'doctor' | 'pharmacist' | 'laboratory' | string;
  created_at: string;
  specialization?: string | null;
  doctor_license?: string | null;
  hospital_affiliation?: string | null;
  pharmacist_license?: string | null;
  pharmacy_name?: string | null;
  lab_license?: string | null;
  lab_name?: string | null;
  organization_id?: number | null;
  organization_name?: string | null;
  org_type?: string | null;
  plan_name?: string | null;
  plan_price_monthly?: number | null;
  plan_currency?: string | null;
  affiliation_certifications?: { id: number; organization_name: string; org_type: string; status: string; responded_at: string | null }[];
}

const ROLE_META: Record<string, { Icon: typeof Stethoscope; label: string; tint: string }> = {
  doctor:     { Icon: Stethoscope,  label: 'Doctor',     tint: 'bg-blue-50 text-blue-700'   },
  pharmacist: { Icon: Pill,         label: 'Pharmacist', tint: 'bg-teal-50 text-teal-700'   },
  laboratory: { Icon: FlaskConical, label: 'Laboratory', tint: 'bg-violet-50 text-violet-700' },
};

// The licence number is the whole point of the review — it is the one claim
// nothing in the system verifies automatically, so it has to be in front of
// the admin at the moment they decide.
const credentials = (u: PendingUser): { label: string; value: string }[] => {
  const out: { label: string; value: string }[] = [];
  if (u.role === 'doctor') {
    if (u.doctor_license) out.push({ label: 'Licence', value: u.doctor_license });
    if (u.specialization) out.push({ label: 'Specialization', value: u.specialization });
    // A workplace that is on Suwela is certified by the organisation itself
    // (shown separately below); only a typed-in one needs the admin to check.
    const certified = (u.affiliation_certifications ?? []).some(c => c.organization_name === u.hospital_affiliation);
    if (u.hospital_affiliation && !certified) out.push({ label: 'Main workplace (not on Suwela — verify)', value: u.hospital_affiliation });
  } else if (u.role === 'pharmacist') {
    if (u.pharmacist_license) out.push({ label: 'Licence', value: u.pharmacist_license });
    if (u.pharmacy_name) out.push({ label: 'Pharmacy', value: u.pharmacy_name });
  } else if (u.role === 'laboratory') {
    if (u.lab_license) out.push({ label: 'Licence', value: u.lab_license });
    if (u.lab_name) out.push({ label: 'Laboratory', value: u.lab_name });
  }
  if (u.organization_name) {
    out.push({ label: 'Registering as owner of', value: `${u.organization_name} (${u.org_type})` });
  }
  // Migration 014: the package they chose. A paid one is the admin's cue to
  // confirm payment before approving.
  if (u.plan_name) {
    out.push({ label: 'Package', value: `${u.plan_name} (${formatPrice(u.plan_price_monthly ?? 0, u.plan_currency ?? 'LKR')}${u.plan_price_monthly ? ' / month' : ''})` });
  }
  return out;
};

export default function PendingApprovals() {
  const qc = useQueryClient();
  const [declining, setDeclining] = useState<PendingUser | null>(null);
  const [reason, setReason] = useState('');

  const { data: pending = [], isLoading } = useQuery<PendingUser[]>({
    queryKey: ['pending-approvals'],
    queryFn: () => userApi.pendingApprovals(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pending-approvals'] });
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  // Approving before every hospital has answered is possible (an
  // organisation that never responds would otherwise block a doctor
  // forever) but has to be a deliberate, confirmed choice.
  const [overriding, setOverriding] = useState<PendingUser | null>(null);

  const approve = useMutation({
    mutationFn: ({ id, override }: { id: number; override?: boolean }) => userApi.approve(id, override),
    onSuccess: (res: { name?: string; verificationEmailSent?: boolean }) => {
      // Say whether the email actually went, because the applicant still
      // cannot log in until they confirm — "approved" alone would imply they
      // are good to go.
      toast.success(
        res?.verificationEmailSent
          ? `${res.name ?? 'Account'} approved — a confirmation email has been sent.`
          : `${res?.name ?? 'Account'} approved.`
      );
      setOverriding(null);
      refresh();
    },
    onError: (e: { message?: string }) => toast.error(e?.message || 'Could not approve the account.'),
  });

  const decline = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => userApi.decline(id, reason),
    onSuccess: () => {
      toast.success('Registration declined.');
      setDeclining(null);
      setReason('');
      refresh();
    },
    onError: (e: { message?: string }) => toast.error(e?.message || 'Could not decline the registration.'),
  });

  // Nothing waiting is the normal state — an empty panel would just be noise
  // on the page.
  if (isLoading || pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-amber-600" />
        <h2 className="font-semibold text-gray-900">
          {pending.length} registration{pending.length === 1 ? '' : 's'} waiting for approval
        </h2>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        These people chose a professional role at sign-up. Nothing verifies a licence
        automatically — check the number below against the register before approving.
        They cannot log in until you do, and approving is what sends their email
        confirmation link.
      </p>

      <div className="space-y-3">
        {pending.map(u => {
          const meta = ROLE_META[u.role] ?? { Icon: Building2, label: u.role, tint: 'bg-gray-100 text-gray-700' };
          const { Icon } = meta;
          return (
            <div key={u.id} className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.tint}`}>
                      <Icon className="w-3 h-3" /> {meta.label}
                    </span>
                    <p className="font-semibold text-gray-900 truncate">{u.name}</p>
                  </div>
                  <p className="text-sm text-gray-500 break-all">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Applied {formatDate(u.created_at)}</p>

                  {credentials(u).length > 0 && (
                    <dl className="mt-2.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {credentials(u).map(c => (
                        <div key={c.label} className="text-xs">
                          <dt className="text-gray-400 inline">{c.label}: </dt>
                          <dd className="text-gray-700 font-medium inline">{c.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {/* Migration 015: each hospital/clinic the doctor named
                      certifies them before the admin decides. */}
                  {(u.affiliation_certifications?.length ?? 0) > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Hospital / clinic certification</p>
                      <div className="flex flex-wrap gap-1.5">
                        {u.affiliation_certifications!.map(c => {
                          const s = c.status === 'accepted'
                            ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Check, text: 'Certified' }
                            : c.status === 'declined'
                              ? { cls: 'bg-red-50 text-red-700 border-red-200', Icon: X, text: 'Not confirmed' }
                              : { cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock3, text: 'Waiting' };
                          return (
                            <span key={c.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${s.cls}`}>
                              <s.Icon className="w-3 h-3" /> {c.organization_name} · {s.text}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                 <div className="flex gap-2">
                  {(() => {
                    const waiting = (u.affiliation_certifications ?? []).filter(c => c.status === 'pending');
                    return (
                      <button
                        type="button"
                        onClick={() => waiting.length ? setOverriding(u) : approve.mutate({ id: u.id })}
                        disabled={approve.isPending}
                        title={waiting.length ? 'Waiting for hospital certification' : undefined}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                          waiting.length
                            ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'bg-teal-600 text-white hover:bg-teal-700'}`}
                      >
                        {waiting.length ? <Clock3 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        {waiting.length ? `Awaiting ${waiting.length} hospital${waiting.length === 1 ? '' : 's'}` : 'Approve'}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => { setDeclining(u); setReason(''); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" /> Decline
                  </button>
                 </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {overriding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">Hospitals haven't responded yet</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{overriding.name}</span> is still waiting for{' '}
              <span className="font-medium">
                {(overriding.affiliation_certifications ?? []).filter(c => c.status === 'pending').map(c => c.organization_name).join(', ')}
              </span>{' '}
              to confirm they work there. The usual order is to wait for them.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Approve anyway only if you have verified the doctor another way. The hospitals can still certify later,
              and this override is recorded in the audit log.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOverriding(null)}
                className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
              >
                Wait for hospitals
              </button>
              <button
                type="button"
                onClick={() => approve.mutate({ id: overriding.id, override: true })}
                disabled={approve.isPending}
                className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                {approve.isPending ? 'Approving...' : 'Approve anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Declining is destructive from the applicant's point of view, so it
          asks rather than firing on one click. The reason is recorded in the
          audit log. */}
      {declining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Decline this registration?</h3>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{declining.name}</span> ({declining.email}) will not be able
              to log in. The record is kept so the decision is auditable, and they can register again.
            </p>
            <label className="label mt-4">Reason (optional, recorded in the audit log)</label>
            <textarea
              className="input"
              rows={3}
              value={reason}
              placeholder="e.g. licence number could not be verified"
              onChange={e => setReason(e.target.value)}
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => decline.mutate({ id: declining.id, reason })}
                disabled={decline.isPending}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {decline.isPending ? 'Declining...' : 'Decline registration'}
              </button>
              <button
                type="button"
                onClick={() => setDeclining(null)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
