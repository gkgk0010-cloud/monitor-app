import pg from 'pg'
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

const dbUrl = env.SUPABASE_DB_URL
const poolerUrl = dbUrl?.replace(
  '@db.shfmyqdbnvrudumckvat.supabase.co:5432',
  '@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?options=project%3Dshfmyqdbnvrudumckvat',
)?.replace('postgresql://postgres:', 'postgresql://postgres.shfmyqdbnvrudumckvat:')

const client = new pg.Client({
  connectionString: poolerUrl || dbUrl,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const UID = '이자윤8226'
const SHEET = 'User_Profile_2026-07'
const TID = '9fce1aae-b9d5-4e23-919a-958cde204236'
const AID = '152a56af-90ea-4e0f-9078-5c3ded9c0beb'

console.log('BEFORE:')
const before = await client.query(
  `SELECT id, "User ID", teacher_id, academy_id, __sheet_name FROM students WHERE "User ID" = $1 ORDER BY __sheet_name`,
  [UID],
)
console.log(JSON.stringify(before.rows, null, 2))

const upd = await client.query(
  `UPDATE students SET teacher_id = $1, academy_id = $2 WHERE "User ID" = $3 AND __sheet_name = $4 RETURNING id, teacher_id, academy_id, __sheet_name`,
  [TID, AID, UID, SHEET],
)
console.log('\nUPDATED:', JSON.stringify(upd.rows, null, 2))

console.log('\nAFTER ALL ROWS:')
const after = await client.query(
  `SELECT id, "User ID", teacher_id, academy_id, __sheet_name FROM students WHERE "User ID" = $1 ORDER BY __sheet_name`,
  [UID],
)
console.log(JSON.stringify(after.rows, null, 2))

await client.end()
