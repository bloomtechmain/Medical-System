import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { orgApi } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import OperatingHoursPicker from '../components/common/OperatingHoursPicker';
import MultiSelectWithCustom from '../components/common/MultiSelectWithCustom';
import { LEGAL_VERSION } from '../legal';
import PlanPicker from '../components/plans/PlanPicker';
import { Plan, PlanAudience } from '../types';
import EmailCodeForm from '../components/auth/EmailCodeForm';
import AuthShell from '../components/landing/AuthShell';
import { Leaf, Cross } from '../components/landing/Shapes';
import {
  Hospital, Stethoscope, Pill, FlaskConical, ArrowLeft, ArrowRight, Check, Building2,
  IdCard, Sparkles, UserRound, Search, ShieldCheck, Eye, EyeOff, Clock, Loader2, Mail, type LucideIcon,
} from 'lucide-react';

interface OwnerCandidate {
  id: number;
  name: string;
  email: string;
  [key: string]: unknown;
}

// `Icon`, `hex` and `tint` are presentation only (Suwela role palette).
const ORG_TYPES: {
  id: string; Icon: LucideIcon; hex: string; tint: string;
  label: string; desc: string; ownerRole: string; badgeText: string;
}[] = [
  {
    id: 'hospital',
    Icon: Hospital,
    hex: '#EF7B2D',
    tint: '#FFB36B',
    label: 'Hospital',
    desc: 'Full-service hospital with inpatient, outpatient, and emergency departments.',
    ownerRole: 'Doctor / Director',
    badgeText: 'Doctor owner',
  },
  {
    id: 'clinic',
    Icon: Stethoscope,
    hex: '#13A58F',
    tint: '#5EDDB0',
    label: 'Clinic',
    desc: 'Doctor-owned private clinic or multi-specialty outpatient centre.',
    ownerRole: 'Doctor / Owner',
    badgeText: 'Doctor owner',
  },
  {
    id: 'pharmacy',
    Icon: Pill,
    hex: '#6A4DB6',
    tint: '#A68BF0',
    label: 'Pharmacy',
    desc: 'Retail or hospital pharmacy managing inventory, prescriptions, and dispensing.',
    ownerRole: 'Pharmacist / Owner',
    badgeText: 'Pharmacist owner',
  },
  {
    id: 'laboratory',
    Icon: FlaskConical,
    hex: '#0279D1',
    tint: '#38B6F5',
    label: 'Laboratory',
    desc: 'Diagnostic laboratory offering pathology, radiology, and clinical testing.',
    ownerRole: 'Lab Director',
    badgeText: 'Lab owner',
  },
];

// ── Presentation helpers (no logic) ─────────────────────────────────────────
const CARD = 'relative overflow-hidden bg-white rounded-[28px] p-6 sm:p-7 shadow-[0_24px_50px_-30px_rgba(14,44,82,0.45)] border border-suwela-line/70';
const PRIMARY_BTN = 'w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-14px_rgba(19,165,143,0.8)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed';
const PRIMARY_BG = { backgroundColor: '#13A58F', backgroundImage: 'linear-gradient(120deg, #13A58F, #07947E)' };

