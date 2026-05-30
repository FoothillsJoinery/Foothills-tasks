import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fdaqspcusvirljyjffqr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkYXFzcGN1c3ZpcmxqeWpmZnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTkzNzcsImV4cCI6MjA5NTczNTM3N30.7cI5b-Yh_jX1cAr0QCDhtvfLPSMNuzrelKLWNBjMrwQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
