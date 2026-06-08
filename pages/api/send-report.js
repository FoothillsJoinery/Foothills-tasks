import { sendWeeklyReport, supabase } from '../../lib/needs-email'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { job_id, recipients, hidden_categories } = req.body
  if (!job_id) return res.status(400).json({ error: 'Missing job_id' })

  const { data: job, error } = await supabase.from('jobs').select('*').eq('id', job_id).single()
  if (error || !job) return res.status(404).json({ error: 'Job not found' })

  const toList = recipients?.length ? recipients : (job.client_email ? [job.client_email] : [])
  if (toList.length === 0) return res.status(400).json({ error: 'No recipients' })

  const jobUrl = `${req.headers.origin || 'https://foothillsjoinery.com'}/job/${job_id}`

  try {
    await sendWeeklyReport(job, jobUrl, { recipients: toList, hiddenCategories: new Set(hidden_categories || []) })
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Send report error:', e)
    res.status(500).json({ error: 'Failed to send report' })
  }
}
