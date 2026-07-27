import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [
    {
      name: "pixel-everywhere-app-entry",
      transformIndexHtml(html) {
        return html.replace(
          'src="/web/main.js"',
          'src="./web/app-entry.js"'
        );
      }
    }
  ],
  build: {
    outDir: "www",
    emptyOutDir: true
  }
});
