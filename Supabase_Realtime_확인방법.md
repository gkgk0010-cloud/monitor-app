# Supabase Realtime 확인 방법 (빨간불/파란불 실시간 반영)

**집중관리존**에서 학생이 문제를 풀 때마다 **새로고침 없이** 파란불/빨간불이 바뀌려면, Supabase에서 **Realtime(Postgres Changes)** 이 `student_status` 테이블에 켜져 있어야 합니다.

---

## ⚠️ 혼동하기 쉬운 점

- **PLATFORM → Replication** (BigQuery, Iceberg 등)  
  → **외부 데이터 웨어하우스로 복제**하는 메뉴입니다. **여기는 아닙니다.**
- 우리가 켜야 하는 건 **Database → Publications** 입니다.  
  → 여기서 `supabase_realtime` Publication에 `student_status`를 넣어야 **모니터 앱**이 새로고침 없이 갱신됩니다.

---

## 1단계: Supabase 대시보드 들어가기

1. 브라우저에서 **https://supabase.com** 접속
2. 로그인 후 **똑패스 모니터용 프로젝트(Tokpass 등)** 선택

---

## 2단계: Database → Publications 로 가기

1. **왼쪽 세로 메뉴**에서 **Database** 를 클릭합니다.
2. **Database** 아래에 **DATABASE MANAGEMENT** 섹션이 보입니다.
3. 그 안에 있는 **Publications** 를 클릭합니다.  
   - **Replication**이 아니라 **Publications** 입니다.  
   - Replication은 아래쪽 **PLATFORM** 섹션에 있고, 그건 쓰지 않습니다.

---

## 3단계: supabase_realtime 에서 student_status 확인

1. **Publications** 페이지가 열리면 **Publication 목록**이 보입니다.
2. **`supabase_realtime`** (또는 비슷한 이름) Publication을 클릭합니다.
3. 그 Publication에 **어떤 테이블이 포함되는지** 목록/토글이 보입니다.
4. **`student_status`** 가 **켜져(체크/포함)** 있는지 확인합니다.
   - **있고 켜져 있으면** → Realtime 설정 완료. 빨간불/파란불이 새로고침 없이 갱신됩니다.
   - **없거나 꺼져 있으면** → 4단계에서 추가합니다.

---

## 4단계: student_status 가 없을 때 추가하기

**방법 A: 대시보드에서**
1. `supabase_realtime` Publication 화면에서 **테이블 추가** 또는 **토글**이 있으면,
2. **`student_status`** 를 찾아서 **켜기(체크/추가)** 한 뒤 저장합니다.

**방법 B: SQL로**
1. 왼쪽에서 **SQL Editor** 로 이동
2. 아래 SQL을 붙여넣고 **Run** 합니다.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE student_status;
```

3. 에러 없이 실행되면 `student_status` 가 Realtime에 포함된 것입니다.

---

## 5단계: 동작 확인

- **모니터 앱**을 켜 둔 채로, 학생이 문제를 풀거나 상태가 바뀌게 하면,
- **접속 중**, **3연속 오답**, **빨간불/파란불** 등이 **새로고침 없이** 바뀌어야 합니다.
- 이미 이렇게 되고 있다면 Realtime은 이미 켜져 있는 것이고, 별도 설정은 필요 없습니다.

---

## 정리

| 확인할 것 | 가야 할 메뉴 | 하지 말아야 할 메뉴 |
|----------|-------------|---------------------|
| Realtime 테이블 설정 | **Database → Publications** | PLATFORM → Replication (BigQuery 등) |
| 할 일 | `supabase_realtime` 에 **student_status** 포함 | "Request alpha access", "Create read replica" 는 사용 안 함 |

**한 줄 요약:**  
**왼쪽 메뉴 Database → Publications** 로 가서 **supabase_realtime** 에 **student_status** 가 포함돼 있는지 확인/추가하면 됩니다.
