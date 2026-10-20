import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __CT51_SANDBOX__: "false" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
