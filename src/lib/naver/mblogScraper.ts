import * as cheerio from "cheerio";

export type ScrapedPost = {
  blogId: string;
  logNo: string;
  url: string;
  title: string;
  publishedAt?: string; // best-effort (ISO date or YYYY-MM-DD)
  text: string;
  images: string[];
};

export type BlogCategory = {
  categoryNo: number;
  categoryName: string;
  postCnt: number;
  parentCategoryNo: number | null;
  categoryType: string;
  openYN: boolean;
  childCategory: boolean;
};

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function safeTrim(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export type CookieSession = {
  cookie: string; // "k=v; k2=v2"
  referer: string;
};

function normalizeNeedle(s: string) {
  return s.replace(/\s+/g, "").trim();
}

function extractSetCookies(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const sc = res.headers.get("set-cookie");
  if (!sc) return [];

  // Best-effort split for environments that collapse multiple Set-Cookie headers.
  // Expires attribute contains commas; we avoid splitting inside it.
  const out: string[] = [];
  let cur = "";
  let inExpires = false;
  for (let i = 0; i < sc.length; i++) {
    const ch = sc[i];
    cur += ch;
    if (cur.toLowerCase().endsWith("expires=")) inExpires = true;
    if (inExpires && ch === ";") inExpires = false;

    if (ch === "," && !inExpires) {
      // If next token looks like a new cookie "k=v"
      const rest = sc.slice(i + 1);
      if (/^\s*[^=;,\s]+=[^;,\s]+/.test(rest)) {
        out.push(cur.slice(0, -1).trim());
        cur = "";
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [sc];
}

function setCookiesToHeader(setCookies: string[]) {
  // Convert "k=v; Path=/; ..." to "k=v; k2=v2"
  const parts = setCookies
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean);
  return parts.join("; ");
}

async function fetchHtml(url: string, session?: CookieSession) {
  const res = await fetch(url, {
    // Naver sometimes behaves differently depending on headers.
    headers: {
      "user-agent": DEFAULT_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
      ...(session?.cookie ? { cookie: session.cookie } : {}),
      ...(session?.referer ? { referer: session.referer } : {}),
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return await res.text();
}

async function fetchJson(url: string, session: CookieSession) {
  const res = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_UA,
      accept: "application/json, text/plain, */*",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "x-requested-with": "XMLHttpRequest",
      referer: session.referer,
      cookie: session.cookie,
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid_json (${url})`);
  }
}

export async function createSession(blogId: string): Promise<CookieSession> {
  const referer = `https://m.blog.naver.com/${encodeURIComponent(blogId)}?tab=1`;
  const res = await fetch(referer, {
    headers: {
      "user-agent": DEFAULT_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`session init failed: ${res.status} ${res.statusText}`);
  }
  const cookie = setCookiesToHeader(extractSetCookies(res));
  return { cookie, referer };
}

export async function fetchBlogCategories(
  blogId: string,
  session?: CookieSession,
): Promise<BlogCategory[]> {
  const s = session ?? (await createSession(blogId));
  const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(blogId)}/category-list`;
  const json = await fetchJson(url, s);
  const root = asRecord(json);
  const result = asRecord(root?.result);
  const list = result?.mylogCategoryList;
  if (!Array.isArray(list)) return [];

  const out: BlogCategory[] = [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const categoryNo = typeof rec.categoryNo === "number" ? rec.categoryNo : null;
    const categoryName =
      typeof rec.categoryName === "string" ? rec.categoryName : "";
    if (categoryNo == null || !categoryName) continue;
    out.push({
      categoryNo,
      categoryName,
      postCnt: typeof rec.postCnt === "number" ? rec.postCnt : 0,
      parentCategoryNo:
        typeof rec.parentCategoryNo === "number" ? rec.parentCategoryNo : null,
      categoryType: typeof rec.categoryType === "string" ? rec.categoryType : "",
      openYN: typeof rec.openYN === "boolean" ? rec.openYN : true,
      childCategory: typeof rec.childCategory === "boolean" ? rec.childCategory : false,
    });
  }
  return out;
}

function parsePublishedAt($: cheerio.CheerioAPI): string | undefined {
  // Try common meta tags first.
  const metaCandidates = [
    'meta[property="article:published_time"]',
    'meta[property="og:article:published_time"]',
    'meta[property="og:updated_time"]',
    'meta[name="article:published_time"]',
  ];
  for (const sel of metaCandidates) {
    const v = $(sel).attr("content");
    if (v && v.length >= 10) return v;
  }

  // Try visible date nodes (best-effort).
  const textCandidates = [
    ".se_publishDate",
    ".date",
    ".blog_author .date",
    ".post_date",
    ".time",
  ];
  for (const sel of textCandidates) {
    const t = safeTrim($(sel).first().text());
    if (!t) continue;
    // Normalize: keep first token with digits.
    const m = t.match(/(\d{4}\.\d{1,2}\.\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/);
    if (m) return m[1].replace(/\./g, "-");
  }
  return undefined;
}

function parseTitle($: cheerio.CheerioAPI): string {
  const og = $('meta[property="og:title"]').attr("content");
  if (og) return safeTrim(og);

  const h1 = $("h1").first().text();
  if (h1) return safeTrim(h1);

  const title = $("title").first().text();
  return safeTrim(title) || "(untitled)";
}

function extractText($: cheerio.CheerioAPI): string {
  // New editor (SmartEditor) container.
  const containers = [".se-main-container", "#postViewArea", "#viewTypeSelector"];
  for (const c of containers) {
    const root = $(c).first();
    if (!root.length) continue;

    // Remove non-content.
    root.find("script, style, noscript").remove();

    const parts: string[] = [];
    root.find("p, li, blockquote, h1, h2, h3, h4, pre").each((_, el) => {
      const t = safeTrim($(el).text());
      if (t) parts.push(t);
    });

    if (parts.length) return parts.join("\n");
  }

  // Fallback: whole body text is too noisy; keep it minimal.
  const body = safeTrim($("body").text());
  return body.slice(0, 4000);
}

function extractImages($: cheerio.CheerioAPI): string[] {
  const urls: string[] = [];
  const roots = [".se-main-container", "#postViewArea", "body"];

  for (const r of roots) {
    const root = $(r).first();
    if (!root.length) continue;
    root.find("img").each((_, el) => {
      const $el = $(el);
      const src =
        $el.attr("data-src") ||
        $el.attr("data-lazy-src") ||
        $el.attr("data-original") ||
        $el.attr("src");
      if (!src) return;
      if (src.startsWith("data:")) return;
      if (src.startsWith("//")) urls.push(`https:${src}`);
      else if (src.startsWith("http")) urls.push(src);
    });
  }

  return uniq(urls);
}

export function pickChallengeCategoryCandidates(categories: BlogCategory[]) {
  const needles = [
    "[블챌]",
    "블챌",
    "주간일기",
    "왓츠인마이블로그",
    "체크인",
    "챌린지",
  ];
  const norm = (s: string) => s.replace(/\s+/g, "").trim();
  const scored = categories
    .map((c) => {
      const name = norm(c.categoryName);
      let score = 0;
      if (name.includes("[블챌]")) score += 120;
      // Prefer the specific "왓츠인마이블로그" challenge when present.
      if (name.includes("왓츠인마이블로그")) score += 260;
      if (name.includes("주간일기")) score += 80;
      if (name.includes("블챌")) score += 70;
      if (name.includes("체크인")) score += 40;
      if (name.includes("챌린지")) score += 30;
      // Prefer categories with more posts.
      score += Math.min(30, Math.floor(c.postCnt / 3));

      const hit = needles.some((n) => name.includes(norm(n)));
      return { c, score, hit };
    })
    .filter((x) => x.hit)
    .sort((a, b) => b.score - a.score);

  return {
    candidates: scored.map((x) => x.c),
    recommended: scored[0]?.c ?? null,
  };
}

async function findCategoryNoByNameNeedle(opts: {
  blogId: string;
  categoryNameNeedle: string;
  session: CookieSession;
}): Promise<number | null> {
  const { blogId, session } = opts;
  const needle = normalizeNeedle(opts.categoryNameNeedle);

  const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(blogId)}/category-list`;
  const json = await fetchJson(url, session);
  const root = asRecord(json);
  const result = asRecord(root?.result);
  const list = result?.mylogCategoryList;
  if (!Array.isArray(list)) return null;

  for (const item of list) {
    const rec = asRecord(item);
    const name = typeof rec?.categoryName === "string" ? rec.categoryName : "";
    const catNo = typeof rec?.categoryNo === "number" ? rec.categoryNo : null;
    if (!name || catNo == null) continue;
    if (normalizeNeedle(name).includes(needle)) return catNo;
  }
  return null;
}

type PostListItem = {
  logNo: string;
  title: string;
  addDate?: number; // epoch ms
};

function toISODateFromEpochMs(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString().slice(0, 10);
}

async function listPostItemsByCategory(opts: {
  blogId: string;
  categoryNo: number;
  session: CookieSession;
  maxItems: number;
  maxPages: number;
  minAddDateMs?: number; // cutoff for 1y filtering
}): Promise<PostListItem[]> {
  const { blogId, categoryNo, session, maxItems, maxPages, minAddDateMs } = opts;
  const itemsOut: PostListItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(
      blogId,
    )}/post-list?categoryNo=${encodeURIComponent(String(categoryNo))}&page=${page}`;
    const json = await fetchJson(url, session);
    const root = asRecord(json);
    const result = asRecord(root?.result);
    const items = result?.items;
    if (!Array.isArray(items) || items.length === 0) break;

    let sawOld = false;
    for (const it of items) {
      const rec = asRecord(it);
      const n = rec?.logNo;
      const logNo =
        typeof n === "number" ? String(n) : typeof n === "string" ? n : "";
      if (!logNo || !/^\d+$/.test(logNo)) continue;

      const addDate = typeof rec?.addDate === "number" ? rec.addDate : undefined;
      if (minAddDateMs && addDate && addDate < minAddDateMs) {
        sawOld = true;
        continue;
      }

      const title =
        typeof rec?.titleWithInspectMessage === "string"
          ? rec.titleWithInspectMessage
          : "";

      itemsOut.push({ logNo, title, addDate });
      if (itemsOut.length >= maxItems) return itemsOut;
    }

    // Post list is reverse chronological; once we see old items on a page, we can stop.
    if (sawOld) break;
  }

  return itemsOut;
}

async function listLogNosByCategory(opts: {
  blogId: string;
  categoryNo: number;
  session: CookieSession;
  maxLogNos: number;
  maxPages: number;
}): Promise<string[]> {
  const { blogId, categoryNo, session, maxLogNos, maxPages } = opts;

  const logNos: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(
      blogId,
    )}/post-list?categoryNo=${encodeURIComponent(String(categoryNo))}&page=${page}`;
    const json = await fetchJson(url, session);
    const root = asRecord(json);
    const result = asRecord(root?.result);
    const items = result?.items;
    if (!Array.isArray(items) || items.length === 0) break;

    for (const it of items) {
      const rec = asRecord(it);
      const n = rec?.logNo;
      const s = typeof n === "number" ? String(n) : typeof n === "string" ? n : "";
      if (s && /^\d+$/.test(s)) logNos.push(s);
      if (logNos.length >= maxLogNos) return uniq(logNos).slice(0, maxLogNos);
    }
  }

  return uniq(logNos).slice(0, maxLogNos);
}

export async function scrapePostsFromChallengeCategory(opts: {
  blogId: string;
  categoryNameNeedle: string;
  maxMatches?: number;
}) {
  const { blogId } = opts;
  const maxMatches = Math.max(1, Math.min(20, opts.maxMatches ?? 5));

  // m.blog API endpoints require cookies from an initial HTML request.
  const session = await createSession(blogId);

  const categoryNo = await findCategoryNoByNameNeedle({
    blogId,
    categoryNameNeedle: opts.categoryNameNeedle,
    session,
  });
  if (categoryNo == null) return [];

  const logNos = await listLogNosByCategory({
    blogId,
    categoryNo,
    session,
    maxLogNos: Math.max(maxMatches, 12),
    maxPages: 5,
  });
  if (!logNos.length) return [];

  const posts: ScrapedPost[] = [];
  for (const logNo of logNos) {
    if (posts.length >= maxMatches) break;
    const url = `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(
      logNo,
    )}`;
    try {
      const html = await fetchHtml(url, session);
      const $ = cheerio.load(html);
      posts.push({
        blogId,
        logNo,
        url,
        title: parseTitle($),
        publishedAt: parsePublishedAt($),
        text: extractText($),
        images: extractImages($),
      });
    } catch {
      // skip single post
    }
  }

  return posts;
}

export async function scrapePostsFromCategoryNo(opts: {
  blogId: string;
  categoryNo: number;
  maxMatches?: number;
  maxDaysBack?: number;
  session?: CookieSession;
}) {
  const { blogId, categoryNo } = opts;
  const maxMatches = Math.max(1, Math.min(30, opts.maxMatches ?? 20));
  const maxDaysBack = Math.max(1, Math.min(3660, opts.maxDaysBack ?? 365));

  const cutoff = Date.now() - maxDaysBack * 24 * 60 * 60 * 1000;

  const session = opts.session ?? (await createSession(blogId));

  const items = await listPostItemsByCategory({
    blogId,
    categoryNo,
    session,
    maxItems: maxMatches,
    maxPages: 12,
    minAddDateMs: cutoff,
  });

  if (!items.length) return [];

  const posts: ScrapedPost[] = [];
  for (const it of items) {
    if (posts.length >= maxMatches) break;
    const url = `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(
      it.logNo,
    )}`;
    try {
      const html = await fetchHtml(url, session);
      const $ = cheerio.load(html);
      posts.push({
        blogId,
        logNo: it.logNo,
        url,
        title: it.title || parseTitle($),
        publishedAt: toISODateFromEpochMs(it.addDate) ?? parsePublishedAt($),
        text: extractText($),
        images: extractImages($),
      });
    } catch {
      // skip
    }
  }
  return posts;
}
