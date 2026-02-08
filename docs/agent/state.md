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

## Next Actions

- 수동 QA: 375/768/1024/1440 반응형, 키보드 탭 이동/포커스 링, demo 모드 흐름 점검.
- 실제 분석 플로우에서 sessionStorage 리포트가 Report에 잘 반영되는지 확인.

## Open Questions / Risks

- Report의 Graph 탭에서 노드 클릭 시 Evidence로 자동 이동이 항상 원하는 UX인지(현재는 이동하도록 구현).
- demo 모드에서 샘플 데이터 구체성/문구(워터마크 강도) 톤 조정 필요 여부.

## Recent Commands

- `./scripts/agent/quickcheck.sh` -> lint/tsc/build ok
