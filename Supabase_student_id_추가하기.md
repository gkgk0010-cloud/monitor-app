# Supabase에서 student_id 컬럼 추가하기 (지금 화면에서)

지금 **Database → Tables** 목록이 보이는 상태에서 아래만 따라하면 됩니다.

---

## 방법 A: SQL로 한 번에 하기 (가장 단순)

1. **왼쪽 사이드바**에서 **"SQL Editor"** 클릭  
   (Database 아래나 다른 메뉴에 있을 수 있음. "SQL Editor" 또는 "편집기" 같은 이름)

2. **"+ New query"** 로 새 쿼리 창 열기

3. 아래 SQL **전부 복사**해서 붙여넣고 **Run** (실행) 버튼 클릭:

```sql
-- 1) student_id 컬럼 추가
ALTER TABLE public.student_status
ADD COLUMN IF NOT EXISTS student_id text;

-- 2) 같은 사람이 한 줄만 있도록 unique 걸기
ALTER TABLE public.student_status
ADD CONSTRAINT student_status_student_id_key UNIQUE (student_id);
```

4. **"Success"** 나오면 끝.

5. (선택) 이미 있는 행(예: 철수)에 값 넣으려면 Table Editor에서 `student_status` 열고, 그 행의 `student_id` 칸에 `철수1234` 처럼 입력.

---

## 방법 B: 화면에서 컬럼 추가하기

1. **지금 테이블 목록**에서 **`student_status`** 이름을 **클릭**  
   → 테이블이 열리면서 컬럼(id, student_name, ...)과 데이터가 보임.

2. 컬럼 헤더 오른쪽 끝에 **"+"** 또는 **"Add column"** / **"새 열"** 버튼 찾기 → 클릭.

3. **새 컬럼 설정**:
   - **Name:** `student_id`
   - **Type:** `text`
   - **Nullable:** 체크 해제(필수로 두고 싶으면) 또는 그대로 두기  
   → **Save** / **저장**.

4. **Unique 설정**은 보통 테이블 설정에서:
   - 같은 화면에서 테이블 이름 옆 **톱니바퀴(설정)** 또는 **테이블 정보** 들어가기  
   - **student_id** 컬럼 옆에 **Unique** 체크  
   또는 **SQL Editor**에서 아래만 실행:
   ```sql
   ALTER TABLE public.student_status
   ADD CONSTRAINT student_status_student_id_key UNIQUE (student_id);
   ```

---

## 확인

- **Table Editor** → `student_status` 선택  
- 컬럼 목록에 **student_id** 가 보이면 성공.  
- 이제 똑패스에서 로그인하면 이 컬럼으로 자동 반영됩니다.

**여기서 못 따라가겠다** → **방법 A (SQL Editor)** 로 가서 SQL만 실행하는 게 가장 빠릅니다.
