import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';

interface LoginFormData {
  email: string;
  password: string;
}

export default function Login() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>();
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const res = await authApi.login(data) as unknown as { user: User; token: string };
      if (!res?.user?.role) throw new Error('Invalid response from server');
      login(res.user, res.token);
      const routes: Record<string, string> = { admin: '/admin', doctor: '/doctor', pharmacist: '/pharmacist', patient: '/patient', laboratory: '/laboratory' };
      navigate(routes[res.user.role] || '/');
    } catch (err: any) {
      toast.error(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-700 to-primary-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12h15m-7.5-7.5v15M9 7.5H6a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 006 19.5h12a1.5 1.5 0 001.5-1.5V9A1.5 1.5 0 0018 7.5h-3" />
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">Core Health</p>
            <p className="text-primary-200 text-xs">by BloomTech</p>
          </div>
        </div>

        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Your health,<br />our priority.
          </h2>
          <p className="text-primary-200 text-lg max-w-sm">
            A unified platform for patients, doctors, and pharmacists — delivering seamless healthcare management.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: '🩺', title: 'Doctors', desc: 'Manage patients & prescriptions' },
              { icon: '💊', title: 'Pharmacists', desc: 'Inventory, orders & dispensing' },
              { icon: '🏥', title: 'Patients', desc: 'Your health records in one place' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{item.title}</p>
                  <p className="text-primary-200 text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-primary-300 text-xs">© 2024 Core Health by BloomTech. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">Core Health</span>
            </div>
            <p className="text-sm text-gray-500">by BloomTech</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
              <p className="text-gray-500 text-sm mt-1">Sign in to your Core Health account</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  {...register('email', { required: 'Email is required' })}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="••••••••"
                    {...register('password', { required: 'Password is required' })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                className="btn-primary w-full mt-2 py-2.5"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 font-medium hover:text-primary-700">
                Create account
              </Link>
            </p>
            <p className="text-center text-sm text-gray-500 mt-2">
              Registering an organization?{' '}
              <Link to="/org-register" className="text-primary-600 font-medium hover:text-primary-700">
                Register here
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Core Health by BloomTech · Secure Medical Platform
          </p>
        </div>
      </div>
    </div>
  );
}
