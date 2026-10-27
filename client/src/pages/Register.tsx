import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import HospitalSearchAdd from '../components/common/HospitalSearchAdd';
import { LEGAL_VERSION } from '../legal';
import { Building2, X } from 'lucide-react';
import PlanPicker from '../components/plans/PlanPicker';
import { Plan } from '../types';
import { ArrowRight, Building2, Check, X } from 'lucide-react';
import AuthShell from '../components/landing/AuthShell';
import { roleById } from '../components/landing/roles';
import { Leaf, Cross } from '../components/landing/Shapes';

interface RoleOption {
  id: string;
  label: string;
  desc: string;
}

const ROLES: RoleOption[] = [
  {
    id: 'patient',
    label: 'Patient',
    desc: 'Register to manage your health records, find doctors, and view prescriptions.',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    desc: 'Join as a medical professional to manage patients and write prescriptions.',
  },
];

const SPECIALIZATIONS = [
  'General Practice', 'Cardiology', 'Dermatology', 'Endocrinology',
  'Gastroenterology', 'Neurology', 'Oncology', 'Orthopedics',
  'Pediatrics', 'Psychiatry', 'Pulmonology', 'Radiology',
  'Surgery', 'Urology', 'Gynecology', 'Ophthalmology',
];

export default function Register() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [hospitals, setHospitals] = useState<any[]>([]);
  // Migration 014: the package a doctor signs up for. Patients have none —
  // everything is free for them — so they skip that step entirely.
  const [plan, setPlan] = useState<Plan | null>(null);
  const choosePlan = useCallback((p: Plan) => setPlan(p), []);
  const steps = selectedRole === 'doctor' ? [1, 2, 3] : [1, 3];
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const { login } = useAuth();
  const navigate = useNavigate();

  const password = watch('password');

  const onSubmit = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      const { name, email, password, confirmPassword: _confirmPassword, ...profileData } = data;

      const profile: Record<string, unknown> = {};
      Object.entries(profileData).forEach(([k, v]) => {
        if (v !== '' && v !== undefined) profile[k] = v;
      });

      const hospital_organization_ids = selectedRole === 'doctor' ? hospitals.map(h => h.id) : undefined;
      // COMP-02: send which version of the terms/privacy policy was on screen,
      // so there is a record of what this person actually agreed to rather
      // than just that they clicked a button at some point.
      const plan_id = selectedRole === 'doctor' ? plan?.id : undefined;
      const res = await authApi.register({ name, email, password, role: selectedRole, profile, hospital_organization_ids, plan_id, accepted_terms_version: LEGAL_VERSION }) as unknown as { user: User; token?: string; refreshToken?: string; pending?: boolean; message?: string };
      if (res.pending || !res.token) {
        toast.success(res.message || 'Account created — pending admin approval.', { duration: 6000 });
        navigate('/login');
        return;
      }
      login(res.user, res.token, res.refreshToken);
      toast.success('Account created successfully!');
      const routes: Record<string, string> = { doctor: '/doctor', patient: '/patient' };
      navigate(routes[selectedRole] || '/');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const roleMeta = roleById(selectedRole === 'doctor' ? 'doctor' : 'patient');

  return (
    <AuthShell
      title={<>One record, <em className="text-suwela-mint">every visit.</em></>}
      text="Create your Suwela account and your consultations, prescriptions and lab results start collecting in one place.">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s ? 'text-white' : 'bg-white text-suwela-slate shadow-sm'
                }`} style={step >= s ? { backgroundColor: '#13A58F' } : undefined}>{step > s ? <Check className="w-4 h-4" strokeWidth={3} /> : s}</div>
                {s < 2 && <div className="w-16 h-1 rounded-full" style={{ backgroundColor: step > s ? '#13A58F' : '#E2E7E3' }} />}
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-suwela-slate mt-3">
            {step === 1
              ? 'Choose your account type'
              : step === 2
                ? 'Choose your package'
                : selectedRole === 'patient'
                ? 'Create your account'
                : `Complete your ${selectedRole} profile`}
          </p>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div className="sw-rise">
            <h1 className="font-display text-4xl sm:text-5xl text-suwela-navy text-center leading-tight">How will you use Suwela?</h1>
            <p className="text-suwela-slate text-center mt-3 mb-8">Select the option that best describes you.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {ROLES.map((r) => {
                const m = roleById(r.id === 'doctor' ? 'doctor' : 'patient');
                const Shape = r.id === 'doctor' ? Cross : Leaf;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelectedRole(r.id); setStep(2); }}
                    className="group relative overflow-hidden text-left p-7 rounded-[32px] bg-white transition-all duration-300 hover:-translate-y-1.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 shadow-[0_24px_50px_-30px_rgba(14,44,82,0.45)]"
                  >
                    <Shape from={m.tint} to={m.color} className="absolute -right-10 -top-10 w-40 h-40 opacity-15 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
                    <span className="relative flex w-20 h-20 rounded-[26px] items-center justify-center text-white mb-5 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
                          style={{ backgroundColor: m.color, backgroundImage: `linear-gradient(135deg, ${m.tint}, ${m.color})`, boxShadow: `0 16px 30px -14px ${m.color}` }}>
                      <m.icon className="w-10 h-10" strokeWidth={1.8} />
                    </span>
                    <p className="relative font-display text-3xl text-suwela-navy">{r.label}</p>
                    <p className="relative text-suwela-slate leading-relaxed mt-2">{r.desc}</p>
                    <span className="relative mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all group-hover:gap-3"
                          style={{ backgroundColor: m.color }}>
                      Register as {r.label} <ArrowRight className="w-4 h-4" />
                    </span>
                  </button>
                );
              })}
            </div>

            <Link to="/org-register"
                  className="group mt-5 flex items-center gap-4 rounded-[28px] p-4 pr-6 text-white transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(120deg, #0E2C52, #123E6E)' }}>
              <span className="flex -space-x-2 shrink-0">
                {(['pharmacist', 'laboratory', 'org'] as const).map(id => {
                  const o = roleById(id);
                  return (
                    <span key={id} className="w-11 h-11 rounded-full flex items-center justify-center ring-[3px] ring-[#0E2C52]" style={{ backgroundColor: o.color }}>
                      <o.icon className="w-5 h-5" />
                    </span>
                  );
                })}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">Running a pharmacy, lab, hospital or clinic?</span>
                <span className="block text-sm text-white/65">Register your organisation instead.</span>
              </span>
              <ArrowRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>

            <p className="text-center text-suwela-slate mt-8">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-suwela-green hover:text-suwela-forest">Sign in</Link>
            </p>
          </div>
        )}

        {/* Step 2 (doctors only): package */}
        {step === 2 && selectedRole === 'doctor' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                ← Back
              </button>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Choose your package</h2>
              <p className="text-gray-500 text-sm mt-1">
                Start free, or pick a package with more features. Paid packages are activated by an administrator when your registration is approved, and you can change package later.
              </p>
            </div>
            <PlanPicker audience="doctor" value={plan?.id ?? null} onChange={choosePlan} />
            <button type="button" className="btn-primary w-full py-2.5" disabled={!plan} onClick={() => setStep(3)}>
              {plan ? `Continue with ${plan.name}` : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 3: Registration form */}
        {step === 3 && (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="sw-rise bg-white rounded-[32px] shadow-[0_24px_60px_-34px_rgba(14,44,82,0.5)] p-6 sm:p-9 space-y-6">
              {/* Back button + role badge */}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setStep(selectedRole === 'doctor' ? 2 : 1)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  ← Back
                </button>
                {selectedRole === 'doctor' && plan && (
                  <button type="button" onClick={() => setStep(2)} className="text-xs px-3 py-1 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100">
                    📦 {plan.name} package · change
                  </button>
                )}
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  ROLES.find(r => r.id === selectedRole)?.badge
                }`}>
                  {ROLES.find(r => r.id === selectedRole)?.icon} Registering as {selectedRole}
                <span className="inline-flex items-center gap-2 text-sm pl-1.5 pr-4 py-1.5 rounded-full font-semibold text-white" style={{ backgroundColor: roleMeta.color }}>
                  <span className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center"><roleMeta.icon className="w-4 h-4" /></span>
                  Registering as {selectedRole}
                </span>
              </div>

              {/* Account Info */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Account Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label">Full Name</label>
                    <input className="input" placeholder="Dr. Jane Smith" {...register('name', { required: 'Full name is required' })} />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Email Address</label>
                    <input type="email" className="input" placeholder="you@example.com" {...register('email', { required: 'Email is required' })} />
                    {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message as string}</p>}
                  </div>
                  <div>
                    <label className="label">Password</label>
                    <div className="relative">
                      <input type={showPwd ? 'text' : 'password'} className="input pr-10" placeholder="Min. 10 characters"
                        {...register('password', { required: 'Password required', minLength: { value: 10, message: 'Min 10 characters' } })} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message as string}</p>}
                  </div>
                  <div>
                    <label className="label">Confirm Password</label>
                    <input type="password" className="input" placeholder="Repeat password"
                      {...register('confirmPassword', {
                        required: 'Please confirm password',
                        validate: (v: string) => v === password || 'Passwords do not match'
                      })} />
                    {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message as string}</p>}
                  </div>
                </div>
              </div>

              {selectedRole === 'patient' && (
                <p className="text-xs text-gray-400 -mt-2">
                  You can add your health details, blood type, emergency contact and more later from Settings.
                </p>
              )}

              {/* Doctor-specific fields */}
              {selectedRole === 'doctor' && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Professional Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Phone Number <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="+94 77 123 4567" {...register('phone', { required: 'Phone is required' })} />
                      {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Specialization <span className="text-red-400">*</span></label>
                      <select className="input" {...register('specialization', { required: 'Specialization is required' })}>
                        <option value="">Select specialization</option>
                        {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {errors.specialization && <p className="text-xs text-red-500 mt-1">{errors.specialization.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Medical License No. <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="SLMC-12345" {...register('license_number', { required: 'License number is required' })} />
                      {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Years of Experience</label>
                      <input type="number" min="0" max="60" className="input" placeholder="e.g., 10" {...register('years_experience')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Medical School / University</label>
                      <input className="input" placeholder="e.g., University of Colombo, Faculty of Medicine" {...register('medical_school')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Hospital / Clinic Affiliation</label>
                      <input className="input" placeholder="e.g., Nawaloka Hospital, Colombo" {...register('hospital_affiliation')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">
                        Registered Hospitals / Clinics <span className="text-gray-400 font-normal">(optional — more can be added later from Settings)</span>
                      </label>
                      {hospitals.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {hospitals.map(h => (
                            <div key={h.id} className="flex items-center gap-1.5 bg-primary-50 border border-primary-100 text-primary-700 text-sm font-medium pl-3 pr-2 py-1.5 rounded-xl">
                              <Building2 size={13} strokeWidth={2} />
                              {h.name}
                              <button type="button" onClick={() => setHospitals(hs => hs.filter(x => x.id !== h.id))} className="text-primary-400 hover:text-red-500 ml-0.5">
                                <X size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <HospitalSearchAdd
                        onAdd={(org) => setHospitals(hs => hs.some(x => x.id === org.id) ? hs : [...hs, org])}
                        excludeIds={hospitals.map(h => h.id)}
                        placeholder="Search for a hospital or clinic already on Suwela..."
                      />
                    </div>
                    <div>
                      <label className="label">Consultation Fee (LKR)</label>
                      <input type="number" min="0" className="input" placeholder="e.g., 2500" {...register('consultation_fee')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Bio / About <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea rows={3} className="input resize-none" placeholder="Brief description of your practice and expertise..."
                        {...register('bio')} />
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="btn-primary w-full py-3 rounded-full text-base" disabled={loading}
                      style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Creating account...
                  </span>
                ) : 'Create Account'}
              </button>

              {/* COMP-02: this said the same thing in plain text, with no
                  pages behind it and nothing recording what was agreed to.
                  The version is submitted with the form and stored on the
                  user row (migration 008). */}
              <p className="text-center text-xs text-gray-400">
                By creating an account, you agree to Suwela's{' '}
                <Link to="/terms" target="_blank" className="text-blue-600 underline hover:text-blue-700">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="text-blue-600 underline hover:text-blue-700">
                  Privacy Policy
                </Link>{' '}
                (version {LEGAL_VERSION}).
              </p>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
