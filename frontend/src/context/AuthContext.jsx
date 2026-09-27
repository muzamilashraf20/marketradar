import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ACCESS_DENIED_EVENT } from '../lib/authFetch'

const AuthContext = createContext(null)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState(() => {
    try { const p = localStorage.getItem('bf_plan'); return p ? JSON.parse(p) : null } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [planLoaded, setPlanLoaded] = useState(() => {
    return !!localStorage.getItem('bf_plan')
  })

  // The server decides access: /api/user/plan returns plan.pro, the same rule every Pro route
  // enforces. The cached plan is painted only until the server answers, never trusted on its own.
  const fetchPlan = async (userId) => {
    let cached = null
    try { cached = JSON.parse(localStorage.getItem('bf_plan') || 'null') } catch { cached = null }
    try {
      // 1. Paint the cached plan straight away, so a paying user doesn't see a lock flash
      if (cached) {
        setPlan(cached)
        setPlanLoaded(true)
      }

      // 2. Ask the backend for the verdict
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const res = await fetch(`${API_URL}/api/user/plan`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        if (res.ok) {
          const d = await res.json()
          if (d.success && d.plan) {
            setPlan(d.plan)
            localStorage.setItem('bf_plan', JSON.stringify(d.plan))
            return
          }
        }
      }

      // 3. Backend unreachable: keep the cache if there is one, else read the row directly
      //    (RLS lets a signed-in user read their own row). Not cached, so the server's
      //    answer replaces it next time.
      if (cached) return
      const uid = userId || user?.id
      if (uid) {
        const { data } = await supabase
          .from('user_plans')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle()
        if (data) setPlan(data)
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

  // A Pro route refused us (see authFetch.js), so the plan on screen is stale. Ask the server again;
  // a lapsed plan comes back pro:false and DashboardLayout shows the lock wall. A 401 with no session
  // left means the login itself is gone, so sign out rather than show an app that cannot load.
  // Throttled: one refused dashboard load fires several requests at once.
  useEffect(() => {
    let last = 0
    const onDenied = async (e) => {
      if (Date.now() - last < 30 * 1000) return
      last = Date.now()
      if (e.detail?.code === 'login_required') {
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
        if (!session) { await logout(); return }
      }
      fetchPlan()
    }
    window.addEventListener(ACCESS_DENIED_EVENT, onDenied)
    return () => window.removeEventListener(ACCESS_DENIED_EVENT, onDenied)
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

  // No free trial — BiasForge is paid-only. Access requires an active Pro plan.
  // plan.pro is the server's verdict (expiry and admins included). The tier check covers only a plan
  // that did not come from the server — an old cache, or the direct read while the backend is down —
  // and is replaced as soon as /api/user/plan answers.
  const isActualPro = typeof plan?.pro === 'boolean' ? plan.pro : plan?.tier === 'pro'
  const trialDaysLeft = 0
  const isTrialActive = false
  // "Locked": a signed-in user whose plan has resolved and is not Pro → must subscribe.
  // (Kept the trialExpired name so downstream gating/lock-wall logic stays unchanged.)
  const trialExpired = !!(user && planLoaded && !isActualPro)

  const isPro = isActualPro

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