import { sendDailyReport, supabase } from '../../../lib/needs-email'

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('email_enabled', true)
    .not('client_email', 'is', null)

  const results = []
  for (const job of jobs || []) {
    const jobUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://tasks.foothillsjoinery.com'}/job/${job.id}`
    try {
      const sent = await sendDailyReport(job, jobUrl)
      results.push({ job: job.name, sent })
    } catch (e) {
      console.error(`Daily report failed for ${job.name}:`, e)
      results.push({ job: job.name, sent: false, error: e.message })
    }
  }

  res.status(200).json({ results })
}
