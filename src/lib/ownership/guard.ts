import { NextResponse } from "next/server";
import {
  getOwnershipSecret,
  normalizeBlogId,
  OWNERSHIP_COOKIE_NAME,
  readCookieValue,
  verifyOwnershipSessionToken,
} from "@/lib/ownership/token";

const DEFAULT_MESSAGE = "블로그 소유권 인증이 필요합니다. 홈에서 인증 후 다시 시도해 주세요.";

export function requireOwnershipOrThrow(req: Request, blogId: string): NextResponse | null {
  if (normalizeBlogId(blogId) === "sample") return null;

  const secret = getOwnershipSecret();
  if (!secret) {
    return NextResponse.json(
      {
        error: "ownership_not_configured",
        message: "서버에 소유권 인증 비밀키가 설정되지 않았습니다.",
      },
      { status: 500 },
    );
  }

  const token = readCookieValue(req.headers.get("cookie"), OWNERSHIP_COOKIE_NAME);
  if (!token) {
    return NextResponse.json(
      {
        error: "ownership_required",
        message: DEFAULT_MESSAGE,
      },
      { status: 403 },
    );
  }

  const checked = verifyOwnershipSessionToken({ token, blogId, secret });
  if (!checked.ok) {
    const message =
      checked.error === "expired"
        ? "소유권 인증 세션이 만료되었습니다. 홈에서 다시 인증해 주세요."
        : DEFAULT_MESSAGE;
    return NextResponse.json(
      {
        error: "ownership_required",
        message,
      },
      { status: 403 },
    );
  }

  return null;
}
