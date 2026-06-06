import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

export default function JobPage() {
  const router = useRouter()
  const { id } = router.query

  const [user, setUser] = useState(null)
  const [job, setJob] = useState(null)
  const [sections, setSections] = useState([])
  const [tasks, setTasks] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [expanded, setExpanded] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({})
  const [modal, setModal] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ title: '', notes: '', status: 'ready', section_id: '', needText: '', needCategory: '' })
  const [needForm, setNeedForm] = useState({ text: '', category: '', task_id: null })
  const [resolveForm, setResolveForm] = useState({ answer: '', task_id: null, need_id: null })
  const [editNeedForm, setEditNeedForm] = useState({ text: '', category: '', task_id: null, need_id: null })
  const [newSectionName, setNewSectionName] = useState('')
  const [parentSectionId, setParentSectionId] = useState(null)
  const [editSectionId, setEditSectionId] = useState(null)
  const [editSectionName, setEditSectionName] = useState('')
  const [editSectionParent, setEditSectionParent] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!id) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        loadAll()
      } else {
        // Check for guest token (carpenter/client link)
        const guestName = localStorage.getItem('guestName_' + id)
        const guestRole = localStorage.getItem('guestRole_' + id)
        if (guestName && guestRole) {
          setUser({ email: guestName, role: guestRole, isGuest: true })
          loadAll()
        } else {
          router.push('/join/' + id)
        }
      }
    })
  }, [id])

  async function loadAll() {
    if (!id) return
    const [jobRes, secRes, taskRes, actRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('sections').select('*').eq('job_id', id).order('created_at'),
      supabase.from('tasks').select('*, needs(*)').eq('job_id', id).order('created_at'),
      supabase.from('activity').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(50)
    ])
    if (jobRes.data) setJob(jobRes.data)
    setSections(secRes.data || [])
    setTasks(taskRes.data || [])
    setActivity(actRes.data || [])
    setLoading(false)
  }

  function userName() {
    if (!user) return 'Unknown'
    return user.isGuest ? user.email : user.email.split('@')[0]
  }

  function userRole() {
    if (!user) return 'viewer'
    return user.isGuest ? user.role : 'admin'
  }

  async function logActivity(msg) {
    await supabase.from('activity').insert([{ job_id: id, who: userName(), msg }])
    const { data } = await supabase.from('activity').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(50)
    setActivity(data || [])
  }

  async function addTask() {
    if (!form.title.trim()) { showToast('Please enter a description'); return }
    setSaving(true)
    const { data, error } = await supabase.from('tasks').insert([{
      job_id: id,
      title: form.title.trim(),
      notes: form.notes.trim(),
      status: form.status,
      section_id: form.section_id || null,
      created_by: userName()
    }]).select('*, needs(*)').single()
    setSaving(false)
    if (error) { showToast('Error saving task — try again'); return }
    if (data) {
      let taskWithNeeds = data
      if (form.needText.trim() && data.status === 'blocked') {
        const { data: needData } = await supabase.from('needs').insert([{
          task_id: data.id,
          job_id: id,
          text: form.needText.trim(),
          category: form.needCategory || null,
          requested_by: userName()
        }]).select().single()
        if (needData) taskWithNeeds = { ...data, needs: [needData] }
        await logActivity(`logged need on "${data.title}"`)
      }
      setTasks(prev => [...prev, taskWithNeeds])
      await logActivity(`added "${data.title}" (${data.status})`)
      setForm({ title: '', notes: '', status: 'ready', section_id: '', needText: '', needCategory: '' })
      setModal(null)
      setTab(tab === 'done' ? data.status : tab)
      showToast('Task added')
    }
  }

  async function saveEdit() {
    if (!form.title.trim()) { showToast('Please enter a description'); return }
    setSaving(true)
    const task = tasks.find(t => t.id === editId)
    const { data, error } = await supabase.from('tasks').update({
      title: form.title.trim(),
      notes: form.notes.trim(),
      status: task.status === 'done' ? 'done' : form.status,
      section_id: form.section_id || null
    }).eq('id', editId).select('*, needs(*)').single()
    setSaving(false)
    if (error) { showToast('Error saving — try again'); return }
    if (data) {
      let taskWithNeeds = data
      if (form.needText.trim() && data.status === 'blocked') {
        const { data: needData } = await supabase.from('needs').insert([{
          task_id: data.id,
          job_id: id,
          text: form.needText.trim(),
          category: form.needCategory || null,
          requested_by: userName()
        }]).select().single()
        if (needData) taskWithNeeds = { ...data, needs: [...(data.needs || []), needData] }
        await logActivity(`logged need on "${data.title}"`)
      }
      setTasks(prev => prev.map(t => t.id === editId ? taskWithNeeds : t))
      await logActivity(`edited "${data.title}"`)
      setModal(null)
      setEditId(null)
      showToast('Task updated')
    }
  }

  async function toggleComplete(taskId) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const isDone = task.status === 'done'
    const newStatus = isDone ? (task.prev_status || 'ready') : 'done'
    const { data, error } = await supabase.from('tasks').update({
      status: newStatus,
      prev_status: isDone ? null : task.status,
      completed_at: isDone ? null : new Date().toISOString(),
      completed_by: isDone ? null : userName()
    }).eq('id', taskId).select('*, needs(*)').single()
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === taskId ? data : t))
      await logActivity(isDone ? `reopened "${task.title}"` : `completed "${task.title}"`)
      showToast(isDone ? 'Task reopened' : 'Task done ✓')
    }
  }

  async function addNeed() {
    if (!needForm.text.trim()) return
    setSaving(true)
    const task = tasks.find(t => t.id === needForm.task_id)
    const { data, error } = await supabase.from('needs').insert([{
      task_id: needForm.task_id,
      job_id: id,
      text: needForm.text.trim(),
      category: needForm.category || null,
      requested_by: userName()
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === needForm.task_id ? { ...t, needs: [...(t.needs || []), data] } : t))
      await logActivity(`logged need on "${task?.title}"`)
      setNeedForm({ text: '', category: '', task_id: null })
      setModal(null)
      showToast('Need logged')
    }
  }

  async function resolveNeed() {
    if (!resolveForm.answer.trim()) return
    setSaving(true)
    const task = tasks.find(t => t.id === resolveForm.task_id)
    const { data, error } = await supabase.from('needs').update({
      resolved_at: new Date().toISOString(),
      answer: resolveForm.answer.trim(),
      resolved_by: userName()
    }).eq('id', resolveForm.need_id).select().single()
    setSaving(false)
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === resolveForm.task_id
        ? { ...t, needs: t.needs.map(n => n.id === resolveForm.need_id ? data : n) }
        : t))
      await logActivity(`resolved need on "${task?.title}"`)
      setResolveForm({ answer: '', task_id: null, need_id: null })
      setModal(null)
      showToast('Need resolved')
    }
  }

  async function saveEditNeed() {
    if (!editNeedForm.text.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('needs').update({ text: editNeedForm.text.trim(), category: editNeedForm.category || null }).eq('id', editNeedForm.need_id).select().single()
    setSaving(false)
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === editNeedForm.task_id
        ? { ...t, needs: t.needs.map(n => n.id === editNeedForm.need_id ? data : n) }
        : t))
      setEditNeedForm({ text: '', category: '', task_id: null, need_id: null })
      setModal(null)
      showToast('Need updated')
    }
  }

  async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId)
    if (!confirm(`Delete "${task?.title}"? This can't be undone.`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId))
      showToast('Task deleted')
    }
  }

  async function saveSection() {
    if (!editSectionName.trim()) return
    setSaving(true)
    const sec = sections.find(s => s.id === editSectionId)
    const { data, error } = await supabase.from('sections').update({
      name: editSectionName.trim(),
      parent_id: sec.parent_id !== undefined ? (editSectionParent || null) : null
    }).eq('id', editSectionId).select().single()
    setSaving(false)
    if (!error && data) {
      setSections(prev => prev.map(s => s.id === editSectionId ? data : s))
      setModal(null)
      setEditSectionId(null)
      showToast('Section updated')
    }
  }

  async function deleteSection(secId) {
    if (!confirm('Delete this section? Tasks inside will become unsectioned.')) return
    const { error } = await supabase.from('sections').delete().eq('id', secId)
    if (!error) {
      setSections(prev => prev.filter(s => s.id !== secId && s.parent_id !== secId))
      setTasks(prev => prev.map(t => t.section_id === secId ? { ...t, section_id: null } : t))
      showToast('Section deleted')
    }
  }

  async function addSection() {
    if (!newSectionName.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('sections').insert([{
      job_id: id,
      name: newSectionName.trim(),
      created_by: userName(),
      parent_id: parentSectionId || null
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setSections(prev => [...prev, data])
      setNewSectionName('')
      setParentSectionId(null)
      setModal(null)
      showToast(parentSectionId ? 'Sub-section added' : 'Section added')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function sendReport() {
    if (!job?.client_email) { showToast('No client email on this job'); return }
    setSending(true)
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id })
      })
      if (res.ok) showToast('Report sent to client')
      else showToast('Failed to send — check console')
    } catch (e) {
      showToast('Failed to send — check console')
    }
    setSending(false)
  }

  async function toggleEmailEnabled() {
    const newVal = !job.email_enabled
    const { error } = await supabase.from('jobs').update({ email_enabled: newVal }).eq('id', id)
    if (!error) setJob(prev => ({ ...prev, email_enabled: newVal }))
  }


  function filteredTasks() {
    if (tab === 'active') return tasks.filter(t => t.status === 'ready' || t.status === 'blocked')
    return tasks.filter(t => t.status === tab)
  }

  function openEdit(taskId) {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    setEditId(taskId)
    setForm({ title: t.title, notes: t.notes || '', status: t.status === 'done' ? (t.prev_status || 'ready') : t.status, section_id: t.section_id || '', needText: '', needCategory: '' })
    setModal('edit')
  }

  function copyShareLink(role) {
    const url = `${window.location.origin}/join/${id}?role=${role}`
    navigator.clipboard.writeText(url)
    showToast('Link copied!')
  }

  function ts(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const canEdit = userRole() === 'admin' || userRole() === 'carpenter'
  const counts = {
    active: tasks.filter(t => t.status === 'ready' || t.status === 'blocked').length,
    ready: tasks.filter(t => t.status === 'ready').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
    done: tasks.filter(t => t.status === 'done').length
  }

  function TaskCard({ task }) {
    const done = task.status === 'done'
    const blocked = task.status === 'blocked'
    const isExpanded = expanded[task.id]
    const taskActivity = activity.filter(a => a.msg.includes(`"${task.title}"`)).slice(0, 3)

    return (
      <div className="card">
        <div className="card-header" onClick={() => setExpanded(prev => ({ ...prev, [task.id]: !prev[task.id] }))}>
          {canEdit && (
            <button
              className={`check-btn ${done ? 'checked' : ''}`}
              onClick={e => { e.stopPropagation(); toggleComplete(task.id) }}
              aria-label={done ? 'Reopen task' : 'Mark complete'}
            >
              {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`task-title ${done ? 'done' : ''}`}>{task.title}</div>
            <div className="task-meta">By {task.created_by} · {ts(task.created_at)}{done ? ` · Done ${ts(task.completed_at)}` : ''}</div>
          </div>
          <span className={`badge badge-${done ? 'done' : blocked ? 'blocked' : 'ready'}`}>
            {done ? 'Done' : blocked ? 'Blocked' : 'Ready'}
          </span>
        </div>

        {isExpanded && (
          <div className="card-body">
            {task.notes && <p style={{ fontSize: 13, color: '#5f5e5a', margin: '10px 0 6px', lineHeight: 1.5 }}>{task.notes}</p>}

            {canEdit && (
              <div className="task-actions">
                <button className="action-btn" onClick={() => openEdit(task.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
                <button className="action-btn action-btn-delete" onClick={() => deleteTask(task.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Delete
                </button>
                {blocked && (
                  <button className="action-btn" onClick={() => { setNeedForm({ text: '', task_id: task.id }); setModal('need') }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    Log need
                  </button>
                )}
              </div>
            )}

            {blocked && (
              <>
                <div className="needs-label">What's needed</div>
                {(task.needs || []).length === 0 && (
                  <div style={{ fontSize: 13, color: '#b4b2a9', padding: '4px 0' }}>Nothing logged yet.</div>
                )}
                {(task.needs || []).map(need => (
                  <div key={need.id} className="need-row">
                    <div style={{ flex: 1 }}>
                      <div className="need-text">{need.text}</div>
                      {need.category && <div style={{ fontSize: 11, color: '#888780', marginTop: 2, fontStyle: 'italic' }}>{need.category}</div>}
                      <div className="need-meta">By {need.requested_by} · {ts(need.requested_at || need.created_at)}{need.resolved_at ? ` · Answered ${ts(need.resolved_at)}` : ''}</div>
                      {need.answer && <div className="need-answer">✓ {need.answer}</div>}
                    </div>
                    {!need.resolved_at && canEdit
                      ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                          <button className="resolve-btn" onClick={() => { setResolveForm({ answer: '', task_id: task.id, need_id: need.id }); setModal('resolve') }}>Resolve</button>
                          <button className="resolve-btn" style={{ background: 'none', color: '#8a8880', border: '1px solid #e8e6df' }} onClick={() => { setEditNeedForm({ text: need.text, category: need.category || '', task_id: task.id, need_id: need.id }); setModal('editNeed') }}>Edit</button>
                        </div>
                      : <span className={`npill ${need.resolved_at ? 'npill-resolved' : 'npill-pending'}`}>{need.resolved_at ? 'Received' : 'Pending'}</span>
                    }
                  </div>
                ))}
              </>
            )}

            {taskActivity.length > 0 && (
              <div className="activity-log">
                {taskActivity.map(a => (
                  <div key={a.id} className="activity-row">
                    <span className="activity-who">{a.who}</span> {a.msg.replace(`"${task.title}"`, '').trim()} · {ts(a.created_at)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="login-wrap"><div style={{ color: '#888780', fontSize: 14 }}>Loading...</div></div>
  )

  const allFiltered = filteredTasks()
  const unsectioned = allFiltered.filter(t => !t.section_id)

  return (
    <>
      <Head>
        <title>{job?.name || 'Job'} — Foothills Joinery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app">
        <div className="topbar">
          {userRole() === 'admin' && (
            <button className="back-btn" onClick={() => router.push('/')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              Jobs
            </button>
          )}
          <span className="topbar-title">{job?.name}</span>
          {userRole() === 'admin' && (
            <>
              <button className="share-icon-btn" onClick={() => router.push(`/report/${id}`)} aria-label="Report">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Report
              </button>
              <button className="share-icon-btn" onClick={sendReport} disabled={sending} aria-label="Send report">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button className="share-icon-btn" onClick={() => setModal('share')} aria-label="Share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
            </>
          )}
          <span className="topbar-role">{userName()}</span>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Active <span style={{ opacity: 0.6 }}>{counts.active}</span>
          </button>
          <button className={`tab ${tab === 'ready' ? 'active' : ''}`} onClick={() => setTab('ready')}>
            Ready <span style={{ opacity: 0.6 }}>{counts.ready}</span>
          </button>
          <button className={`tab ${tab === 'blocked' ? 'active' : ''}`} onClick={() => setTab('blocked')}>
            Blocked <span style={{ opacity: 0.6 }}>{counts.blocked}</span>
          </button>
          <button className={`tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
            Done <span style={{ opacity: 0.6 }}>{counts.done}</span>
          </button>
        </div>

        {canEdit && (
          <div className="action-bar">
            <button className="action-bar-btn" onClick={() => { setParentSectionId(null); setNewSectionName(''); setModal('section') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Add Section
            </button>
            <button className="action-bar-btn action-bar-btn-primary" onClick={() => { setForm({ title: '', notes: '', status: 'ready', section_id: '' }); setModal('add') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Add Task
            </button>
          </div>
        )}

        {allFiltered.length === 0 && sections.length === 0 && (
          <div className="empty">No {tab === 'active' ? 'active' : tab} tasks yet.</div>
        )}

        {unsectioned.length > 0 && (
          <div className="section-wrap">
            {unsectioned.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        )}

        {sections.filter(s => !s.parent_id).map(sec => {
          const secTasks = allFiltered.filter(t => t.section_id === sec.id)
          const collapsed = collapsedSections[sec.id]
          const subSections = sections.filter(s => s.parent_id === sec.id)
          return (
            <div key={sec.id} className="section-wrap">
              <div className="section-header" onClick={() => setCollapsedSections(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2">
                  {collapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
                <span className="section-name">{sec.name}</span>
                <span className="section-count">{secTasks.length}</span>
                {canEdit && (
                  <>
                    <button
                      className="subsection-add-btn"
                      onClick={e => { e.stopPropagation(); setParentSectionId(sec.id); setNewSectionName(''); setModal('section') }}
                      title="Add sub-section"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                      Sub-section
                    </button>
                    <button
                      className="subsection-add-btn"
                      onClick={e => { e.stopPropagation(); setEditSectionId(sec.id); setEditSectionName(sec.name); setEditSectionParent(''); setModal('editSection') }}
                      title="Edit section"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </>
                )}
              </div>
              {!collapsed && (
                <>
                  {secTasks.length > 0
                    ? secTasks.map(task => <TaskCard key={task.id} task={task} />)
                    : subSections.length === 0 && <div style={{ fontSize: 13, color: '#b4b2a9', padding: '4px 0 8px' }}>No {tab} tasks in this section.</div>
                  }
                  {subSections.map(sub => {
                    const subTasks = allFiltered.filter(t => t.section_id === sub.id)
                    const subCollapsed = collapsedSections[sub.id]
                    return (
                      <div key={sub.id} className="subsection-wrap">
                        <div className="section-header subsection-header" onClick={() => setCollapsedSections(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="2">
                            {subCollapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M6 9l6 6 6-6"/>}
                          </svg>
                          <span className="section-name subsection-name">{sub.name}</span>
                          <span className="section-count">{subTasks.length}</span>
                          {canEdit && (
                            <button
                              className="subsection-add-btn"
                              onClick={e => { e.stopPropagation(); setEditSectionId(sub.id); setEditSectionName(sub.name); setEditSectionParent(sub.parent_id || ''); setModal('editSection') }}
                              title="Edit sub-section"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                        </div>
                        {!subCollapsed && (
                          subTasks.length > 0
                            ? subTasks.map(task => <TaskCard key={task.id} task={task} />)
                            : <div style={{ fontSize: 13, color: '#b4b2a9', padding: '4px 0 8px' }}>No {tab} tasks here.</div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )
        })}

        {canEdit && (
          <button className="fab" onClick={() => { setForm({ title: '', notes: '', status: 'ready', section_id: '' }); setModal('add') }} aria-label="Add task">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        )}

        {(modal === 'add' || modal === 'edit') && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">{modal === 'edit' ? 'Edit task' : 'Add task'}</div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input type="text" placeholder="e.g. Install upper cabinet boxes" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <textarea placeholder="Any details..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Section (optional)</label>
                <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}>
                  <option value="">— No section —</option>
                  {sections.filter(s => !s.parent_id).map(s => (
                    <optgroup key={s.id} label={s.name}>
                      <option value={s.id}>{s.name}</option>
                      {sections.filter(sub => sub.parent_id === s.id).map(sub => (
                        <option key={sub.id} value={sub.id}>↳ {sub.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {!(modal === 'edit' && tasks.find(t => t.id === editId)?.status === 'done') && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <div className="toggle-row">
                    <button className={`tbtn ${form.status === 'ready' ? 't-ready' : ''}`} onClick={() => setForm(f => ({ ...f, status: 'ready', needText: '' }))}>Ready to go</button>
                    <button className={`tbtn ${form.status === 'blocked' ? 't-blocked' : ''}`} onClick={() => setForm(f => ({ ...f, status: 'blocked' }))}>Blocked</button>
                  </div>
                </div>
              )}
              {form.status === 'blocked' && (
                <>
                  <div className="form-group">
                    <label className="form-label">What's needed? (optional)</label>
                    <textarea placeholder="e.g. Confirm upper cabinet height with client" value={form.needText} onChange={e => setForm(f => ({ ...f, needText: e.target.value }))} />
                  </div>
                  {form.needText.trim() && (
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select value={form.needCategory} onChange={e => setForm(f => ({ ...f, needCategory: e.target.value }))}>
                        <option value="">— Select a category —</option>
                        <option>Decision/answer needed from client</option>
                        <option>Material not supplied by Foothills Joinery</option>
                        <option>Prerequisite task — Foothills Joinery</option>
                        <option>Prerequisite task — other contractor</option>
                      </select>
                    </div>
                  )}
                </>
              )}
              {sections.length === 0 && (
                <p style={{ fontSize: 12, color: '#888780', marginBottom: 12 }}>
                  No sections yet —{' '}
                  <button className="link-btn" onClick={() => setModal('section')}>add one first</button>
                </p>
              )}
              <button className="submit-btn" onClick={modal === 'edit' ? saveEdit : addTask} disabled={saving}>
                {saving ? 'Saving...' : modal === 'edit' ? 'Save changes' : 'Add task'}
              </button>
            </div>
          </div>
        )}

        {modal === 'section' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">{parentSectionId ? `Add sub-section` : 'Add section'}</div>
              {parentSectionId && (
                <p style={{ fontSize: 13, color: '#888780', marginBottom: 14 }}>
                  Under: <strong style={{ color: '#1a1a18' }}>{sections.find(s => s.id === parentSectionId)?.name}</strong>
                </p>
              )}
              <div className="form-group">
                <label className="form-label">{parentSectionId ? 'Sub-section name' : 'Section name'}</label>
                <input type="text" placeholder={parentSectionId ? 'e.g. Upper Cabinets, Phase 1' : 'e.g. Floor 1, Kitchen, Exterior'} value={newSectionName} onChange={e => setNewSectionName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && addSection()} />
              </div>
              <button className="submit-btn" onClick={addSection} disabled={saving}>{saving ? 'Adding...' : parentSectionId ? 'Add sub-section' : 'Add section'}</button>
            </div>
          </div>
        )}

        {modal === 'need' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Log a need</div>
              <div className="form-group">
                <label className="form-label">What's needed (info or material)</label>
                <textarea placeholder="e.g. Confirm upper cabinet height with client" value={needForm.text} onChange={e => setNeedForm(f => ({ ...f, text: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select value={needForm.category} onChange={e => setNeedForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— Select a category —</option>
                  <option>Decision/answer needed from client</option>
                  <option>Material not supplied by Foothills Joinery</option>
                  <option>Prerequisite task — Foothills Joinery</option>
                  <option>Prerequisite task — other contractor</option>
                </select>
              </div>
              <button className="submit-btn" onClick={addNeed} disabled={saving}>{saving ? 'Logging...' : 'Log need'}</button>
            </div>
          </div>
        )}

        {modal === 'resolve' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Resolve need</div>
              <div className="form-group">
                <label className="form-label">Answer / info received</label>
                <textarea placeholder="e.g. Client confirmed 36 inches, see email 5/5" value={resolveForm.answer} onChange={e => setResolveForm(f => ({ ...f, answer: e.target.value }))} autoFocus />
              </div>
              <button className="submit-btn" onClick={resolveNeed} disabled={saving}>{saving ? 'Saving...' : 'Mark resolved'}</button>
            </div>
          </div>
        )}

        {modal === 'editNeed' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Edit need</div>
              <div className="form-group">
                <label className="form-label">What's needed (info or material)</label>
                <textarea placeholder="e.g. Confirm upper cabinet height with client" value={editNeedForm.text} onChange={e => setEditNeedForm(f => ({ ...f, text: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select value={editNeedForm.category} onChange={e => setEditNeedForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— Select a category —</option>
                  <option>Decision/answer needed from client</option>
                  <option>Material not supplied by Foothills Joinery</option>
                  <option>Prerequisite task — Foothills Joinery</option>
                  <option>Prerequisite task — other contractor</option>
                </select>
              </div>
              <button className="submit-btn" onClick={saveEditNeed} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        )}

        {modal === 'editSection' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">{sections.find(s => s.id === editSectionId)?.parent_id ? 'Edit sub-section' : 'Edit section'}</div>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input type="text" value={editSectionName} onChange={e => setEditSectionName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveSection()} />
              </div>
              {sections.find(s => s.id === editSectionId)?.parent_id && (
                <div className="form-group">
                  <label className="form-label">Move to a different section</label>
                  <select value={editSectionParent} onChange={e => setEditSectionParent(e.target.value)}>
                    {sections.filter(s => !s.parent_id && s.id !== editSectionId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button className="submit-btn" onClick={saveSection} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button
                onClick={() => { setModal(null); deleteSection(editSectionId) }}
                style={{ width: '100%', marginTop: 10, padding: 13, background: 'none', border: '1px solid #e8e6df', borderRadius: 8, color: '#993c1d', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Delete section
              </button>
            </div>
          </div>
        )}

        {modal === 'share' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Share this job</div>
              <p style={{ fontSize: 13, color: '#5f5e5a', marginBottom: 16 }}>Send a link to your team or client to give them access.</p>
              <div className="share-sheet-row">
                <div className="share-sheet-info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185fa5" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>Carpenter link</div>
                    <div style={{ fontSize: 12, color: '#888780' }}>Can add and complete tasks</div>
                  </div>
                </div>
                <button className="share-btn" onClick={() => { copyShareLink('carpenter'); setModal(null) }}>Copy link</button>
              </div>
              <div className="share-sheet-row">
                <div className="share-sheet-info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#854f0b" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>Client / site super link</div>
                    <div style={{ fontSize: 12, color: '#888780' }}>View-only access</div>
                  </div>
                </div>
                <button className="share-btn" onClick={() => { copyShareLink('client'); setModal(null) }}>Copy link</button>
              </div>

              <div style={{ borderTop: '1px solid #e8e6df', marginTop: 16, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Automated email reports</div>
                <div className="share-sheet-row" style={{ alignItems: 'center' }}>
                  <div className="share-sheet-info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={job?.email_enabled ? '#1a8a4a' : '#888780'} strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>
                        {job?.email_enabled ? 'Emails on' : 'Emails off'}
                      </div>
                      <div style={{ fontSize: 12, color: '#888780' }}>
                        {job?.client_email
                          ? `Weekly + daily digest to ${job.client_email}`
                          : 'No client email set on this job'}
                      </div>
                    </div>
                  </div>
                  <button
                    className="share-btn"
                    onClick={toggleEmailEnabled}
                    disabled={!job?.client_email}
                    style={job?.email_enabled ? { background: '#e8f5ee', color: '#1a8a4a', border: '1px solid #b8dfc8' } : {}}
                  >
                    {job?.email_enabled ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
                {job?.last_weekly_sent && (
                  <div style={{ fontSize: 11, color: '#b4b2a9', marginTop: 6 }}>Last weekly sent {ts(job.last_weekly_sent)}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}
