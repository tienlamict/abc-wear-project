import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\/(.*)$/, replacement: `${fromRoot("./components/")}$1` },
      { find: /^@\/(.*)$/, replacement: `${fromRoot("./src/")}$1` },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
