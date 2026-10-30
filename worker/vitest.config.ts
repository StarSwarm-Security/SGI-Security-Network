import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { TEST_WEBHOOK_SECRET } from "./test/fixture.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    fs: {
      allow: [root, path.resolve(root, "..")],
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(root, "migrations"));
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Test fixture only. Not a RevenueCat secret.
            REVENUECAT_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
            APPLE_CLIENT_ID: "",
            APPLE_TEAM_ID: "",
            APPLE_KEY_ID: "",
            APPLE_PRIVATE_KEY: "",
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
