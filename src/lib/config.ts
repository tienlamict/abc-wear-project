import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().startsWith("mysql://", "phải là chuỗi kết nối mysql://"),
  JWT_SECRET: z.string().min(1),
  MAIN_SYSTEM_URL: z.url(),
  MAIN_WEBHOOK_SECRET: z.string().min(1),
  WEB_BASE_URL: z.url(),
  SMTP_URL: z.string().startsWith("smtp", "phải là chuỗi kết nối smtp://"),
  MAIL_FROM: z.string().min(1),
  MAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
});

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}\n` +
        "Copy .env.example to .env and fill in the missing values.",
    );
    this.name = "ConfigError";
  }
}

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".");
      return env[key] === undefined || env[key] === ""
        ? `${key}: missing`
        : `${key}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  return result.data;
}

let cached: AppConfig | undefined;

/** Reads and validates process.env once; throws ConfigError with every problem listed. */
export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}
