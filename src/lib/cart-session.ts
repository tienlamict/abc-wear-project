import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getSessionMemberId } from "./auth";
import { getConfig } from "./config";

/** Whose cart: a signed-in member, or a guest identified by the `sid` cookie. */
export type CartOwner = { memberId: string } | { sessionId: string };

export const SID_COOKIE = "sid";
const SID_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guest session id from the cookie, if it looks valid. */
export function getGuestSessionId(): string | null {
  const sid = cookies().get(SID_COOKIE)?.value;
  return sid && UUID.test(sid) ? sid : null;
}

/** For reads: null when there is neither a member nor a guest cookie (= empty cart). */
export async function getCartOwner(): Promise<CartOwner | null> {
  const memberId = await getSessionMemberId();
  if (memberId) return { memberId };
  const sessionId = getGuestSessionId();
  return sessionId ? { sessionId } : null;
}

/** For writes (route handlers only): issues a `sid` cookie to a new guest. */
export async function getOrCreateCartOwner(): Promise<CartOwner> {
  const owner = await getCartOwner();
  if (owner) return owner;
  const sessionId = randomUUID();
  cookies().set(SID_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().WEB_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: SID_MAX_AGE_S,
  });
  return { sessionId };
}

/** Lets the browser that just placed an order see its thank-you page (OD-04). */
export const LAST_ORDER_COOKIE = "last_order";

export function rememberLastOrder(code: string): void {
  cookies().set(LAST_ORDER_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().WEB_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: 24 * 60 * 60,
  });
}

export function getLastOrderCode(): string | null {
  return cookies().get(LAST_ORDER_COOKIE)?.value ?? null;
}
