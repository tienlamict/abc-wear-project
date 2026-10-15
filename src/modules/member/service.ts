import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { type MemberProfile, memberProfileSelect } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendEmailInBackground } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { RESET_TOKEN_TTL_S, signToken, verifyToken } from "@/lib/tokens";
import { passwordResetEmail } from "./emails";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "./schemas";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

const INVALID_CREDENTIALS = "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.";

// Compared against when the email is unknown, so both paths cost one bcrypt check
// (cost-10 hash of a random string nobody knows).
const DUMMY_HASH = "$2b$10$Nd0Y9khfIvhjSkLlZ9TUaOoRm6ifhTXFQc8/VpJlxxXgCfaMA9Zs6";

function lockedError(lockedUntil: Date, now: Date): AppError {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return new AppError(
    "ACCOUNT_LOCKED",
    `Tài khoản tạm khóa do nhập sai mật khẩu ${MAX_FAILED_LOGINS} lần. Vui lòng thử lại sau ${minutes} phút hoặc đặt lại mật khẩu.`,
  );
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** MA-01: no email verification; the account is usable right away. */
export async function register(input: unknown): Promise<MemberProfile> {
  const data = registerSchema.parse(input);
  if (await prisma.member.findUnique({ where: { email: data.email }, select: { id: true } })) {
    throw new AppError("EMAIL_TAKEN");
  }
  try {
    const member = await prisma.member.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        fullName: data.fullName,
        phone: data.phone ?? null,
      },
      select: memberProfileSelect,
    });
    console.log(`[auth] registered member=${member.id}`);
    return member;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("EMAIL_TAKEN"); // concurrent sign-up
    throw err;
  }
}

/** MA-02 + QT9: 5 wrong passwords in a row lock the account for 15 minutes. */
export async function login(input: unknown, now: Date = new Date()): Promise<MemberProfile> {
  const { email, password } = loginSchema.parse(input);
  const member = await prisma.member.findUnique({ where: { email } });

  if (!member) {
    await verifyPassword(password, DUMMY_HASH);
    console.log("[auth] login failed: unknown email");
    throw new AppError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }
  if (member.lockedUntil && member.lockedUntil > now) {
    console.log(`[auth] login refused: member=${member.id} locked`);
    throw lockedError(member.lockedUntil, now);
  }

  if (!(await verifyPassword(password, member.passwordHash))) {
    // Atomic increment so parallel attempts are all counted.
    const { failedLogins } = await prisma.member.update({
      where: { id: member.id },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    if (failedLogins >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
      await prisma.member.update({
        where: { id: member.id },
        data: { failedLogins: 0, lockedUntil },
      });
      console.log(
        `[auth] login failed: member=${member.id} locked until ${lockedUntil.toISOString()}`,
      );
      throw lockedError(lockedUntil, now);
    }
    console.log(`[auth] login failed: member=${member.id} attempt ${failedLogins}`);
    throw new AppError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  if (member.failedLogins > 0 || member.lockedUntil) {
    await prisma.member.update({
      where: { id: member.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  console.log(`[auth] login ok: member=${member.id}`);
  return getProfile(member.id);
}

export async function getProfile(memberId: string): Promise<MemberProfile> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: memberProfileSelect,
  });
  if (!member) throw new AppError("UNAUTHORIZED");
  return member;
}

/** MA-04: name, phone and the single default shipping address. */
export async function updateProfile(memberId: string, input: unknown): Promise<MemberProfile> {
  const data = profileSchema.parse(input);
  try {
    return await prisma.member.update({
      where: { id: memberId },
      data,
      select: memberProfileSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError("UNAUTHORIZED");
    }
    throw err;
  }
}

/** MA-03: requires the current password. */
export async function changePassword(memberId: string, input: unknown): Promise<void> {
  const { currentPassword, newPassword } = changePasswordSchema.parse(input);
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new AppError("UNAUTHORIZED");
  if (!(await verifyPassword(currentPassword, member.passwordHash))) {
    throw new AppError("VALIDATION_ERROR", "Mật khẩu hiện tại không đúng.", {
      fields: { currentPassword: "Mật khẩu hiện tại không đúng" },
    });
  }
  await prisma.member.update({
    where: { id: memberId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  console.log(`[auth] password changed: member=${memberId}`);
}

/** Ties a reset token to the current password hash: once the password changes, it stops working. */
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export function createPasswordResetToken(member: { id: string; passwordHash: string }) {
  return signToken(
    "pwreset",
    { sub: member.id, fp: passwordFingerprint(member.passwordHash) },
    RESET_TOKEN_TTL_S,
    getConfig().JWT_SECRET,
  );
}

/**
 * MA-03: emails a reset link valid for 30 minutes. Always succeeds so the response does not
 * reveal whether an email is registered; mail errors are only logged.
 */
export async function requestPasswordReset(input: unknown): Promise<void> {
  const { email } = forgotPasswordSchema.parse(input);
  const member = await prisma.member.findUnique({ where: { email } });
  if (!member) {
    console.log("[auth] password reset requested for unknown email");
    return;
  }
  const token = await createPasswordResetToken(member);
  const url = new URL("/dat-lai-mat-khau", getConfig().WEB_BASE_URL);
  url.searchParams.set("token", token);
  // Not awaited: the reply takes as long whether or not the email is registered.
  sendEmailInBackground(
    passwordResetEmail(member.email, member.fullName, url.toString()),
    `password reset, member=${member.id}`,
  );
}

/** MA-03: sets a new password from an emailed token; also lifts a login lock. */
export async function resetPassword(input: unknown): Promise<void> {
  const { token, password } = resetPasswordSchema.parse(input);
  const claims = await verifyToken("pwreset", token, getConfig().JWT_SECRET);
  const member = claims && (await prisma.member.findUnique({ where: { id: claims.sub } }));
  if (!member || claims.fp !== passwordFingerprint(member.passwordHash)) {
    throw new AppError("TOKEN_INVALID");
  }
  await prisma.member.update({
    where: { id: member.id },
    data: {
      passwordHash: await hashPassword(password),
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  console.log(`[auth] password reset: member=${member.id}`);
}
