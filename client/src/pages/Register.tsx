import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';

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
  {
    id: 'pharmacist',
    label: 'Pharmacist',
    icon: '💊',
    desc: 'Register to manage pharmacy inventory, orders, and patient dispensing.',
    color: 'border-purple-500 bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'laboratory',
    label: 'Laboratory',
    icon: '🔬',
    desc: 'Register your diagnostic lab to connect with doctors and patients on Core Health.',
    color: 'border-cyan-500 bg-cyan-50',
    badge: 'bg-cyan-100 text-cyan-700',
  },
];

const SPECIALIZATIONS = [
  'General Practice', 'Cardiology', 'Dermatology', 'Endocrinology',
  'Gastroenterology', 'Neurology', 'Oncology', 'Orthopedics',
  'Pediatrics', 'Psychiatry', 'Pulmonology', 'Radiology',
  'Surgery', 'Urology', 'Gynecology', 'Ophthalmology',
];

const PHARMA_SPECIALIZATIONS = [
  'Clinical Pharmacy', 'Hospital Pharmacy', 'Retail Pharmacy',
  'Compounding Pharmacy', 'Oncology Pharmacy', 'Pediatric Pharmacy',
  'Geriatric Pharmacy', 'Community Pharmacy',
];

const LAB_TYPES = [
  'Clinical Laboratory', 'Diagnostic Laboratory', 'Pathology Laboratory',
  'Radiology Center', 'Microbiology Laboratory', 'Hematology Laboratory',
  'Biochemistry Laboratory', 'Molecular Diagnostics', 'Immunology Laboratory',
  'Genetic Testing Laboratory', 'Multi-Specialty Diagnostic Center',
];

const LAB_SERVICES = [
  'Complete Blood Count (CBC)', 'Liver Function Tests (LFT)', 'Kidney Function Tests (KFT)',
  'Lipid Profile', 'Blood Sugar / HbA1c', 'Thyroid Function Tests',
  'Hormone Tests', 'Urine Analysis', 'Stool Analysis',
  'Microbiology & Culture', 'Pathology / Biopsy', 'Histopathology',
  'X-Ray', 'Ultrasound', 'Echocardiogram',
  'MRI Scan', 'CT Scan', 'ECG / EEG',
  'COVID-19 PCR / Antigen', 'Genetic / DNA Testing',
];