function SectionCard({ icon: Icon, title, hint, hex = '#13A58F', tint = '#5EDDB0', children }: {
  icon: LucideIcon; title: string; hint?: string; hex?: string; tint?: string; children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <Leaf from={tint} to={hex} className="absolute -right-12 -top-12 w-40 h-40 opacity-[0.08] pointer-events-none" />
      <div className="relative flex items-start gap-3 mb-5">
        <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-white"
              style={{ backgroundColor: hex, backgroundImage: `linear-gradient(135deg, ${tint}, ${hex})` }}>
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-semibold text-lg text-suwela-navy leading-tight">{title}</h3>
          {hint && <p className="text-sm text-suwela-slate mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

const Req = () => <span className="text-red-400">*</span>;
const FieldError = ({ msg }: { msg?: unknown }) =>
  msg ? <p className="text-xs text-red-500 mt-1">{msg as string}</p> : null;

const SPECIALIZATIONS = [
  'General Practice','Cardiology','Dermatology','Endocrinology',
  'Gastroenterology','Neurology','Oncology','Orthopedics',
  'Pediatrics','Psychiatry','Pulmonology','Radiology','Surgery',
  'Urology','Gynecology','Ophthalmology','Emergency Medicine',
];

const PHARMA_SPECS = [
  'Clinical Pharmacy','Hospital Pharmacy','Retail Pharmacy',
  'Compounding Pharmacy','Oncology Pharmacy','Community Pharmacy',
];

const LAB_TYPES = [
  'Clinical Laboratory','Diagnostic Laboratory','Pathology Laboratory',
  'Radiology Center','Microbiology Laboratory','Biochemistry Laboratory',
  'Molecular Diagnostics','Immunology Laboratory','Genetic Testing',
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    // The server takes 3-60 characters that start and end with a letter or
    // number: "City Pharmacy -" used to give "city-pharmacy-", refused.
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

// Same rule as the server (server.ts registerOrgValidators).
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

// The server answers a refused field with { errors: [{ path, msg }] } and no
// message, which used to show only "Registration failed. Please try again."
const registrationError = (err: any): string => {
  if (err?.message) return err.message;
  const first = Array.isArray(err?.errors) ? err.errors[0] : null;
  if (first?.path === 'slug') return 'The URL slug must be 3-60 lowercase letters, numbers or hyphens, starting and ending with a letter or number.';
  if (first?.path === 'owner_email') return 'Please enter a valid email address for the owner.';
  if (first?.path === 'owner_password') return 'The password must be 10-128 characters.';
  if (first?.msg && first.msg !== 'Invalid value') return first.msg;
  return 'Registration failed. Please check the details and try again.';
};

const STEP3_FIELDS: Record<string, string[]> = {
  hospital:   ['phone', 'license_number'],
  clinic:     ['phone', 'license_number'],
  pharmacy:   ['phone', 'license_number', 'pharmacy_name'],
  laboratory: ['phone', 'license_number', 'lab_name', 'address'],
};

const STEP3_TITLE: Record<string, string> = {
  hospital: 'Doctor / Director Profile',
  clinic: 'Doctor / Director Profile',
  pharmacy: 'Pharmacy Details',
  laboratory: 'Laboratory Details',
};

const STEP_LABELS = ['Organization Type', 'Package', 'Organization Details', 'Role Details', 'Owner Account'];

type Step = 1 | 2 | 3 | 4 | 5;

export default function OrgRegister() {
  const [step, setStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Migration 017: a new owner account confirms its email with a 6-digit code
  // before the registration counts as submitted.
  const [verifying, setVerifying] = useState<{ email: string; codeSent: boolean } | null>(null);
  const [orgSpecializations, setOrgSpecializations] = useState<string[]>([]);
  const [showPwd, setShowPwd] = useState(false);
  // Migration 014: the package this organisation signs up for.
  const [plan, setPlan] = useState<Plan | null>(null);
  const choosePlan = useCallback((p: Plan) => setPlan(p), []);

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors } } = useForm();
  const password = watch('owner_password');
  const orgName = watch('org_name', '');
  const operatingHours = watch('operating_hours', '');

  const goNext = async (fields: string[]) => {
    const ok = await trigger(fields);
    if (ok) setStep(s => (s + 1) as Step);
  };

  // Owner search — lets the form reuse an existing, already-approved user as
  // the new org's owner instead of always creating a fresh login.
  const [ownerUser, setOwnerUser] = useState<OwnerCandidate | null>(null);
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerResults, setOwnerResults] = useState<OwnerCandidate[]>([]);
  const [ownerSearching, setOwnerSearching] = useState(false);
  const [showOwnerResults, setShowOwnerResults] = useState(false);
  const debouncedOwnerQuery = useDebounce(ownerQuery, 350);

  useEffect(() => {
    setOwnerUser(null);
    setOwnerQuery('');
    setOwnerResults([]);
  }, [selectedType]);

  useEffect(() => {
    if (!selectedType || debouncedOwnerQuery.trim().length < 2) {
      setOwnerResults([]);
      return;
    }
    let cancelled = false;
    setOwnerSearching(true);
    orgApi.searchOwner(selectedType, debouncedOwnerQuery.trim())
      .then((rows: OwnerCandidate[]) => { if (!cancelled) setOwnerResults(rows); })
      .catch(() => { if (!cancelled) setOwnerResults([]); })
      .finally(() => { if (!cancelled) setOwnerSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedOwnerQuery, selectedType]);

  const selectOwner = (u: OwnerCandidate) => {
    setOwnerUser(u);
    setOwnerQuery('');
    setOwnerResults([]);
    setShowOwnerResults(false);
  };

  const clearOwner = () => setOwnerUser(null);

  const onOrgNameBlur = () => {
    const slug = slugify(orgName);
    if (slug) setValue('slug', slug);
  };

  const onSubmit = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      const profile: Record<string, any> = {};
      const profileFields = [
        'phone','license_number','medical_school',
        'years_experience','hospital_affiliation','consultation_fee','bio',
        'pharmacy_name','pharmacy_address','specialization_area',
        'lab_name','lab_type','accreditation','address','services_offered',
        'operating_hours','website',
      ];
      profileFields.forEach(k => {
        if (data[k] !== undefined && data[k] !== '') profile[k] = data[k];
      });

      const res = await orgApi.register({
        org_name:       data.org_name,
        slug:           data.slug,
        org_type:       selectedType,
        owner_user_id:  ownerUser?.id,
        owner_name:     ownerUser ? undefined : data.owner_name,
        owner_email:    ownerUser ? undefined : data.owner_email,
        owner_password: ownerUser ? undefined : data.owner_password,
        profile: Object.keys(profile).length ? profile : undefined,
        specializations: orgSpecializations.length ? orgSpecializations : undefined,
        accepted_terms_version: LEGAL_VERSION,
        plan_id:        plan?.id,
      }) as { emailVerificationRequired?: boolean; email?: string; codeSent?: boolean };

      if (res?.emailVerificationRequired && res.email) {
        setVerifying({ email: res.email, codeSent: res.codeSent !== false });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setDone(true);
    } catch (err: any) {
      toast.error(registrationError(err));
    } finally {
      setLoading(false);
    }
  };

  const selectedTypeInfo = ORG_TYPES.find(t => t.id === selectedType);
  const accentHex = selectedTypeInfo?.hex ?? '#13A58F';
  const accentTint = selectedTypeInfo?.tint ?? '#5EDDB0';

  const shellTitle = <>Bring your <em className="text-suwela-mint">organisation</em> onto Suwela.</>;
  const shellText = 'Register your hospital, clinic, pharmacy or laboratory and connect with doctors and patients across the Suwela network.';

  if (verifying) {
    return (
      <AuthShell title={shellTitle} text={shellText}>
        <div className={`${CARD} w-full max-w-md p-8 sm:p-10 sw-rise`}>
          <EmailCodeForm email={verifying.email} initialCodeSent={verifying.codeSent}
                         onVerified={() => { setVerifying(null); setDone(true); }} />
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={shellTitle} text={shellText}>
        <div className={`${CARD} w-full max-w-md p-8 sm:p-10 text-center sw-rise`}>
          <Cross from="#5EDDB0" to="#13A58F" className="absolute -right-10 -top-10 w-40 h-40 opacity-10 pointer-events-none" />
          <div className="relative w-20 h-20 rounded-[26px] flex items-center justify-center mx-auto mb-6 text-white"
               style={{ ...PRIMARY_BG, boxShadow: '0 16px 30px -14px #13A58F' }}>
            <Check className="w-10 h-10" strokeWidth={2.5} />
          </div>
          <h2 className="relative font-display text-3xl text-suwela-navy mb-3">Registration Submitted!</h2>
          <p className="relative text-suwela-slate mb-6 leading-relaxed">
            Your organization has been registered and is currently <span className="font-semibold text-suwela-navy">pending admin review</span>.
            You'll be able to sign in once your organization is approved.
          </p>
          <div className="relative bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-left flex items-start gap-3">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600"><Clock className="w-5 h-5" /></span>
            <div>
              <p className="text-sm font-semibold text-amber-800">What happens next?</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">An administrator will review your registration. Once approved, you can sign in with the credentials you provided.</p>
            </div>
          </div>
          <div className="relative flex flex-col gap-3">
            <Link to="/login" className={PRIMARY_BTN} style={PRIMARY_BG}>
              Go to Sign In <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/" className="text-sm font-medium text-suwela-slate hover:text-suwela-navy">
              Back to Home
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  const TypeBadge = () => selectedTypeInfo ? (
    <span className="inline-flex items-center gap-2 text-xs pl-1 pr-3 py-1 rounded-full font-semibold text-white"
          style={{ backgroundColor: selectedTypeInfo.hex }}>
      <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center"><selectedTypeInfo.Icon className="w-3.5 h-3.5" /></span>
      {selectedTypeInfo.label}
    </span>
  ) : null;

  const BackButton = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-suwela-slate hover:text-suwela-navy transition-colors">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );

  return (
    <AuthShell title={shellTitle} text={shellText}>
      <div className={`w-full ${step === 2 ? 'max-w-4xl' : 'max-w-2xl'} pb-10`}>
        <div className="flex justify-end text-sm mb-6">
          <span className="text-suwela-slate">Already registered?</span>
          <Link to="/login" className="ml-1.5 font-semibold text-suwela-green hover:text-suwela-forest">Sign In</Link>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl sm:text-5xl text-suwela-navy leading-tight">Register Your Organization</h1>
          <p className="text-suwela-slate mt-3">Join the Suwela network as a verified healthcare organization</p>

          {/* Step indicator */}
          <div className="flex items-start justify-center mt-7">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className="flex items-start">
                <div className="flex flex-col items-center w-14 sm:w-20">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    step >= s ? 'text-white' : 'bg-white text-suwela-slate shadow-sm border border-suwela-line'
                  } ${step === s ? 'ring-4 ring-suwela-mint/30' : ''}`}
                       style={step >= s ? { backgroundColor: accentHex, backgroundImage: `linear-gradient(135deg, ${accentTint}, ${accentHex})` } : undefined}>
                    {step > s ? <Check className="w-4 h-4" strokeWidth={3} /> : s}
                  </div>
                  <span className={`hidden sm:block mt-2 text-[11px] leading-tight font-semibold ${step >= s ? 'text-suwela-navy' : 'text-suwela-slate/70'}`}>
                    {s === 4 ? (STEP3_TITLE[selectedType] || STEP_LABELS[3]) : STEP_LABELS[s - 1]}
                  </span>
                </div>
                {s < 5 && <div className="w-4 sm:w-6 h-1 rounded-full mt-4 transition-colors" style={{ backgroundColor: step > s ? accentHex : '#E2E7E3' }} />}
              </div>
            ))}
          </div>
          <p className="sm:hidden text-xs font-semibold text-suwela-slate mt-3">
            {`Step ${step} — ${step === 4 ? (STEP3_TITLE[selectedType] || STEP_LABELS[3]) : STEP_LABELS[step - 1]}`}
          </p>
        </div>

        {/* Step 1: Type selection */}
        {step === 1 && (
          <div className="sw-rise">
            <h2 className="text-xl font-semibold text-suwela-navy text-center">What type of organization are you registering?</h2>
            <p className="text-sm text-suwela-slate text-center mt-1 mb-6">Select the type that best describes your organization.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {ORG_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setSelectedType(t.id); setOrgSpecializations([]); setPlan(null); setStep(2); }}
                  className="group relative overflow-hidden text-left p-6 rounded-[28px] bg-white border border-suwela-line/70 transition-all duration-300 hover:-translate-y-1.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 shadow-[0_24px_50px_-30px_rgba(14,44,82,0.45)]"
                >
                  <Leaf from={t.tint} to={t.hex} className="absolute -right-10 -top-10 w-36 h-36 opacity-15 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
                  <ArrowRight className="absolute top-6 right-6 w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" style={{ color: t.hex }} />
                  <span className="relative flex w-16 h-16 rounded-[22px] items-center justify-center text-white mb-4 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
                        style={{ backgroundColor: t.hex, backgroundImage: `linear-gradient(135deg, ${t.tint}, ${t.hex})`, boxShadow: `0 14px 26px -14px ${t.hex}` }}>
                    <t.Icon className="w-8 h-8" strokeWidth={1.8} />
                  </span>
                  <p className="relative font-display text-2xl text-suwela-navy">{t.label}</p>
                  <span className="relative inline-block text-xs px-2.5 py-1 rounded-full font-semibold mt-2 mb-2.5"
                        style={{ backgroundColor: `${t.hex}18`, color: t.hex }}>{t.badgeText}</span>
                  <p className="relative text-sm text-suwela-slate leading-relaxed">{t.desc}</p>
                </button>
              ))}
            </div>

            <p className="text-center text-sm text-suwela-slate mt-8">
              Not an organization?{' '}
              <Link to="/register" className="font-semibold text-suwela-green hover:text-suwela-forest">Register as an individual</Link>
            </p>
          </div>
        )}

        {/* Step 2: Package — migration 014. Every organisation type is sold as a
            package; the free one is preselected. */}
        {step === 2 && selectedType && (
          <div className={`${CARD} space-y-6 sw-rise`}>
            <div className="flex items-center justify-between">
              <BackButton onClick={() => setStep(1)} />
              <TypeBadge />
            </div>
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-white"
                    style={{ backgroundColor: accentHex, backgroundImage: `linear-gradient(135deg, ${accentTint}, ${accentHex})` }}>
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-suwela-navy">Choose a package for your {selectedTypeInfo?.label.toLowerCase()}</h2>
                <p className="text-sm text-suwela-slate mt-1 leading-relaxed">
                  Start free, or pick a package with more features. Paid packages are activated by an administrator when your registration is approved, and you can change package later.
                </p>
              </div>
            </div>
            <PlanPicker audience={selectedType as PlanAudience} value={plan?.id ?? null} onChange={choosePlan} />
            <button
              type="button"
              disabled={!plan}
              onClick={() => setStep(3)}
              className={PRIMARY_BTN}
              style={PRIMARY_BG}
            >
              {plan ? `Continue with ${plan.name}` : 'Continue'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Steps 3-5: Full form, one step shown at a time */}
        {step >= 3 && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 sw-rise">
            {/* Back + type badge */}
            <div className="flex items-center justify-between mb-1">
              <BackButton onClick={() => setStep(s => (s - 1) as Step)} />
              <TypeBadge />
            </div>

            {/* Step 2: Organization details */}
            {step === 3 && (
            <SectionCard icon={Building2} title="Organization Details" hint="How your organization appears across Suwela." hex={accentHex} tint={accentTint}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Organization Name <Req /></label>
                  <input
                    className="input"
                    placeholder="e.g., Nawaloka Hospital, City Pharmacy Colombo"
                    {...register('org_name', { required: 'Organization name is required' })}
                    onBlur={onOrgNameBlur}
                  />
                  <FieldError msg={errors.org_name?.message} />
                </div>

                <div className="sm:col-span-2">
                  <label className="label">
                    URL Slug <Req />
                    <span className="text-suwela-slate/70 font-normal ml-1">(unique identifier, lowercase letters & hyphens only)</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3.5 border border-r-0 border-gray-300 rounded-l-xl bg-suwela-paper text-xs font-medium text-suwela-slate shrink-0">suwela.com/</span>
                    <input
                      className="input rounded-l-none"
                      placeholder="nawaloka-hospital"
                      {...register('slug', {
                        required: 'Slug is required',
                        pattern: { value: SLUG_PATTERN, message: '3-60 lowercase letters, numbers or hyphens, starting and ending with a letter or number' },
                      })}
                    />
                  </div>
                  <FieldError msg={errors.slug?.message} />
                </div>
              </div>
            </SectionCard>
            )}

            {step === 3 && (
              <button type="button" onClick={() => goNext(['org_name', 'slug'])} className={PRIMARY_BTN} style={PRIMARY_BG}>
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Step 3: Role-specific profile fields */}
            {step === 4 && (
            <>
            {(selectedType === 'hospital' || selectedType === 'clinic') && (
              <SectionCard icon={IdCard} title="Doctor / Director Profile" hex={accentHex} tint={accentTint}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Phone <Req /></label>
                    <input className="input" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    <FieldError msg={errors.phone?.message} />
                  </div>
                  <div>
                    <label className="label">Medical License No. <Req /></label>
                    <input className="input" placeholder="SLMC-12345" {...register('license_number', { required: 'Required' })} />
                    <FieldError msg={errors.license_number?.message} />
                  </div>
                  <div>
                    <label className="label">Years of Experience</label>
                    <input type="number" min="0" max="60" className="input" placeholder="e.g., 15" {...register('years_experience')} />
                  </div>
                </div>
              </SectionCard>
            )}

            {(selectedType === 'hospital' || selectedType === 'clinic') && (
              <SectionCard icon={Sparkles} title="Organization Specializations" hint="What medical specialties does your organization offer? Select any that apply, or add your own." hex={accentHex} tint={accentTint}>
                <MultiSelectWithCustom
                  options={SPECIALIZATIONS}
                  selected={orgSpecializations}
                  onChange={setOrgSpecializations}
                  customPlaceholder="e.g., Sports Medicine"
                />
              </SectionCard>
            )}

            {selectedType === 'pharmacy' && (
              <SectionCard icon={Pill} title="Pharmacy Details" hex={accentHex} tint={accentTint}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Phone <Req /></label>
                    <input className="input" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    <FieldError msg={errors.phone?.message} />
                  </div>
                  <div>
                    <label className="label">Pharmacy License No. <Req /></label>
                    <input className="input" placeholder="NMRA-PH-12345" {...register('license_number', { required: 'Required' })} />
                    <FieldError msg={errors.license_number?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Pharmacy Name <Req /></label>
                    <input className="input" placeholder="City Pharmacy, Colombo 03" {...register('pharmacy_name', { required: 'Required' })} />
                    <FieldError msg={errors.pharmacy_name?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Pharmacy Address</label>
                    <input className="input" placeholder="Full address" {...register('pharmacy_address')} />
                  </div>
                  <div>
                    <label className="label">Specialization</label>
                    <select className="input" {...register('specialization_area')}>
                      <option value="">Select...</option>
                      {PHARMA_SPECS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </SectionCard>
            )}

            {selectedType === 'pharmacy' && (
              <SectionCard icon={Sparkles} title="Organization Specializations" hint="What pharmacy services does your organization offer? Select any that apply, or add your own." hex={accentHex} tint={accentTint}>
                <MultiSelectWithCustom
                  options={PHARMA_SPECS}
                  selected={orgSpecializations}
                  onChange={setOrgSpecializations}
                  customPlaceholder="e.g., Veterinary Pharmacy"
                />
              </SectionCard>
            )}

            {selectedType === 'laboratory' && (
              <SectionCard icon={FlaskConical} title="Laboratory Details" hex={accentHex} tint={accentTint}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label">Laboratory Name <Req /></label>
                    <input className="input" placeholder="City Diagnostics" {...register('lab_name', { required: 'Required' })} />
                    <FieldError msg={errors.lab_name?.message} />
                  </div>
                  <div>
                    <label className="label">Phone <Req /></label>
                    <input className="input" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    <FieldError msg={errors.phone?.message} />
                  </div>
                  <div>
                    <label className="label">License No. <Req /></label>
                    <input className="input" placeholder="MOH-LAB-2024-001" {...register('license_number', { required: 'Required' })} />
                    <FieldError msg={errors.license_number?.message} />
                  </div>
                  <div>
                    <label className="label">Lab Type</label>
                    <select className="input" {...register('lab_type')}>
                      <option value="">Select...</option>
                      {LAB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <input type="hidden" {...register('operating_hours')} />
                    <OperatingHoursPicker value={operatingHours} onChange={v => setValue('operating_hours', v)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Address <Req /></label>
                    <input className="input" placeholder="Full address" {...register('address', { required: 'Address is required' })} />
                    <FieldError msg={errors.address?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Website <span className="text-suwela-slate/70 font-normal">(optional)</span></label>
                    <input className="input" placeholder="https://www.yourlaboratory.lk" {...register('website')} />
                  </div>
                </div>
              </SectionCard>
            )}

            {selectedType === 'laboratory' && (
              <SectionCard icon={Sparkles} title="Organization Specializations" hint="What testing services does your laboratory offer? Select any that apply, or add your own." hex={accentHex} tint={accentTint}>
                <MultiSelectWithCustom
                  options={LAB_TYPES}
                  selected={orgSpecializations}
                  onChange={setOrgSpecializations}
                  customPlaceholder="e.g., Toxicology"
                />
              </SectionCard>
            )}

            <button type="button" onClick={() => goNext(STEP3_FIELDS[selectedType] || [])} className={PRIMARY_BTN} style={PRIMARY_BG}>
              Continue <ArrowRight className="w-4 h-4" />
            </button>
            </>
            )}

            {/* Step 4: Owner / Account */}
            {step === 5 && (
            <>
            <SectionCard icon={UserRound} title="Owner Account"
                         hint={selectedTypeInfo ? `Will be registered as ${selectedTypeInfo.ownerRole}` : undefined}
                         hex={accentHex} tint={accentTint}>
              {!ownerUser && (
                <div className="mb-5">
                  <label className="label">
                    Already on Suwela? <span className="text-suwela-slate/70 font-normal">(search by name or email)</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-suwela-slate/60 pointer-events-none" />
                    <input
                      className="input pl-10"
                      placeholder={`Search existing ${selectedTypeInfo?.ownerRole.toLowerCase() || 'owner'}s...`}
                      value={ownerQuery}
                      onChange={e => { setOwnerQuery(e.target.value); setShowOwnerResults(true); }}
                      onFocus={() => setShowOwnerResults(true)}
                      onBlur={() => setTimeout(() => setShowOwnerResults(false), 150)}
                    />
                    {showOwnerResults && ownerQuery.trim().length >= 2 && (
                      <div className="absolute z-10 mt-2 w-full bg-white border border-suwela-line rounded-2xl shadow-xl max-h-56 overflow-y-auto">
                        {ownerSearching && <div className="px-4 py-3 text-sm text-suwela-slate flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>}
                        {!ownerSearching && ownerResults.length === 0 && (
                          <div className="px-4 py-3 text-sm text-suwela-slate">No matching account found — enter details below to create one.</div>
                        )}
                        {!ownerSearching && ownerResults.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => selectOwner(u)}
                            className="w-full text-left px-4 py-2.5 hover:bg-suwela-mint/10 border-b border-suwela-line/60 last:border-0 flex items-center gap-3"
                          >
                            <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: accentHex }}>
                              {u.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-suwela-navy">{u.name}</span>
                              <span className="block text-xs text-suwela-slate">{u.email}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-suwela-slate/80 mt-1.5">Not found? Fill in the fields below to create a new owner account.</p>
                </div>
              )}

              {ownerUser ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl p-4 border"
                     style={{ backgroundColor: `${accentHex}10`, borderColor: `${accentHex}40` }}>
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: accentHex }}>
                      {ownerUser.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-suwela-navy">{ownerUser.name}</p>
                      <p className="text-xs text-suwela-slate">{ownerUser.email}</p>
                      <p className="text-xs mt-1 font-medium" style={{ color: accentHex }}>Using this existing account as owner — no new password needed.</p>
                    </div>
                  </div>
                  <button type="button" onClick={clearOwner} className="text-xs font-semibold text-suwela-slate hover:text-suwela-navy shrink-0 px-3 py-1.5 rounded-full bg-white border border-suwela-line">
                    Change
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label">Full Name <Req /></label>
                    <input className="input" placeholder="Dr. Jane Perera" {...register('owner_name', { required: 'Name is required' })} />
                    <FieldError msg={errors.owner_name?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Email Address <Req /></label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-suwela-slate/60 pointer-events-none" />
                      <input type="email" className="input pl-10" placeholder="owner@yourhospital.lk" {...register('owner_email', { required: 'Email is required' })} />
                    </div>
                    <FieldError msg={errors.owner_email?.message} />
                  </div>
                  <div>
                    <label className="label">Password <Req /></label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        className="input pr-10"
                        placeholder="Min. 10 characters"
                        {...register('owner_password', { required: 'Password is required', minLength: { value: 10, message: 'Min 10 characters' } })}
                      />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Hide password' : 'Show password'}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-suwela-slate/70 hover:text-suwela-navy">
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FieldError msg={errors.owner_password?.message} />
                  </div>
                  <div>
                    <label className="label">Confirm Password <Req /></label>
                    <input
                      type="password"
                      className="input"
                      placeholder="Repeat password"
                      {...register('confirm_password', {
                        required: 'Please confirm password',
                        validate: (v: string) => v === password || 'Passwords do not match',
                      })}
                    />
                    <FieldError msg={errors.confirm_password?.message} />
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600"><ShieldCheck className="w-5 h-5" /></span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Pending Approval</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Your organization will be inactive until reviewed and approved by a Suwela administrator.
                  You will not be able to sign in until approval is granted.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={PRIMARY_BTN}
              style={PRIMARY_BG}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting Registration...
                </>
              ) : 'Submit Organization Registration'}
            </button>

            {/* COMP-02: see Register.tsx — the documents now exist and the
                accepted version is recorded. */}
            <p className="text-center text-xs text-suwela-slate">
              By registering, you agree to Suwela's{' '}
              <Link to="/terms" target="_blank" className="font-semibold text-suwela-green underline underline-offset-2 hover:text-suwela-forest">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="font-semibold text-suwela-green underline underline-offset-2 hover:text-suwela-forest">
                Privacy Policy
              </Link>{' '}
              (version {LEGAL_VERSION}).
            </p>
            </>
            )}
          </form>
        )}
      </div>
    </AuthShell>
  );
}
