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

const categoryOrder = [
  'Decision/answer needed from client',
  'Material not supplied by Foothills Joinery',
  'Prerequisite task — Foothills Joinery',
  'Prerequisite task — other contractor',
]

export default function ReportPage() {
  const router = useRouter()
  const { id } = router.query
  const [job, setJob] = useState(null)
  const [needs, setNeeds] = useState([])
  const [tasks, setTasks] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [hiddenCategories, setHiddenCategories] = useState(new Set())
  const [sortMode, setSortMode] = useState('category')
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function saveEditNeed() {
    if (!editForm?.text?.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('needs')
      .update({ text: editForm.text.trim(), category: editForm.category || null })
      .eq('id', editForm.id)
      .select().single()
    setSaving(false)
    if (!error && data) {
      setNeeds(prev => prev.map(n => n.id === data.id ? data : n))
      setEditForm(null)
      showToast('Need updated')
    }
  }

  useEffect(() => {
    if (!id) return
    async function load() {
      const [jobRes, taskRes, needRes, secRes] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('tasks').select('id, title, section_id').eq('job_id', id),
        supabase.from('needs').select('*').eq('job_id', id).order('created_at'),
        supabase.from('sections').select('*').eq('job_id', id)
      ])
      if (jobRes.data) setJob(jobRes.data)
      setTasks(taskRes.data || [])
      setNeeds(needRes.data || [])
      setSections(secRes.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#888' }}>Loading...</div>
  if (!job) return <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#888' }}>Job not found.</div>

  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]))
  const sectionMap = Object.fromEntries(sections.map(s => [s.id, s]))

  function sectionPath(sectionId) {
    if (!sectionId) return null
    const sec = sectionMap[sectionId]
    if (!sec) return null
    if (sec.parent_id) {
      const parent = sectionMap[sec.parent_id]
      return parent ? `${parent.name} › ${sec.name}` : sec.name
    }
    return sec.name
  }

  const presentCategories = categoryOrder.filter(cat => needs.some(n => n.category === cat))
  const hasUncategorized = needs.some(n => !n.category)

  function toggleCategory(cat) {
    setHiddenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  function isVisible(need) {
    const cat = need.category || '__uncategorized__'
    return !hiddenCategories.has(cat)
  }

  function sectionSortKey(need) {
    const task = taskMap[need.task_id]
    if (!task?.section_id) return { parentIdx: Infinity, subIdx: Infinity }
    const sec = sectionMap[task.section_id]
    if (!sec) return { parentIdx: Infinity, subIdx: Infinity }
    const parentId = sec.parent_id || sec.id
    const parentIdx = sections.filter(s => !s.parent_id).findIndex(s => s.id === parentId)
    const subIdx = sec.parent_id ? sections.filter(s => s.parent_id === parentId).findIndex(s => s.id === sec.id) : -1
    return { parentIdx, subIdx }
  }

  function sortNeeds(list) {
    return [...list].sort((a, b) => {
      if (sortMode === 'date') return new Date(a.created_at) - new Date(b.created_at)
      if (sortMode === 'section') {
        const ak = sectionSortKey(a), bk = sectionSortKey(b)
        if (ak.parentIdx !== bk.parentIdx) return ak.parentIdx - bk.parentIdx
        if (ak.subIdx !== bk.subIdx) return ak.subIdx - bk.subIdx
        return new Date(a.created_at) - new Date(b.created_at)
      }
      // category (default)
      const ai = a.category ? categoryOrder.indexOf(a.category) : categoryOrder.length
      const bi = b.category ? categoryOrder.indexOf(b.category) : categoryOrder.length
      if (ai !== bi) return ai - bi
      return new Date(a.created_at) - new Date(b.created_at)
    })
  }

  const filteredNeeds = needs.filter(isVisible)
  const open = sortNeeds(filteredNeeds.filter(n => !n.resolved_at))
  const resolved = sortNeeds(filteredNeeds.filter(n => n.resolved_at))

  function groupHeader(label, colSpan) {
    return (
      <tr key={'grp-' + label}>
        <td colSpan={colSpan} style={{ padding: '10px 10px 4px', fontSize: 11, fontWeight: 700, color: '#5f5e5a', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8f7f4', borderBottom: '1px solid #e8e6df' }}>
          {label}
        </td>
      </tr>
    )
  }

  function NeedsTable({ needs, timeLabel }) {
    const colSpan = 9
    const rows = []
    if (sortMode === 'section') {
      let lastPath = undefined
      needs.forEach(n => {
        const task = taskMap[n.task_id]
        const path = task ? sectionPath(task.section_id) : null
        const label = path || 'No section'
        if (label !== lastPath) {
          rows.push(groupHeader(label, colSpan))
          lastPath = label
        }
        rows.push(<NeedRow key={n.id} need={n} />)
      })
    } else if (sortMode === 'category') {
      let lastCat = undefined
      needs.forEach(n => {
        const cat = n.category || 'Uncategorized'
        if (cat !== lastCat) {
          rows.push(groupHeader(cat, colSpan))
          lastCat = cat
        }
        rows.push(<NeedRow key={n.id} need={n} />)
      })
    } else {
      needs.forEach(n => rows.push(<NeedRow key={n.id} need={n} />))
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {thSort('section', 'Task')}
              <th style={th}>What's needed</th>
              {thSort('category', 'Category')}
              <th style={th}>Logged by</th>
              {thSort('date', 'Logged')}
              <th style={th}>Resolved</th>
              <th style={th}>{timeLabel}</th>
              <th style={th}>Answer</th>
              <th style={th} className="no-print"></th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    )
  }

  function NeedRow({ need }) {
    const isOpen = !need.resolved_at
    return (
      <tr style={{ borderBottom: '1px solid #e8e6df', pageBreakInside: 'avoid' }}>
        <td style={td}>
          {(() => {
            const task = taskMap[need.task_id]
            if (!task) return '—'
            const path = sectionPath(task.section_id)
            return (
              <>
                {path && <div style={{ fontSize: 11, color: '#888780', marginBottom: 2 }}>{path}</div>}
                {task.title}
              </>
            )
          })()}
        </td>
        <td style={td}>{need.text}</td>
        <td style={td}>{need.category || '—'}</td>
        <td style={td}>{need.requested_by}</td>
        <td style={td}>{fmtDate(need.created_at)}</td>
        <td style={td}>{fmtDate(need.resolved_at)}</td>
        <td style={{ ...td, color: isOpen ? '#993c1d' : '#1a8a4a', fontWeight: 600 }}>
          {isOpen ? `Open (${durationStr(need.created_at, null)})` : durationStr(need.created_at, need.resolved_at)}
        </td>
        <td style={td}>{need.answer || '—'}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }} className="no-print">
          <button
            onClick={() => setEditForm({ id: need.id, text: need.text, category: need.category || '' })}
            style={{ padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: 'none', border: '1px solid #e8e6df', borderRadius: 4, color: '#5f5e5a', fontFamily: 'inherit' }}
          >
            Edit
          </button>
        </td>
      </tr>
    )
  }

  const td = { padding: '8px 10px', fontSize: 12, verticalAlign: 'top', color: '#1a1a18' }
  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 600, textAlign: 'left', color: '#5f5e5a', borderBottom: '2px solid #1a1a18', whiteSpace: 'nowrap' }
  const thSort = (mode, label) => (
    <th
      style={{ ...th, cursor: 'pointer', userSelect: 'none', color: sortMode === mode ? '#1a1a18' : '#5f5e5a' }}
      onClick={() => setSortMode(mode)}
    >
      {label}{sortMode === mode ? ' ↑' : ''}
    </th>
  )

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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Needs Report
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{job.name}</h1>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 4 }}>
            Generated {fmtDate(new Date().toISOString())} · {filteredNeeds.length} of {needs.length} need{needs.length !== 1 ? 's' : ''} · {open.length} open · {resolved.length} resolved
          </div>
        </div>

        {(presentCategories.length > 0 || hasUncategorized) && (
          <div className="no-print" style={{ marginBottom: 28, padding: '14px 16px', background: '#f8f7f4', borderRadius: 8, border: '1px solid #e8e6df' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Filter by category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {presentCategories.map(cat => {
                const hidden = hiddenCategories.has(cat)
                const isFJ = cat === 'Prerequisite task — Foothills Joinery'
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      cursor: 'pointer',
                      border: '1px solid ' + (hidden ? '#e8e6df' : isFJ ? '#c4966a' : '#b4b2a9'),
                      background: hidden ? '#fff' : isFJ ? '#fdf0e6' : '#eeecea',
                      color: hidden ? '#b4b2a9' : '#1a1a18',
                      textDecoration: hidden ? 'line-through' : 'none',
                      fontFamily: 'inherit'
                    }}
                  >
                    {cat}
                  </button>
                )
              })}
              {hasUncategorized && (
                <button
                  onClick={() => toggleCategory('__uncategorized__')}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: '1px solid ' + (hiddenCategories.has('__uncategorized__') ? '#e8e6df' : '#b4b2a9'),
                    background: hiddenCategories.has('__uncategorized__') ? '#fff' : '#eeecea',
                    color: hiddenCategories.has('__uncategorized__') ? '#b4b2a9' : '#1a1a18',
                    textDecoration: hiddenCategories.has('__uncategorized__') ? 'line-through' : 'none',
                    fontFamily: 'inherit'
                  }}
                >
                  Uncategorized
                </button>
              )}
            </div>
          </div>
        )}

        {needs.length === 0 && (
          <div style={{ fontSize: 14, color: '#888780' }}>No needs logged for this job.</div>
        )}

        {open.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#993c1d', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open ({open.length})
            </h2>
            <NeedsTable needs={open} timeLabel="Time open" />
          </div>
        )}

        {resolved.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a8a4a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resolved ({resolved.length})
            </h2>
            <NeedsTable needs={resolved} timeLabel="Time to resolve" />
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

      {editForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditForm(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 500 }}>
            <button onClick={() => setEditForm(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888780' }}>×</button>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Edit need</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: '#5f5e5a' }}>What's needed</label>
              <textarea
                autoFocus
                value={editForm.text}
                onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e8e6df', borderRadius: 8, fontFamily: 'inherit', minHeight: 80, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: '#5f5e5a' }}>Category</label>
              <select
                value={editForm.category}
                onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e8e6df', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }}
              >
                <option value="">— Select a category —</option>
                <option>Decision/answer needed from client</option>
                <option>Material not supplied by Foothills Joinery</option>
                <option>Prerequisite task — Foothills Joinery</option>
                <option>Prerequisite task — other contractor</option>
              </select>
            </div>
            <button
              onClick={saveEditNeed}
              disabled={saving}
              style={{ width: '100%', padding: 13, background: '#1a1a18', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1a18', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </>
  )
}
