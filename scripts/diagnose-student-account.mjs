import pg from 'pg'
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

const dbUrl = env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL missing in tokpass/.env')
  process.exit(1)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

async function run(label, sql, params = []) {
  console.log('\n=== ' + label + ' ===')
  try {
    const res = await client.query(sql, params)
    console.log(JSON.stringify(res.rows, null, 2))
    return res.rows
  } catch (e) {
    console.error('ERROR:', e.message)
    return []
  }
}

const u8226 = '이자윤8226'
const u3289 = '이자윤3289'

await run('students: ' + u8226, `
  SELECT id, "User ID", "Name", teacher_id, academy_id, class, __sheet_name, "Last Active"
  FROM students WHERE "User ID" = $1 ORDER BY __sheet_name
`, [u8226])

await run('students: ' + u3289, `
  SELECT id, "User ID", "Name", teacher_id, academy_id, class, __sheet_name, "Last Active"
  FROM students WHERE "User ID" = $1 ORDER BY __sheet_name
`, [u3289])

await run('student_set_access: ' + u8226, `
  SELECT ssa.id, ssa.student_id, ssa.set_id, ssa.joined_at, ws.name AS set_name, ws.teacher_id, ws.academy_id
  FROM student_set_access ssa
  LEFT JOIN word_sets ws ON ws.id = ssa.set_id
  WHERE ssa.student_id = $1
  ORDER BY ssa.joined_at DESC NULLS LAST
`, [u8226])

await run('student_set_access: ' + u3289, `
  SELECT ssa.id, ssa.student_id, ssa.set_id, ssa.joined_at, ws.name AS set_name, ws.teacher_id, ws.academy_id
  FROM student_set_access ssa
  LEFT JOIN word_sets ws ON ws.id = ssa.set_id
  WHERE ssa.student_id = $1
  ORDER BY ssa.joined_at DESC NULLS LAST
`, [u3289])

const teachers = await run('teachers (노원준 / 9fce1aae)', `
  SELECT id, name, email, academy_id, invite_code, teaching_type,
         jsonb_object_keys(visible_menus) AS visible_menu_keys_sample
  FROM teachers
  WHERE name ILIKE '%노원준%' OR id::text ILIKE '%9fce1aae%'
`)

await run('teachers visible_menus full (노원준)', `
  SELECT id, name, visible_menus
  FROM teachers
  WHERE id::text ILIKE '%9fce1aae%' OR name ILIKE '%노원준%'
  LIMIT 1
`)

await run('academies (152a56af)', `
  SELECT id, name, auth_mode FROM academies WHERE id::text ILIKE '%152a56af%'
`)

const tidRows = await client.query(`
  SELECT id FROM teachers WHERE id::text ILIKE '%9fce1aae%' LIMIT 1
`)
const tid = tidRows.rows[0]?.id

if (tid) {
  await run('word_sets for teacher ' + tid, `
    SELECT id, name, invite_code, academy_id, teacher_id
    FROM word_sets WHERE teacher_id = $1 ORDER BY name
  `, [tid])

  await run('8226 set_access vs 노원준 sets', `
    SELECT ws.id, ws.name, ws.invite_code,
           EXISTS(SELECT 1 FROM student_set_access s WHERE s.student_id = $2 AND s.set_id = ws.id) AS has_access
    FROM word_sets ws
    WHERE ws.teacher_id = $1
    ORDER BY ws.name
  `, [tid, u8226])
}

const st3289 = await client.query(`
  SELECT DISTINCT teacher_id, academy_id FROM students
  WHERE "User ID" = $1 AND teacher_id IS NOT NULL LIMIT 1
`, [u3289])

if (st3289.rows[0]?.teacher_id) {
  await run('3289 teacher', `
    SELECT id, name, academy_id, visible_menus FROM teachers WHERE id = $1
  `, [st3289.rows[0].teacher_id])
}

await run('8226 homeworks/absence sample', `
  SELECT 'homeworks' AS tbl, "ID", "이름", "방이름", __sheet_name FROM homeworks WHERE "ID" = $1 LIMIT 5
  UNION ALL
  SELECT 'absence', "ID", "실명", "반", __sheet_name FROM absence WHERE "ID" = $1 LIMIT 5
`, [u8226])

await client.end()
