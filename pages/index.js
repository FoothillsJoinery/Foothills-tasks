import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [newJobClientEmail, setNewJobClientEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      loadJobs()
    })
  }, [])

  async function loadJobs() {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  async function createJob() {
    if (!newJobName.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('jobs').insert([{
      name: newJobName.trim(),
      client_email: newJobClientEmail.trim() || null,
      created_by: user.email
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setJobs(prev => [data, ...prev])
      setNewJobName('')
      setNewJobClientEmail('')
      setShowNewJob(false)
      showToast('Job created')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  function ts(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return (
    <div className="login-wrap">
      <div style={{ color: '#888780', fontSize: 14 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <Head>
        <title>Foothills Joinery Tasks</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app">
        <div className="topbar">
          <span className="topbar-title">Foothills Joinery</span>
          <button className="action-btn" onClick={signOut} style={{ marginLeft: 'auto' }}>Sign out</button>
        </div>

        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Jobs
          </div>

          {jobs.length === 0 && !loading && (
            <div className="empty">No jobs yet. Create your first one below.</div>
          )}

          {jobs.map(job => {
            const taskCount = job.task_count || 0
            return (
              <div key={job.id} className="job-row" onClick={() => router.push(`/job/${job.id}`)}>
                <div>
                  <div className="job-name">{job.name}</div>
                  <div className="job-meta">Created {ts(job.created_at)}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            )
          })}

          <button className="dashed-btn" onClick={() => setShowNewJob(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            New job
          </button>
        </div>

        {showNewJob && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowNewJob(false) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setShowNewJob(false)}>×</button>
              <div className="sheet-title">New job</div>
              <div className="form-group">
                <label className="form-label">Job name / address</label>
                <input
                  type="text"
                  placeholder="e.g. 1420 Maple Ave — Kitchen Remodel"
                  value={newJobName}
                  onChange={e => setNewJobName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createJob()}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Client email (for need notifications)</label>
                <input
                  type="email"
                  placeholder="e.g. client@example.com"
                  value={newJobClientEmail}
                  onChange={e => setNewJobClientEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createJob()}
                />
              </div>
              <button className="submit-btn" onClick={createJob} disabled={saving}>
                {saving ? 'Creating...' : 'Create job'}
              </button>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}
