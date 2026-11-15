import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";

const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));

export default defineConfig({
  root: frontendRoot,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: "echarts",
              test: /(?:^|[\\/])node_modules[\\/](?:echarts|zrender)[\\/]/,
              maxSize: 450 * 1024,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
