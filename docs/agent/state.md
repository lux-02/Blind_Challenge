# Agent State

This file is the single source of truth for the current work state.
Keep it compact: no large logs, no pasted code blocks, no long terminal output.

## Update Rules

- Update when starting a new task, after major decisions, and after finishing a chunk of work.
- If the task is >30 minutes, use a simple cadence: do work, then add a checkpoint update here.
- Prefer bullet points; keep each section to ~10 lines.
- If something is uncertain, put it in "Open Questions" (do not guess silently).
- If you run commands, record only the command + 1-line outcome in "Recent Commands".

## Goal (Current)

- UX/UI 리디자인(시니어 톤) + IA 재구성(Report 탭 워크벤치) + 성능(ReactFlow 지연 로딩) + a11y(포커스/스킵 링크) 적용.
- 분석 플로우 고도화: Recon(카테고리 정찰) -> Analyze(사용자 선택 기반 다중 카테고리 통합 분석) + Report OSINT 품질 개선.
- 보안 보완: 소유권 검증(소개글 난수 인증) 도입으로 타인 블로그 무단 분석 경로 차단.

## Constraints

- Tech: Next.js App Router, TypeScript, ESLint.
- Do not read/scan huge dirs by default: `node_modules/`, `.next/`.

## Current Status

- 글로벌 토큰 확장 + 공통 포커스 스타일 + reduced-motion 훅/클래스 + content-visibility 유틸 추가.
- 레퍼런스 기반 HUD/CRT 무드로 테마 전환: 완전 흑백(화이트 단색) + 그리드/스캔라인/노이즈 + 패널 프레임/코너 틱 적용(컬러 포인트 제거).
- CRT 질감 강화: `--bc-border/--bc-hud-line/--bc-hud-glow` 강화, scanlines/noise 거칠기 증가(overlay + grain).
- RootLayout에 skip link + `#bc-main` 앵커 추가.
- Home: 섹션 밀도 축소(Risk Insights 제거), Trust 섹션 단순화, RetentionPanel은 details로 접기.
- Analysis: 상단 Stepper + 추천 카테고리 배지 + postCnt 바 + 상세 로그 패널 + 취소 버튼 추가.
- Report: Sticky 헤더 + 탭(overview/graph/evidence/training) 도입, Graph는 탭 진입 시에만 ReactFlow(AttackPathGraph) 동적 로딩, Evidence에 필터/검색 추가, demo 모드에서 외부 링크 숨김.
- ESLint/tsc/next build 모두 통과.
- Analysis: `/api/naver/recon` 기반 정찰(최근 1년 활동 카테고리) + High Risk 자동 분류(OpenAI/휴리스틱) + 모달 체크박스 다중 선택 UI 추가(블챌 강제 High Risk/상단).
- Analyze API: `categoryNos`(다중) 입력 지원, 카테고리별 cap/전체 cap으로 통합 리포트 생성, `report.categories`/`contents[].categoryName` 메타 포함.
- Report: 그래프는 요약 모드 기본(중복 단서 축약/저강도 연결 감소) + 위험 중심 클러스터 레이아웃. Evidence의 "근거 있는 것만"은 포스트도 필터링하고 본문/이미지 목록을 기본 숨김(토글로 전체 보기).
- Report: Vision 완료 후 `/api/post-insights`로 포스트별 텍스트+이미지 통합 분석 자동 생성 및 Evidence에 표시.
- Vision: 이미지 분석 출력 한국어 강제 프롬프트 강화.
- README 문서화: Project Overview / Architecture / Flow Diagram / Functional Requirements / Schema / API Spec 섹션 추가.
- 샘플 리포트(buildMockReport) 보강: contents/단서/이미지 단서/그래프/포스트 인사이트/스코어링 포함. “크롤링/AI 분석은 연결 단계” 문구 제거.
- Branding: `fav.png` 기반으로 `src/app/favicon.ico` 갱신 + `src/app/icon.png`/`src/app/apple-icon.png` 추가, `metadata.icons` 설정.
- README 상단에 `top_logo.svg` 로고 적용.
- SEO: App Router `metadata` 보강(페이지별 title/description/canonical/OG/Twitter), `viewport` 추가, `robots.txt`/`sitemap.xml` 생성, 홈에 Organization/WebSite JSON-LD 추가, OG/Twitter 이미지 추가.
- Report mobile: Evidence(단서) 섹션에서 base grid columns 누락으로 implicit column이 max-content 폭을 가져 horizontal overflow 발생 -> `grid-cols-1` 추가 + 긴 문자열 `overflow-wrap:anywhere` 적용.
- 소유권 인증 로직 추가: `/api/naver/ownership/nonce`, `/api/naver/ownership/verify`, `HttpOnly` 세션 쿠키(`bc_own_v1`) 발급.
- API 보호 게이트 적용: `/api/naver/recon`, `/api/analyze`, `/api/vision`, `/api/graph`, `/api/phishing`, `/api/post-insights`, `/api/naver/categories`에서 소유권 검증 필수화(샘플 `blogId=sample` 예외).
- Home 입력 플로우 개편: ID/URL 입력 -> 난수 발급 -> 소개글 반영 -> 인증 후 분석 시작.
- 보안/운영 문서 업데이트: README에 ownership secret/env/flow 반영.

## Next Actions

- 소유권 인증 수동 QA: 난수 만료(3분), 오입력/미반영, 세션 만료(1시간), 재인증 UX 확인.
- 운영 환경 점검: Vercel 환경변수 `BLINDCHAL_OWNERSHIP_SECRET` 설정 및 쿠키 동작 확인.
- 발표용 캡처 생성: 인증 발급/검증 성공/분석 진입/403 차단 화면.

## Open Questions / Risks

- Report의 Graph 탭에서 노드 클릭 시 Evidence로 자동 이동이 항상 원하는 UX인지(현재는 이동하도록 구현).
- demo 모드에서 샘플 데이터 구체성/문구(워터마크 강도) 톤 조정 필요 여부.

## Recent Commands

- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok
- `./scripts/agent/quickcheck.sh --skip-build` -> lint/tsc ok
- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok
- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok (icons 추가)
- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok (SEO 메타/robots/sitemap)
- `./scripts/agent/quickcheck.sh --skip-build` -> lint/tsc ok (SEO title 조정)
- `./scripts/agent/quickcheck.sh --skip-build` -> lint/tsc ok (Report mobile overflow fix)
- `./scripts/agent/quickcheck.sh --skip-build` -> lint/tsc ok (ownership auth 추가)
- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok (ownership auth + API guard)
