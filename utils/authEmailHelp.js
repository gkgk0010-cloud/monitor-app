/**
 * Supabase Auth 이메일 오류 → 사용자·운영자 조치 안내
 * (대시보드 Rate limits·기본 SMTP 제한 등)
 */
export function explainAuthEmailError(err) {
  if (err == null) return '요청에 실패했습니다.';
  const raw = String(err.message ?? err);
  const m = raw.toLowerCase();

  if (
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('email rate limit') ||
    m.includes('exceeded') ||
    raw.includes('429')
  ) {
    return [
      '이메일 발송 한도에 걸렸습니다.',
      'Supabase는 기본(내장) SMTP를 쓰는 동안「시간당 이메일」한도를 Rate limits 화면에서 임의로 올리지 못하게 되어 있는 경우가 많습니다(문서상 조정은 Custom SMTP 연동 후).',
      '근본 해결: 대시보드 Authentication → SMTP에서 Resend·SendGrid 등을 연결한 뒤, 같은 화면의 Rate limits에서 발송 한도를 올리세요.',
      '당장은 1시간 뒤 다시 시도해 보세요.',
    ].join(' ');
  }

  if (m.includes('not authorized') || m.includes('email address not authorized')) {
    return [
      '기본 SMTP는 조직 팀 멤버 메일 등만 허용될 수 있습니다.',
      'Supabase → Authentication → SMTP에서 커스텀 SMTP(Resend 등)를 켜면 모든 주소로 발송할 수 있습니다.',
    ].join(' ');
  }

  return raw;
}
