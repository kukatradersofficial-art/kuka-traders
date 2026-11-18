import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Mail, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

type AuthMode = 'login' | 'register' | 'reset';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, title }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'your Vercel domain';
        setError(
          `This domain (${host}) is not authorized for Google Sign-In yet. Add "${host}" in Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code === 'auth/popup-closed-by-user' || msg.includes('auth/popup-closed-by-user')) {
        setError('Google Sign-In popup was closed before completing sign-in.');
      } else if (code === 'auth/popup-blocked' || msg.includes('auth/popup-blocked')) {
        setError('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      } else {
        setError(msg);
      }
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
          setNotice('Please verify your email address from your inbox before placing orders. A verification link was sent.');
        } else {
          onClose();
        }
      } else if (mode === 'register') {
        if (!name.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await sendEmailVerification(cred.user);
        setNotice(
          'Account created! Please check your email inbox and click the verification link, then sign in.'
        );
        setMode('login');
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('Password reset link sent to your email address.');
        setMode('login');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication error.';
      if (msg.includes('auth/operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Please use Google Sign-In above, or enable Email/Password under Firebase Console → Authentication → Sign-in method.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1324]/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customer Sign In"
    >
      <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 relative shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign in dialog"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-display text-xl font-extrabold text-slate-900 mb-1">
          {title || (mode === 'login' ? 'Sign in to KUKA TRADERS' : mode === 'register' ? 'Create Account' : 'Reset Password')}
        </h2>
        <p className="text-sm text-slate-600 mb-5">
          Sign in with Google or email to place orders, save delivery addresses, and track deliveries.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleSignIn}
          className="w-full py-2.5 px-4 rounded-full border border-slate-300 bg-white text-slate-900 font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2.5 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
            <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
          </svg>
          Continue with Google
        </button>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-slate-200" />
          <span className="shrink mx-3 text-xs text-slate-400">or with email</span>
          <div className="flex-grow border-t border-slate-200" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tariq Ahmad"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-full bg-[#FF9900] text-slate-950 font-extrabold text-sm hover:bg-[#E68A00] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
          >
            <Mail className="w-4 h-4" />
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign In with Email'
                : mode === 'register'
                  ? 'Create Customer Account'
                  : 'Send Reset Email'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className="font-bold text-[#E68A00] hover:underline"
              >
                New customer? Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError('');
                }}
                className="hover:underline"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="font-bold text-[#E68A00] hover:underline"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
