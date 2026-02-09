import type { BlindReport } from "@/lib/types";
import { scoreReport } from "@/lib/scoring";

// IMPORTANT: Sample reports are rendered in a Client Component that is SSR-ed too.
// Any "now" values cause hydration mismatches. Keep timestamps deterministic.
const MOCK_NOW = new Date("2026-02-08T00:00:00.000Z");
const MOCK_NOW_ISO = MOCK_NOW.toISOString();

function dateDaysAgoISO(days: number) {
  const d = new Date(MOCK_NOW.getTime());
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildMockReport(blogId: string): BlindReport {
  const categoryPrimary = { categoryNo: 101, categoryName: "[블챌] 왓츠인마이블로그" };
  const categories = [
    categoryPrimary,
    { categoryNo: 202, categoryName: "주간일기" },
    { categoryNo: 303, categoryName: "일상" },
  ];

  const contents: NonNullable<BlindReport["contents"]> = [
    {
      logNo: "100000001",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000001`,
      title: "왓츠인마이블로그 1주차: 배송 박스 정리 & 소소한 기록",
      publishedAt: dateDaysAgoISO(5),
      categoryNo: categoryPrimary.categoryNo,
      categoryName: categoryPrimary.categoryName,
      text: [
        "주말에 집에서 정리하다가 택배 박스가 한가득… 사진으로 남겨봅니다.",
        "라벨은 얼른 떼려고 했는데, 찍고 보니 어딘가가 보였을지도 몰라 걱정이 되네요.",
        "요즘은 [동네] 쪽 카페를 자주 가서 그 주변을 자주 걷습니다.",
        "다음 주엔 2박 3일로 짧게 다녀올 예정이라 일정은 끝나고 올릴게요.",
      ].join("\n"),
      images: ["/mock/shipping-label.jpg", "/mock/map-screenshot.jpg"],
    },
    {
      logNo: "100000002",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000002`,
      title: "주간일기: 출근 루틴과 운동 시간",
      publishedAt: dateDaysAgoISO(11),
      categoryNo: 202,
      categoryName: "주간일기",
      text: [
        "평일엔 대체로 8시쯤 집을 나가고, 퇴근 후엔 운동을 합니다.",
        "운동은 보통 19시 전후로 시작하고, 끝나면 근처에서 간단히 먹어요.",
        "루틴이 쌓이면 편하긴 한데, 공개 글에 반복해서 남기는 건 조심해야겠다는 생각도 듭니다.",
      ].join("\n"),
      images: ["/mock/receipt.jpg"],
    },
    {
      logNo: "100000003",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000003`,
      title: "행사 스태프 참여 후기(명찰 인증샷 포함)",
      publishedAt: dateDaysAgoISO(18),
      categoryNo: 303,
      categoryName: "일상",
      text: [
        "주말에 행사 스태프로 참여했어요. 정신없었지만 재밌었습니다.",
        "인증샷을 올리려고 보니 명찰에 적힌 정보가 생각보다 또렷하더라고요.",
        "이런 건 모자이크하고 올리는 게 맞겠죠.",
      ].join("\n"),
      images: ["/mock/name-badge.jpg"],
    },
    {
      logNo: "100000004",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000004`,
      title: "가족과 주말 나들이(호칭/관계 언급)",
      publishedAt: dateDaysAgoISO(26),
      categoryNo: 303,
      categoryName: "일상",
      text: [
        "오랜만에 가족이랑 나들이. 아이가 좋아하는 곳이라 자주 가게 되네요.",
        "사진은 최대한 조심해서 올리고, 이름은 가능하면 줄여 쓰려고 합니다.",
      ].join("\n"),
      images: [],
    },
    {
      logNo: "100000005",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000005`,
      title: "여행 준비: 짐 리스트와 일정 메모(공개 범위 점검)",
      publishedAt: dateDaysAgoISO(33),
      categoryNo: 303,
      categoryName: "일상",
      text: [
        "다음 달 여행 준비 중. 일정표를 대충 정리해두니 마음이 편해요.",
        "다만 실시간으로 올리면 부재가 드러날 수 있어서, 공개 범위를 한 번 더 확인해야겠습니다.",
      ].join("\n"),
      images: [],
    },
    {
      logNo: "100000006",
      url: `https://m.blog.naver.com/${encodeURIComponent(blogId)}/100000006`,
      title: "사진 정리: 위치 태그/메타데이터는 어떻게 될까?",
      publishedAt: dateDaysAgoISO(52),
      categoryNo: 303,
      categoryName: "일상",
      text: [
        "사진을 올릴 때 위치 태그나 메타데이터가 남는지 가끔 헷갈립니다.",
        "업로드 전에 설정을 확인하고, 민감한 사진은 아예 올리지 않는 게 최선이겠죠.",
      ].join("\n"),
      images: ["/mock/map-screenshot.jpg"],
    },
  ];

  const extractedPieces: BlindReport["extractedPieces"] = [
    {
      type: "address_hint",
      value: "택배 라벨/상자 사진에서 위치 단서가 드러날 수 있음",
      evidencePostDate: dateDaysAgoISO(5),
      evidence: {
        postUrl: contents[0]!.url,
        postTitle: contents[0]!.title,
        logNo: contents[0]!.logNo,
        excerpt: "라벨은 얼른 떼려고 했는데, 찍고 보니 어딘가가 보였을지도 몰라 걱정이 되네요.",
        rationale:
          "배송 라벨/상자 표면에 주소·건물명·동호수 같은 정보가 남아있을 수 있어, 위치 특정 위험이 생깁니다.",
        confidence: 0.78,
      },
    },
    {
      type: "schedule",
      value: "부재 일정(여행/외출) 시점이 공개 글에서 드러날 수 있음",
      evidencePostDate: dateDaysAgoISO(5),
      evidence: {
        postUrl: contents[0]!.url,
        postTitle: contents[0]!.title,
        logNo: contents[0]!.logNo,
        excerpt: "다음 주엔 2박 3일로 짧게 다녀올 예정이라 일정은 끝나고 올릴게요.",
        rationale:
          "부재 기간이 추정되면, 외부인이 집이 비는 시간대를 가늠해 표적화할 수 있습니다(방어 관점).",
        confidence: 0.62,
      },
    },
    {
      type: "address_hint",
      value: "자주 가는 장소/동네 언급이 반복되면 생활권이 좁혀질 수 있음",
      evidencePostDate: dateDaysAgoISO(5),
      evidence: {
        postUrl: contents[0]!.url,
        postTitle: contents[0]!.title,
        logNo: contents[0]!.logNo,
        excerpt: "요즘은 [동네] 쪽 카페를 자주 가서 그 주변을 자주 걷습니다.",
        rationale:
          "특정 동네/상권 언급이 누적되면 생활권이 좁혀져 위치 기반 사칭/접근 시도가 쉬워질 수 있습니다.",
        confidence: 0.7,
      },
    },
    {
      type: "schedule",
      value: "출퇴근/운동 루틴이 반복적으로 노출될 수 있음",
      evidencePostDate: dateDaysAgoISO(11),
      evidence: {
        postUrl: contents[1]!.url,
        postTitle: contents[1]!.title,
        logNo: contents[1]!.logNo,
        excerpt: "평일엔 대체로 8시쯤 집을 나가고, 퇴근 후엔 운동을 합니다.",
        rationale:
          "규칙적인 시간 패턴은 제3자가 행동 반경/부재 시간을 추정하는 데 악용될 소지가 있습니다.",
        confidence: 0.68,
      },
    },
    {
      type: "schedule",
      value: "주요 활동 시간대(저녁 시간) 노출",
      evidencePostDate: dateDaysAgoISO(11),
      evidence: {
        postUrl: contents[1]!.url,
        postTitle: contents[1]!.title,
        logNo: contents[1]!.logNo,
        excerpt: "운동은 보통 19시 전후로 시작하고, 끝나면 근처에서 간단히 먹어요.",
        rationale:
          "특정 시간대 반복 언급은 동선/활동 패턴을 강화해 보여 줄 수 있어, 공개 범위를 재확인하는 것이 안전합니다.",
        confidence: 0.6,
      },
    },
    {
      type: "other",
      value: "행사 참여 사실이 소속/관심사 단서로 이어질 수 있음",
      evidencePostDate: dateDaysAgoISO(18),
      evidence: {
        postUrl: contents[2]!.url,
        postTitle: contents[2]!.title,
        logNo: contents[2]!.logNo,
        excerpt: "주말에 행사 스태프로 참여했어요. 정신없었지만 재밌었습니다.",
        rationale:
          "행사/커뮤니티 활동은 사회공학적 접근에서 ‘신뢰 맥락’으로 활용될 수 있어 과도한 세부 공개를 피하는 편이 안전합니다.",
        confidence: 0.58,
      },
    },
    {
      type: "photo_metadata",
      value: "명찰/서류/라벨 등 사진 내 민감정보 노출 위험",
      evidencePostDate: dateDaysAgoISO(18),
      evidence: {
        postUrl: contents[2]!.url,
        postTitle: contents[2]!.title,
        logNo: contents[2]!.logNo,
        excerpt: "인증샷을 올리려고 보니 명찰에 적힌 정보가 생각보다 또렷하더라고요.",
        rationale:
          "사진 속 텍스트(이름/소속/바코드 등)는 확대 시 식별력이 높아져, 사칭/계정 탈취 시도에 이용될 수 있습니다.",
        confidence: 0.8,
      },
    },
    {
      type: "family",
      value: "가족/자녀 관련 언급이 관계 단서로 누적될 수 있음",
      evidencePostDate: dateDaysAgoISO(26),
      evidence: {
        postUrl: contents[3]!.url,
        postTitle: contents[3]!.title,
        logNo: contents[3]!.logNo,
        excerpt: "오랜만에 가족이랑 나들이. 아이가 좋아하는 곳이라 자주 가게 되네요.",
        rationale:
          "가족 구성/관계/자녀 관련 정보가 반복되면 ‘지인 사칭’ 문구가 더 설득력 있게 만들어질 수 있습니다.",
        confidence: 0.64,
      },
    },
    {
      type: "schedule",
      value: "여행 준비/일정 메모가 부재 가능성을 암시",
      evidencePostDate: dateDaysAgoISO(33),
      evidence: {
        postUrl: contents[4]!.url,
        postTitle: contents[4]!.title,
        logNo: contents[4]!.logNo,
        excerpt: "다만 실시간으로 올리면 부재가 드러날 수 있어서, 공개 범위를 한 번 더 확인해야겠습니다.",
        rationale:
          "실시간 게시가 부재 신호로 해석될 수 있음을 인지하고 있어도, 공개 범위가 넓으면 리스크가 남습니다.",
        confidence: 0.55,
      },
    },
    {
      type: "photo_metadata",
      value: "위치 태그/메타데이터(촬영지/시간) 관리 필요",
      evidencePostDate: dateDaysAgoISO(52),
      evidence: {
        postUrl: contents[5]!.url,
        postTitle: contents[5]!.title,
        logNo: contents[5]!.logNo,
        excerpt: "사진을 올릴 때 위치 태그나 메타데이터가 남는지 가끔 헷갈립니다.",
        rationale:
          "촬영지/시간 관련 메타데이터가 남으면 위치/패턴 추정에 도움이 될 수 있어 업로드 설정 점검이 필요합니다.",
        confidence: 0.6,
      },
    },
  ];

  const imageFindings: NonNullable<BlindReport["imageFindings"]> = [
    {
      postLogNo: contents[0]!.logNo,
      postUrl: contents[0]!.url,
      postTitle: contents[0]!.title,
      imageUrl: contents[0]!.images[0]!,
      imageIndex: 0,
      label: "배송 라벨(위치 단서)",
      severity: "high",
      excerpt: "라벨 영역에 주소/건물/동호수처럼 보이는 문자열이 포함될 수 있습니다(마스킹 필요).",
      rationale:
        "배송 라벨은 확대 시 식별력이 높아 위치 특정 가능성을 급격히 올립니다. 업로드 전 모자이크/크롭을 권장합니다.",
      confidence: 0.82,
    },
    {
      postLogNo: contents[0]!.logNo,
      postUrl: contents[0]!.url,
      postTitle: contents[0]!.title,
      imageUrl: contents[0]!.images[1]!,
      imageIndex: 1,
      label: "지도/동선 화면(생활권 추정)",
      severity: "medium",
      excerpt: "자주 방문하는 장소 주변이 연상되는 화면 요소가 포함될 수 있습니다.",
      rationale:
        "반복적으로 나타나는 지도/랜드마크는 생활권을 좁히는 단서가 될 수 있어 공유 범위 조정이 필요합니다.",
      confidence: 0.65,
    },
    {
      postLogNo: contents[1]!.logNo,
      postUrl: contents[1]!.url,
      postTitle: contents[1]!.title,
      imageUrl: contents[1]!.images[0]!,
      imageIndex: 0,
      label: "영수증/결제 시각(시간 패턴)",
      severity: "low",
      excerpt: "결제 시각/지점 정보가 노출되면 활동 시간대가 강화될 수 있습니다.",
      rationale:
        "단독으론 약하지만, 텍스트 루틴과 결합되면 시간/동선 추정이 쉬워질 수 있어 가려서 공유하는 편이 안전합니다.",
      confidence: 0.55,
    },
    {
      postLogNo: contents[2]!.logNo,
      postUrl: contents[2]!.url,
      postTitle: contents[2]!.title,
      imageUrl: contents[2]!.images[0]!,
      imageIndex: 0,
      label: "명찰/사원증(이름·소속 단서)",
      severity: "high",
      excerpt: "이름/소속/행사 정보가 식별 가능하게 보일 수 있습니다(모자이크 권장).",
      rationale:
        "소속/실명 단서는 사회공학 공격에서 ‘신뢰 근거’로 악용될 수 있어 즉시 마스킹이 필요합니다.",
      confidence: 0.86,
    },
    {
      postLogNo: contents[5]!.logNo,
      postUrl: contents[5]!.url,
      postTitle: contents[5]!.title,
      imageUrl: contents[5]!.images[0]!,
      imageIndex: 0,
      label: "지도/위치 태그(메타데이터 연상)",
      severity: "medium",
      excerpt: "촬영 위치/주변 지형을 연상시키는 요소가 포함될 수 있습니다.",
      rationale:
        "게시물 메타데이터/이미지 내용이 결합되면 위치 추정 정확도가 높아질 수 있어, 위치 관련 요소를 줄이는 것이 안전합니다.",
      confidence: 0.6,
    },
  ];

  const riskNodes: BlindReport["riskNodes"] = [
    { id: "r-location", label: "생활권/거주지 추정", severity: "high" },
    { id: "r-absence", label: "부재 시간대 추정", severity: "high" },
    { id: "r-social", label: "지인·기관 사칭(사회공학)", severity: "high" },
    { id: "r-work", label: "직장/소속 기반 표적화", severity: "medium" },
    { id: "r-pattern", label: "루틴/동선 패턴 축적", severity: "medium" },
  ];

  const scenarios: BlindReport["scenarios"] = [
    {
      id: "s-phish",
      title: "맥락을 아는 듯한 사칭 메시지(훈련용)",
      narrative:
        "공개 글의 ‘배송/행사/가족’ 맥락을 활용해 신뢰를 얻고, 추가 정보 제공을 유도하는 메시지가 올 수 있습니다. 링크/인증 요구가 나오면 즉시 중단하고 공식 채널로 재확인하는 것이 안전합니다.",
    },
    {
      id: "s-targeting",
      title: "생활권·루틴 기반 접근 시도",
      narrative:
        "반복적으로 공개된 장소/시간 정보를 바탕으로 생활 패턴이 추정될 수 있습니다. 공개 범위를 낮추고, 특정 장소·시간·동선 정보를 세부적으로 남기지 않는 것이 효과적입니다.",
    },
    {
      id: "s-account",
      title: "소속/활동 기반 계정 공격(사회공학)",
      narrative:
        "명찰/소속 단서가 쌓이면 고객센터/지인 사칭이 더 설득력 있어질 수 있습니다. 계정 보안(2단계 인증, 복구 수단 점검)과 사진 마스킹을 우선 권장합니다.",
    },
  ];

  const attackGraph: NonNullable<BlindReport["attackGraph"]> = {
    generatedAt: MOCK_NOW_ISO,
    model: "sample",
    edges: [
      {
        id: "e-1",
        source: { kind: "image", index: 0 },
        target: { kind: "risk", riskId: "r-location" },
        strength: 0.92,
        reason: "배송 라벨은 위치 단서가 직접 포함될 수 있어 생활권/거주지 추정을 크게 강화합니다.",
      },
      {
        id: "e-2",
        source: { kind: "piece", index: 0 },
        target: { kind: "risk", riskId: "r-location" },
        strength: 0.85,
        reason: "라벨 노출 가능성 언급 자체가 위치 단서 리스크를 시사합니다(사진 점검 필요).",
      },
      {
        id: "e-3",
        source: { kind: "piece", index: 1 },
        target: { kind: "risk", riskId: "r-absence" },
        strength: 0.72,
        reason: "부재 일정은 집이 비는 시간대 추정으로 이어질 수 있어 실시간 공개를 피하는 편이 안전합니다.",
      },
      {
        id: "e-4",
        source: { kind: "piece", index: 3 },
        target: { kind: "risk", riskId: "r-pattern" },
        strength: 0.7,
        reason: "출근/운동 루틴 반복은 활동 시간대 패턴을 강화해 표적화 가능성을 높일 수 있습니다.",
      },
      {
        id: "e-5",
        source: { kind: "image", index: 3 },
        target: { kind: "risk", riskId: "r-work" },
        strength: 0.88,
        reason: "명찰/소속 단서는 직장 기반 표적화(사칭)에서 신뢰 근거로 악용될 수 있습니다.",
      },
      {
        id: "e-6",
        source: { kind: "piece", index: 7 },
        target: { kind: "risk", riskId: "r-social" },
        strength: 0.76,
        reason: "관계/가족 맥락이 쌓이면 ‘지인 사칭’ 문구가 더 설득력 있게 구성될 수 있습니다.",
      },
      {
        id: "e-7",
        source: { kind: "risk", riskId: "r-location" },
        target: { kind: "scenario", scenarioId: "s-targeting" },
        strength: 0.78,
        reason: "생활권 추정은 반복 방문 장소/동선 기반의 접근 위험을 높여 방어 조치가 필요합니다.",
      },
      {
        id: "e-8",
        source: { kind: "risk", riskId: "r-absence" },
        target: { kind: "scenario", scenarioId: "s-targeting" },
        strength: 0.74,
        reason: "부재 시간대가 추정되면 접근 시도가 늘 수 있어 일정 공유 방식을 바꾸는 것이 좋습니다.",
      },
      {
        id: "e-9",
        source: { kind: "risk", riskId: "r-social" },
        target: { kind: "scenario", scenarioId: "s-phish" },
        strength: 0.8,
        reason: "사회공학은 ‘맥락’으로 신뢰를 얻는 방식이어서, 공개 단서가 많을수록 메시지가 정교해집니다.",
      },
      {
        id: "e-10",
        source: { kind: "risk", riskId: "r-work" },
        target: { kind: "scenario", scenarioId: "s-account" },
        strength: 0.7,
        reason: "소속 단서는 계정/연락 채널 사칭에 활용될 수 있어 보안 설정 점검이 중요합니다.",
      },
    ],
  };

  const postInsights: NonNullable<BlindReport["postInsights"]> = {
    generatedAt: MOCK_NOW_ISO,
    model: "sample",
    posts: contents.map((c) => {
      const evidence: Array<{
        kind: "text" | "image";
        excerpt: string;
        why: string;
        severity: "low" | "medium" | "high";
        confidence?: number;
      }> = [];

      for (const p of extractedPieces) {
        if (p.evidence?.logNo !== c.logNo) continue;
        evidence.push({
          kind: "text",
          excerpt: p.evidence.excerpt,
          why: p.evidence.rationale,
          severity: p.type === "address_hint" || p.type === "photo_metadata" ? "high" : p.type === "family" ? "medium" : "low",
          confidence: p.evidence.confidence,
        });
      }

      for (const f of imageFindings) {
        if (f.postLogNo !== c.logNo) continue;
        evidence.push({
          kind: "image",
          excerpt: f.excerpt,
          why: f.rationale,
          severity: f.severity,
          confidence: f.confidence,
        });
      }

      const top = evidence
        .slice()
        .sort((a, b) => (b.severity === "high" ? 3 : b.severity === "medium" ? 2 : 1) - (a.severity === "high" ? 3 : a.severity === "medium" ? 2 : 1))
        .slice(0, 6);

      const rawSignals: string[] = top.map((e) =>
        e.kind === "image" ? "이미지 민감정보" : "텍스트 패턴",
      );
      if (top.some((e) => e.severity === "high")) rawSignals.push("즉시 마스킹 권장");
      const signals = Array.from(new Set(rawSignals)).slice(0, 6);

      return {
        logNo: c.logNo,
        summary:
          top.length
            ? "텍스트/이미지 에비던스를 종합하면, 공개 범위에 따라 생활권/루틴/소속 단서가 축적될 수 있습니다. 특히 사진(라벨·명찰·영수증) 계열은 확대 시 식별력이 높아 즉시 마스킹이 권장됩니다. 일정/루틴은 실시간 공유를 피하고, 위치·관계 단서는 반복 노출을 줄이는 것이 안전합니다."
            : "현재 탐지된 텍스트/이미지 에비던스가 적어 자동 통합 분석을 최소화했습니다. 공개 범위와 사진 포함 여부를 수동 점검하는 것을 권장합니다.",
        riskSignals: signals,
        evidence: top,
        defensiveActions: [
          "사진(라벨/명찰/영수증) 텍스트 영역 모자이크 후 재업로드",
          "동네/상호/역명 등 위치 단서는 구 단위로 범위 넓히기",
          "여행/부재 일정은 종료 후 게시(실시간 공유 지양)",
          "공개 범위(전체공개/이웃공개) 재확인",
        ].slice(0, 5),
      };
    }),
  };

  const totalImages = contents.reduce((acc, c) => acc + (c.images?.length ?? 0), 0);

  const base: BlindReport = {
    blogId,
    generatedAt: MOCK_NOW_ISO,
    contents,
    extractedPieces,
    imageFindings,
    riskNodes,
    scenarios,
    attackGraph,
    postInsights,
    vision: { status: "complete", processedImages: totalImages, totalImages },
    source: { scrapedAt: MOCK_NOW_ISO, postCount: contents.length },
    category: categoryPrimary,
    categories,
    phishingSimulation: {
      sms: "안녕하세요. [택배/행사] 관련 확인이 필요해 연락드렸습니다. 개인정보는 답장으로 보내지 말고, 공식 앱/고객센터에서 확인해 주세요.",
      voiceScript:
        [
          "(훈련용 시뮬레이션) 안녕하세요. 본 통화는 보안 인식 훈련 목적입니다.",
          "최근 [배송/행사] 관련 문의가 접수되어 확인 연락을 드렸습니다.",
          "상대가 이름/주소/소속 같은 정보를 먼저 말하도록 유도할 수 있습니다.",
          "이때는 정보를 제공하지 말고, 통화를 종료한 뒤 공식 채널로 직접 확인하세요.",
          "링크 전송, 인증번호 요청, 송금 유도, 기관 사칭 등이 나오면 즉시 차단이 안전합니다.",
          "마지막으로, 공개 글의 사진(라벨/명찰/영수증)과 일정/루틴 언급은 최소화하는 것을 권장합니다.",
        ].join("\n"),
      model: "sample",
      generatedAt: MOCK_NOW_ISO,
    },
  };

  const scoring = scoreReport(base, { nowMs: MOCK_NOW.getTime() });
  return { ...base, scoring, riskScore: scoring.riskScore };
}
