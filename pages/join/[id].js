import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

export default function JoinPage() {
  const router = useRouter()
  const { id, role } = router.query
  const [job, setJob] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('jobs').select('*').eq('id', id).single().then(({ data }) => {
      setJob(data)
      setLoading(false)
    })
  }, [id])

  function join() {
    if (!name.trim()) return
    setJoining(true)
    localStorage.setItem('guestName_' + id, name.trim())
    localStorage.setItem('guestRole_' + id, role || 'carpenter')
    router.push('/job/' + id)
  }

  const roleLabel = role === 'client' ? 'Client / Site Super' : 'Carpenter'
  const roleColor = role === 'client' ? '#854f0b' : '#185fa5'
  const roleBg = role === 'client' ? '#faeeda' : '#e6f1fb'

  if (loading) return (
    <div className="login-wrap"><div style={{ color: '#888780', fontSize: 14 }}>Loading...</div></div>
  )

  if (!job) return (
    <div className="login-wrap"><div style={{ color: '#993c1d', fontSize: 14 }}>Job not found.</div></div>
  )

  return (
    <>
      <Head>
        <title>Join — Foothills Joinery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">Foothills Joinery</div>
          <div className="login-sub">You've been invited to view a job</div>

          <div style={{ background: '#f5f4f0', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#888780', marginBottom: 2 }}>Job</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a18' }}>{job.name}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: roleBg, color: roleColor }}>{roleLabel}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Your name</label>
            <input
              type="text"
              placeholder={role === 'client' ? 'e.g. Riverside Construction' : 'e.g. Mike'}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && join()}
              autoFocus
            />
          </div>
          <button className="submit-btn" onClick={join} disabled={joining || !name.trim()}>
            {joining ? 'Joining...' : 'View job'}
          </button>
        </div>
      </div>
    </>
  )
}
