# 똑패스 모니터 앱 — Vercel 배포 가이드

Next.js 앱이라 **Vercel**이 가장 잘 맞고, **무료(Hobby)** 플랜으로 충분합니다.

---

## 1. 준비 (한 번만)

### 1-1. Git 저장소
- 코드가 **GitHub / GitLab / Bitbucket** 중 하나에 올라가 있어야 합니다.
- 아직이면: 똑패스 폴더에서 `monitor-app`만 배포할 수 있도록, **monitor-app 폴더를 루트로 하는 새 저장소**를 만드는 게 좋습니다.
  - GitHub에서 새 저장소 생성 → 로컬에서 `monitor-app` 폴더만 그 저장소로 push.

### 1-2. 환경 변수 확인
- 로컬에 `monitor-app/.env.local` 이 있다면, 아래 두 값을 메모해 두세요 (Vercel에 입력할 때 씁니다).
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 없어도 됩니다. Supabase 대시보드 → **Project Settings → API** 에서 **Project URL**과 **anon public** 키를 복사해 두면 됩니다.

---

## 1-3. (선택) Git 없이 CLI로 배포
- 터미널에서 `monitor-app` 폴더로 이동 후:
  - `npm i -g vercel` (Vercel CLI 설치, 한 번만)
  - `vercel` 실행 → 로그인 안내 따라 로그인
  - 프로젝트 이름·설정 질문에 엔터만 쳐도 됨
- 배포 후 Vercel 대시보드에서 **Settings → Environment Variables** 에 위 두 환경 변수 추가하고 **Redeploy** 하면 됩니다.

---

## 2. Vercel 배포 (단계별)

### 2-1. Vercel 가입·로그인
1. https://vercel.com 접속
2. **Sign Up** → **Continue with GitHub** (또는 GitLab/Bitbucket) 선택
3. GitHub 계정으로 로그인·권한 허용

### 2-2. 새 프로젝트 만들기
1. Vercel 대시보드에서 **Add New… → Project**
2. **Import Git Repository** 에서 방금 올려둔 저장소 선택 (예: `your-username/똑패스-monitor` 같은 이름)
3. **Import** 클릭

### 2-3. 프로젝트 설정 (중요)
- **Framework Preset:** Next.js (자동 감지됨)
- **Root Directory:** 저장소 루트가 `monitor-app`이면 비워 두고, 똑패스 전체 저장소라면 **`monitor-app`** 입력
- **Build Command:** `npm run build` (기본값 그대로)
- **Output Directory:** 비워 두기 (기본값)
- **Install Command:** `npm install` (기본값)

### 2-4. 환경 변수 넣기 (필수)
**Environment Variables** 섹션에서 다음 두 개 추가:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (예: `https://xxxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key (긴 JWT 문자열) |

- **Environment:** Production, Preview, Development 전부 체크해 두면 편합니다.
- **Save** 또는 **Add** 후 **Deploy** 클릭

### 2-5. 배포 완료
- 빌드가 끝나면 **Visit** 또는 배포 URL로 접속합니다.
- 모니터 화면 주소 예:  
  `https://프로젝트이름.vercel.app/teacher/monitor`
- 나중에 **Settings → Domains** 에서 커스텀 도메인(예: `monitor.똑패스.com`)도 연결할 수 있습니다.

---

## 3. 이후 수정사항 반영

- **Git 저장소에 push** 하면 Vercel이 자동으로 다시 빌드·배포합니다.
- `main`(또는 기본 브랜치)에 push할 때마다 Production 배포가 갱신됩니다.

---

## 4. 문제 해결

| 증상 | 확인할 것 |
|------|------------|
| 빌드 실패 | Vercel 빌드 로그에서 에러 메시지 확인. 대부분 `npm install` / `npm run build` 실패 또는 경로 문제 |
| 모니터 화면이 안 뜸 / 데이터 안 나옴 | Vercel **Settings → Environment Variables** 에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 가 정확히 들어갔는지 확인. 수정 후 **Redeploy** |
| 404 | URL이 `/teacher/monitor` 인지 확인 (맨 뒤 슬래시 없이) |

---

## 5. 요약 체크리스트

- [ ] monitor-app 코드가 GitHub 등 Git 저장소에 있음
- [ ] Vercel에서 해당 저장소로 새 Project 생성
- [ ] Root Directory: 저장소가 똑패스 전체면 `monitor-app`, 모니터만 있으면 비움
- [ ] 환경 변수 2개 추가 (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- [ ] Deploy 후 `https://xxx.vercel.app/teacher/monitor` 로 접속 테스트

이대로 하시면 PC 없이 태블릿·휴대폰에서도 모니터 주소만 열면 됩니다.
