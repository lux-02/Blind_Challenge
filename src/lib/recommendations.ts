import type { ExtractedPiece, ImageFinding } from "@/lib/types";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function hasPieceType(pieces: ExtractedPiece[], type: ExtractedPiece["type"]) {
  return pieces.some((p) => p.type === type);
}

function maxSeverity(findings: ImageFinding[]) {
  if (!findings.length) return null;
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

export function buildPostRecommendations(args: {
  pieces: ExtractedPiece[];
  imageFindings: ImageFinding[];
  visionStatus?: "pending" | "partial" | "complete";
}): string[] {
  const { pieces, imageFindings, visionStatus } = args;
  const out: string[] = [];

  const sev = maxSeverity(imageFindings);
  if (sev) {
    out.push(
      sev === "high"
        ? "사진에서 주소/이름/학교/회사 단서가 보이면 즉시 모자이크 후 재업로드(또는 삭제)하세요."
        : "사진 속 라벨/명찰/영수증 등 민감 요소는 모자이크 후 재업로드(또는 삭제)하세요.",
    );
  } else if (visionStatus && visionStatus !== "complete") {
    out.push("이미지 단서 분석이 진행 중입니다. 사진 위험 신호가 추가로 발견될 수 있어요.");
  }

  if (hasPieceType(pieces, "address_hint")) {
    out.push("동네/가게/건물명 등 위치 단서는 삭제하거나 범위를 넓혀(예: 구 단위) 표현하세요.");
  }
  if (hasPieceType(pieces, "schedule")) {
    out.push("휴가/부재/루틴 같은 일정은 실시간 공유를 피하고, 과거형으로 기록하세요.");
  }
  if (hasPieceType(pieces, "family")) {
    out.push("가족/자녀 실명·호칭·관계 정보는 이니셜/별칭으로 바꾸고 반복 노출을 줄이세요.");
  }
  if (hasPieceType(pieces, "photo_metadata")) {
    out.push("사진 위치 태그/EXIF 등 메타데이터가 남지 않도록 설정을 확인하세요.");
  }

  out.push("해당 게시물 공개 범위를 ‘이웃공개/비공개’로 낮추는 것을 우선 고려하세요.");

  // Keep it tight: 1~2 actionable bullets.
  const deduped = uniq(out);

  // Prefer concrete actions over meta messages.
  const preferred = deduped.filter((s) => !s.includes("진행 중"));
  const pickFrom = preferred.length ? preferred : deduped;

  return pickFrom.slice(0, 2);
}

