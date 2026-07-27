import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [
    {
      name: "pixel-everywhere-enhancements",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { type: "module", src: "./web/enhancements.js" },
            injectTo: "head-prepend"
          },
          {
            tag: "link",
            attrs: { rel: "stylesheet", href: "./web/startup-v2.css" },
            injectTo: "head"
          }
        ];
      }
    }
  ],
  build: {
    outDir: "www",
    emptyOutDir: true
  }
});
