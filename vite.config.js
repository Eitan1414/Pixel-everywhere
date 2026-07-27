import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const serverSettingsPanel = `
        <section id="serverSettingsPanel" class="server-settings-panel open" aria-label="Réglage du serveur PDD">
          <button class="server-settings-toggle" type="button">
            <span>Serveur PDD</span>
            <small id="serverSettingsLabel">À configurer</small>
          </button>
          <div class="server-settings-body">
            <small>Colle l’adresse HTTPS affichée par ngrok, ou utilise Termux local si le serveur tourne sur ce même appareil.</small>
            <input id="serverSettingsInput" type="url" inputmode="url" autocomplete="url" placeholder="https://exemple.ngrok-free.app/api" />
            <div class="server-settings-actions">
              <button id="testServerSettings" type="button">Tester</button>
              <button id="saveServerSettings" type="button">Enregistrer</button>
              <button id="useLocalServer" type="button">Termux local</button>
              <button id="resetServerSettings" type="button">Adresse d’origine</button>
            </div>
            <p id="serverSettingsStatus" class="server-settings-status">Vérification du serveur…</p>
          </div>
        </section>`;

export default defineConfig({
  base: "./",
  publicDir: "public",
  resolve: {
    alias: [
      {
        find: /^\/web\/main\.js$/,
        replacement: fileURLToPath(new URL("./web/app-entry.js", import.meta.url))
      }
    ]
  },
  plugins: [
    {
      name: "pixel-everywhere-static-server-panel",
      transformIndexHtml(html) {
        return html.replace(
          '<div class="account-tabs" role="tablist">',
          `${serverSettingsPanel}\n        <div class="account-tabs" role="tablist">`
        );
      }
    }
  ],
  build: {
    outDir: "www",
    emptyOutDir: true
  }
});
