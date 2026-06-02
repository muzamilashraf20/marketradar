import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Activity, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const { login, loginWithGoogle, user } = useAuth()

  const [tab, setTab] = useState('signin')
  const [mode, setMode] = useState('auth') // 'auth' or 'forgot'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const validate = () => {
    const errors = {}
    if (tab === 'signup' && !name.trim()) errors.name = 'Name is required'
    if (!email.trim()) errors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Enter a valid email'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters'
    return errors
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setLoading(true)

    try {
      const endpoint = tab === 'signin' ? '/api/login' : '/api/register'
      const body = tab === 'signin'
        ? { email, password }
        : { email, password, name }

      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()

      if (data.success) {
        login(data.user, data.session)
        navigate('/dashboard', { replace: true })
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Cannot connect to server. Please try again later.')
    }

    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setFieldErrors({ email: 'Enter your email address' })
      return
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldErrors({ email: 'Enter a valid email' })
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess('Password reset link sent! Check your email inbox (and spam folder).')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (mode === 'forgot') handleForgotPassword()
      else handleSubmit()
    }
  }

  const switchTab = (t) => {
    setTab(t)
    setError('')
    setSuccess('')
    setFieldErrors({})
  }

  const goToForgot = () => {
    setMode('forgot')
    setError('')
    setSuccess('')
    setFieldErrors({})
  }

  const goBackToAuth = () => {
    setMode('auth')
    setError('')
    setSuccess('')
    setFieldErrors({})
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-4 py-12">

      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-6">
        <Link
          to="/landing"
          className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1.5 transition-colors w-fit"
        >
          ← Back to Landing
        </Link>
      </div>

      <div className="w-full max-w-md bg-[#0a0f1a] border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={18} className="text-black" strokeWidth={3} />
          </div>
          <span className="text-xl font-black tracking-tight text-white">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </div>

        {/* ═══════════════════════════════════ */}
        {/* FORGOT PASSWORD MODE */}
        {/* ═══════════════════════════════════ */}
        {mode === 'forgot' ? (
          <>
            <button
              onClick={goBackToAuth}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Sign In
            </button>

            <div className="mb-6">
              <h1 className="text-xl font-bold text-white">Reset your password</h1>
              <p className="text-slate-500 text-sm mt-1">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            <div className="space-y-4" onKeyDown={handleKeyDown}>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setFieldErrors({}); setError(''); setSuccess('') }}
                  placeholder="you@example.com"
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors ${
                    fieldErrors.email ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  {success}
                </div>
              )}

              <button
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link →'
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ═══════════════════════════════════ */}
            {/* NORMAL AUTH MODE (Sign In / Sign Up) */}
            {/* ═══════════════════════════════════ */}

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 mb-8 border border-white/10">
              {[
                { key: 'signin', label: 'Sign In' },
                { key: 'signup', label: 'Sign Up' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => switchTab(t.key)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    tab === t.key
                      ? 'bg-white/10 text-white shadow'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <h1 className="text-xl font-bold text-white">
                {tab === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {tab === 'signin'
                  ? 'Sign in to access your BiasForge dashboard.'
                  : 'Start your free trial. No credit card required.'}
              </p>
            </div>

            {/* Google Sign-In */}
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-3"
            >
              {googleLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-slate-600 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Email/Password Form */}
            <div className="space-y-4" onKeyDown={handleKeyDown}>

              {tab === 'signup' && (
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })) }}
                    placeholder="Your name"
                    className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors ${
                      fieldErrors.name ? 'border-red-500/60' : 'border-white/10'
                    }`}
                  />
                  {fieldErrors.name && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.name}</p>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })) }}
                  placeholder="you@example.com"
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors ${
                    fieldErrors.email ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider">
                    Password
                  </label>
                  {tab === 'signin' && (
                    <button
                      onClick={goToForgot}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })) }}
                    placeholder="••••••••"
                    className={`w-full bg-white/5 border rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors ${
                      fieldErrors.password ? 'border-red-500/60' : 'border-white/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  {success}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition-all duration-200 mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Please wait...
                  </>
                ) : (
                  tab === 'signin' ? 'Sign In →' : 'Create Account →'
                )}
              </button>
            </div>

            {tab === 'signup' && (
              <p className="text-slate-600 text-xs text-center mt-4">
                By signing up, you agree to our{' '}
                <Link to="/terms" className="text-slate-400 hover:text-cyan-400 transition-colors">Terms</Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-slate-400 hover:text-cyan-400 transition-colors">Privacy Policy</Link>.
              </p>
            )}

            <p className="text-slate-500 text-sm text-center mt-5">
              {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                {tab === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </>
        )}

      </div>
    </div>
  )
}