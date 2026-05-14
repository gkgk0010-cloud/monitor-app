import { redirect } from 'next/navigation';

/** 북마크용 짧은 URL → 선생님 레이아웃 하위 실제 페이지 */
export default function LiveBattleRedirectPage() {
  redirect('/teacher/live-battle');
}
