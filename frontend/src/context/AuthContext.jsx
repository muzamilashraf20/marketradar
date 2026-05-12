import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user session exists in localStorage
    const stored = localStorage.getItem('bf_user')
    if (stored) {
      try {
        setUser(JSON.parse(stored))
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
  }

  const logout = () => {
    localStorage.removeItem('bf_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}