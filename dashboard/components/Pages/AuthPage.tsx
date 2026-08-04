import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { AuthPayload, login, register } from '../../services/api';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: (session: AuthPayload) => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onAuth, onSwitchMode }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State — signup mirrors the backend's RegisterInput.
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    tenantName: '',
    domain: ''
  });

  // UI State
  const [showPassword, setShowPassword] = useState(false);

  // Password Validation Logic
  const getPasswordStrength = (pwd: string) => {
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
    
    const typesCount = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
    const isLengthValid = pwd.length >= 8 && pwd.length <= 20;
    
    const isValid = isLengthValid && typesCount >= 3;

    return { hasUpper, hasLower, hasNumber, hasSymbol, typesCount, isLengthValid, isValid };
  };

  const passwordReqs = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !passwordReqs.isValid) return;

    setIsLoading(true);
    setError(null);

    try {
      const session =
        mode === 'login'
          ? await login(formData.email, formData.password)
          : await register({
              email: formData.email,
              password: formData.password,
              firstName: formData.firstName,
              lastName: formData.lastName,
              tenantName: formData.tenantName,
              // The domain is what the SDK will report from; default to the email's.
              domain: formData.domain || formData.email.split('@')[1] || 'example.com',
            });
      onAuth(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary-500/10 dark:bg-primary-500/5 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-teal-500/10 dark:bg-teal-500/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-10 animate-fade-in overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
               <img src="/logo.png" alt="ObsPro" className="h-14 w-14 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {mode === 'login' 
                ? 'Enter your credentials to access your dashboard.' 
                : 'Start monitoring your frontend applications today.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 animate-fade-in">
                <Icons.AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">First Name</label>
                      <div className="relative">
                          <Icons.User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                              type="text"
                              required
                              value={formData.firstName}
                              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                              placeholder="John"
                          />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Last Name</label>
                      <input
                          type="text"
                          required
                          value={formData.lastName}
                          onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                          placeholder="Doe"
                      />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Organization</label>
                      <input
                          type="text"
                          required
                          value={formData.tenantName}
                          onChange={(e) => setFormData({...formData, tenantName: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                          placeholder="Acme Inc"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Domain <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                          type="text"
                          value={formData.domain}
                          onChange={(e) => setFormData({...formData, domain: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                          placeholder="acme.com"
                      />
                  </div>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Work Email</label>
                <div className="relative">
                    <Icons.Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="email" 
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                        placeholder="name@company.com"
                    />
                </div>
            </div>

            {/* Password Field */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                    <Icons.Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type={showPassword ? "text" : "password"}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-lg py-2.5 pl-10 pr-10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors
                           ${mode === 'signup' && formData.password.length > 0
                             ? (passwordReqs.isValid ? 'border-green-500 focus:border-green-500 focus:ring-green-500' : 'border-slate-200 dark:border-slate-800 focus:border-primary-500 focus:ring-primary-500')
                             : 'border-slate-200 dark:border-slate-800 focus:border-primary-500 focus:ring-primary-500'
                           }
                        `}
                        placeholder="••••••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}
                    </button>
                </div>
                
                {/* Password Requirements Checklist (Signup Only) */}
                {mode === 'signup' && (
                    <div className="mt-3 space-y-1.5 p-3 bg-slate-50 dark:bg-slate-950/50 rounded-lg border border-slate-100 dark:border-slate-800/50">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Password Requirements</p>
                        
                        <div className="flex items-center gap-2">
                             <div className={`w-3 h-3 rounded-full flex items-center justify-center ${passwordReqs.isLengthValid ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                <Icons.Check size={8} strokeWidth={4} />
                             </div>
                             <span className={`text-xs ${passwordReqs.isLengthValid ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                8-20 characters
                             </span>
                        </div>

                        <div className="flex items-center gap-2">
                             <div className={`w-3 h-3 rounded-full flex items-center justify-center ${passwordReqs.typesCount >= 3 ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                <Icons.Check size={8} strokeWidth={4} />
                             </div>
                             <span className={`text-xs ${passwordReqs.typesCount >= 3 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                3+ types: Uppercase, Lowercase, Number, Symbol
                             </span>
                        </div>
                        
                        <div className="flex gap-1 mt-1 pl-5">
                            <span className={`text-[10px] px-1 rounded ${passwordReqs.hasUpper ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-800'}`}>ABC</span>
                            <span className={`text-[10px] px-1 rounded ${passwordReqs.hasLower ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-800'}`}>abc</span>
                            <span className={`text-[10px] px-1 rounded ${passwordReqs.hasNumber ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-800'}`}>123</span>
                            <span className={`text-[10px] px-1 rounded ${passwordReqs.hasSymbol ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-800'}`}>#$&</span>
                        </div>
                    </div>
                )}
            </div>

            {mode === 'login' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sessions last 24 hours and renew automatically while you stay signed in.
                </p>
            )}

            <button 
                type="submit" 
                disabled={isLoading || (mode === 'signup' && !passwordReqs.isValid)}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 rounded-lg transition-all shadow-lg shadow-primary-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {isLoading && <Icons.Refresh className="animate-spin" size={18} />}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

        </div>

        <div className="bg-slate-50 dark:bg-slate-950/50 p-4 text-center border-t border-slate-200 dark:border-slate-800">
             <p className="text-sm text-slate-600 dark:text-slate-400">
                {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                <button 
                    onClick={() => onSwitchMode(mode === 'login' ? 'signup' : 'login')}
                    className="ml-1 text-primary-600 dark:text-primary-400 hover:text-primary-500 font-medium hover:underline"
                >
                    {mode === 'login' ? 'Sign up' : 'Log in'}
                </button>
             </p>
        </div>
      </div>
      
      <div className="mt-8 text-center text-slate-500 dark:text-slate-500 text-xs">
        <p>© 2024 Observability Pro. All rights reserved.</p>
        <div className="flex gap-4 justify-center mt-2">
            <a href="#" className="hover:text-slate-800 dark:hover:text-slate-300">Privacy Policy</a>
            <a href="#" className="hover:text-slate-800 dark:hover:text-slate-300">Terms of Service</a>
        </div>
      </div>
    </div>
  );
};