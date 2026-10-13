import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "@/lib/config";

const validEnv = {
  DATABASE_URL: "mysql://root:root@localhost:3306/selling",
  JWT_SECRET: "secret",
  MAIN_SYSTEM_URL: "http://localhost:4100",
  MAIN_WEBHOOK_SECRET: "secret",
  WEB_BASE_URL: "http://localhost:3000",
  SMTP_URL: "smtp://localhost:1025",
  MAIL_FROM: "ABC Wear <no-reply@abcwear.local>",
  MAIN_TIMEOUT_MS: "3000",
};

describe("parseConfig", () => {
  it("parses a valid environment and coerces numbers", () => {
    const config = parseConfig(validEnv);
    expect(config.MAIN_TIMEOUT_MS).toBe(3000);
    expect(config.MAIN_SYSTEM_URL).toBe("http://localhost:4100");
  });

  it("defaults MAIN_TIMEOUT_MS to 3000", () => {
    const { MAIN_TIMEOUT_MS: _omit, ...env } = validEnv;
    expect(parseConfig(env).MAIN_TIMEOUT_MS).toBe(3000);
  });

  it("lists every missing variable by name", () => {
    const { JWT_SECRET: _a, DATABASE_URL: _b, ...env } = validEnv;
    try {
      parseConfig(env);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const { issues } = err as ConfigError;
      expect(issues).toContain("JWT_SECRET: missing");
      expect(issues).toContain("DATABASE_URL: missing");
    }
  });

  it("rejects malformed values", () => {
    expect(() => parseConfig({ ...validEnv, MAIN_SYSTEM_URL: "not a url" })).toThrow(
      /MAIN_SYSTEM_URL/,
    );
  });
});
