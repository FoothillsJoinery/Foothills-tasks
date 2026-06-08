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

function needRow(need, taskMap, sectionMap) {
  const task = taskMap[need.task_id]
  const taskTitle = task ? task.title : '—'
  const path = task ? sectionPath(task.section_id, sectionMap) : null
  const age = need.resolved_at
    ? `Resolved after ${durationDays(need.created_at, need.resolved_at)}`
    : `Open ${durationDays(need.created_at)} so far`
  const answerLine = need.answer
    ? `<div style="margin-top:4px;color:#1a8a4a;font-size:12px">✓ ${need.answer}</div>`
    : ''
  const pathLine = path
    ? `<div style="font-size:11px;color:#888780;margin-bottom:1px">${path}</div>`
    : ''
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e8e6df;vertical-align:top">
        <div style="font-size:13px;color:#1a1a18;font-weight:600">${need.text}</div>
        <div style="font-size:12px;color:#888780;margin-top:3px">${pathLine}${taskTitle} · Logged ${fmtDate(need.created_at)} by ${need.requested_by} · ${age}</div>
        ${answerLine}
      </td>
    </tr>`
}

export function buildWeeklyHtml(job, needs, taskMap, jobUrl, sectionMap = {}, note = '') {
  const open = needs.filter(n => !n.resolved_at)
  const resolved = needs.filter(n => n.resolved_at)

  let categorySections = ''
  for (const cat of CATEGORIES) {
    const catNeeds = open.filter(n => n.category === cat)
    if (catNeeds.length === 0) continue
    categorySections += `
      <h3 style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#5f5e5a;text-transform:uppercase;letter-spacing:0.05em">${cat}</h3>
      <table style="width:100%;border-collapse:collapse">
        ${catNeeds.map(n => needRow(n, taskMap, sectionMap)).join('')}
      </table>`
  }

  const uncategorized = open.filter(n => !n.category)
  if (uncategorized.length > 0) {
    categorySections += `
      <h3 style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#5f5e5a;text-transform:uppercase;letter-spacing:0.05em">Uncategorized</h3>
      <table style="width:100%;border-collapse:collapse">
        ${uncategorized.map(n => needRow(n, taskMap, sectionMap)).join('')}
      </table>`
  }

  if (open.length === 0) {
    categorySections = `<p style="color:#1a8a4a;font-size:14px">No open needs — all clear!</p>`
  }

  return `
    <div style="font-family:sans-serif;max-width:600px;color:#1a1a18">
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Needs report</div>
        <h1 style="margin:0;font-size:20px;font-weight:700">${job.name}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#888780">${open.length} open · ${resolved.length} resolved · ${fmtDate(new Date().toISOString())}</p>
      </div>

      ${note ? `<div style="background:#f8f7f4;border-left:3px solid #c4966a;padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;font-size:14px;color:#1a1a18;line-height:1.5">${note.replace(/\n/g, '<br>')}</div>` : ''}

      <div style="background:#fff8f0;border:1px solid #f0d9b5;border-radius:8px;padding:16px;margin-bottom:24px">
        <div style="font-size:13px;font-weight:600;color:#854f0b;margin-bottom:8px">Open needs (${open.length})</div>
        ${categorySections}
      </div>

      ${resolved.length > 0 ? `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:600;color:#1a8a4a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Resolved (${resolved.length})</div>
        <table style="width:100%;border-collapse:collapse">
          ${resolved.map(n => needRow(n, taskMap, sectionMap)).join('')}
        </table>
      </div>` : ''}

      ${jobUrl ? `<a href="${jobUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a18;color:white;text-decoration:none;border-radius:6px;font-size:13px">View job</a>` : ''}
      <p style="margin-top:24px;font-size:11px;color:#b4b2a9">Foothills Joinery</p>
    </div>`
}

function buildDailyHtml(job, newNeeds, resolvedNeeds, taskMap, jobUrl) {
  const newRows = newNeeds.map(n => needRow(n, taskMap)).join('')
  const resolvedRows = resolvedNeeds.map(n => needRow(n, taskMap)).join('')

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

export async function sendWeeklyReport(job, jobUrl, { recipients, hiddenCategories, note } = {}) {
  const [needsRes, tasksRes, secRes] = await Promise.all([
    supabase.from('needs').select('*').eq('job_id', job.id).order('created_at'),
    supabase.from('tasks').select('id, title, section_id').eq('job_id', job.id),
    supabase.from('sections').select('*').eq('job_id', job.id)
  ])
  const allNeeds = needsRes.data || []
  const hidden = hiddenCategories || new Set()
  const needs = hidden.size > 0
    ? allNeeds.filter(n => !hidden.has(n.category || '__uncategorized__'))
    : allNeeds
  const taskMap = Object.fromEntries((tasksRes.data || []).map(t => [t.id, t]))
  const sectionMap = Object.fromEntries((secRes.data || []).map(s => [s.id, s]))

  const toList = recipients?.length ? recipients : [job.client_email]
  const html = buildWeeklyHtml(job, needs, taskMap, jobUrl, sectionMap, note || '')
  await sendEmail(toList, `Needs report — ${job.name}`, html)

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
