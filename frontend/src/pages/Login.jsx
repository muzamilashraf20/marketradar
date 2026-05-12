import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const endpoint = isLogin ? '/api/login' : '/api/register'
      const body = isLogin ? { email, password } : { email, password, name }

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.success) {
        login(data.user, data.session)
        navigate('/')
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch (e) {
      setError('Server error — make sure backend is running')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080B10',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Syne', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(0,212,170,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: '420px',
        background: '#0E1218',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '2.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '6px' }}>
            <span style={{ color: '#00D4AA' }}>Bias</span>
            <span style={{ color: '#8A9BB0' }}>Forge</span>
            <span style={{ color: '#00D4AA', fontSize: '14px' }}>.ai</span>
          </div>
          <div style={{ fontSize: '13px', color: '#4A5568' }}>
            {isLogin ? 'Welcome back — sign in to continue' : 'Create your account'}
          </div>
        </div>

        <div style={{
          display: 'flex', background: '#141920', borderRadius: '10px',
          padding: '4px', marginBottom: '1.5rem',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {['Sign In', 'Sign Up'].map((tab, i) => (
            <button key={tab} onClick={() => { setIsLogin(i === 0); setError('') }} style={{
              flex: 1, padding: '8px', borderRadius: '7px', border: 'none',
              background: (i === 0) === isLogin ? '#1E2733' : 'transparent',
              color: (i === 0) === isLogin ? '#F0F4F8' : '#4A5568',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!isLogin && (
            <div>
              <label style={{ fontSize: '11px', color: '#8A9BB0', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>FULL NAME</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: '#141920', color: '#F0F4F8', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: "'Syne', sans-serif" }}
                onFocus={e => e.target.style.borderColor = '#00D4AA'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', color: '#8A9BB0', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: '#141920', color: '#F0F4F8', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: "'Syne', sans-serif" }}
              onFocus={e => e.target.style.borderColor = '#00D4AA'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#8A9BB0', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: '#141920', color: '#F0F4F8', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: "'Syne', sans-serif" }}
              onFocus={e => e.target.style.borderColor = '#00D4AA'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.25)', color: '#FF4D6A', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{
            width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
            background: '#00D4AA', color: '#000', fontSize: '14px', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            marginTop: '4px', transition: 'all 0.2s', fontFamily: "'Syne', sans-serif",
          }}>
            {loading ? 'Please wait...' : isLogin ? 'Sign In →' : 'Create Account →'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '12px', color: '#4A5568' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setIsLogin(!isLogin); setError('') }}
            style={{ color: '#00D4AA', cursor: 'pointer', fontWeight: 600 }}>
            {isLogin ? 'Sign Up' : 'Sign In'}
          </span>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '11px', color: '#2D3748' }}>
          🔒 Secured by Supabase Auth
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}