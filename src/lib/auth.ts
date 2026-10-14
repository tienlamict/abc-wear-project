import { cookies } from "next/headers";
import { getConfig } from "./config";
import { prisma } from "./db";
import { AppError } from "./errors";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, signToken, verifyToken } from "./tokens";

/** Member fields safe to hand to pages and the API (no hash, no lock counters). */
export const memberProfileSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  shipLine1: true,
  shipWard: true,
  shipDistrict: true,
  shipProvince: true,
} as const;

export interface MemberProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  shipLine1: string | null;
  shipWard: string | null;
  shipDistrict: string | null;
  shipProvince: string | null;
}

export function createSessionToken(memberId: string): Promise<string> {
  return signToken("session", { sub: memberId }, SESSION_MAX_AGE_S, getConfig().JWT_SECRET);
}

/** httpOnly, SameSite=Lax, 7 days; Secure when the site runs on https. */
export async function setSessionCookie(memberId: string): Promise<void> {
  cookies().set(SESSION_COOKIE, await createSessionToken(memberId), {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().WEB_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

/** Member id from a valid session cookie, without touching the database. */
export async function getSessionMemberId(): Promise<string | null> {
  const claims = await verifyToken(
    "session",
    cookies().get(SESSION_COOKIE)?.value,
    getConfig().JWT_SECRET,
  );
  return claims?.sub ?? null;
}

/** The signed-in member, or null (no cookie, invalid/expired token, deleted member). */
export async function getCurrentMember(): Promise<MemberProfile | null> {
  const id = await getSessionMemberId();
  if (!id) return null;
  return prisma.member.findUnique({ where: { id }, select: memberProfileSelect });
}

/** For route handlers that need a signed-in member: throws UNAUTHORIZED otherwise. */
export async function requireMemberId(): Promise<string> {
  const id = await getSessionMemberId();
  if (!id) throw new AppError("UNAUTHORIZED");
  return id;
}
