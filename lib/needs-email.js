import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  'https://fdaqspcusvirljyjffqr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkYXFzcGN1c3ZpcmxqeWpmZnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTkzNzcsImV4cCI6MjA5NTczNTM3N30.7cI5b-Yh_jX1cAr0QCDhtvfLPSMNuzrelKLWNBjMrwQ'
)

export const CATEGORIES = [
  'Decision/answer needed from client',
  'Material not supplied by Foothills Joinery',
  'Prerequisite task — Foothills Joinery',
  'Prerequisite task — other contractor',
]

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function durationDays(startStr, endStr) {
  const ms = new Date(endStr || new Date()) - new Date(startStr)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  return days === 0 ? '< 1 day' : `${days} day${days === 1 ? '' : 's'}`
}

function sectionPath(sectionId, sectionMap) {
  if (!sectionId || !sectionMap) return null
  const sec = sectionMap[sectionId]
  if (!sec) return null
  if (sec.parent_id && sectionMap[sec.parent_id]) return `${sectionMap[sec.parent_id].name} › ${sec.name}`
  return sec.name
}

const catColors = {
  'Decision/answer needed from client':         { bg: '#e8f0fe', color: '#1a56db', border: '#c3d2f7' },
  'Material not supplied by Foothills Joinery': { bg: '#fff3e0', color: '#c05e00', border: '#ffcc80' },
  'Prerequisite task — Foothills Joinery':      { bg: '#fdf0e6', color: '#854f0b', border: '#f0d9b5' },
  'Prerequisite task — other contractor':       { bg: '#f3e8ff', color: '#6b21a8', border: '#ddd6fe' },
}

function catBadge(category) {
  const c = catColors[category]
  const bg = c ? c.bg : '#f0efed'
  const color = c ? c.color : '#888780'
  const border = c ? c.border : '#e8e6df'
  return `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:${bg};color:${color};border:1px solid ${border};white-space:nowrap">${category || 'Uncategorized'}</span>`
}

function taskCard(taskId, taskNeeds, taskMap, sectionMap) {
  const task = taskMap[taskId]
  if (!task) return ''
  const path = sectionPath(task.section_id, sectionMap)
  const needRows = taskNeeds.map(need => {
    const age = `Open ${durationDays(need.created_at)} so far`
    const answerLine = need.answer
      ? `<div style="margin-top:4px;font-size:12px;color:#1a8a4a">✓ ${need.answer}</div>`
      : ''
    return `
      <tr>
        <td style="padding:8px 12px;border-top:1px solid #f0efed;vertical-align:top">
          <div style="font-size:13px;color:#1a1a18;line-height:1.4;margin-bottom:5px">${need.text}</div>
          <div style="font-size:11px;color:#b4b2a9">${fmtDate(need.created_at)} · ${age}</div>
          ${answerLine}
        </td>
      </tr>`
  }).join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e6df;border-radius:8px;margin-bottom:8px;border-collapse:separate;overflow:hidden">
      <tr>
        <td style="padding:7px 12px;background:#f8f7f4;border-bottom:1px solid #e8e6df;border-radius:8px 8px 0 0">
          ${path ? `<div style="font-size:11px;color:#888780;margin-bottom:2px">${path}</div>` : ''}
          <div style="font-size:13px;font-weight:700;color:#1a1a18">${task.title}</div>
        </td>
      </tr>
      ${needRows}
    </table>`
}

function catSection(cat, catNeeds, taskMap, sectionMap) {
  // group needs by task, preserving section order
  const taskGroups = {}
  const taskOrder = []
  catNeeds.forEach(n => {
    if (!taskGroups[n.task_id]) { taskGroups[n.task_id] = []; taskOrder.push(n.task_id) }
    taskGroups[n.task_id].push(n)
  })

  const c = catColors[cat]
  const bg = c ? c.bg : '#f0efed'
  const color = c ? c.color : '#888780'
  const border = c ? c.border : '#e8e6df'
  const label = cat || 'Uncategorized'

  return `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.05em;padding:6px 10px;background:${bg};border:1px solid ${border};border-radius:6px;margin-bottom:6px;display:inline-block">${label}</div>
      ${taskOrder.map(tid => taskCard(tid, taskGroups[tid], taskMap, sectionMap)).join('')}
    </div>`
}

export function buildWeeklyHtml(job, needs, taskMap, jobUrl, sectionMap = {}, note = '', since = null) {
  const open = needs.filter(n => !n.resolved_at)

  let body = ''
  for (const cat of [...CATEGORIES, null]) {
    const catNeeds = cat === null
      ? open.filter(n => !n.category)
      : open.filter(n => n.category === cat)
    if (catNeeds.length === 0) continue
    body += catSection(cat, catNeeds, taskMap, sectionMap)
  }

  if (open.length === 0) {
    body = `<p style="color:#1a8a4a;font-size:14px;margin:0">No open needs — all clear!</p>`
  }

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;color:#1a1a18;margin:0 auto">

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Needs report</div>
        <div style="font-size:22px;font-weight:700;margin:0 0 4px">${job.name}</div>
        <div style="font-size:13px;color:#888780">${open.length} open need${open.length !== 1 ? 's' : ''} · ${since ? `since ${fmtDate(since)}` : 'all open'} · ${fmtDate(new Date().toISOString())}</div>
      </div>

      ${note ? `<div style="background:#f8f7f4;border-left:3px solid #c4966a;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#1a1a18;line-height:1.5">${note.replace(/\n/g, '<br>')}</div>` : ''}

      ${body}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e8e6df">
        ${jobUrl ? `<a href="${jobUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a18;color:white;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">View full job</a>` : ''}
        <div style="margin-top:16px;font-size:11px;color:#b4b2a9">Foothills Joinery</div>
      </div>

    </div>`
}

