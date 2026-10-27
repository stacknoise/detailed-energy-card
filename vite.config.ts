import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
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
