export type ExtractedPiece = {
  type: "address_hint" | "schedule" | "family" | "photo_metadata" | "other";
  value: string;
  evidencePostDate: string; // ISO date (YYYY-MM-DD)
  evidence?: {
    postUrl: string;
    postTitle: string;
    logNo?: string;
    excerpt: string; // short quote/snippet from extracted text
    rationale: string; // why this is considered a signal
    confidence?: number; // 0..1
  };
};

export type ScrapedContent = {
  logNo: string;
  url: string;
  title: string;
  publishedAt?: string; // best-effort
  text: string; // extracted text (bounded)
  images: string[]; // image URLs (bounded)
  categoryNo?: number;
  categoryName?: string;
};

export type ImageFinding = {
  postLogNo: string;
  postUrl: string;
  postTitle: string;
  imageUrl: string;
  imageIndex: number; // 0-based within the post
  label: string; // e.g. "배송 라벨(주소 단서)" / "명찰(실명/소속)"
  severity: "low" | "medium" | "high";
  excerpt: string; // masked/partial description, do not include full PII
  rationale: string;
  confidence?: number; // 0..1
};

export type VisionCursor = {
  postIndex: number;
  imageIndex: number;
};

export type VisionMeta = {
  status: "pending" | "partial" | "complete";
  processedImages: number;
  totalImages: number;
  cursor?: VisionCursor;
};

export type ScoringBreakdown = {
  byPieceType: Record<string, number>;
  byImageSeverity: Record<"low" | "medium" | "high", number>;
  byRecency: number;
  total: number;
};

export type PostScore = {
  logNo: string;
  url: string;
  title: string;
  publishedAt?: string;
  score: number;
  reasons: string[];
  pieceIndexes: number[];
  imageFindingIndexes: number[];
};

export type ReportScoring = {
  riskScore: number; // 0..100
  postScores: PostScore[]; // sorted desc
  breakdown: ScoringBreakdown;
};

export type RiskNode = {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type Scenario = {
  id: string;
  title: string;
  narrative: string;
};

export type AttackGraphEdgeRef =
  | { kind: "piece"; index: number }
  | { kind: "image"; index: number }
  | { kind: "risk"; riskId: string };

export type AttackGraphTargetRef =
  | { kind: "risk"; riskId: string }
  | { kind: "scenario"; scenarioId: string };

export type AttackGraphEdge = {
  id: string;
  source: AttackGraphEdgeRef;
  target: AttackGraphTargetRef;
  strength: number; // 0..1
  reason: string; // 방어/설명 관점 1~2문장
};

export type AttackGraph = {
  generatedAt: string;
  model: string;
  edges: AttackGraphEdge[];
  warnings?: string[];
};

export type PostInsight = {
  logNo: string;
  summary: string; // 3~5 sentences
  riskSignals: string[]; // short labels
  evidence: Array<{
    kind: "text" | "image";
    excerpt: string;
    why: string;
    severity: "low" | "medium" | "high";
    confidence?: number;
  }>;
  defensiveActions: string[];
};

export type PostInsights = {
  generatedAt: string;
  model: string;
  posts: PostInsight[];
  warnings?: string[];
};

export type BlindReport = {
  blogId: string;
  extractedPieces: ExtractedPiece[];
  riskNodes: RiskNode[];
  scenarios: Scenario[];
  generatedAt: string; // ISO datetime
  riskScore?: number; // 0-100 (optional for MVP)
  warnings?: string[];
  contents?: ScrapedContent[]; // scraped posts within the target category
  imageFindings?: ImageFinding[];
  vision?: VisionMeta;
  attackGraph?: AttackGraph;
  scoring?: ReportScoring;
  category?: {
    categoryNo: number;
    categoryName: string;
  };
  categories?: Array<{ categoryNo: number; categoryName: string }>;
  source?: {
    scrapedAt: string;
    postCount: number;
  };
  phishingSimulation?: {
    sms: string;
    voiceScript: string;
    model?: string;
    generatedAt?: string;
  };
  postInsights?: PostInsights;
};
