import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { EmailMessage } from "@/lib/email";
import { getConfig } from "@/lib/config";
import { signToken } from "@/lib/tokens";
import {
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  changePassword,
  createPasswordResetToken,
  getProfile,
  login,
  register,
  requestPasswordReset,
  resetPassword,
  updateProfile,
} from "@/modules/member";
import { resetMembers } from "./helpers";

const sent: EmailMessage[] = [];
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async (message: EmailMessage) => {
    sent.push(message);
  }),
}));

const PASSWORD = "matkhau123";
const newMember = (email = "an.nguyen@example.com") =>
  register({ email, password: PASSWORD, fullName: "Nguyễn Văn An", phone: "0901 234 567" });

describe("member module (MA-01 → MA-04)", () => {
  beforeEach(async () => {
    await resetMembers();
    sent.length = 0;
  });
  afterAll(() => prisma.$disconnect());

  describe("MA-01 register", () => {
    it("creates a usable account with a lower-cased email and bcrypt hash", async () => {
      const member = await register({
        email: "  An.Nguyen@Example.COM ",
        password: PASSWORD,
        fullName: " Nguyễn Văn An ",
        phone: "0901.234.567",
      });
      expect(member).toMatchObject({
        email: "an.nguyen@example.com",
        fullName: "Nguyễn Văn An",
        phone: "0901234567",
      });
      expect(member).not.toHaveProperty("passwordHash");

      const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(row.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect(row.passwordHash).not.toContain(PASSWORD);

      await expect(
        login({ email: "AN.NGUYEN@example.com", password: PASSWORD }),
      ).resolves.toMatchObject({
        id: member.id,
      });
    });

    it("rejects a taken email with EMAIL_TAKEN, whatever its case", async () => {
      await newMember();
      await expect(newMember("AN.nguyen@EXAMPLE.com")).rejects.toMatchObject({
        code: "EMAIL_TAKEN",
      });
    });

    it("validates input with Vietnamese messages", async () => {
      await expect(
        register({ email: "khong-phai-email", password: "123", fullName: "", phone: "12345" }),
      ).rejects.toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["email"], message: "Email không hợp lệ" }),
          expect.objectContaining({ path: ["password"], message: "Mật khẩu cần ít nhất 8 ký tự" }),
          expect.objectContaining({ path: ["fullName"], message: "Vui lòng nhập họ tên" }),
          expect.objectContaining({ path: ["phone"] }),
        ]),
      });
    });
  });

  describe("MA-02 login and QT9 lockout", () => {
    it("rejects a wrong password or unknown email with the same message", async () => {
      await newMember();
      const [wrong, unknown] = await Promise.allSettled([
        login({ email: "an.nguyen@example.com", password: "sai-mat-khau" }),
        login({ email: "ai.do@example.com", password: PASSWORD }),
      ]);
      expect(wrong).toMatchObject({ status: "rejected", reason: { code: "UNAUTHORIZED" } });
      expect(unknown).toMatchObject({ status: "rejected", reason: { code: "UNAUTHORIZED" } });
      expect((wrong as PromiseRejectedResult).reason.message).toBe(
        (unknown as PromiseRejectedResult).reason.message,
      );
    });

    it(`locks for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} wrong passwords in a row`, async () => {
      const member = await newMember();
      const t0 = new Date("2026-10-14T08:00:00Z");
      const attempt = (password: string, now: Date) =>
        login({ email: member.email, password }, now);

      for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
        await expect(attempt("sai", t0)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
      await expect(attempt("sai", t0)).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });

      const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(row.lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MINUTES * 60_000);

      // Even the right password is refused while locked.
      const t14 = new Date(t0.getTime() + 14 * 60_000);
      await expect(attempt(PASSWORD, t14)).rejects.toMatchObject({
        code: "ACCOUNT_LOCKED",
        message: expect.stringContaining("1 phút"),
      });

      // After 15 minutes it works again and the counters are cleared.
      const t15 = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1);
      await expect(attempt(PASSWORD, t15)).resolves.toMatchObject({ id: member.id });
      const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(after).toMatchObject({ failedLogins: 0, lockedUntil: null });
    });

    it("resets the failure counter after a successful login", async () => {
      const member = await newMember();
      for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
        await expect(login({ email: member.email, password: "sai" })).rejects.toThrow();
      }
      await login({ email: member.email, password: PASSWORD });
      await expect(login({ email: member.email, password: "sai" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("counts parallel wrong attempts", async () => {
      const member = await newMember();
      await Promise.allSettled(
        Array.from({ length: MAX_FAILED_LOGINS }, () =>
          login({ email: member.email, password: "sai" }),
        ),
      );
      const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(row.lockedUntil).not.toBeNull();
    });
  });

  describe("MA-04 profile", () => {
    it("updates name, phone and default address; empty fields clear them", async () => {
      const member = await newMember();
      const updated = await updateProfile(member.id, {
        fullName: "Nguyễn Văn Bình",
        phone: "+84901234567",
        shipLine1: "12 Lý Thường Kiệt",
        shipWard: "Phường Hàng Bài",
        shipDistrict: "Quận Hoàn Kiếm",
        shipProvince: "Hà Nội",
      });
      expect(updated).toMatchObject({
        fullName: "Nguyễn Văn Bình",
        phone: "+84901234567",
        shipProvince: "Hà Nội",
      });

      // PATCH: missing fields stay, empty ones become null.
      const cleared = await updateProfile(member.id, { phone: "", shipWard: "  " });
      expect(cleared).toMatchObject({
        fullName: "Nguyễn Văn Bình",
        phone: null,
        shipWard: null,
        shipLine1: "12 Lý Thường Kiệt",
      });
      expect(await getProfile(member.id)).toEqual(cleared);
    });

    it("refuses an empty name or a bad phone", async () => {
      const member = await newMember();
      await expect(updateProfile(member.id, { fullName: " " })).rejects.toThrow();
      await expect(updateProfile(member.id, { phone: "abc" })).rejects.toThrow();
      expect((await getProfile(member.id)).fullName).toBe("Nguyễn Văn An");
    });
  });

  describe("MA-03 passwords", () => {
    it("changes the password only with the current one", async () => {
      const member = await newMember();
      await expect(
        changePassword(member.id, { currentPassword: "sai", newPassword: "matkhaumoi1" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        details: { fields: { currentPassword: "Mật khẩu hiện tại không đúng" } },
      });

      await changePassword(member.id, { currentPassword: PASSWORD, newPassword: "matkhaumoi1" });
      await expect(login({ email: member.email, password: PASSWORD })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(login({ email: member.email, password: "matkhaumoi1" })).resolves.toBeTruthy();
    });

    it("emails a 30-minute reset link only to registered addresses", async () => {
      const member = await newMember();
      await requestPasswordReset({ email: "AN.NGUYEN@example.com" });
      await requestPasswordReset({ email: "khong.co@example.com" });

      expect(sent).toHaveLength(1);
      const mail = sent[0]!;
      expect(mail.to).toBe(member.email);
      expect(mail.text).toContain("30 phút");
      const link = /https?:\/\/\S+\/dat-lai-mat-khau\?token=\S+/.exec(mail.text)?.[0];
      expect(link?.startsWith(getConfig().WEB_BASE_URL)).toBe(true);
      const token = new URL(link!).searchParams.get("token")!;

      await resetPassword({ token, password: "datlai1234" });
      await expect(login({ email: member.email, password: "datlai1234" })).resolves.toBeTruthy();

      // Single use: the password changed, so the same link no longer works.
      await expect(resetPassword({ token, password: "lan-thu-hai" })).rejects.toMatchObject({
        code: "TOKEN_INVALID",
      });
    });

    it("rejects expired, forged and session tokens; reset also unlocks the account", async () => {
      const member = await newMember();
      const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      const secret = getConfig().JWT_SECRET;

      const expired = await signToken("pwreset", { sub: member.id }, -10, secret);
      const forged = await signToken("pwreset", { sub: member.id }, 1800, "another-secret");
      const session = await signToken("session", { sub: member.id }, 1800, secret);
      for (const token of [expired, forged, session, "not-a-jwt"]) {
        await expect(resetPassword({ token, password: "datlai1234" })).rejects.toMatchObject({
          code: "TOKEN_INVALID",
        });
      }

      await prisma.member.update({
        where: { id: member.id },
        data: { lockedUntil: new Date(Date.now() + 10 * 60_000), failedLogins: 0 },
      });
      await resetPassword({ token: await createPasswordResetToken(row), password: "datlai1234" });
      await expect(login({ email: member.email, password: "datlai1234" })).resolves.toBeTruthy();
    });
  });
});
