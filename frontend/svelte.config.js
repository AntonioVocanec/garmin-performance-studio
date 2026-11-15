import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    cssHash: ({ css, filename, hash }) => {
      const component = filename && filename !== "(unknown)"
        ? path.relative(frontendRoot, filename).replaceAll(path.sep, "/")
        : css;
      return `svelte-${hash(component)}`;
    },
  },
};
