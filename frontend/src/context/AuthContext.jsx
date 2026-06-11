import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const TRIAL_DAYS = 7

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState(() => {
    try { const p = localStorage.getItem('bf_plan'); return p ? JSON.parse(p) : null } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [planLoaded, setPlanLoaded] = useState(() => {
    return !!localStorage.getItem('bf_plan')
  })

  const fetchPlan = async (userId) => {
    try {
      // 1. Check localStorage cache first
      const cached = localStorage.getItem('bf_plan')
      if (cached) {
        setPlan(JSON.parse(cached))
        setPlanLoaded(true)
        return
      }

      // 2. Try direct Supabase query (no backend needed)
      const uid = userId || user?.id
      if (uid) {
        const { data } = await supabase
          .from('user_plans')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle()

        if (data) {
          setPlan(data)
          localStorage.setItem('bf_plan', JSON.stringify(data))
          setPlanLoaded(true)
          return
        }
      }

      // 3. Fallback: try backend API
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const res = await fetch(`${API_URL}/api/user/plan`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        const d = await res.json()
        if (d.success && d.plan) {
          setPlan(d.plan)
          localStorage.setItem('bf_plan', JSON.stringify(d.plan))
        }
      }
    } catch (e) {
      console.error('Failed to fetch plan:', e.message)
    } finally {
      setPlanLoaded(true)
    }
  }

  const buildUserFromSession = (session) => {
    if (!session?.user) return null
    const u = session.user
    return {
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User',
      avatar: u.user_metadata?.avatar_url || null,
      provider: u.app_metadata?.provider || 'email',
      token: session.access_token,
      createdAt: u.created_at,
    }
  }

  // ── Idle timeout: if the user hasn't opened/used the app for this long, require re-login ──
  // 7 days = daily users never see a login screen; change to e.g. 5*60*60*1000 for 5 hours
  const SESSION_IDLE_LIMIT = 7 * 24 * 60 * 60 * 1000

  useEffect(() => {
    let subscription

    const initAuth = async () => {
      try {
        // Idle check BEFORE restoring any session
        const lastActive = parseInt(localStorage.getItem('bf_last_active') || '0', 10)
        if (lastActive && Date.now() - lastActive > SESSION_IDLE_LIMIT) {
          await supabase.auth.signOut().catch(() => {})
          localStorage.removeItem('bf_user')
          localStorage.removeItem('bf_plan')
          localStorage.setItem('bf_last_active', String(Date.now()))
          setUser(null)
          setLoading(false)
          return
        }
        localStorage.setItem('bf_last_active', String(Date.now()))

        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
          fetchPlan(session.user.id)
        } else {
          const stored = localStorage.getItem('bf_user')
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              setUser(parsed)
              fetchPlan(parsed.id)
            } catch {
              localStorage.removeItem('bf_user')
            }
          }
        }
      } catch (err) {
        console.error('Auth init error:', err)
      }

      setLoading(false)

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
          localStorage.removeItem('bf_plan')
          fetchPlan(session.user.id)
        }

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setPlan(null)
          setPlanLoaded(false)
          localStorage.removeItem('bf_user')
          localStorage.removeItem('bf_plan')
        }

        if (event === 'TOKEN_REFRESHED' && session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
        }
      })

      subscription = data.subscription
    }

    initAuth()

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  // Keep last-activity timestamp fresh while the app is in use (throttled to once a minute)
  useEffect(() => {
    let last = 0
    const mark = () => {
      const now = Date.now()
      if (now - last > 60 * 1000) { last = now; localStorage.setItem('bf_last_active', String(now)) }
    }
    window.addEventListener('click', mark)
    window.addEventListener('keydown', mark)
    document.addEventListener('visibilitychange', mark)
    return () => {
      window.removeEventListener('click', mark)
      window.removeEventListener('keydown', mark)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [])

  const login = (userData, session) => {
    const payload = { ...userData, token: session?.access_token, createdAt: session?.user?.created_at || new Date().toISOString() }
    localStorage.setItem('bf_user', JSON.stringify(payload))
    localStorage.removeItem('bf_plan')
    setUser(payload)
    fetchPlan(payload.id)
    // Hand the session to the supabase client so it auto-refreshes the JWT
    // (same as the OAuth flow — without this, email users' tokens expire after ~1h → "Invalid token")
    if (session?.access_token && session?.refresh_token) {
      supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).catch(() => {})
    }
  }

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (error) throw error
  }

  const logout = async () => {
    localStorage.removeItem('bf_user')
    localStorage.removeItem('bf_plan')
    setUser(null)
    setPlan(null)
    setPlanLoaded(false)
    await supabase.auth.signOut().catch(() => {})
  }

  const isActualPro = plan?.tier === 'pro'
  const trialDaysLeft = user?.createdAt
    ? Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000))
    : 0
  const isTrialActive = trialDaysLeft > 0 && !isActualPro
  const trialExpired = user && planLoaded && trialDaysLeft === 0 && !isActualPro

  const isPro = isActualPro || isTrialActive

  return (
    <AuthContext.Provider value={{
      user, plan, isPro, isActualPro, isTrialActive, trialDaysLeft, trialExpired, planLoaded,
      login, loginWithGoogle, logout, loading, fetchPlan
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}