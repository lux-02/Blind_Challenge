import * as cheerio from "cheerio";
import { createSession } from "@/lib/naver/mblogScraper";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function compactWhitespace(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

async function fetchBlogHomeHtml(blogId: string, session: { cookie: string; referer: string }) {
  const url = `https://m.blog.naver.com/${encodeURIComponent(blogId)}?tab=1`;
  const res = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
      cookie: session.cookie,
      referer: session.referer,
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`intro_fetch_failed_${res.status}`);
  }

  return await res.text();
}

function collectPossibleIntroText(html: string): string {
  const $ = cheerio.load(html);

  const buckets: string[] = [];
  const metaCandidates = [
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];
  for (const sel of metaCandidates) {
    const v = $(sel).attr("content");
    if (v) buckets.push(v);
  }

  const textCandidates = [
    ".blog_desc",
    ".bloger_desc",
    ".blog_intro",
    ".profile_desc",
    ".intro",
    ".se-component-content",
    "#_blogMenuProfile",
    "#_profileArea",
    "#viewTypeSelector",
  ];
  for (const sel of textCandidates) {
    const t = compactWhitespace($(sel).first().text());
    if (t) buckets.push(t);
  }

  const bodyText = compactWhitespace($("body").text()).slice(0, 60000);
  if (bodyText) buckets.push(bodyText);

  return buckets.join("\n");
}

export async function verifyBlogIntroContainsNonce(opts: {
  blogId: string;
  nonce: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const nonce = opts.nonce.trim();
  if (!nonce) return { ok: false, error: "nonce_missing" };

  const session = await createSession(opts.blogId);
  const html = await fetchBlogHomeHtml(opts.blogId, session);
  const haystack = collectPossibleIntroText(html);

  if (!haystack.includes(nonce)) {
    return { ok: false, error: "nonce_not_found_in_intro" };
  }

  return { ok: true };
}
