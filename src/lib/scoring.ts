import type { BlindReport, ImageFinding, ReportScoring } from "@/lib/types";

const PIECE_WEIGHT: Record<string, number> = {
  address_hint: 7,
  photo_metadata: 7,
  family: 5,
  schedule: 4,
  other: 2,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function daysAgo(dateISO: string | undefined, nowMs: number) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  if (!Number.isFinite(d.getTime())) return null;
  const diff = nowMs - d.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function pieceScore(p: BlindReport["extractedPieces"][number]) {
  const base = PIECE_WEIGHT[p.type] ?? 2;
  const conf =
    typeof p.evidence?.confidence === "number"
      ? clamp(p.evidence.confidence, 0, 1)
      : 0.6;
  // Stronger effect for high-confidence.
  return base * (0.55 + conf * 0.9);
}

function imageFindingScore(f: ImageFinding) {
  const sev =
    f.severity === "high" ? 10 : f.severity === "medium" ? 6 : 3;
  const conf =
    typeof f.confidence === "number" ? clamp(f.confidence, 0, 1) : 0.6;
  return sev * (0.55 + conf * 0.9);
}

export function scoreReport(report: BlindReport, opts?: { nowMs?: number }): ReportScoring {
  const nowMs = typeof opts?.nowMs === "number" && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const contents = report.contents ?? [];
  const pieces = report.extractedPieces ?? [];
  const findings = report.imageFindings ?? [];

  const pieceIndexesByLogNo = new Map<string, number[]>();
  for (let i = 0; i < pieces.length; i++) {
    const logNo = pieces[i].evidence?.logNo;
    if (!logNo) continue;
    const list = pieceIndexesByLogNo.get(logNo) ?? [];
    list.push(i);
    pieceIndexesByLogNo.set(logNo, list);
  }

  const findingIndexesByLogNo = new Map<string, number[]>();
  for (let i = 0; i < findings.length; i++) {
    const logNo = findings[i].postLogNo;
    const list = findingIndexesByLogNo.get(logNo) ?? [];
    list.push(i);
    findingIndexesByLogNo.set(logNo, list);
  }

  const byPieceType: Record<string, number> = {};
  for (const p of pieces) {
    byPieceType[p.type] = (byPieceType[p.type] ?? 0) + pieceScore(p);
  }

  let imgLow = 0,
    imgMed = 0,
    imgHigh = 0;
  for (const f of findings) {
    const s = imageFindingScore(f);
    if (f.severity === "high") imgHigh += s;
    else if (f.severity === "medium") imgMed += s;
    else imgLow += s;
  }

  // Recency bonus: if there are risky posts in last 30 days, add a small bump.
  let recency = 0;
  for (const c of contents) {
    const d = daysAgo(c.publishedAt, nowMs);
    if (d == null) continue;
    const hasSignals =
      (pieceIndexesByLogNo.get(c.logNo)?.length ?? 0) +
        (findingIndexesByLogNo.get(c.logNo)?.length ?? 0) >
      0;
    if (!hasSignals) continue;
    if (d <= 7) recency += 2.0;
    else if (d <= 30) recency += 1.0;
  }

  // Post scores
  const postScores = contents
    .map((c) => {
      const pieceIdxs = pieceIndexesByLogNo.get(c.logNo) ?? [];
      const findingIdxs = findingIndexesByLogNo.get(c.logNo) ?? [];

      const pScore = pieceIdxs.reduce((acc, idx) => acc + pieceScore(pieces[idx]), 0);
      const iScore = findingIdxs.reduce(
        (acc, idx) => acc + imageFindingScore(findings[idx]),
        0,
      );

      const d = daysAgo(c.publishedAt, nowMs);
      const rBonus = d != null && d <= 30 ? (d <= 7 ? 1.4 : 1.15) : 1.0;
      const score = round1((pScore + iScore) * rBonus);

      const reasons: string[] = [];
      if (findingIdxs.length) reasons.push(`이미지 단서 ${findingIdxs.length}개`);
      if (pieceIdxs.length) reasons.push(`텍스트 단서 ${pieceIdxs.length}개`);
      if (d != null && d <= 7) reasons.push("최근 7일 내 게시물");
      else if (d != null && d <= 30) reasons.push("최근 30일 내 게시물");

      return {
        logNo: c.logNo,
        url: c.url,
        title: c.title,
        publishedAt: c.publishedAt,
        score,
        reasons,
        pieceIndexes: pieceIdxs,
        imageFindingIndexes: findingIdxs,
      };
    })
    .filter((p) => p.pieceIndexes.length + p.imageFindingIndexes.length > 0)
    .sort((a, b) => b.score - a.score);

  // Total score -> 0..100 normalization (simple, stable for MVP).
  const total =
    Object.values(byPieceType).reduce((a, b) => a + b, 0) +
    imgLow +
    imgMed +
    imgHigh +
    recency;

  // Map typical totals into a 0..100 range without being overly sensitive.
  const riskScore = clamp(Math.round((1 - Math.exp(-total / 18)) * 100), 0, 100);

  return {
    riskScore,
    postScores,
    breakdown: {
      byPieceType: Object.fromEntries(
        Object.entries(byPieceType).map(([k, v]) => [k, round1(v)]),
      ),
      byImageSeverity: {
        low: round1(imgLow),
        medium: round1(imgMed),
        high: round1(imgHigh),
      },
      byRecency: round1(recency),
      total: round1(total),
    },
  };
}
