import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function signIn() {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/')
  }

  return (
    <>
      <Head>
        <title>Foothills Joinery — Sign In</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">Foothills Joinery</div>
          <div className="login-sub">Task Tracker — Admin Sign In</div>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="text"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && signIn()}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && signIn()}
            />
          </div>
          <button className="submit-btn" onClick={signIn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </div>
    </>
  )
}
