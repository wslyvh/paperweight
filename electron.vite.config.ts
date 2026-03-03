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
      },
    },
    plugins: [react()],
    css: {
      postcss: "./postcss.config.js",
    },
  },
});
