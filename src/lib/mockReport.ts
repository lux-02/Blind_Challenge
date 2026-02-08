import type { BlindReport } from "@/lib/types";

// IMPORTANT: Mock reports are rendered in a Client Component that is SSR-ed too.
// Any "now" values cause hydration mismatches. Keep timestamps deterministic.
const MOCK_NOW = new Date("2026-02-08T00:00:00.000Z");
const MOCK_NOW_ISO = MOCK_NOW.toISOString();

function dateDaysAgoISO(days: number) {
  const d = new Date(MOCK_NOW.getTime());
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildMockReport(blogId: string): BlindReport {
  return {
    blogId,
    generatedAt: MOCK_NOW_ISO,
    riskScore: 72,
    warnings: ["현재는 Mock 분석 결과입니다. (크롤링/AI 분석은 연결 단계)"],
    contents: [],
    imageFindings: [],
    vision: { status: "complete", processedImages: 0, totalImages: 0 },
    source: { scrapedAt: MOCK_NOW_ISO, postCount: 0 },
    extractedPieces: [
      {
        type: "address_hint",
        value: "택배 라벨/근처 랜드마크 노출 가능성",
        evidencePostDate: dateDaysAgoISO(12),
      },
      {
        type: "schedule",
        value: "휴가 일정 (부재 기간) 언급",
        evidencePostDate: dateDaysAgoISO(29),
      },
      {
        type: "family",
        value: "자녀 이름/학교/학원 단서",
        evidencePostDate: dateDaysAgoISO(44),
      },
    ],
    riskNodes: [
      { id: "r-emptyhome", label: "빈집 시간대 추정", severity: "high" },
      { id: "r-phish", label: "가족정보 기반 피싱", severity: "high" },
    ],
    scenarios: [
      {
        id: "s-voice",
        title: "보이스피싱(택배/학교/지인 사칭)",
        narrative:
          "공개된 가족 정보와 배송 단서를 조합해 신뢰를 얻고, 인증/결제 유도를 시도합니다.",
      },
      {
        id: "s-burglary",
        title: "부재 기간을 노린 침입 시도",
        narrative:
          "휴가/외출 일정으로 비어있는 시간대를 추정해 침입 가능 시간을 탐색합니다.",
      },
    ],
    phishingSimulation: {
      sms: "[샘플] 안녕하세요, 택배 관련 확인이 필요합니다. 주소/수령 가능 시간을 답장해 주세요.",
      voiceScript:
        "[샘플] 본 통화는 보안 인식 훈련용 시뮬레이션입니다. 상대가 개인 정보를 확인하려 하거나 링크/인증을 요구하면 끊고 공식 채널로 확인하세요.",
    },
  };
}
