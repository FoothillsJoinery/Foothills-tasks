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
  const [tab, setTab] = useState('ready')
  const [expanded, setExpanded] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({})
  const [modal, setModal] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ title: '', notes: '', status: 'ready', section_id: '' })
  const [needForm, setNeedForm] = useState({ text: '', task_id: null })
  const [resolveForm, setResolveForm] = useState({ answer: '', task_id: null, need_id: null })
  const [newSectionName, setNewSectionName] = useState('')
  const [saving, setSaving] = useState(false)
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
    if (!form.title.trim()) return
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
    if (!error && data) {
      setTasks(prev => [...prev, data])
      await logActivity(`added "${data.title}" (${data.status})`)
      setForm({ title: '', notes: '', status: 'ready', section_id: '' })
      setModal(null)
      setTab(data.status)
      showToast('Task added')
    }
  }

  async function saveEdit() {
    if (!form.title.trim()) return
    setSaving(true)
    const task = tasks.find(t => t.id === editId)
    const { data, error } = await supabase.from('tasks').update({
      title: form.title.trim(),
      notes: form.notes.trim(),
      status: task.status === 'done' ? 'done' : form.status,
      section_id: form.section_id || null
    }).eq('id', editId).select('*, needs(*)').single()
    setSaving(false)
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === editId ? data : t))
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
      requested_by: userName()
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setTasks(prev => prev.map(t => t.id === needForm.task_id ? { ...t, needs: [...(t.needs || []), data] } : t))
      await logActivity(`logged need on "${task?.title}"`)
      setNeedForm({ text: '', task_id: null })
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

  async function addSection() {
    if (!newSectionName.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('sections').insert([{
      job_id: id,
      name: newSectionName.trim(),
      created_by: userName()
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setSections(prev => [...prev, data])
      setNewSectionName('')
      setModal(null)
      showToast('Section added')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  function filteredTasks() {
    return tasks.filter(t => t.status === tab)
  }

  function openEdit(taskId) {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    setEditId(taskId)
    setForm({ title: t.title, notes: t.notes || '', status: t.status === 'done' ? (t.prev_status || 'ready') : t.status, section_id: t.section_id || '' })
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
                      <div className="need-meta">By {need.requested_by} · {ts(need.requested_at || need.created_at)}{need.resolved_at ? ` · Answered ${ts(need.resolved_at)}` : ''}</div>
                      {need.answer && <div className="need-answer">✓ {need.answer}</div>}
                    </div>
                    {!need.resolved_at && canEdit
                      ? <button className="resolve-btn" onClick={() => { setResolveForm({ answer: '', task_id: task.id, need_id: need.id }); setModal('resolve') }}>Resolve</button>
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
          <span className="topbar-role">{userName()}</span>
        </div>

        <div className="tabs">
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

        {/* Action bar - always visible for editors */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 16px 4px', alignItems: 'center' }}>
            <button
              onClick={() => { setForm({ title: '', notes: '', status: 'ready', section_id: '' }); setModal('add') }}
              style={{ flex: 1, padding: '10px 0', background: '#3b6d11', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add task
            </button>
            <button
              onClick={() => { setNewSectionName(''); setModal('section') }}
              style={{ flex: 1, padding: '10px 0', background: 'white', color: '#3b6d11', border: '1.5px solid #3b6d11', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b6d11" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add section
            </button>
            {userRole() === 'admin' && (
              <button
                onClick={() => setModal('share')}
                style={{ padding: '10px 12px', background: 'white', color: '#888780', border: '1px solid #e8e6df', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                title="Share job"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
            )}
          </div>
        )}

        {allFiltered.length === 0 && sections.length === 0 && (
          <div className="empty">No {tab} tasks yet.</div>
        )}

        {unsectioned.length > 0 && (
          <div className="section-wrap">
            {unsectioned.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        )}

        {sections.map(sec => {
          const secTasks = allFiltered.filter(t => t.section_id === sec.id)
          const collapsed = collapsedSections[sec.id]
          return (
            <div key={sec.id} className="section-wrap">
              <div className="section-header" onClick={() => setCollapsedSections(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2">
                  {collapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
                <span className="section-name">{sec.name}</span>
                <span className="section-count">{secTasks.length}</span>
              </div>
              {!collapsed && (
                secTasks.length > 0
                  ? secTasks.map(task => <TaskCard key={task.id} task={task} />)
                  : <div style={{ fontSize: 13, color: '#b4b2a9', padding: '4px 0 12px' }}>No {tab} tasks in this section.</div>
              )}
            </div>
          )
        })}



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
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {!(modal === 'edit' && tasks.find(t => t.id === editId)?.status === 'done') && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <div className="toggle-row">
                    <button className={`tbtn ${form.status === 'ready' ? 't-ready' : ''}`} onClick={() => setForm(f => ({ ...f, status: 'ready' }))}>Ready to go</button>
                    <button className={`tbtn ${form.status === 'blocked' ? 't-blocked' : ''}`} onClick={() => setForm(f => ({ ...f, status: 'blocked' }))}>Blocked</button>
                  </div>
                </div>
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
              <div className="sheet-title">Add section</div>
              <div className="form-group">
                <label className="form-label">Section name</label>
                <input type="text" placeholder="e.g. Floor 1, Kitchen, Exterior" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && addSection()} />
              </div>
              <button className="submit-btn" onClick={addSection} disabled={saving}>{saving ? 'Adding...' : 'Add section'}</button>
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

        {modal === 'share' && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="sheet">
              <button className="sheet-close" onClick={() => setModal(null)}>×</button>
              <div className="sheet-title">Share this job</div>
              <p style={{ fontSize: 13, color: '#5f5e5a', marginBottom: 16 }}>Copy a link and send it by text or email. They tap the link, enter their name, and they're in.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#e6f1fb', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#185fa5' }}>Carpenter link</div>
                    <div style={{ fontSize: 12, color: '#5f5e5a', marginTop: 2 }}>Can add & edit tasks, log needs, check off work</div>
                  </div>
                  <button className="share-btn" onClick={() => { copyShareLink('carpenter'); setModal(null) }}>Copy</button>
                </div>
                <div style={{ background: '#faeeda', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#854f0b' }}>Client / site super link</div>
                    <div style={{ fontSize: 12, color: '#5f5e5a', marginTop: 2 }}>Can view everything and add requests</div>
                  </div>
                  <button className="share-btn" onClick={() => { copyShareLink('client'); setModal(null) }}>Copy</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
