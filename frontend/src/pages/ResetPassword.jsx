import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Activity, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if session already exists (user clicked link and landed here)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async () => {
    setError('')

    if (!password) {
      setError('Please enter a new password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
        // Sign out so they can log in fresh with new password
        await supabase.auth.signOut()
        setTimeout(() => navigate('/login', { replace: true }), 3000)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleReset()
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-4 py-12">

      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

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

        {/* ── Success State ── */}
        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Password Updated!</h1>
            <p className="text-slate-400 text-sm mb-6">
              Your password has been reset successfully. Redirecting you to login...
            </p>
            <Link
              to="/login"
              className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold transition-colors"
            >
              Go to Login →
            </Link>
          </div>
        ) : !ready ? (
          /* ── Loading / Invalid Link State ── */
          <div className="text-center py-6">
            <div className="w-10 h-10 border-3 border-white/10 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Verifying reset link...</h1>
            <p className="text-slate-500 text-sm mb-6">
              If this takes too long, the link may have expired.
            </p>
            <Link
              to="/login"
              className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold transition-colors"
            >
              ← Back to Login
            </Link>
          </div>
        ) : (
          /* ── Reset Form ── */
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-white">Set new password</h1>
              <p className="text-slate-500 text-sm mt-1">
                Enter your new password below. Must be at least 6 characters.
              </p>
            </div>

            <div className="space-y-4" onKeyDown={handleKeyDown}>

              {/* New Password */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition-all duration-200 mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password →'
                )}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}