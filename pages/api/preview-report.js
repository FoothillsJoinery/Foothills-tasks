import { buildWeeklyHtml, supabase } from '../../lib/needs-email'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { job_id, hidden, note, since } = req.query
  if (!job_id) return res.status(400).end()

  const { data: job, error } = await supabase.from('jobs').select('*').eq('id', job_id).single()
  if (error || !job) return res.status(404).end()

  const [needsRes, tasksRes, secRes] = await Promise.all([
    supabase.from('needs').select('*').eq('job_id', job_id).order('created_at'),
    supabase.from('tasks').select('id, title, section_id').eq('job_id', job_id),
    supabase.from('sections').select('*').eq('job_id', job_id)
  ])

  const hiddenCategories = new Set(Array.isArray(hidden) ? hidden : hidden ? [hidden] : [])
  const needs = (needsRes.data || []).filter(n => {
    const cat = n.category || '__uncategorized__'
    if (hiddenCategories.has(cat)) return false
    if (since && n.created_at < since) return false
    return true
  })
  const taskMap = Object.fromEntries((tasksRes.data || []).map(t => [t.id, t]))
  const sectionMap = Object.fromEntries((secRes.data || []).map(s => [s.id, s]))
  const jobUrl = `${req.headers.origin || 'https://foothillsjoinery.com'}/job/${job_id}`

  const html = buildWeeklyHtml(job, needs, taskMap, jobUrl, sectionMap, note || '', since || null)
  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(html)
}
