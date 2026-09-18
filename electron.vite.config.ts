import { resolve } from "path";
import { config } from "dotenv";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

config();

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@paperweight/analysis/contracts": resolve("analysis/src/contracts.ts"),
        "@paperweight/analysis/country": resolve("analysis/src/country.ts"),
        "@paperweight/analysis/received-address": resolve(
          "analysis/src/received-address.ts",
        ),
        "@paperweight/analysis/profile-values": resolve(
          "analysis/src/profile-values.ts",
        ),
        // The app (CJS) consumes the engine's public index. Its ESM-only deps
        // (franc, postal-mime) can't be `require`d in a CJS worker, but Rollup
        // bundles the whole graph inline and converts it to CJS at build time
        // (verified: no runtime require of franc/postal-mime/libphonenumber/
        // htmlparser2). So we alias to source and let the bundler flatten it.
        "@paperweight/analysis": resolve("analysis/src/index.ts"),
      },
    },
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ""),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(
        process.env.GOOGLE_CLIENT_SECRET || ""
      ),
      __MICROSOFT_CLIENT_ID__: JSON.stringify(
        process.env.MICROSOFT_CLIENT_ID || ""
      ),
    },
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "sync-worker": resolve("src/main/sync-worker.ts"),
        },
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@paperweight/analysis/contracts": resolve("analysis/src/contracts.ts"),
      },
    },
    build: {
      externalizeDeps: true,
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@shared": resolve("src/shared"),
        "@paperweight/analysis/contracts": resolve("analysis/src/contracts.ts"),
        "@paperweight/analysis/country": resolve("analysis/src/country.ts"),
        "@paperweight/analysis/received-address": resolve(
          "analysis/src/received-address.ts",
        ),
        "@paperweight/analysis/profile-values": resolve(
          "analysis/src/profile-values.ts",
        ),
      },
    },
    plugins: [react()],
    css: {
      postcss: "./postcss.config.js",
    },
  },
});
