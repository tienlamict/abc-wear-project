import { SignJWT, jwtVerify } from "jose";

// Edge-safe (jose only): used by middleware.ts as well as by Node code.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days
export const RESET_TOKEN_TTL_S = 30 * 60; // 30 minutes

/** `typ` keeps a reset token from being accepted as a session and vice versa. */
type TokenType = "session" | "pwreset";

export interface TokenClaims {
  sub: string;
  /** Password-reset tokens only: fingerprint of the password hash they were issued for. */
  fp?: string;
}

const encode = (secret: string) => new TextEncoder().encode(secret);

export async function signToken(
  typ: TokenType,
  claims: TokenClaims,
  ttlSeconds: number,
  secret: string,
): Promise<string> {
  const { sub, ...rest } = claims;
  return new SignJWT({ ...rest, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(encode(secret));
}

/** Null for anything invalid: bad signature, expired, wrong type, malformed. */
export async function verifyToken(
  typ: TokenType,
  token: string | undefined,
  secret: string,
): Promise<TokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encode(secret), { algorithms: ["HS256"] });
    if (payload.typ !== typ || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, fp: typeof payload.fp === "string" ? payload.fp : undefined };
  } catch {
    return null;
  }
}
