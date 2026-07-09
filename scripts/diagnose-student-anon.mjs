import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('missing SUPABASE_URL/ANON_KEY')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

async function section(label, fn) {
  console.log('\n=== ' + label + ' ===')
  const { data, error } = await fn()
  if (error) console.log('ERROR:', error.message, error.code, error.details)
  else console.log(JSON.stringify(data, null, 2))
  return { data, error }
}

const u8226 = '이자윤8226'
const u3289 = '이자윤3289'

for (const uid of [u8226, u3289]) {
  await section('students: ' + uid, () =>
    sb
      .from('students')
      .select('id, "User ID", Name, teacher_id, academy_id, class, __sheet_name, "Last Active"')
      .eq('User ID', uid)
      .order('__sheet_name'),
  )
}

for (const uid of [u8226, u3289]) {
  await section('student_set_access: ' + uid, () =>
    sb.from('student_set_access').select('id, student_id, set_id, joined_at').eq('student_id', uid),
  )
}

await section('teachers 노원준', () =>
  sb.from('teachers').select('id, name, academy_id, visible_menus, teaching_type').ilike('name', '%노원준%'),
)

await section('teachers 9fce1aae', () =>
  sb.from('teachers').select('id, name, academy_id, visible_menus').ilike('id', '%9fce1aae%'),
)

await section('academies 152a56af', () => sb.from('academies').select('id, name, auth_mode').ilike('id', '%152a56af%'))
