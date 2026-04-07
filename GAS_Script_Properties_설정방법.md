# GAS Script Properties에 Supabase URL/Key 넣는 방법

## 1. Supabase에서 URL·Key 복사하기

1. **Supabase 대시보드** 접속 → 사용 중인 프로젝트 선택  
   (예: https://supabase.com/dashboard)
2. 왼쪽 메뉴에서 **⚙️ Project Settings** (프로젝트 설정) 클릭
3. **API** 탭 클릭
4. 아래 두 값을 **복사**해 두기:
   - **Project URL** (예: `https://xxxxxxxx.supabase.co`)
   - **Project API keys** 중 **anon public** 키 (긴 문자열)

---

## 2. Google Apps Script에서 Script Properties 열기

1. **Google Apps Script** (똑패스 GAS 프로젝트) 열기  
   - 브라우저에서 https://script.google.com 접속  
   - 똑패스용으로 만든 프로젝트 선택
2. 왼쪽 **사이드바**에서:
   - **⚙️ 프로젝트 설정** (Project settings) 아이콘 클릭  
     - 또는 상단 메뉴 **프로젝트 설정** (Project settings)
3. 아래로 내려가서 **"스크립트 속성" (Script properties)** 섹션 찾기

---

## 3. 속성 추가하기

1. **"스크립트 속성 추가"** (Add script property) 클릭
2. **첫 번째 속성**
   - **속성** (Property): `SUPABASE_URL`
   - **값** (Value): 1번에서 복사한 **Project URL** 붙여넣기  
   → **스크립트 속성 저장** 클릭
3. 다시 **"스크립트 속성 추가"** 클릭
4. **두 번째 속성**
   - **속성**: `SUPABASE_ANON_KEY`
   - **값**: 1번에서 복사한 **anon public** 키 붙여넣기  
   → **스크립트 속성 저장** 클릭

---

## 4. 확인

- 스크립트 속성 목록에 **SUPABASE_URL**, **SUPABASE_ANON_KEY** 두 개가 보이면 됨
- **값은 다른 사람에게 보이지 않도록** 노출되지 않음 (표시만 되거나 마스킹됨)

---

## 5. 똑패스 앱에 반영

- **새로 배포할 필요 없음** (Script Properties는 서버에 이미 저장됨)
- **똑패스 웹앱**에서 학생이 **한 번 로그인**하면, 그때 `getMonitorConfig()`가 이 값들을 읽어서 Supabase에 연결함
- 이후 퀴즈 풀기·상태 변경 시 `student_status` 테이블로 자동 전송됨

---

## 요약

| 단계 | 할 일 |
|------|--------|
| 1 | Supabase 대시보드 → Project Settings → API 에서 **Project URL**, **anon public key** 복사 |
| 2 | script.google.com → 똑패스 프로젝트 → **프로젝트 설정** |
| 3 | **스크립트 속성**에서 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 추가 후 값 붙여넣기 |

이렇게 하면 똑패스 앱이 Supabase와 연결됩니다.

---

## (선택) 랭킹 지난달 매칭 방식

**지난달 랭킹**과 **이번 달 학생**을 어떻게 같은 사람으로 볼지 설정할 수 있습니다.

### 방법 1: 한 번만 설정 (자동 전환, 권장)

| 속성 이름 | 값 | 설명 |
|-----------|-----|------|
| `RANKING_NAME_ONLY_UNTIL_MONTH` | `2026-02` (이번 달 yyyy-MM) | **이 달까지**는 이름만 같으면 같은 사람. **다음 달부터는 자동으로** uid만 같을 때만 같은 사람으로 전환됨. |

- **설정**: 스크립트 속성에 `RANKING_NAME_ONLY_UNTIL_MONTH` = `2026-02` (지금이 2월이면) 한 번만 넣기.
- **다음 달(3월)부터** 별도 수정 없이 자동으로 "이름+번호4자리"만 같을 때만 같은 사람으로 인식합니다.

### 방법 2: 매달 수동 전환

| 속성 이름 | 값 | 설명 |
|-----------|-----|------|
| `RANKING_LAST_MONTH_MATCH_MODE` | `name_only` | **이름만** 같으면 같은 사람. |
| (설정 안 함 또는) `uid_only` | (기본) | **uid(이름+번호4자리)**가 같아야 같은 사람. |

- 이번 달만 이름 매칭 쓰려면 `name_only`로 두고, 다음 달 되면 속성 삭제하거나 `uid_only`로 바꿔야 합니다.