const ACCREDITATIONS = [
  'ISO 15189', 'ISO 9001', 'CAP (College of American Pathologists)',
  'NABL (National Accreditation Board)', 'JCI Accreditation',
  'Local Ministry of Health', 'Other',
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function Register() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const { login } = useAuth();
  const navigate = useNavigate();

  const password = watch('password');

  const onSubmit = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      const { name, email, password, confirmPassword, ...profileData } = data;

      const profile: Record<string, unknown> = {};
      Object.entries(profileData).forEach(([k, v]) => {
        if (v !== '' && v !== undefined) profile[k] = v;
      });

      // Join checkbox arrays into comma-separated strings
      ['services_offered', 'lab_type', 'accreditation'].forEach(key => {
        if (Array.isArray(profile[key])) {
          profile[key] = (profile[key] as string[]).join(', ');
        }
      });

      const res = await authApi.register({ name, email, password, role: selectedRole, profile }) as unknown as { user: User; token: string };
      login(res.user, res.token);
      toast.success('Account created successfully!');
      const routes: Record<string, string> = { doctor: '/doctor', pharmacist: '/pharmacist', patient: '/patient', laboratory: '/laboratory' };
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
            {step === 1 ? 'Choose your account type' : `Complete your ${selectedRole} profile`}
          </p>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2">How will you use Core Health?</h2>
            <p className="text-gray-500 text-sm mb-6">Select the option that best describes you.</p>
            <div className="grid gap-4">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(r.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    selectedRole === r.id ? r.color + ' shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{r.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{r.label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                          Register as {r.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{r.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedRole === r.id ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                    }`}>
                      {selectedRole === r.id && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => selectedRole && setStep(2)}
              disabled={!selectedRole}
              className="btn-primary w-full mt-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            <p className="text-center text-sm text-gray-500 mt-4">
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

              {/* Patient-specific fields */}
              {selectedRole === 'patient' && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Personal Health Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Phone Number <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="+94 77 123 4567" {...register('phone', { required: 'Phone is required' })} />
                      {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Date of Birth</label>
                      <input type="date" className="input" {...register('date_of_birth')} />
                    </div>
                    <div>
                      <label className="label">Gender</label>
                      <select className="input" {...register('gender')}>
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other / Prefer not to say</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Blood Type</label>
                      <select className="input" {...register('blood_type')}>
                        <option value="">Unknown / Not sure</option>
                        {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Home Address</label>
                      <input className="input" placeholder="No. 12, Main Street, Colombo 03" {...register('address')} />
                    </div>
                    <div>
                      <label className="label">Emergency Contact Name</label>
                      <input className="input" placeholder="Parent / Spouse name" {...register('emergency_contact_name')} />
                    </div>
                    <div>
                      <label className="label">Emergency Contact Phone</label>
                      <input className="input" placeholder="+94 77 987 6543" {...register('emergency_contact_phone')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Known Allergies</label>
                      <input className="input" placeholder="e.g., Penicillin, Aspirin, Latex (or None)" {...register('allergies')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Chronic Conditions</label>
                      <input className="input" placeholder="e.g., Diabetes, Hypertension, Asthma (or None)" {...register('chronic_conditions')} />
                    </div>
                    <div>
                      <label className="label">Insurance Provider <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input className="input" placeholder="e.g., Ceylinco, AIA, Union Assurance" {...register('insurance_provider')} />
                    </div>
                    <div>
                      <label className="label">Policy Number <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input className="input" placeholder="e.g., POL-123456" {...register('insurance_policy_number')} />
                    </div>
                  </div>
                </div>
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

              {/* Pharmacist-specific fields */}
              {selectedRole === 'pharmacist' && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Pharmacy Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Phone Number <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="+94 77 123 4567" {...register('phone', { required: 'Phone is required' })} />
                      {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Pharmacy License No. <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="NMRA-PH-12345" {...register('license_number', { required: 'License number is required' })} />
                      {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Pharmacy Name <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="e.g., City Pharmacy, Colombo" {...register('pharmacy_name', { required: 'Pharmacy name is required' })} />
                      {errors.pharmacy_name && <p className="text-xs text-red-500 mt-1">{errors.pharmacy_name.message as string}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Pharmacy Address</label>
                      <input className="input" placeholder="Full address of the pharmacy" {...register('pharmacy_address')} />
                    </div>
                    <div>
                      <label className="label">Years of Experience</label>
                      <input type="number" min="0" max="60" className="input" placeholder="e.g., 5" {...register('years_experience')} />
                    </div>
                    <div>
                      <label className="label">Specialization Area</label>
                      <select className="input" {...register('specialization_area')}>
                        <option value="">Select area</option>
                        {PHARMA_SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Laboratory-specific fields */}
              {selectedRole === 'laboratory' && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Laboratory Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="label">Laboratory Name <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="e.g., City Diagnostics, Colombo Labs" {...register('lab_name', { required: 'Lab name is required' })} />
                      {errors.lab_name && <p className="text-xs text-red-500 mt-1">{errors.lab_name.message as string}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">
                        Laboratory Type <span className="text-red-400">*</span>
                        <span className="ml-2 text-gray-400 font-normal text-xs">(select all that apply)</span>
                      </label>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {LAB_TYPES.map(t => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              value={t}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              {...register('lab_type', { required: 'Select at least one lab type' })}
                            />
                            <span className="text-xs text-gray-700 group-hover:text-gray-900">{t}</span>
                          </label>
                        ))}
                      </div>
                      {errors.lab_type && <p className="text-xs text-red-500 mt-1">{errors.lab_type.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Phone Number <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                      {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                    </div>
                    <div>
                      <label className="label">Registration / License No. <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="e.g., MOH-LAB-2024-001" {...register('license_number', { required: 'License number is required' })} />
                      {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">
                        Accreditation
                        <span className="ml-2 text-gray-400 font-normal text-xs">(select all that apply)</span>
                      </label>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ACCREDITATIONS.map(a => (
                          <label key={a} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              value={a}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              {...register('accreditation')}
                            />
                            <span className="text-xs text-gray-700 group-hover:text-gray-900">{a}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">Operating Hours</label>
                      <input className="input" placeholder="e.g., Mon–Sat 7:00 AM – 8:00 PM" {...register('operating_hours')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Laboratory Address <span className="text-red-400">*</span></label>
                      <input className="input" placeholder="Full address of the laboratory" {...register('address', { required: 'Address is required' })} />
                      {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address.message as string}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input className="input" placeholder="https://www.yourlaboratory.lk" {...register('website')} />
                    </div>

                    {/* Services offered — checkbox grid */}
                    <div className="sm:col-span-2">
                      <label className="label">Services Offered <span className="text-gray-400 font-normal">(select all that apply)</span></label>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {LAB_SERVICES.map(service => (
                          <label key={service} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              value={service}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              {...register('services_offered')}
                            />
                            <span className="text-xs text-gray-700 group-hover:text-gray-900">{service}</span>
                          </label>
                        ))}
                      </div>
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
