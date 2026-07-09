import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const UID = '이자윤8226'
const SHEET = 'User_Profile_2026-07'
const TID = '9fce1aae-b9d5-4e23-919a-958cde204236'
const AID = '152a56af-90ea-4e0f-9078-5c3ded9c0beb'

console.log('BEFORE')
const before = await sb
  .from('students')
  .select('id, teacher_id, academy_id, __sheet_name')
  .eq('User ID', UID)
  .order('__sheet_name')
console.log(JSON.stringify(before.data, null, 2), before.error?.message)

const upd = await sb
  .from('students')
  .update({ teacher_id: TID, academy_id: AID })
  .eq('User ID', UID)
  .eq('__sheet_name', SHEET)
  .select('id, teacher_id, academy_id, __sheet_name')

console.log('\nUPDATE RESULT')
console.log(JSON.stringify(upd.data, null, 2), upd.error?.message)

const after = await sb
  .from('students')
  .select('id, teacher_id, academy_id, __sheet_name')
  .eq('User ID', UID)
  .order('__sheet_name')
console.log('\nAFTER')
console.log(JSON.stringify(after.data, null, 2))
