import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: () => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onAuth, onSwitchMode }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    verificationCode: ''
  });

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  // Timer Effect
  useEffect(() => {
    let timer: number;
    if (countdown > 0) {
      timer = window.setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = () => {
    if (!formData.email) return; // Simple check, ideally validate email format
    setCodeSent(true);
    setCountdown(60);
    // Simulate API sending code
    console.log("Sending verification code to", formData.email);
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Additional Validation for Signup
    if (mode === 'signup') {
        if (!passwordReqs.isValid) return;
        if (!formData.verificationCode) {
            alert("Please enter the verification code sent to your email.");
            return;
        }
    }

    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      onAuth();
    }, 1500);
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
            <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-500 mb-4">
               <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <Icons.Activity size={28} strokeWidth={2.5} />
               </div>
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
            {mode === 'signup' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
                    <div className="relative">
                        <Icons.User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                            placeholder="John Doe"
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

            {/* Verification Code (Signup Only) */}
            {mode === 'signup' && (
              <div className="animate-fade-in">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Verification Code</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            value={formData.verificationCode}
                            onChange={(e) => setFormData({...formData, verificationCode: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                            placeholder="e.g. 123456"
                            maxLength={6}
                        />
                    </div>
                    <button 
                        type="button"
                        onClick={handleSendCode}
                        disabled={countdown > 0 || !formData.email}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[100px]"
                    >
                        {countdown > 0 ? `${countdown}s` : 'Send Code'}
                    </button>
                  </div>
                  {codeSent && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Code sent to your email.</p>}
              </div>
            )}

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
                <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                        <span className="text-slate-600 dark:text-slate-400">Remember me</span>
                    </label>
                    <a href="#" className="text-primary-600 dark:text-primary-400 hover:text-primary-500 font-medium">Forgot password?</a>
                </div>
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

          <div className="mt-6">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-slate-900 text-slate-500">Or continue with</span>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium text-sm">
                    <Icons.Github size={18} />
                    GitHub
                </button>
                <button type="button" className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium text-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Google
                </button>
            </div>
          </div>
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