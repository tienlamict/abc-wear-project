import { execSync } from "node:child_process";

/** Creates/migrates the test database (MySQL from docker-compose must be running). */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see vitest.config.mts)");
  try {
    execSync("pnpm exec prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (err) {
    const output = (err as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(
      `Could not migrate the test database. Is MySQL running (docker compose up -d)?\n${output}`,
    );
  }
}
