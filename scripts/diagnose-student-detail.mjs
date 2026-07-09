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

const NOWONJUN = '9fce1aae-b9d5-4e23-919a-958cde204236'
const EZETOUR = '152a56af-90ea-4e0f-9078-5c3ded9c0beb'
const OTHER_T = '688d97d9-d466-4106-8ffd-5f62e54541a6'
const OTHER_A = '13eb0b97-609c-4fe4-99a4-532e86f6be9e'

const sets8226 = ['caadc6a8-8e4b-499b-b144-520c7b0f51fd', '0c7b237c-014e-4763-a793-bc9973ff6f72']

console.log('=== word_sets for 8226 access ===')
const ws1 = await sb.from('word_sets').select('id, name, invite_code, teacher_id, academy_id').in('id', sets8226)
console.log(JSON.stringify(ws1.data, null, 2), ws1.error?.message)

console.log('\n=== word_sets 노원준 teacher ===')
const ws2 = await sb.from('word_sets').select('id, name, invite_code, teacher_id, academy_id').eq('teacher_id', NOWONJUN).order('name')
console.log(JSON.stringify(ws2.data, null, 2))

console.log('\n=== teacher 688d97d9 ===')
const t = await sb.from('teachers').select('id, name, academy_id, visible_menus').eq('id', OTHER_T).maybeSingle()
console.log(JSON.stringify(t.data, null, 2))

console.log('\n=== academy comparison ===')
const ac = await sb.from('academies').select('id, name, auth_mode').in('id', [EZETOUR, OTHER_A])
console.log(JSON.stringify(ac.data, null, 2))

console.log('\n=== peer student set_access (same teacher, limit 3 students) ===')
const peers = await sb.from('students').select('"User ID"').eq('teacher_id', NOWONJUN).neq('User ID', '이자윤8226').limit(3)
for (const p of peers.data || []) {
  const uid = p['User ID']
  const acc = await sb.from('student_set_access').select('set_id').eq('student_id', uid)
  console.log(uid, acc.data?.map((x) => x.set_id))
}
