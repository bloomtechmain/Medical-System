import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { orgApi } from '../services/api';

const ORG_TYPES = [
  {
    id: 'hospital',
    icon: '🏥',
    label: 'Hospital',
    desc: 'Full-service hospital with inpatient, outpatient, and emergency departments.',
    ownerRole: 'Doctor / Director',
    color: 'border-blue-400 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    badgeText: 'Doctor owner',
  },
  {
    id: 'clinic',
    icon: '🩺',
    label: 'Clinic',
    desc: 'Doctor-owned private clinic or multi-specialty outpatient centre.',
    ownerRole: 'Doctor / Owner',
    color: 'border-teal-400 bg-teal-50',
    badge: 'bg-teal-100 text-teal-700',
    badgeText: 'Doctor owner',
  },
  {
    id: 'pharmacy',
    icon: '💊',
    label: 'Pharmacy',
    desc: 'Retail or hospital pharmacy managing inventory, prescriptions, and dispensing.',
    ownerRole: 'Pharmacist / Owner',
    color: 'border-purple-400 bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
    badgeText: 'Pharmacist owner',
  },
  {
    id: 'laboratory',
    icon: '🔬',
    label: 'Laboratory',
    desc: 'Diagnostic laboratory offering pathology, radiology, and clinical testing.',
    ownerRole: 'Lab Director',
    color: 'border-cyan-400 bg-cyan-50',
    badge: 'bg-cyan-100 text-cyan-700',
    badgeText: 'Lab owner',
  },
];

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
    .replace(/-+/g, '-');
}

