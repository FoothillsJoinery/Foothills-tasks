import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function CarpenterAdmin() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [carpenters, setCarpenters] = useState([])
  const [jobs, setJobs] = useState([])
  const [jobAccess, setJobAccess] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', email: '' })
  const [grantCarpId, setGrantCarpId] = useState(null)
  const [grantJobId, setGrantJobId] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data: carp } = await supabase.from('carpenters').select('id').eq('email', session.user.email).single()
      if (carp) { router.push('/crew'); return }
      loadAll()
    })
  }, [])

  async function loadAll() {
    const [carpRes, jobRes, accessRes] = await Promise.all([
      supabase.from('carpenters').select('*').order('name'),
      supabase.from('jobs').select('id, name').order('created_at', { ascending: false }),
      supabase.from('job_access').select('*').not('carpenter_id', 'is', null).order('joined_at', { ascending: false })
    ])
    setCarpenters(carpRes.data || [])
    setJobs(jobRes.data || [])
    setJobAccess(accessRes.data || [])
    setLoading(false)
  }

  async function addCarpenter() {
    if (!form.name.trim() || !form.email.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('carpenters').insert([{
      name: form.name.trim(),
      email: form.email.trim().toLowerCase()
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setCarpenters(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setForm({ name: '', email: '' })
      setModal(null)
      showToast(data.name + ' added to roster')
    } else {
      showToast(error?.message || 'Error — email may already be in use')
    }
  }

  async function toggleActive(carp) {
    const { data } = await supabase.from('carpenters').update({ active: !carp.active }).eq('id', carp.id).select().single()
    if (data) setCarpenters(prev => prev.map(c => c.id === carp.id ? data : c))
    showToast(data?.active ? carp.name + ' reactivated' : carp.name + ' deactivated')
  }

  async function openGrant(carpId) {
    setGrantCarpId(carpId)
    setGrantJobId('')
    setModal('grant')
  }

  async function grantAccess() {
    if (!grantCarpId || !grantJobId) return
    const existing = jobAccess.find(a => a.carpenter_id === grantCarpId && a.job_id === grantJobId && !a.revoked_at)
    if (existing) { showToast('Already has access to this job'); setModal(null); return }
    setSaving(true)
    const carp = carpenters.find(c => c.id === grantCarpId)
    const job = jobs.find(j => j.id === grantJobId)
    const { data, error } = await supabase.from('job_access').insert([{
      job_id: grantJobId,
      carpenter_id: grantCarpId,
      name: carp?.name,
      role: 'carpenter'
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setJobAccess(prev => [data, ...prev])
      setModal(null)
      showToast(carp?.name + ' added to ' + job?.name)
    }
  }

  async function revokeAccess(accessId) {
    await supabase.from('job_access').update({ revoked_at: new Date().toISOString() }).eq('id', accessId)
    setJobAccess(prev => prev.map(a => a.id === accessId ? { ...a, revoked_at: new Date().toISOString() } : a))
  }

  async function restoreAccess(accessId) {
    await supabase.from('job_access').update({ revoked_at: null }).eq('id', accessId)
    setJobAccess(prev => prev.map(a => a.id === accessId ? { ...a, revoked_at: null } : a))
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function ts(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return (
    <div className="login-wrap"><div style={{ color: '#888780', fontSize: 14 }}>Loading...</div></div>
  )

  return (
    <>
      <Head>
        <title>Carpenters — Foothills Joinery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app">
        <div className="topbar">
          <button className="back-btn" onClick={() => router.push('/')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Jobs
          </button>
          <span className="topbar-title">Carpenters</span>
          <button
            className="action-bar-btn action-bar-btn-primary"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => { setForm({ name: '', email: '' }); setModal('add') }}
          >
            + Add
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          {carpenters.length === 0 ? (
            <div className="empty">No carpenters yet. Add someone to get started.</div>
          ) : (
            carpenters.map(carp => {
              const carpAccess = jobAccess.filter(a => a.carpenter_id === carp.id)
              const activeCount = carpAccess.filter(a => !a.revoked_at).length
              const isExpanded = expanded[carp.id]
              return (
                <div key={carp.id} className="card" style={{ marginBottom: 10 }}>
                  <div
                    className="card-header"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpanded(prev => ({ ...prev, [carp.id]: !prev[carp.id] }))}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="task-title" style={{ opacity: carp.active ? 1 : 0.45 }}>{carp.name}</div>
                      <div className="task-meta">{carp.email} · {activeCount} active job{activeCount !== 1 ? 's' : ''}</div>
                    </div>
                    <span className={`badge ${carp.active ? 'badge-ready' : 'badge-done'}`}>
                      {carp.active ? 'Active' : 'Inactive'}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="2" style={{ marginLeft: 6, flexShrink: 0 }}>
                      {isExpanded ? <path d="M6 9l6 6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
                    </svg>
                  </div>

                  {isExpanded && (
                    <div className="card-body">
                      <div className="task-actions" style={{ marginTop: 12 }}>
                        <button
                          className="action-btn"
                          onClick={() => openGrant(carp.id)}
                          disabled={!carp.active}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          Add to job
                        </button>
                        <button
                          className={`action-btn ${carp.active ? 'action-btn-delete' : ''}`}
                          onClick={() => toggleActive(carp)}
                        >
                          {carp.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>

                      {carpAccess.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#b4b2a9', padding: '12px 0 4px' }}>Not assigned to any jobs yet.</div>
                      ) : (
                        <>
                          <div className="needs-label" style={{ marginTop: 14 }}>Job access</div>
                          {carpAccess.map(a => {
                            const job = jobs.find(j => j.id === a.job_id)
                            const isRevoked = !!a.revoked_at
                            return (
                              <div key={a.id} className="need-row" style={{ opacity: isRevoked ? 0.45 : 1 }}>
                                <div style={{ flex: 1 }}>
                                  <div className="need-text" style={{ textDecoration: isRevoked ? 'line-through' : 'none' }}>
                                    {job?.name || '(unknown job)'}
                                  </div>
                                  <div className="need-meta">
                                    {isRevoked ? 'Access revoked' : 'Granted ' + (a.joined_at ? ts(a.joined_at) : '')}
                                  </div>
                                </div>
                                <button
                                  className="resolve-btn"
                                  onClick={() => isRevoked ? restoreAccess(a.id) : revokeAccess(a.id)}
                                  style={isRevoked ? {} : { color: '#993c1d', borderColor: '#f5c9bb' }}
                                >
                                  {isRevoked ? 'Restore' : 'Revoke'}
                                </button>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {modal === 'add' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Add carpenter</div>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mike"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  placeholder="mike@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addCarpenter()}
                />
              </div>
              <p style={{ fontSize: 12, color: '#888780', marginBottom: 14, lineHeight: 1.5 }}>
                They'll sign in at /crew using this email — a magic link gets sent to their inbox.
              </p>
              <button className="submit-btn" onClick={addCarpenter} disabled={saving || !form.name.trim() || !form.email.trim()}>
                {saving ? 'Adding...' : 'Add to roster'}
              </button>
            </div>
          </div>
        )}

        {modal === 'grant' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Add to job</div>
              <p style={{ fontSize: 13, color: '#5f5e5a', marginBottom: 14 }}>
                {carpenters.find(c => c.id === grantCarpId)?.name} will see this job the next time they open /crew.
              </p>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select value={grantJobId} onChange={e => setGrantJobId(e.target.value)} autoFocus>
                  <option value="">— Select a job —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <button className="submit-btn" onClick={grantAccess} disabled={saving || !grantJobId}>
                {saving ? 'Granting...' : 'Grant access'}
              </button>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}
