import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

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

  useEffect(() => {
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
    setLoading(false)
  }, [])

  const login = (userData, session) => {
    const payload = { ...userData, token: session?.access_token }
    localStorage.setItem('bf_user', JSON.stringify(payload))
    setUser(payload)
    if (payload.token) fetchPlan(payload.token)
  }

  const logout = () => {
    localStorage.removeItem('bf_user')
    setUser(null)
    setPlan(null)
  }

  const isPro = plan?.tier === 'pro'

  return (
    <AuthContext.Provider value={{ user, plan, isPro, login, logout, loading, fetchPlan }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}