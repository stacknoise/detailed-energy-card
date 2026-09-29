import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/energy-card.ts",
      formats: ["es"],
      fileName: () => "energy-card.js",
    },
    outDir: "dist",
    minify: "esbuild",
    target: "es2021",
  },
  test: { include: ["test/**/*.test.ts"] },
});
