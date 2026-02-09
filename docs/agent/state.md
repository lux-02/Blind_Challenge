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

## Next Actions

- 수동 QA: 375/768/1024/1440 반응형, 키보드 탭 이동/포커스 링, 모달 ESC/닫기 동작 점검.
- 실제 분석 플로우: recon -> 카테고리 선택 -> 다중 카테고리 수집 -> 리포트 반영(`report.categories`, `contents[].categoryName`) 확인.
- Vision 완료 후 Post Insights 자동 생성(429 재시도 포함) 확인.

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
