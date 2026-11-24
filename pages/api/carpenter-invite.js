import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// Generates a Supabase magic link that signs a roster carpenter in and lands
// them on a specific job. Optionally emails it to them via Resend.
//
// Requires env vars:
//   SUPABASE_SERVICE_ROLE_KEY  — needed for auth.admin.generateLink (server only)
//   RESEND_API_KEY             — needed when send = true
// Optional: ADMIN_EMAIL, RESEND_FROM_EMAIL, RESEND_REPLY_TO, NEXT_PUBLIC_SITE_URL

const SUPABASE_URL = 'https://fdaqspcusvirljyjffqr.supabase.co'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'matt@foothillsjoinery.com').toLowerCase()

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function inviteHtml(carpName, jobName, link) {
  const first = escapeHtml((carpName || '').trim().split(/\s+/)[0] || 'there')
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1a1a18;margin:0 auto">
      <div style="font-size:11px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">You've been added to a job</div>
      <div style="font-size:22px;font-weight:700;margin:0 0 16px">${escapeHtml(jobName)}</div>
      <p style="font-size:14px;line-height:1.5;margin:0 0 20px">Hi ${first}, Foothills Joinery has given you access to this job in the task tracker. Tap below to sign in — it will take you straight to the job.</p>
      <a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a1a18;color:white;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Open ${escapeHtml(jobName)}</a>
      <p style="font-size:12px;color:#888780;line-height:1.5;margin:20px 0 0">This sign-in link works once and expires soon. If it has expired, ask Foothills Joinery to resend it, or sign in from the crew page with your email.</p>
      <p style="margin-top:24px;font-size:11px;color:#b4b2a9">Foothills Joinery</p>
    </div>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' })
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Only the admin may generate sign-in links for other people
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData?.user || (authData.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin only' })
  }

  const { job_id, carpenter_id, send } = req.body || {}
  if (!job_id || !carpenter_id) return res.status(400).json({ error: 'Missing job_id or carpenter_id' })

  const [jobRes, carpRes, accessRes] = await Promise.all([
    admin.from('jobs').select('id, name').eq('id', job_id).single(),
    admin.from('carpenters').select('*').eq('id', carpenter_id).single(),
    admin.from('job_access').select('id').eq('job_id', job_id).eq('carpenter_id', carpenter_id).is('revoked_at', null).limit(1)
  ])
  const job = jobRes.data
  const carp = carpRes.data
  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (!carp || !carp.active) return res.status(404).json({ error: 'Carpenter not found or inactive' })
  if (!accessRes.data?.length) return res.status(400).json({ error: 'Carpenter does not have access to this job' })

  const email = carp.email.trim().toLowerCase()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.headers.origin || 'https://tasks.foothillsjoinery.com'
  const redirectTo = `${origin.replace(/\/$/, '')}/job/${job_id}`

  // Magic links need an existing auth user; create one (pre-confirmed) if needed
  const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (createErr && !/already|registered|exists/i.test(createErr.message || '')) {
    console.error('Invite createUser error:', createErr)
    return res.status(500).json({ error: 'Could not create sign-in account' })
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo }
  })
  const link = linkData?.properties?.action_link
  if (linkErr || !link) {
    console.error('Invite generateLink error:', linkErr)
    return res.status(500).json({ error: 'Could not generate sign-in link' })
  }

  if (send) {
    const { error: sendErr } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'tasks@foothillsjoinery.com',
      reply_to: process.env.RESEND_REPLY_TO || 'matt@foothillsjoinery.com',
      to: email,
      subject: `You've been added to ${job.name}`,
      html: inviteHtml(carp.name, job.name, link)
    })
    if (sendErr) {
      console.error('Invite Resend error:', sendErr)
      return res.status(502).json({ error: 'Failed to send invite email', link })
    }
  }

  res.status(200).json({ ok: true, link, sent: !!send })
}
