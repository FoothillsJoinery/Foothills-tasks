import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

function durationStr(startStr, endStr) {
  const start = new Date(startStr)
  const end = endStr ? new Date(endStr) : new Date()
  const ms = end - start
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days === 0) return '< 1 day'
  return `${days} day${days === 1 ? '' : 's'}`
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReportPage() {
  const router = useRouter()
  const { id } = router.query
  const [job, setJob] = useState(null)
  const [needs, setNeeds] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function load() {
      const [jobRes, taskRes, needRes] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('tasks').select('id, title').eq('job_id', id),
        supabase.from('needs').select('*').eq('job_id', id).order('created_at')
      ])
      if (jobRes.data) setJob(jobRes.data)
      setTasks(taskRes.data || [])
      setNeeds(needRes.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#888' }}>Loading...</div>
  if (!job) return <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#888' }}>Job not found.</div>

  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t.title]))
  const open = needs.filter(n => !n.resolved_at)
  const resolved = needs.filter(n => n.resolved_at)

  const categoryOrder = [
    'Decision/answer needed from client',
    'Material not supplied by Foothills Joinery',
    'Prerequisite task — Foothills Joinery',
    'Prerequisite task — other contractor',
  ]

  function NeedRow({ need }) {
    const isOpen = !need.resolved_at
    return (
      <tr style={{ borderBottom: '1px solid #e8e6df', pageBreakInside: 'avoid' }}>
        <td style={td}>{taskMap[need.task_id] || '—'}</td>
        <td style={td}>{need.text}</td>
        <td style={td}>{need.category || '—'}</td>
        <td style={td}>{need.requested_by}</td>
        <td style={td}>{fmtDate(need.created_at)}</td>
        <td style={td}>{fmtDate(need.resolved_at)}</td>
        <td style={{ ...td, color: isOpen ? '#993c1d' : '#1a8a4a', fontWeight: 600 }}>
          {isOpen ? `Open (${durationStr(need.created_at, null)})` : durationStr(need.created_at, need.resolved_at)}
        </td>
        <td style={td}>{need.answer || '—'}</td>
      </tr>
    )
  }

  const td = { padding: '8px 10px', fontSize: 12, verticalAlign: 'top', color: '#1a1a18' }
  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 600, textAlign: 'left', color: '#5f5e5a', borderBottom: '2px solid #1a1a18', whiteSpace: 'nowrap' }

  return (
    <>
      <Head>
        <title>Needs Report — {job.name}</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            table { page-break-inside: auto; }
          }
        `}</style>
      </Head>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif', color: '#1a1a18' }}>
        <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => router.back()}
            style={{ padding: '8px 14px', background: 'none', border: '1px solid #e8e6df', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            ← Back
          </button>
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 14px', background: '#1a1a18', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Print / Save as PDF
          </button>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Needs Report
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{job.name}</h1>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 4 }}>
            Generated {fmtDate(new Date().toISOString())} · {needs.length} total need{needs.length !== 1 ? 's' : ''} · {open.length} open · {resolved.length} resolved
          </div>
        </div>

        {needs.length === 0 && (
          <div style={{ fontSize: 14, color: '#888780' }}>No needs logged for this job.</div>
        )}

        {open.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#993c1d', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open ({open.length})
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Task</th>
                    <th style={th}>What's needed</th>
                    <th style={th}>Category</th>
                    <th style={th}>Logged by</th>
                    <th style={th}>Logged</th>
                    <th style={th}>Resolved</th>
                    <th style={th}>Time open</th>
                    <th style={th}>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map(n => <NeedRow key={n.id} need={n} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resolved.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a8a4a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resolved ({resolved.length})
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Task</th>
                    <th style={th}>What's needed</th>
                    <th style={th}>Category</th>
                    <th style={th}>Logged by</th>
                    <th style={th}>Logged</th>
                    <th style={th}>Resolved</th>
                    <th style={th}>Time to resolve</th>
                    <th style={th}>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map(n => <NeedRow key={n.id} need={n} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {needs.length > 0 && (
          <div style={{ marginTop: 40, pageBreakBefore: 'always' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5f5e5a' }}>
              By category
            </h2>
            <table style={{ width: 'auto', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Category</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right', color: '#993c1d' }}>Open</th>
                  <th style={{ ...th, textAlign: 'right', color: '#1a8a4a' }}>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {categoryOrder.map(cat => {
                  const catNeeds = needs.filter(n => n.category === cat)
                  if (catNeeds.length === 0) return null
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid #e8e6df' }}>
                      <td style={td}>{cat}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{catNeeds.length}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#993c1d' }}>{catNeeds.filter(n => !n.resolved_at).length}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#1a8a4a' }}>{catNeeds.filter(n => n.resolved_at).length}</td>
                    </tr>
                  )
                })}
                {needs.filter(n => !n.category).length > 0 && (
                  <tr style={{ borderBottom: '1px solid #e8e6df' }}>
                    <td style={{ ...td, color: '#888780' }}>Uncategorized</td>
                    <td style={{ ...td, textAlign: 'right' }}>{needs.filter(n => !n.category).length}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#993c1d' }}>{needs.filter(n => !n.category && !n.resolved_at).length}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#1a8a4a' }}>{needs.filter(n => !n.category && n.resolved_at).length}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
