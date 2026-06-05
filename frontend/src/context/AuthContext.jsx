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
  const [planLoaded, setPlanLoaded] = useState(false)

  // Always gets fresh token from Supabase before fetching plan
  const fetchPlan = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setPlanLoaded(true)
        return
      }
      const res = await fetch(`${API_URL}/api/user/plan`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await res.json()
      if (data.success) {
        setPlan(data.plan)
        localStorage.setItem('bf_plan', JSON.stringify(data.plan))
      }
    } catch (e) {
      console.error('Failed to fetch plan')
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

  useEffect(() => {
    let subscription

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
          fetchPlan()
        } else {
          const stored = localStorage.getItem('bf_user')
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              setUser(parsed)
              fetchPlan()
            } catch {
              localStorage.removeItem('bf_user')
              localStorage.removeItem('bf_plan')
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
          fetchPlan()
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
          fetchPlan()
        }
      })

      subscription = data.subscription
    }

    initAuth()

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const login = (userData, session) => {
    const payload = { ...userData, token: session?.access_token, createdAt: session?.user?.created_at || new Date().toISOString() }
    localStorage.setItem('bf_user', JSON.stringify(payload))
    setUser(payload)
    fetchPlan()
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
      user, plan, isPro, isActualPro, isTrialActive, trialDaysLeft, trialExpired,
      login, loginWithGoogle, logout, loading, fetchPlan
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}