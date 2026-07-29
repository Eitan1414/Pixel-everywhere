const { app } = require("electron");

const MACOS_NO_INTRO_CSS = `
  #startupAnimation {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    animation: none !important;
  }

  body.startup-running {
    overflow-x: hidden !important;
    overflow-y: auto !important;
  }

  body.startup-running .app-shell,
  .app-shell {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    animation: none !important;
  }
`;

require("./startup-guard.cjs");

if (process.platform === "darwin") {
  app.on("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", async () => {
      try {
        const cssKey = await window.webContents.insertCSS(MACOS_NO_INTRO_CSS, {
          cssOrigin: "author"
        });
        console.log(`PIXEL_MACOS_UI_VISIBLE ${JSON.stringify({
          source: "bootstrap-css-before-show",
          cssKey: Boolean(cssKey),
          introHidden: true,
          shellVisible: true
        })}`);
        window.show();
        console.log("PIXEL_MACOS_WINDOW_SHOWN");
      } catch (error) {
        console.error("PIXEL_MACOS_PREPARE_FAILED", error?.message || String(error));
        window.show();
      }
    });
  });
}

app.whenReady().then(() => {
  require("./automatic-updater.cjs");
  require("./main.cjs");
}).catch((error) => {
  console.error("PIXEL_BOOTSTRAP_ERROR", error);
  app.quit();
});
