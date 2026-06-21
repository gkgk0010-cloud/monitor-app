import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { provisionTeacherForAuthUser } from '@/utils/provisionTeacherCore';

export async function POST(req) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { ok: false, error: '서버에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인해 주세요.' },
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
    return Response.json(
      { ok: false, error: userErr?.message || '세션이 유효하지 않습니다. 다시 로그인해 주세요.' },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const result = await provisionTeacherForAuthUser(admin, user, {
    academy_name: body.academy_name,
    teaching_type: body.teaching_type,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 422 });
  }
  return Response.json({
    ok: true,
    created: result.created,
    teacherId: result.teacherId,
  });
}
