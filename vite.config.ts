import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/detailed-energy-card.ts",
      formats: ["es"],
      fileName: () => "detailed-energy-card.js",
    },
    outDir: "dist",
    target: "es2021",
  },
  test: { include: ["test/**/*.test.ts"] },
});