export default function OrgRegister() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm();
  const password = watch('owner_password');
  const orgName = watch('org_name', '');

  const onOrgNameBlur = () => {
    const slug = slugify(orgName);
    if (slug) setValue('slug', slug);
  };

  const onSubmit = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      const profile: Record<string, any> = {};
      const profileFields = [
        'phone','specialization','license_number','medical_school',
        'years_experience','hospital_affiliation','consultation_fee','bio',
        'pharmacy_name','pharmacy_address','specialization_area',
        'lab_name','lab_type','accreditation','address','services_offered',
        'operating_hours','website',
      ];
      profileFields.forEach(k => {
        if (data[k] !== undefined && data[k] !== '') profile[k] = data[k];
      });

      await orgApi.register({
        org_name:       data.org_name,
        slug:           data.slug,
        org_type:       selectedType,
        owner_name:     data.owner_name,
        owner_email:    data.owner_email,
        owner_password: data.owner_password,
        profile: Object.keys(profile).length ? profile : undefined,
      });

      setDone(true);
    } catch (err: any) {
      toast.error(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTypeInfo = ORG_TYPES.find(t => t.id === selectedType);

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Registration Submitted!</h2>
          <p className="text-gray-500 mb-6 leading-relaxed">
            Your organization has been registered and is currently <span className="font-semibold text-gray-700">pending admin review</span>.
            You'll be able to sign in once your organization is approved.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">What happens next?</p>
                <p className="text-xs text-amber-700 mt-1">An administrator will review your registration. Once approved, you can sign in with the credentials you provided.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Link to="/login" className="btn-primary w-full py-2.5 text-center text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
              Go to Sign In
            </Link>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50/30">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-700 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">Core Health</span>
          <span className="text-gray-400 text-sm">by BloomTech</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">Already registered?</span>
          <Link to="/login" className="font-semibold text-teal-600 hover:text-teal-700">Sign In</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-10 pb-20">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Register Your Organization</h1>
          <p className="text-gray-500 text-sm mt-1">Join the Core Health network as a verified healthcare organization</p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3 mt-5">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{s}</div>
                {s < 2 && <div className={`w-16 h-0.5 transition-colors ${step > 1 ? 'bg-teal-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {step === 1 ? 'Step 1 — Choose organization type' : 'Step 2 — Organization & owner details'}
          </p>
        </div>

        {/* Step 1: Type selection */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-1">What type of organization are you registering?</h2>
            <p className="text-sm text-gray-500 mb-6">Select the type that best describes your organization.</p>

            <div className="space-y-3">
              {ORG_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    selectedType === t.id ? t.color + ' shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-semibold text-gray-900">{t.label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.badge}`}>{t.badgeText}</span>
                      </div>
                      <p className="text-sm text-gray-500">{t.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedType === t.id ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
                    }`}>
                      {selectedType === t.id && (
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
              onClick={() => selectedType && setStep(2)}
              disabled={!selectedType}
              className="w-full mt-6 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            <p className="text-center text-sm text-gray-500 mt-4">
              Not an organization?{' '}
              <Link to="/register" className="text-teal-600 font-medium hover:text-teal-700">Register as an individual</Link>
            </p>
          </div>
        )}

        {/* Step 2: Full form */}
        {step === 2 && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Back + type badge */}
            <div className="flex items-center justify-between mb-1">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              {selectedTypeInfo && (
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${selectedTypeInfo.badge}`}>
                  {selectedTypeInfo.icon} {selectedTypeInfo.label}
                </span>
              )}
            </div>

            {/* Organization details */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Organization Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name <span className="text-red-400">*</span></label>
                  <input
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="e.g., Nawaloka Hospital, City Pharmacy Colombo"
                    {...register('org_name', { required: 'Organization name is required' })}
                    onBlur={onOrgNameBlur}
                  />
                  {errors.org_name && <p className="text-xs text-red-500 mt-1">{errors.org_name.message as string}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL Slug <span className="text-red-400">*</span>
                    <span className="text-gray-400 font-normal ml-1">(unique identifier, lowercase letters & hyphens only)</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3.5 py-2.5 border border-r-0 border-gray-300 rounded-l-xl bg-gray-50 text-xs text-gray-500 shrink-0">corehealth.lk/</span>
                    <input
                      className="flex-1 border border-gray-300 rounded-r-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="nawaloka-hospital"
                      {...register('slug', {
                        required: 'Slug is required',
                        pattern: { value: /^[a-z0-9-]+$/, message: 'Only lowercase letters, numbers, and hyphens' },
                      })}
                    />
                  </div>
                  {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug.message as string}</p>}
                </div>
              </div>
            </div>

            {/* Role-specific profile fields */}
            {(selectedType === 'hospital' || selectedType === 'clinic') && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Doctor / Director Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialization <span className="text-red-400">*</span></label>
                    <select className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" {...register('specialization', { required: 'Required' })}>
                      <option value="">Select...</option>
                      {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {errors.specialization && <p className="text-xs text-red-500 mt-1">{errors.specialization.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medical License No. <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="SLMC-12345" {...register('license_number', { required: 'Required' })} />
                    {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                    <input type="number" min="0" max="60" className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g., 15" {...register('years_experience')} />
                  </div>
                </div>
              </div>
            )}

            {selectedType === 'pharmacy' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Pharmacy Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy License No. <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="NMRA-PH-12345" {...register('license_number', { required: 'Required' })} />
                    {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy Name <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="City Pharmacy, Colombo 03" {...register('pharmacy_name', { required: 'Required' })} />
                    {errors.pharmacy_name && <p className="text-xs text-red-500 mt-1">{errors.pharmacy_name.message as string}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy Address</label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Full address" {...register('pharmacy_address')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                    <select className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" {...register('specialization_area')}>
                      <option value="">Select...</option>
                      {PHARMA_SPECS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {selectedType === 'laboratory' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Laboratory Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Laboratory Name <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="City Diagnostics" {...register('lab_name', { required: 'Required' })} />
                    {errors.lab_name && <p className="text-xs text-red-500 mt-1">{errors.lab_name.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+94 11 234 5678" {...register('phone', { required: 'Phone is required' })} />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License No. <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="MOH-LAB-2024-001" {...register('license_number', { required: 'Required' })} />
                    {errors.license_number && <p className="text-xs text-red-500 mt-1">{errors.license_number.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lab Type</label>
                    <select className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" {...register('lab_type')}>
                      <option value="">Select...</option>
                      {LAB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Mon–Sat 7:00 AM – 8:00 PM" {...register('operating_hours')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address <span className="text-red-400">*</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Full address" {...register('address', { required: 'Address is required' })} />
                    {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address.message as string}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="https://www.yourlaboratory.lk" {...register('website')} />
                  </div>
                </div>
              </div>
            )}

            {/* Owner / Account */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Owner Account</h3>
                {selectedTypeInfo && (
                  <span className="text-xs text-gray-400">— will be registered as {selectedTypeInfo.ownerRole}</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-400">*</span></label>
                  <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Dr. Jane Perera" {...register('owner_name', { required: 'Name is required' })} />
                  {errors.owner_name && <p className="text-xs text-red-500 mt-1">{errors.owner_name.message as string}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address <span className="text-red-400">*</span></label>
                  <input type="email" className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="owner@yourhospital.lk" {...register('owner_email', { required: 'Email is required' })} />
                  {errors.owner_email && <p className="text-xs text-red-500 mt-1">{errors.owner_email.message as string}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
                      placeholder="Min. 6 characters"
                      {...register('owner_password', { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })}
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {errors.owner_password && <p className="text-xs text-red-500 mt-1">{errors.owner_password.message as string}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Repeat password"
                    {...register('confirm_password', {
                      required: 'Please confirm password',
                      validate: (v: string) => v === password || 'Passwords do not match',
                    })}
                  />
                  {errors.confirm_password && <p className="text-xs text-red-500 mt-1">{errors.confirm_password.message as string}</p>}
                </div>
              </div>
            </div>

            {/* Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Pending Approval</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your organization will be inactive until reviewed and approved by a Core Health administrator.
                  You will not be able to sign in until approval is granted.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Submitting Registration...
                </>
              ) : 'Submit Organization Registration'}
            </button>

            <p className="text-center text-xs text-gray-400">
              By registering, you agree to Core Health's Terms of Service and Privacy Policy.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
