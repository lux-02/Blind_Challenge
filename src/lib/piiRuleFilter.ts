export type RuleSignalKind = "phone" | "email" | "resident_id" | "account";

export type RuleSignal = {
  kind: RuleSignalKind;
  label: string;
  count: number;
  samples: string[];
};

type SignalBucket = {
  label: string;
  count: number;
  samples: Set<string>;
};

const PHONE_RE = /\b(?:\+82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const RESIDENT_ID_RE = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;
const ACCOUNT_WITH_KEYWORD_RE =
  /\b(?:계좌(?:번호)?|예금주|은행|account)\s*[:：]?\s*([0-9][0-9-]{6,20}[0-9])\b/gi;

function maskDigitsToken(raw: string, keepHead = 2, keepTail = 2): string {
  const digitCount = Array.from(raw).filter((ch) => /\d/.test(ch)).length;
  if (digitCount <= keepHead + keepTail) {
    return raw.replace(/\d/g, "*");
  }

  let seen = 0;
  return raw.replace(/\d/g, (d) => {
    seen += 1;
    if (seen <= keepHead || seen > digitCount - keepTail) return d;
    return "*";
  });
}

function maskEmail(raw: string): string {
  const [localRaw, domainRaw] = raw.split("@");
  if (!localRaw || !domainRaw) return raw.replace(/[A-Za-z0-9]/g, "*");

  const [hostRaw, ...rest] = domainRaw.split(".");
  const localMasked =
    localRaw.length <= 2 ? `${localRaw[0] ?? "*"}*` : `${localRaw.slice(0, 2)}***`;
  const hostMasked =
    hostRaw.length <= 1 ? "*" : `${hostRaw.slice(0, 1)}***`;
  const suffix = rest.length ? `.${rest.join(".")}` : "";
  return `${localMasked}@${hostMasked}${suffix}`;
}

function registerSignal(
  buckets: Map<RuleSignalKind, SignalBucket>,
  kind: RuleSignalKind,
  label: string,
  sample: string,
) {
  const bucket = buckets.get(kind) ?? { label, count: 0, samples: new Set<string>() };
  bucket.count += 1;
  if (sample.trim()) bucket.samples.add(sample.trim().slice(0, 80));
  buckets.set(kind, bucket);
}

export function applyRuleBasedPrefilter(input: string): {
  maskedText: string;
  signals: RuleSignal[];
  totalHits: number;
} {
  let masked = input;
  const buckets = new Map<RuleSignalKind, SignalBucket>();

  masked = masked.replace(RESIDENT_ID_RE, (m) => {
    const mm = maskDigitsToken(m, 2, 2);
    registerSignal(buckets, "resident_id", "주민등록번호 패턴", mm);
    return mm;
  });

  masked = masked.replace(PHONE_RE, (m) => {
    const mm = maskDigitsToken(m, 2, 2);
    registerSignal(buckets, "phone", "전화번호 패턴", mm);
    return mm;
  });

  masked = masked.replace(EMAIL_RE, (m) => {
    const mm = maskEmail(m);
    registerSignal(buckets, "email", "이메일 패턴", mm);
    return mm;
  });

  masked = masked.replace(ACCOUNT_WITH_KEYWORD_RE, (m, accountRaw: string) => {
    const mm = maskDigitsToken(accountRaw, 2, 2);
    registerSignal(buckets, "account", "계좌번호 패턴", mm);
    return m.replace(accountRaw, mm);
  });

  const signals: RuleSignal[] = Array.from(buckets.entries()).map(([kind, bucket]) => ({
    kind,
    label: bucket.label,
    count: bucket.count,
    samples: Array.from(bucket.samples).slice(0, 3),
  }));

  const totalHits = signals.reduce((acc, s) => acc + s.count, 0);
  return { maskedText: masked, signals, totalHits };
}
