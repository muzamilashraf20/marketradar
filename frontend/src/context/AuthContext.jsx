import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const TRIAL_DAYS = 7

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch user plan from backend
  const fetchPlan = async (token) => {
    try {
      const res = await fetch(`${API_URL}/api/user/plan`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setPlan(data.plan)
      }
    } catch (e) {
      console.error('Failed to fetch plan')
    }
  }

  // Build user payload from Supabase session
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
        // 1. Check existing Supabase session (handles OAuth redirect too)
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
          if (payload.token) fetchPlan(payload.token)
        } else {
          // 2. Fallback: check localStorage (for existing email/password users)
          const stored = localStorage.getItem('bf_user')
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              setUser(parsed)
              if (parsed.token) fetchPlan(parsed.token)
            } catch {
              localStorage.removeItem('bf_user')
            }
          }
        }
      } catch (err) {
        console.error('Auth init error:', err)
      }

      setLoading(false)

      // 3. Listen for auth changes (OAuth redirects, sign out, token refresh)
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const payload = buildUserFromSession(session)
          setUser(payload)
          localStorage.setItem('bf_user', JSON.stringify(payload))
          if (payload.token) fetchPlan(payload.token)
        }

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setPlan(null)
          localStorage.removeItem('bf_user')
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

  // Email/password login (existing backend flow)
  const login = (userData, session) => {
    const payload = { ...userData, token: session?.access_token, createdAt: session?.user?.created_at || new Date().toISOString() }
    localStorage.setItem('bf_user', JSON.stringify(payload))
    setUser(payload)
    if (payload.token) fetchPlan(payload.token)
  }

  // Google OAuth login
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
    setUser(null)
    setPlan(null)
    // Sign out from Supabase too (clears OAuth session)
    await supabase.auth.signOut().catch(() => {})
  }

  // Trial calculation
  const isActualPro = plan?.tier === 'pro'
  const trialDaysLeft = user?.createdAt
    ? Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000))
    : 0
  const isTrialActive = trialDaysLeft > 0 && !isActualPro
  const trialExpired = user && trialDaysLeft === 0 && !isActualPro

  // isPro = has full access (either paid OR in trial)
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