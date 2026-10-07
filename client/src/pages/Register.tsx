import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import HospitalSearchAdd from '../components/common/HospitalSearchAdd';
import { Building2, X } from 'lucide-react';

interface RoleOption {
  id: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
  badge: string;
}

const ROLES: RoleOption[] = [
  {
    id: 'patient',
    label: 'Patient',
    icon: '🏥',
    desc: 'Register to manage your health records, find doctors, and view prescriptions.',
    color: 'border-blue-500 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    icon: '🩺',
    desc: 'Join as a medical professional to manage patients and write prescriptions.',
    color: 'border-primary-500 bg-primary-50',
    badge: 'bg-primary-100 text-primary-700',
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
      const res = await authApi.register({ name, email, password, role: selectedRole, profile, hospital_organization_ids }) as unknown as { user: User; token?: string; refreshToken?: string; pending?: boolean; message?: string };
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900">Core Health</span>
          </div>
          <p className="text-xs text-gray-400 -mt-1">by BloomTech</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{s}</div>
                {s < 2 && <div className={`w-12 h-0.5 ${step > s ? 'bg-primary-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {step === 1
              ? 'Choose your account type'
              : selectedRole === 'patient'
                ? 'Create your account'
                : `Complete your ${selectedRole} profile`}
          </p>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2">How will you use Core Health?</h2>
            <p className="text-gray-500 text-sm mb-6">Select the option that best describes you.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setSelectedRole(r.id); setStep(2); }}
                  className={`group relative text-left p-6 rounded-2xl border-2 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${r.color}`}
                >
                  <svg className="absolute top-5 right-5 w-5 h-5 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-3xl mb-4 shadow-sm group-hover:scale-110 transition-transform duration-200">
                    {r.icon}
                  </div>
                  <p className="font-bold text-gray-900 text-lg mb-1.5">{r.label}</p>
                  <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mb-2.5 ${r.badge}`}>
                    Register as {r.label}
                  </span>
                  <p className="text-sm text-gray-500 leading-relaxed">{r.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">Sign in</Link>
            </p>
          </div>
        )}

        {/* Step 2: Registration form */}
        {step === 2 && (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
              {/* Back button + role badge */}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  ← Back
                </button>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  ROLES.find(r => r.id === selectedRole)?.badge
                }`}>
                  {ROLES.find(r => r.id === selectedRole)?.icon} Registering as {selectedRole}
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
                      <input type={showPwd ? 'text' : 'password'} className="input pr-10" placeholder="Min. 6 characters"
                        {...register('password', { required: 'Password required', minLength: { value: 6, message: 'Min 6 characters' } })} />
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
                        placeholder="Search for a hospital or clinic already on Core Health..."
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

              <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
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

              <p className="text-center text-xs text-gray-400">
                By creating an account, you agree to Core Health's Terms of Service and Privacy Policy.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
