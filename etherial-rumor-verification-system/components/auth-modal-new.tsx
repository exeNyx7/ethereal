'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useUser } from '@/lib/user-context-new';
import { sendOTP } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, ShieldCheck, LogIn, UserPlus, KeyRound, User } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'login' | 'register';
type RegisterStep = 'email' | 'otp' | 'done';

export function AuthModal({ isOpen, onOpenChange }: AuthModalProps) {
  const { login, register } = useUser();
  const [tab, setTab] = useState<Tab>('login');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regStep, setRegStep] = useState<RegisterStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Shared
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const otpRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input
  useEffect(() => {
    if (regStep === 'otp') {
      const timer = setTimeout(() => otpRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [regStep]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setTab('login');
        setUsername('');
        setPassword('');
        setRegStep('email');
        setEmail('');
        setOtp('');
        setError('');
        setOtpMessage('');
        setSuccessMessage('');
      }, 200);
    }
  }, [isOpen]);

  // ── LOGIN ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('Enter your username and password'); return; }

    setIsLoading(true);
    try {
      await login(username, password);
      setUsername('');
      setPassword('');
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ── REGISTER Step 1: Email ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('Please enter a valid email address'); return; }

    setIsLoading(true);
    try {
      const result = await sendOTP(email);
      setOtpMessage(result.message || 'Verification code sent!');
      setRegStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // ── REGISTER Step 2: OTP → Register → auto-login ──
  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length < 6) { setError('Enter the 6-digit code'); return; }

    setIsLoading(true);
    try {
      const result = await register(email, otp);
      setSuccessMessage(result.message || 'Account created! Check your email for your login credentials.');
      setRegStep('done');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await sendOTP(email);
      setOtpMessage(result.message || 'New code sent!');
      setOtp('');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
    setRegStep('email');
    setEmail('');
    setOtp('');
    setOtpMessage('');
    setUsername('');
    setPassword('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md border-app-purple/20 animate-slide-up">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-3xl font-bold text-white">
            {tab === 'login' && 'Welcome back'}
            {tab === 'register' && regStep === 'email' && 'Create account'}
            {tab === 'register' && regStep === 'otp' && 'Verify email'}
            {tab === 'register' && regStep === 'done' && 'You\'re in!'}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-base">
            {tab === 'login' && 'Sign in with your credentials.'}
            {tab === 'register' && regStep === 'email' && 'Enter your university .edu email to get started.'}
            {tab === 'register' && regStep === 'otp' && `We sent a 6-digit code to ${email}`}
            {tab === 'register' && regStep === 'done' && 'Your credentials have been sent to your email.'}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        {regStep !== 'done' && (
          <div className="flex gap-1 p-1 glass rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200
                ${tab === 'login'
                  ? 'bg-app-purple text-white shadow-lg shadow-app-purple/20'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              <LogIn className="w-4 h-4" /> Login
            </button>
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200
                ${tab === 'register'
                  ? 'bg-app-purple text-white shadow-lg shadow-app-purple/20'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              <UserPlus className="w-4 h-4" /> Register
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-lg animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ═══ LOGIN TAB ═══ */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5 pt-2 animate-fade-in">
            <div className="space-y-3">
              <Label htmlFor="username" className="text-white font-semibold text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-app-purple" />
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="user_swiftwolf_a1b2"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="smooth-input font-mono"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="password" className="text-white font-semibold text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-app-purple" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="smooth-input"
                autoComplete="current-password"
              />
              <p className="text-xs text-gray-500">
                Check your email for credentials if you just registered.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50"
            >
              {isLoading ? <Spinner /> : 'Sign In'}
            </Button>
          </form>
        )}

        {/* ═══ REGISTER TAB ═══ */}

        {/* Register Step 1: Email */}
        {tab === 'register' && regStep === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-5 pt-2 animate-fade-in">
            <div className="space-y-3">
              <Label htmlFor="reg-email" className="text-white font-semibold text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-app-purple" />
                University Email
              </Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="smooth-input"
                autoComplete="email"
                autoFocus
              />
              <p className="text-xs text-gray-500">
                One account per email. Your username &amp; password will be emailed to you.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !email}
              className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50"
            >
              {isLoading ? <Spinner /> : 'Send Verification Code'}
            </Button>
          </form>
        )}

        {/* Register Step 2: OTP */}
        {tab === 'register' && regStep === 'otp' && (
          <form onSubmit={handleOTPSubmit} className="space-y-5 pt-2 animate-fade-in">
            {otpMessage && (
              <div className="flex items-start gap-3 p-4 bg-app-purple/10 border border-app-purple/30 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-app-purple mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-300">{otpMessage}</p>
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="reg-otp" className="text-white font-semibold text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-app-purple" />
                Verification Code
              </Label>
              <Input
                ref={otpRef}
                id="reg-otp"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isLoading}
                className="smooth-input text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Check your inbox (and spam folder)</p>
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={isLoading}
                  className="text-xs text-app-purple hover:text-app-purple-dark underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" onClick={() => setRegStep('email')} disabled={isLoading}
                className="flex-shrink-0 glass text-gray-300 hover:text-white h-12 px-4 rounded-lg border border-white/10">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button
                type="submit"
                disabled={isLoading || otp.length < 6}
                className="flex-1 bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50"
              >
                {isLoading ? <Spinner /> : 'Verify & Create Account'}
              </Button>
            </div>
          </form>
        )}

        {/* Register Step 3: Success */}
        {tab === 'register' && regStep === 'done' && (
          <div className="space-y-5 pt-2 animate-fade-in text-center">
            <div className="w-16 h-16 mx-auto bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>

            <div className="space-y-2">
              <p className="text-white font-semibold text-lg">Account created successfully!</p>
              <p className="text-gray-400 text-sm">{successMessage}</p>
            </div>

            <div className="p-4 glass rounded-lg text-sm text-left border border-amber-500/30 bg-amber-950/20">
              <p className="text-amber-300 font-semibold mb-2">⚠ Important</p>
              <p className="text-gray-300">
                Your <strong className="text-white">username</strong> and <strong className="text-white">password</strong> have been sent to <strong className="text-app-purple">{email}</strong>.
                Check your inbox (and spam folder). You&apos;ll need them to sign in.
              </p>
            </div>

            <Button
              onClick={() => onOpenChange(false)}
              className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20"
            >
              Got it, let&apos;s go!
            </Button>
          </div>
        )}

        {/* Privacy note */}
        {tab === 'login' && (
          <div className="p-4 glass rounded-lg text-sm text-gray-300 border border-white/10">
            <strong className="text-white">Privacy First:</strong> Your username is private — other users only see an anonymous identity. Email is never stored.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Spinner() {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Please wait...
    </span>
  );
}
