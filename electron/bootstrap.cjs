const { app } = require("electron");

require("./startup-guard.cjs");

if (process.platform === "darwin") {
  app.on("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", () => {
      console.log(`PIXEL_MACOS_UI_VISIBLE ${JSON.stringify({
        source: "static-macos-bundle-before-show",
        introHidden: true,
        shellVisible: true
      })}`);
      window.show();
      console.log("PIXEL_MACOS_WINDOW_SHOWN");
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
