import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { clientEmail, jobName, taskTitle, needText, category, loggedBy, jobUrl } = req.body
  if (!clientEmail || !jobName || !needText) return res.status(400).json({ error: 'Missing fields' })

  const categoryLine = category ? `<p style="margin:0 0 8px"><strong>Category:</strong> ${category}</p>` : ''

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@foothillsjoinery.com',
    reply_to: process.env.RESEND_REPLY_TO || 'matt@foothillsjoinery.com',
    to: clientEmail,
    subject: `Action needed: ${jobName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#1a1a18">
        <h2 style="margin:0 0 16px;font-size:18px">Something is needed on your project</h2>
        <p style="margin:0 0 8px"><strong>Job:</strong> ${jobName}</p>
        <p style="margin:0 0 8px"><strong>Task:</strong> ${taskTitle || '—'}</p>
        ${categoryLine}
        <p style="margin:0 0 16px"><strong>What's needed:</strong> ${needText}</p>
        <p style="margin:0 0 16px;color:#888">Logged by ${loggedBy}</p>
        ${jobUrl ? `<a href="${jobUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a18;color:white;text-decoration:none;border-radius:6px;font-size:14px">View job</a>` : ''}
      </div>
    `
  })

  if (error) {
    console.error('Resend error:', error)
    return res.status(500).json({ error: 'Failed to send email' })
  }

  res.status(200).json({ ok: true })
}
