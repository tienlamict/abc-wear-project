import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/tokens";

/**
 * Sends signed-out visitors of /tai-khoan/* to /dang-nhap?next=…  Only checks the JWT
 * (Edge runtime, no DB); pages still load the member and redirect if it no longer exists.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.JWT_SECRET ?? "";
  const claims = await verifyToken("session", req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (claims) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/dang-nhap";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/tai-khoan", "/tai-khoan/:path*"] };
