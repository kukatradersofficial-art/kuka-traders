import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogOut,
  Mail,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import type { AppLanguage } from '../types';
import { KukaLogo } from './KukaLogo';

interface LoginGateProps {
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  unverifiedUser: User | null;
  onUserVerified: (user: User) => Promise<void>;
  logoUrl?: string;
  storeName?: string;
}

type AuthMode = 'login' | 'register' | 'reset';

export const LoginGate: React.FC<LoginGateProps> = ({
  lang,
  onChangeLang,
  unverifiedUser,
  onUserVerified,
  logoUrl,
  storeName = 'KUKA TRADERS',
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isUrdu = lang === 'ur';

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user);
          setNotice(
            isUrdu
              ? 'اپنے ای میل ان باکس میں موجود تصدیقی لنک پر کلک کریں اور پھر نیچے جاری رکھیں دبائیں۔'
              : 'Verification link sent to your email. Please verify your inbox, then click Continue below.'
          );
        }
      } else if (mode === 'register') {
        if (!name.trim()) {
          setError(isUrdu ? 'براہ کرم اپنا پورا نام درج کریں۔' : 'Please enter your full name.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await sendEmailVerification(cred.user);
        setNotice(
          isUrdu
            ? 'اکاؤنٹ بن گیا! براہ کرم اپنے ای میل ان باکس میں تصدیقی لنک کھولیں۔'
            : 'Account created! Please check your email inbox and verify your address to enter the store.'
        );
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice(
          isUrdu
            ? 'پاس ورڈ ری سیٹ لنک آپ کے ای میل پر بھیج دیا گیا ہے۔'
            : 'Password reset link sent to your email address.'
        );
        setMode('login');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication error.';
      if (msg.includes('auth/operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in Firebase Console. Please use Continue with Google above.'
        );
      } else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        setError('Invalid email or password. Please check your details and try again.');
      } else if (msg.includes('auth/email-already-in-use')) {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    if (!auth.currentUser) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true);
        await onUserVerified(auth.currentUser);
      } else {
        setError(
          'Email is not verified yet. Please click the verification link in your email inbox (check Spam folder too), then try again.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check verification status.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setNotice('A fresh verification link has been sent to ' + (auth.currentUser.email || 'your email') + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const leftHeadline = unverifiedUser
    ? isUrdu
      ? 'ای میل کی تصدیق ضروری ہے'
      : 'Verify your email'
    : mode === 'register'
      ? isUrdu
        ? 'نیا اکاؤنٹ بنائیں'
        : "Looks like you're new here!"
      : mode === 'reset'
        ? isUrdu
          ? 'پاس ورڈ ری سیٹ کریں'
          : 'Reset Password'
        : isUrdu
          ? 'لاگ ان کریں'
          : 'Login';

  const leftSubtext = unverifiedUser
    ? isUrdu
      ? 'اسٹور تک رسائی کے لیے پہلے اپنے ای میل کی تصدیق مکمل کریں۔'
      : 'Complete quick email verification to unlock the KUKA TRADERS store, live pricing, and order tracking.'
    : isUrdu
      ? 'کوکا ٹریڈرز میں خریداری، آرڈرز اور خصوصی قیمتیں دیکھنے کے لیے پہلے سائن ان کریں۔'
      : 'Sign in with your account to view products, check live INR prices, place orders, and manage deliveries.';

  return (
    <div
      className="min-h-screen bg-[#F3F5F8] text-slate-900 flex flex-col"
      dir={isUrdu ? 'rtl' : 'ltr'}
    >
      {/* Top Sopore Promo & Location Strip */}
      <div className="bg-[#0B111A] text-slate-200 text-xs py-2 px-4 text-center border-b border-slate-800">
        <span>Main Bazar, near Jamia Masjid, Sopore · PIN 193201</span>
        <span className="mx-2 text-slate-500">·</span>
        <span className="text-[#FF9900] font-semibold">
          Free delivery across Main Bazar Sopore (193201) on orders above ₹999 · Code SOPORE50
        </span>
      </div>

      {/* Navy Top Header */}
      <header className="bg-[#131921] border-b border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
          <div className="bg-white px-2.5 py-1 rounded-lg">
            <KukaLogo logoUrl={logoUrl} storeName={storeName} />
          </div>
          <button
            type="button"
            onClick={() => onChangeLang(isUrdu ? 'en' : 'ur')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-600 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#FF9900]" />
            {isUrdu ? 'English' : 'اردو'}
          </button>
        </div>
      </header>

      {/* Two-Panel Amazon-Inspired Onboarding & Sign-In Experience (Screens 1 & 2) */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-4xl w-full bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
          {/* Left Panel (Screen 1 Dark Midnight Navy Splash with Amber Ribbon) */}
          <div className="md:col-span-5 relative bg-[#0B1324] text-white p-7 sm:p-9 flex flex-col justify-between gap-8 overflow-hidden">
            {/* Subtle Golden Amber Curve Accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 bottom-12 w-64 h-64 rounded-full bg-[#FF9900]/15 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#FF9900]/15 to-transparent"
            />

            <div className="relative z-10 space-y-5">
              <div className="inline-flex items-center bg-white px-3.5 py-2 rounded-xl shadow-sm">
                <KukaLogo logoUrl={logoUrl} storeName={storeName} />
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#FF9900]">
                  Main Bazar, near Jamia Masjid, Sopore · PIN 193201
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-balance text-white">
                  {leftHeadline === 'Login'
                    ? isUrdu
                      ? 'سمارٹ خریداری۔ بہتر زندگی۔'
                      : 'Shop Smarter. Live Better.'
                    : leftHeadline}
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">{leftSubtext}</p>
              </div>
            </div>

            <div className="relative z-10 space-y-3 pt-4 border-t border-slate-800 text-xs text-slate-200">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#FF9900]" />
                <span>
                  {isUrdu ? 'صرف تصدیق شدہ صارفین کے لیے رسائی' : 'Verified account access for customers & admins'}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 shrink-0 text-[#FF9900]" />
                <span>
                  {isUrdu
                    ? '₹999 سے زیادہ آرڈر پر مفت ڈیلیوری · کوڈ SOPORE50'
                    : 'Free delivery above ₹999 · Code SOPORE50'}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-4 h-4 shrink-0 text-[#FF9900]" />
                <span>
                  {isUrdu ? 'لائیو آرڈر ٹریکنگ اور پی ڈی ایف رسید' : 'Live order tracking & downloadable PDF invoices'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel (Screen 2 Crisp White Welcome & Auth Card) */}
          <div className="md:col-span-7 p-6 sm:p-9 flex flex-col justify-center bg-white">
            {unverifiedUser ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-[#FF9900] flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      {isUrdu ? 'اپنے ای میل کی تصدیق کریں' : 'Check your email inbox'}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {isUrdu ? 'تصدیقی لنک بھیجا گیا:' : 'We sent a verification link to'}{' '}
                      <strong className="text-slate-900">{unverifiedUser.email}</strong>.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {notice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{notice}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleCheckVerified}
                    className="w-full py-3 px-4 rounded-full bg-[#FF9900] text-slate-950 font-bold text-sm hover:bg-[#E68A00] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {isUrdu ? 'تصدیق مکمل ہو گئی — اسٹور کھولیں' : "I've Verified — Continue to Store"}
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleResendVerification}
                    className="w-full py-2.5 px-4 rounded-full border border-slate-300 bg-white text-slate-800 font-semibold text-xs sm:text-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    {isUrdu ? 'تصدیقی ای میل دوبارہ بھیجیں' : 'Resend Verification Email'}
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void signOut(auth)}
                    className="w-full py-2 px-4 rounded-full text-slate-600 font-semibold text-xs hover:text-slate-900 flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {isUrdu ? 'کسی دوسرے اکاؤنٹ سے سائن ان کریں' : 'Sign in with a different account'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-5">
                  <h2 className="font-display text-2xl font-extrabold text-slate-900">
                    {isUrdu ? 'کوکا ٹریڈرز میں خوش آمدید' : `Welcome to ${storeName}`}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {isUrdu
                      ? 'اپنے سوپور گروسری اسٹور میں داخل ہونے کے لیے سائن ان کریں'
                      : 'Sign in or create an account to shop everyday groceries in Sopore.'}
                  </p>
                </div>

                {mode !== 'reset' && (
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-full mb-5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError('');
                        setNotice('');
                      }}
                      className={`py-2 px-3 rounded-full text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                        mode === 'login'
                          ? 'bg-[#FF9900] text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isUrdu ? 'سائن ان' : 'Sign In'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register');
                        setError('');
                        setNotice('');
                      }}
                      className={`py-2 px-3 rounded-full text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                        mode === 'register'
                          ? 'bg-[#FF9900] text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isUrdu ? 'نیا اکاؤنٹ بنائیں' : 'Create Account'}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {notice && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{notice}</span>
                  </div>
                )}

                {mode !== 'reset' && (
                  <>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleGoogleSignIn}
                      className="w-full py-2.5 px-4 rounded-full border border-slate-300 bg-white text-slate-900 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2.5 mb-4 disabled:opacity-60"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                      {isUrdu ? 'گوگل کے ساتھ جاری رکھیں' : 'Continue with Google'}
                    </button>

                    <div className="relative flex py-1.5 items-center mb-4">
                      <div className="flex-grow border-t border-slate-200" />
                      <span className="shrink mx-3 text-xs text-slate-400">
                        {isUrdu ? 'یا ای میل کے ساتھ' : 'or with email'}
                      </span>
                      <div className="flex-grow border-t border-slate-200" />
                    </div>
                  </>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isUrdu ? 'پورا نام' : 'Full Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Tariq Ahmad"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/20"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isUrdu ? 'ای میل ایڈریس' : 'Email Address'}
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/20"
                    />
                  </div>

                  {mode !== 'reset' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          {isUrdu ? 'پاس ورڈ' : 'Password'}
                        </label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('reset');
                              setError('');
                              setNotice('');
                            }}
                            className="text-xs font-semibold text-[#D97706] hover:underline"
                          >
                            {isUrdu ? 'پاس ورڈ بھول گئے؟' : 'Forgot password?'}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-full bg-[#FF9900] text-slate-950 font-bold text-sm hover:bg-[#E68A00] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
                  >
                    <Lock className="w-4 h-4" />
                    {loading
                      ? isUrdu
                        ? 'براہ کرم انتظار کریں...'
                        : 'Please wait...'
                      : mode === 'login'
                        ? isUrdu
                          ? 'سائن ان کریں'
                          : 'Sign In to KUKA TRADERS'
                        : mode === 'register'
                          ? isUrdu
                            ? 'اکاؤنٹ بنائیں'
                            : 'Create Account'
                          : isUrdu
                            ? 'ری سیٹ لنک بھیجیں'
                            : 'Send Reset Email'}
                  </button>
                </form>

                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setNotice('');
                    }}
                    className="mt-4 text-xs font-semibold text-[#D97706] hover:underline"
                  >
                    {isUrdu ? 'سائن ان پر واپس جائیں' : 'Back to Sign In'}
                  </button>
                )}

                <p className="mt-5 text-[11px] text-slate-500 leading-relaxed">
                  {isUrdu
                    ? 'جاری رکھ کر آپ KUKA TRADERS کی شرائط اور رازداری کی پالیسی سے اتفاق کرتے ہیں۔'
                    : 'By continuing, you agree to KUKA TRADERS Terms of Use and Privacy Policy. Only signed-in members can browse products and place orders.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
