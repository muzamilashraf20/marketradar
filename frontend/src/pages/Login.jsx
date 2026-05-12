import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login, user } = useAuth()

  const [tab, setTab] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  // Already logged in → redirect
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  const switchTab = (t) => {
    setTab(t)
    setError('')
    setFieldErrors({})
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-4 py-12">

      {/* Background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Back to Landing */}
      <div className="w-full max-w-md mb-6">
        <Link
          to="/landing"
          className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1.5 transition-colors w-fit"
        >
          ← Back to Landing
        </Link>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-[#0a0f1a] border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={18} className="text-black" strokeWidth={3} />
          </div>
          <span className="text-xl font-black tracking-tight text-white">
            Bias<span className="text-cyan-400">Forge</span>
            <span className="text-slate-500 text-sm font-medium">.ai</span>
          </span>
        </div>

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

        {/* Heading */}
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

        {/* Form */}
        <div className="space-y-4" onKeyDown={handleKeyDown}>

          {/* Name — signup only */}
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

          {/* Email */}
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

          {/* Password */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
              Password
            </label>
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

          {/* Global Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
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

        {/* Terms line — signup only */}
        {tab === 'signup' && (
          <p className="text-slate-600 text-xs text-center mt-4">
            By signing up, you agree to our{' '}
            <Link to="/terms" className="text-slate-400 hover:text-cyan-400 transition-colors">Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-slate-400 hover:text-cyan-400 transition-colors">Privacy Policy</Link>.
          </p>
        )}

        {/* Switch tab */}
        <p className="text-slate-500 text-sm text-center mt-5">
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
            className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
          >
            {tab === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

      </div>
    </div>
  )
}