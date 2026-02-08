# PDF 문구 교정본 (현재 코드 기준)

대상 PDF: `피싱·스캠 예방을 위한 서비스 개발 경진대회 예선 산출물 양식.pdf`

원칙
- “현재 구현”과 다른 기술/구조는 확장안으로 이동하거나 표현을 낮춥니다.
- 정량 수치는 “성과”가 아니라 “목표/가설”로 표기합니다(검증 질문 대비).
- 서버 DB 저장 없음은 유지하되, 브라우저 `sessionStorage`(탭 세션) 사용은 명시합니다.

---

## Page 1) 문제 정의 / 중요성 / 대상 / 기대 지표

### 수정 1: 정량 수치 표현(성과처럼 보이는 문구 완화)
- 현재: `-40% 민감 정보 노출 감소`, `ZERO 맞춤형 피싱 피해`
- 바꿀 문구: `정량 목표: 민감 정보 노출 감소(예: 위치/가족/동선 단서 수)`, `목표: 맞춤형 피싱 피해 최소화`

### 수정 2: “측정 방법” 한 줄 추가(심사 Q&A 방어)
- 현재: (수치만 존재)
- 바꿀 문구(추가): `측정: 점검 전/후 위험 게시물 비공개 전환율, 위험 단서(텍스트/이미지) 개수 변화`

---

## Page 2) 4-Step Analysis Pipeline / Outputs / Differentiators

### 수정 1: 수집 방식 기술 스택 정합성
- 현재: `모바일 페이지 기반 텍스트 추출 (BeautifulSoup / Playwright)`
- 바꿀 문구: `m.blog.naver.com 기반 수집 (Next.js API Route + fetch + cheerio 파싱, 내부 엔드포인트 호출)`

### 수정 2: Privacy First 문구 정확화
- 현재: `분석 데이터는 메모리 내 일시 처리 후 즉시 폐기, 서버에 개인정보 로그를 남기지 않음`
- 바꿀 문구: `서버 DB에 저장하지 않음. 결과는 브라우저 sessionStorage(탭 세션)에서만 유지되며 사용자가 즉시 삭제 가능`

---

## Page 3) Core Features & Capabilities

### 수정 1: Auto Detection 입력 표현 통일
- 현재: `사용자 URL 입력 시 ...`
- 바꿀 문구: `사용자 블로그 아이디/URL 입력 시 ...`

### 수정 2: “이미지 단서” 기능 명시(현재 구현 반영)
- 현재: 텍스트/메타데이터 중심 설명
- 바꿀 문구(추가): `이미지 단서는 Vision 모델로 점진 분석하여(429 회피) 배송 라벨/명찰 등 위험 신호를 탐지`

---

## Page 4) Service Architecture / System Flow / Infrastructure

### 수정 1: Backend/Collector 스택 불일치 제거(가장 중요)
- 현재: `Collector: Python/BS4/Playwright`, `FastAPI (Backend)`
- 바꿀 문구: `Collector/Backend: Next.js(App Router) API Routes(Node.js)에서 수집/분석/시뮬레이터 수행`

### 수정 2: Visualizer 라이브러리 과다 표기 정리
- 현재: `React Flow / ECharts / D3.js`
- 바꿀 문구: `React Flow (공격 경로 그래프 시각화)`

---

## Page 5) User Journey (7-Step Process)

### 수정 1: “동의” 단계 구현 반영
- 현재: `URL 입력 & 동의` + `개인정보 처리 방침 및 분석 동의 진행`
- 바꿀 문구: `홈에서 개인정보 처리 안내(요약) 제공 + 체크박스 동의 후 분석 진행`

### 수정 2: Disposal(자동 폐기) 표현 정확화
- 현재: `세션 종료 후 서버 저장되지 않고 즉시 영구 삭제`
- 바꿀 문구: `서버 DB 저장 없음. 결과는 브라우저 sessionStorage(탭 세션)에서만 유지되며, 탭 종료 또는 '리포트 지우기'로 제거`

### 수정 3: Scanning 게시글 수 표현
- 현재: `10~20개 자동 수집`
- 바꿀 문구: `최근 공개 게시물 최대 N개(예: 10~20개) 수집` (구현 값에 맞춰 N을 최종 확정)

---

## Page 6) Expected Impact / Expansion Roadmap

### 수정 1: Impact 수치의 성격(목표/가설) 명시
- 현재: `40% 개인정보 노출량 감소`, `Low 공격 성공률 하락` (성과처럼 보일 수 있음)
- 바꿀 문구: `기대 효과(목표): 개인정보 노출량 감소`, `기대 효과(가설): 사회공학적 피싱 성공률 하락`

