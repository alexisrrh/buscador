import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      include: [
        "lib/validation.ts",
        "lib/user-identity.ts",
        "lib/intent-first.ts",
        "lib/geographic-boundary.ts",
        "lib/geographic-location-selection.ts",
        "lib/job-offers/canonicalization.ts",
        "lib/job-sources/search-profile-access.ts",
        "lib/matching/{engine,service}.ts",
        "lib/onboarding/{state,persistence}.ts",
        "lib/applications/{analysis,evidence-priority,generator,professional-evidence,professional-evidence-bootstrap,requirement-resolution,validation}.ts",
        "lib/application-engine/{decision,questions}.ts",
        "lib/derived-resumes/{content,layout-plan}.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
