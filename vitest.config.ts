import { defineConfig } from "vitest/config";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [],
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
