import { supabase } from '@/utils/supabaseClient';

export const ACADEMY_LOGOS_BUCKET = 'academy-logos';

/**
 * 공개 URL에서 Storage 객체 경로 추출 (삭제용)
 * @param {string} publicUrl
 * @returns {string | null}
 */
export function pathFromAcademyLogoPublicUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  const marker = `/storage/v1/object/public/${ACADEMY_LOGOS_BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return publicUrl.slice(i + marker.length);
}

export function sanitizeLogoFilename(name) {
  const base = (name || 'logo').replace(/[/\\?%*:|"<>]/g, '_');
  return base.slice(0, 120) || 'logo';
}

/**
 * @param {string} teacherId
 * @param {File} file
 * @returns {Promise<{ path: string, publicUrl: string }>}
 */
export async function uploadAcademyLogoFile(teacherId, file) {
  const ts = Date.now();
  const path = `${teacherId}/${ts}_${sanitizeLogoFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from(ACADEMY_LOGOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(ACADEMY_LOGOS_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error('공개 URL을 가져오지 못했습니다.');
  return { path, publicUrl };
}

/**
 * Storage 업로드 후 teachers.academy_logo_url 갱신. 이전 URL이 있으면 삭제 시도(실패 무시).
 * @param {string} teacherId
 * @param {File} file
 * @param {string | null | undefined} previousPublicUrl
 */
export async function uploadAndAssignAcademyLogo(teacherId, file, previousPublicUrl) {
  if (previousPublicUrl) {
    await removeAcademyLogoFileByPublicUrl(previousPublicUrl).catch(() => {});
  }
  const { publicUrl } = await uploadAcademyLogoFile(teacherId, file);
  const { error } = await supabase.from('teachers').update({ academy_logo_url: publicUrl }).eq('id', teacherId);
  if (error) throw error;
  return publicUrl;
}

/**
 * DB만 NULL + Storage 삭제 시도
 * @param {string} teacherId
 * @param {string | null | undefined} currentPublicUrl
 */
export async function clearTeacherAcademyLogo(teacherId, currentPublicUrl) {
  const { error } = await supabase.from('teachers').update({ academy_logo_url: null }).eq('id', teacherId);
  if (error) throw error;
  if (currentPublicUrl) {
    await removeAcademyLogoFileByPublicUrl(currentPublicUrl).catch(() => {});
  }
}

/** 베스트 에포트: 기존 공개 URL 객체 삭제 */
export async function removeAcademyLogoFileByPublicUrl(publicUrl) {
  const path = pathFromAcademyLogoPublicUrl(publicUrl);
  if (!path) return { ok: false, skipped: true };
  const { error } = await supabase.storage.from(ACADEMY_LOGOS_BUCKET).remove([path]);
  if (error) {
    console.warn('[academyStorage] 로고 파일 삭제 실패:', error.message);
    return { ok: false, error };
  }
  return { ok: true };
}
