import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function CrewPage() {
  const router = useRouter()
  const [phase, setPhase] = useState('loading') // loading | login | sent | home
  const [email, setEmail] = useState('')
  const [carpenter, setCarpenter] = useState(null)
  const [jobs, setJobs] = useState([])
  const [taskCounts, setTaskCounts] = useState({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleSession(session)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleSession(session)
      else setPhase('login')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSession(session) {
    const { data: carp } = await supabase
      .from('carpenters')
      .select('*')
      .eq('email', session.user.email)
      .eq('active', true)
      .single()
    if (!carp) {
      await supabase.auth.signOut()
      setError('No active crew account found for this email. Contact Foothills Joinery.')
      setPhase('login')
      return
    }
    setCarpenter(carp)

    const { data: access } = await supabase
      .from('job_access')
      .select('job_id, jobs(id, name, created_at)')
      .eq('carpenter_id', carp.id)
      .is('revoked_at', null)
    const activeJobs = (access || []).map(a => a.jobs).filter(Boolean)
    setJobs(activeJobs)

    if (activeJobs.length > 0) {
      const jobIds = activeJobs.map(j => j.id)
      const { data: tasks } = await supabase
        .from('tasks')
        .select('job_id, status')
        .in('job_id', jobIds)
        .neq('status', 'done')
      const counts = {}
      for (const t of tasks || []) {
        if (!counts[t.job_id]) counts[t.job_id] = { ready: 0, blocked: 0 }
        counts[t.job_id][t.status] = (counts[t.job_id][t.status] || 0) + 1
      }
      setTaskCounts(counts)
    }

    setPhase('home')
  }

  async function sendMagicLink() {
    if (!email.trim()) return
    setSending(true)
    setError(null)
    const normalized = email.trim().toLowerCase()
    const { data: carp } = await supabase
      .from('carpenters')
      .select('id')
      .eq('email', normalized)
      .eq('active', true)
      .single()
    if (!carp) {
      setError('No crew account found for that email. Contact Foothills Joinery.')
      setSending(false)
      return
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: window.location.origin + '/crew' }
    })
    setSending(false)
    if (otpError) { setError(otpError.message); return }
    setPhase('sent')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setCarpenter(null)
    setJobs([])
    setEmail('')
    setError(null)
    setPhase('login')
  }

  function openJob(jobId) {
    router.push('/job/' + jobId)
  }

  if (phase === 'loading') return (
    <div className="login-wrap"><div style={{ color: '#888780', fontSize: 14 }}>Loading...</div></div>
  )

  if (phase === 'login' || phase === 'sent') return (
    <>
      <Head>
        <title>Crew — Foothills Joinery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">Foothills Joinery</div>
          {phase === 'sent' ? (
            <>
              <div className="login-sub">Check your email</div>
              <p style={{ fontSize: 13, color: '#5f5e5a', lineHeight: 1.6, marginBottom: 20 }}>
                A sign-in link was sent to <strong>{email}</strong>. Tap it to open your jobs. You won't need to do this again on this device.
              </p>
              <button className="submit-btn" onClick={() => setPhase('login')} style={{ background: 'none', color: '#5f5e5a', border: '1px solid #d3d1c7' }}>
                Use a different email
              </button>
            </>
          ) : (
            <>
              <div className="login-sub">Crew sign-in</div>
              {error && <div className="error-msg">{error}</div>}
              <div className="form-group">
                <label className="form-label">Your email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMagicLink()}
                  autoFocus
                />
              </div>
              <button className="submit-btn" onClick={sendMagicLink} disabled={sending || !email.trim()}>
                {sending ? 'Sending...' : 'Send sign-in link'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      <Head>
        <title>My Jobs — Foothills Joinery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app">
        <div className="topbar">
          <span className="topbar-title">My Jobs</span>
          <span className="topbar-role">{carpenter?.name}</span>
          <button className="action-btn" onClick={signOut} style={{ marginLeft: 8, fontSize: 12, padding: '4px 10px' }}>Sign out</button>
        </div>

        <div style={{ padding: '16px' }}>
          {jobs.length === 0 ? (
            <div className="empty">No active jobs yet. Your foreman will add you when there's work to see.</div>
          ) : (
            jobs.map(job => {
              const counts = taskCounts[job.id] || {}
              const total = (counts.ready || 0) + (counts.blocked || 0)
              return (
                <div key={job.id} className="job-row" onClick={() => openJob(job.id)}>
                  <div>
                    <div className="job-name">{job.name}</div>
                    <div className="job-meta" style={{ marginTop: 4 }}>
                      {total === 0 ? 'No open tasks' : (
                        <>
                          {counts.ready > 0 && <span style={{ color: '#3b6d11', marginRight: 8 }}>{counts.ready} ready</span>}
                          {counts.blocked > 0 && <span style={{ color: '#993c1d' }}>{counts.blocked} blocked</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
