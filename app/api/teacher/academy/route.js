import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { insertAcademyRowAdmin } from '@/utils/provisionTeacherCore';
import { normalizeTeachingType } from '@/utils/teacherSignupShared';

export async function POST(req) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { ok: false, error: '서버에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(token);
  if (userErr || !user?.email) {
    return Response.json({ ok: false, error: '세션이 유효하지 않습니다.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) {
    return Response.json({ ok: false, error: '학원명이 비어 있습니다.' }, { status: 400 });
  }

  const teachingType = normalizeTeachingType(body.teaching_type);
  const result = await insertAcademyRowAdmin(admin, name, teachingType);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 422 });
  }
  return Response.json({ ok: true, academyId: result.academyId });
}
