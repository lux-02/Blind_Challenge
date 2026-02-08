Blind Challenge (블라인드 챌린지) MVP

네이버 블로그 챌린지(예: #블챌) 카테고리의 공개 글을 수집해 OSINT 관점의 위험 신호를 추출하고,
`단서 -> 위험 요소 -> 공격 시나리오` 흐름을 그래프로 시각화하는 보안 인식용 MVP입니다.

핵심 메시지: 블챌 참여자는 “포인트/이벤트”만 보지만, 공격자는 그 뒤의 디지털 풋프린트를 봅니다.

## Getting Started

### 1) 설치

```bash
npm i
```

### 2) 환경 변수

`.env.local`:

```bash
OPENAI_API_KEY=...
```

선택(모델/튜닝):

```bash
# Text analysis model (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# LLM graph model (default: gpt-4o-mini)
OPENAI_GRAPH_MODEL=gpt-4o-mini

# Phishing simulator model (default: gpt-4o)
OPENAI_PHISHING_MODEL=gpt-4o

# Progressive Vision batching (default: 12)
BLINDCHAL_VISION_MAX_IMAGES_PER_CALL=12

# Max image bytes when downloading for Vision (default: 1500000)
BLINDCHAL_MAX_IMAGE_BYTES=1500000
```

### 3) 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## 데모 플로우(심사용)

1. `/`에서 네이버 ID 또는 블로그 URL 입력
2. `/analysis`에서 챌린지 카테고리 후보를 자동 탐지하고 선택
3. 분석 완료 후 `/report`로 이동
4. `/report`에서 다음을 확인
   - 상단 임팩트 카드: "왜 지금 중요한가" (위험 신호 규모/상위 게시물 집중도)
   - `Top 위험 게시물`: 게시물별 점수 + 권장 조치(1~2개) 고정 노출, 클릭 시 근거로 스크롤
   - React Flow 그래프: `텍스트 단서/이미지 단서 -> 위험 -> 시나리오` 연결(LLM 그래프 우선)
   - 근거 탐색기: 단서 클릭 -> 해당 포스트/발췌/AI 근거 하이라이트
   - "나를 노리는 가상 피싱 문자": 훈련용 시뮬레이터(SMS + 보이스피싱 대본)

## 주요 기능

- 실스크래핑: `m.blog.naver.com` 기반 카테고리/포스트/이미지 추출
- 텍스트 분석: 공개 텍스트에서 단서(PII/패턴) 추출
- Vision(점진 처리): 이미지 단서를 TPM(429) 회피를 위해 배치로 점진 분석
- 동적 그래프(LLM): 단서/위험/시나리오의 연결(edge)과 근거(reason)를 LLM이 생성 (실패 시 휴리스틱 폴백)
- Top 위험 게시물: 포스트별 점수 + 권장 조치 노출(바로 써먹는 대응)
- 저장 정책: 서버 DB 저장 없음, 브라우저 `sessionStorage`만 사용 (`blindchallenge:latestReport`)

## 아키텍처(요약)

- `/api/analyze`: 텍스트 기반 리포트 생성(기본), Vision은 여기서 수행하지 않음
- `/api/vision`: 점진 Vision 배치 처리(429 발생 시 `retryAfterMs`로 클라이언트 재시도 유도)
- `/api/graph`: LLM 기반 edge 생성(실패 시 휴리스틱 그래프 유지)
- `/api/phishing`: GPT 기반 훈련용 피싱 시뮬레이션 생성

## 안전/윤리(의도)

이 프로젝트는 "범죄 실행"을 돕는 목적이 아니라,
사용자가 공개 글로 인해 발생할 수 있는 OSINT 위험을 인지하고 예방 조치를 하도록 돕는 데 초점을 둡니다.

- 결과 텍스트/이미지 요약은 PII를 그대로 노출하지 않도록 마스킹/축약을 적용합니다.
- 피싱 시뮬레이터는 링크/계좌/전화번호/송금 유도/기관 사칭을 포함하지 않도록 제한합니다.

## Vision(이미지 단서) 처리 방식

이미지 분석은 429(TPM) 방지를 위해 `/api/analyze`에서 한 번에 처리하지 않고,
`/analysis`에서 `/api/vision`을 반복 호출해 100% 완료 후 `/report`로 이동하는
“점진 처리(Progressive)”로 동작합니다.

## 트러블슈팅

- `openai_vision_429` 또는 429가 자주 발생하는 경우
  - `BLINDCHAL_VISION_MAX_IMAGES_PER_CALL` 값을 낮추세요(예: 6~12).
  - `/analysis`에서 “이미지 단서 분석 중…” 상태가 잠시 대기 후 자동 재개되는지 확인하세요.
- 네이버 수집이 실패하는 경우
  - 비공개/성인인증/봇차단/구조 변경 가능성이 있습니다.
  - `/analysis` 단계에서 다른 후보 카테고리를 선택해 시도해 보세요.

## 개발 메모

- Next.js App Router 기반
- React Flow: 그래프 시각화
- cheerio: HTML 파싱(모바일 블로그)
