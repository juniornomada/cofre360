// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineTanstackConfig } from "@lovable.dev/vite-tanstack-config";
import { mergeConfig, defineConfig } from "vite";
import { defaultExclude } from 'vitest/config';

export default defineTanstackConfig({
  vite: {
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/tests/setup.ts",
      exclude: [...defaultExclude, 'e2e/**'],
    },
  } as any,
});
