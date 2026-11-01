import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Transforms the development CSP into a hardened production CSP during production builds.
 * In production:
 * - Drops localhost / 127.0.0.1 dev server origins from script-src and connect-src.
 * - Enforces strict `script-src 'self'` without `'unsafe-inline'` or `'unsafe-eval'`.
 * - Preserves required resources: Google Fonts, styles, images, blobs, and custom islet-art protocol.
 */
const prodCspPlugin = (): Plugin => ({
  name: "islet-prod-csp",
  apply: "build",
  transformIndexHtml(html) {
    const prodCsp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: islet-art: blob: https:; connect-src 'self' https: islet-art:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none';";
    return html.replace(
      /<meta http-equiv="Content-Security-Policy" content="[^"]*"\s*\/?>/i,
      `<meta http-equiv="Content-Security-Policy" content="${prodCsp}" />`
    );
  }
});

export default defineConfig({
  plugins: [react(), prodCspPlugin()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    chunkSizeWarningLimit: 1000
  }
});
