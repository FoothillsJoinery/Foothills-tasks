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
  const [sortMode, setSortMode] = useState('section')
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [sendModal, setSendModal] = useState(false)
  const [sendRecipients, setSendRecipients] = useState([])
  const [sendNewEmail, setSendNewEmail] = useState('')
  const [sendNote, setSendNote] = useState('')
  const [sending, setSending] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  function openSendModal() {
    const saved = job?.client_email ? job.client_email.split(',').map(e => e.trim()).filter(Boolean) : []
    setSendRecipients(saved)
    setSendNewEmail('')
    setSendNote('')
    setPreviewHtml(null)
    setSendModal(true)
  }

  async function loadPreview() {
    setPreviewLoading(true)
    setPreviewHtml(null)
    try {
      const params = new URLSearchParams({ job_id: id })
      ;[...hiddenCategories].forEach(c => params.append('hidden', c))
      if (sendNote.trim()) params.set('note', sendNote.trim())
      const res = await fetch('/api/preview-report?' + params)
      if (res.ok) setPreviewHtml(await res.text())
    } catch {}
    setPreviewLoading(false)
  }

  async function confirmSend() {
    const finalRecipients = sendNewEmail.trim()
      ? [...new Set([...sendRecipients, sendNewEmail.trim()])]
      : sendRecipients
    if (finalRecipients.length === 0) { showToast('Add at least one recipient'); return }
    setSendRecipients(finalRecipients)
    setSendNewEmail('')
    setSending(true)
    setSendModal(false)
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id, recipients: finalRecipients, hidden_categories: [...hiddenCategories], note: sendNote.trim() })
      })
      if (res.ok) showToast('Report sent')
      else showToast('Failed to send')
    } catch { showToast('Failed to send') }
    setSending(false)
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

  const catColors = {
    'Decision/answer needed from client':      { bg: '#e8f0fe', color: '#1a56db', border: '#c3d2f7' },
    'Material not supplied by Foothills Joinery': { bg: '#fff3e0', color: '#c05e00', border: '#ffcc80' },
    'Prerequisite task — Foothills Joinery':   { bg: '#fdf0e6', color: '#854f0b', border: '#f0d9b5' },
    'Prerequisite task — other contractor':    { bg: '#f3e8ff', color: '#6b21a8', border: '#ddd6fe' },
  }

  function CatBadge({ category }) {
    const c = catColors[category]
    return (
      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c ? c.bg : '#f0efed', color: c ? c.color : '#888780', border: `1px solid ${c ? c.border : '#e8e6df'}`, whiteSpace: 'nowrap' }}>
        {category || 'Uncategorized'}
      </span>
    )
  }

  function NeedLine({ need }) {
    return (
      <div className="need-line" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0efed' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="need-text" style={{ fontSize: 13, color: '#1a1a18' }}>{need.text}</div>
          <div className="need-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <CatBadge category={need.category} />
            <span style={{ fontSize: 11, color: '#b4b2a9' }}>{fmtDate(need.created_at)}</span>
          </div>
        </div>
        <button
          className="no-print"
          onClick={() => setEditForm({ id: need.id, text: need.text, category: need.category || '' })}
          style={{ padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: 'none', border: '1px solid #e8e6df', borderRadius: 4, color: '#5f5e5a', fontFamily: 'inherit', flexShrink: 0 }}
        >
          Edit
        </button>
      </div>
    )
  }

  function TaskBlock({ taskId, needs }) {
    const task = taskMap[taskId]
    if (!task) return null
    const path = sectionPath(task.section_id)
    return (
      <div className="task-card" style={{ marginBottom: 8, border: '1px solid #e8e6df', borderRadius: 8, overflow: 'hidden', pageBreakInside: 'avoid' }}>
        <div className="task-card-header" style={{ padding: '7px 12px', background: '#f8f7f4', borderBottom: '1px solid #e8e6df' }}>
          {path && <div className="section-label" style={{ fontSize: 11, color: '#888780', marginBottom: 1 }}>{path}</div>}
          <div className="task-title" style={{ fontSize: 13, fontWeight: 700, color: '#1a1a18' }}>{task.title}</div>
        </div>
        <div className="task-card-body" style={{ padding: '0 12px' }}>
          {needs.map(n => <NeedLine key={n.id} need={n} />)}
        </div>
      </div>
    )
  }

  function SortBar() {
    const btn = (mode, label) => (
      <button
        key={mode}
        onClick={() => setSortMode(mode)}
        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (sortMode === mode ? '#1a1a18' : '#e8e6df'), background: sortMode === mode ? '#1a1a18' : '#fff', color: sortMode === mode ? '#fff' : '#5f5e5a' }}
      >
        {label}{sortMode === mode ? ' ↑' : ''}
      </button>
    )
    return (
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#888780', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group by</span>
        {btn('section', 'Task / Section')}
        {btn('category', 'Category')}
        {btn('date', 'Date')}
      </div>
    )
  }

  function NeedsList({ needs }) {
    // Group by task, then optionally by section/category
    const groups = []
    if (sortMode === 'section' || sortMode === 'date') {
      // group consecutive needs by task
      const taskGroups = {}
      const taskOrder = []
      needs.forEach(n => {
        if (!taskGroups[n.task_id]) { taskGroups[n.task_id] = []; taskOrder.push(n.task_id) }
        taskGroups[n.task_id].push(n)
      })
      // section mode: wrap in section headers
      if (sortMode === 'section') {
        let lastPath = null
        taskOrder.forEach(tid => {
          const task = taskMap[tid]
          const path = task ? (sectionPath(task.section_id) || 'No section') : 'No section'
          if (path !== lastPath) {
            groups.push(
              <div key={'sh-' + path} style={{ fontSize: 11, fontWeight: 700, color: '#5f5e5a', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '14px 0 6px', borderBottom: '2px solid #1a1a18', marginBottom: 8, position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                {path}
              </div>
            )
            lastPath = path
          }
          groups.push(<TaskBlock key={tid} taskId={tid} needs={taskGroups[tid]} />)
        })
      } else {
        taskOrder.forEach(tid => groups.push(<TaskBlock key={tid} taskId={tid} needs={taskGroups[tid]} />))
      }
    } else {
      // category mode: group by category, then by task within
      categoryOrder.concat(['__uncategorized__']).forEach(cat => {
        const catNeeds = cat === '__uncategorized__'
          ? needs.filter(n => !n.category)
          : needs.filter(n => n.category === cat)
        if (catNeeds.length === 0) return
        const c = catColors[cat]
        const label = cat === '__uncategorized__' ? 'Uncategorized' : cat
        groups.push(
          <div key={'ch-' + cat} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '14px 0 6px', borderBottom: `2px solid ${c ? c.color : '#888780'}`, color: c ? c.color : '#888780', marginBottom: 8, position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
            {label}
          </div>
        )
        const taskGroups = {}
        const taskOrder = []
        catNeeds.forEach(n => {
          if (!taskGroups[n.task_id]) { taskGroups[n.task_id] = []; taskOrder.push(n.task_id) }
          taskGroups[n.task_id].push(n)
        })
        taskOrder.forEach(tid => groups.push(<TaskBlock key={cat + tid} taskId={tid} needs={taskGroups[tid]} />))
      })
    }
    return <div>{groups}</div>
  }


  return (
    <>
      <Head>
        <title>Needs Report — {job.name}</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            table { page-break-inside: auto; }
            .report-wrap { padding: 16px !important; font-size: 11px !important; }
            .task-title { font-size: 11px !important; }
            .need-text { font-size: 11px !important; }
            .section-label { font-size: 10px !important; }
            .need-meta { font-size: 10px !important; margin-top: 2px !important; }
            .task-card { margin-bottom: 4px !important; }
            .task-card-header { padding: 4px 8px !important; }
            .task-card-body { padding: 0 8px !important; }
            .need-line { padding: 3px 0 !important; }
            h1 { font-size: 16px !important; margin-bottom: 4px !important; }
            h2 { font-size: 11px !important; margin-bottom: 6px !important; }
            .report-header { margin-bottom: 12px !important; }
          }
          @media (min-width: 768px) {
            .report-wrap { font-size: 15px !important; }
            .report-wrap .need-text { font-size: 15px !important; }
            .report-wrap .task-title { font-size: 15px !important; }
            .report-wrap .section-label { font-size: 13px !important; }
            .report-wrap .need-meta { font-size: 13px !important; }
          }
        `}</style>
      </Head>
      <div className="report-wrap" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif', color: '#1a1a18' }}>
        <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => router.back()}
            style={{ padding: '8px 14px', background: 'none', border: '1px solid #e8e6df', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            ← Back
          </button>
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 14px', background: 'none', border: '1px solid #e8e6df', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Print / Save as PDF
          </button>
          <button
            onClick={openSendModal}
            disabled={sending}
            style={{ padding: '8px 14px', background: '#1a1a18', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            {sending ? 'Sending…' : 'Send this report'}
          </button>
          {hiddenCategories.size > 0 && (
            <span style={{ fontSize: 12, color: '#854f0b', background: '#fdf0e6', padding: '4px 10px', borderRadius: 20, border: '1px solid #f0d9b5' }}>
              {hiddenCategories.size} categor{hiddenCategories.size === 1 ? 'y' : 'ies'} filtered
            </span>
          )}
        </div>

        <div className="report-header" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Needs Report
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{job.name}</h1>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 4 }}>
            Generated {fmtDate(new Date().toISOString())} · {open.length} open need{open.length !== 1 ? 's' : ''}
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

        <SortBar />

        {open.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#993c1d', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open ({open.length})
            </h2>
            <NeedsList needs={open} />
          </div>
        )}
      </div>

      {sendModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setSendModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setSendModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888780' }}>×</button>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Send this report</div>
            {hiddenCategories.size > 0 && (
              <div style={{ fontSize: 12, color: '#854f0b', marginBottom: 16 }}>Sending with {hiddenCategories.size} categor{hiddenCategories.size === 1 ? 'y' : 'ies'} filtered out — matches what you see on screen.</div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: '#5f5e5a' }}>Recipients</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {sendRecipients.map(email => (
                  <span key={email} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#eeecea', borderRadius: 20, fontSize: 12 }}>
                    {email}
                    <button onClick={() => setSendRecipients(prev => prev.filter(e => e !== email))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888780', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
                {sendRecipients.length === 0 && <span style={{ fontSize: 12, color: '#b4b2a9' }}>No recipients yet</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  placeholder="Add email address"
                  value={sendNewEmail}
                  onChange={e => setSendNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && sendNewEmail.trim()) { setSendRecipients(prev => [...new Set([...prev, sendNewEmail.trim()])]); setSendNewEmail('') } }}
                  style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid #e8e6df', borderRadius: 6, fontFamily: 'inherit' }}
                />
                <button onClick={() => { if (sendNewEmail.trim()) { setSendRecipients(prev => [...new Set([...prev, sendNewEmail.trim()])]); setSendNewEmail('') } }} style={{ padding: '8px 14px', fontSize: 13, background: '#eeecea', border: '1px solid #e8e6df', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: '#5f5e5a' }}>Note (optional)</label>
              <textarea
                placeholder="e.g. Hi, here's where things stand heading into next week…"
                value={sendNote}
                onChange={e => { setSendNote(e.target.value); setPreviewHtml(null) }}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid #e8e6df', borderRadius: 8, fontFamily: 'inherit', minHeight: 72, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <button onClick={loadPreview} disabled={previewLoading} style={{ padding: '8px 14px', fontSize: 13, background: 'none', border: '1px solid #e8e6df', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                {previewLoading ? 'Loading…' : previewHtml ? 'Refresh preview' : 'Preview email'}
              </button>
              {previewHtml && (
                <div style={{ marginTop: 10, border: '1px solid #e8e6df', borderRadius: 8, overflow: 'hidden' }}>
                  <iframe srcDoc={previewHtml} style={{ width: '100%', height: 320, border: 'none' }} title="Email preview" />
                </div>
              )}
            </div>

            <button onClick={confirmSend} disabled={sending || sendRecipients.length === 0} style={{ width: '100%', padding: 13, background: '#1a1a18', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {sending ? 'Sending…' : `Send to ${sendRecipients.length} recipient${sendRecipients.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

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