function simpleNeedRow(need, taskMap) {
  const task = taskMap[need.task_id]
  return `<tr><td style="padding:8px 0;border-bottom:1px solid #e8e6df;font-size:13px;color:#1a1a18">
    <div style="font-weight:600">${task ? task.title : '—'}</div>
    <div style="margin-top:2px">${need.text}</div>
    <div style="font-size:11px;color:#888780;margin-top:3px">${fmtDate(need.created_at)}</div>
  </td></tr>`
}

function buildDailyHtml(job, newNeeds, resolvedNeeds, taskMap, jobUrl) {
  const newRows = newNeeds.map(n => simpleNeedRow(n, taskMap)).join('')
  const resolvedRows = resolvedNeeds.map(n => simpleNeedRow(n, taskMap)).join('')

  return `
    <div style="font-family:sans-serif;max-width:600px;color:#1a1a18">
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Daily update</div>
        <h1 style="margin:0;font-size:20px;font-weight:700">${job.name}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#888780">${fmtDate(new Date().toISOString())}</p>
      </div>

      ${newNeeds.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:#854f0b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">New needs (${newNeeds.length})</div>
        <table style="width:100%;border-collapse:collapse">${newRows}</table>
      </div>` : ''}

      ${resolvedNeeds.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:#1a8a4a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Resolved (${resolvedNeeds.length})</div>
        <table style="width:100%;border-collapse:collapse">${resolvedRows}</table>
      </div>` : ''}

      ${jobUrl ? `<a href="${jobUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a18;color:white;text-decoration:none;border-radius:6px;font-size:13px">View job</a>` : ''}
      <p style="margin-top:24px;font-size:11px;color:#b4b2a9">Foothills Joinery · Reply to this email to reach us directly</p>
    </div>`
}

async function sendEmail(to, subject, html) {
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'tasks@foothillsjoinery.com',
    reply_to: process.env.RESEND_REPLY_TO || 'matt@foothillsjoinery.com',
    to,
    subject,
    html
  })
  if (error) throw new Error(error.message)
}

export async function sendWeeklyReport(job, jobUrl, { recipients, hiddenCategories, note, since } = {}) {
  const [needsRes, tasksRes, secRes] = await Promise.all([
    supabase.from('needs').select('*').eq('job_id', job.id).order('created_at'),
    supabase.from('tasks').select('id, title, section_id').eq('job_id', job.id),
    supabase.from('sections').select('*').eq('job_id', job.id)
  ])
  const allNeeds = needsRes.data || []
  const hidden = hiddenCategories || new Set()
  const needs = allNeeds.filter(n => {
    if (hidden.size > 0 && hidden.has(n.category || '__uncategorized__')) return false
    if (since && n.created_at < since) return false
    return true
  })
  const taskMap = Object.fromEntries((tasksRes.data || []).map(t => [t.id, t]))
  const sectionMap = Object.fromEntries((secRes.data || []).map(s => [s.id, s]))

  const toList = recipients?.length ? recipients : [job.client_email]
  const sinceLabel = since ? ` (since ${fmtDate(since)})` : ''
  const html = buildWeeklyHtml(job, needs, taskMap, jobUrl, sectionMap, note || '', since || null)
  await sendEmail(toList, `Needs report — ${job.name}${sinceLabel}`, html)

  await supabase.from('jobs').update({ last_weekly_sent: new Date().toISOString() }).eq('id', job.id)
}

export async function sendDailyReport(job, jobUrl) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [needsRes, tasksRes] = await Promise.all([
    supabase.from('needs').select('*').eq('job_id', job.id),
    supabase.from('tasks').select('id, title').eq('job_id', job.id)
  ])
  const allNeeds = needsRes.data || []
  const taskMap = Object.fromEntries((tasksRes.data || []).map(t => [t.id, t.title]))

  const newNeeds = allNeeds.filter(n => n.created_at >= since && !n.resolved_at)
  const resolvedNeeds = allNeeds.filter(n => n.resolved_at && n.resolved_at >= since)

  if (newNeeds.length === 0 && resolvedNeeds.length === 0) return false

  const html = buildDailyHtml(job, newNeeds, resolvedNeeds, taskMap, jobUrl)
  await sendEmail(job.client_email, `Needs update — ${job.name}`, html)

  await supabase.from('jobs').update({ last_daily_sent: new Date().toISOString() }).eq('id', job.id)
  return true
}

export { supabase }
