const { app, BrowserWindow } = require("electron");

require("./startup-guard.cjs");

function showMacOSWindowWhenLoaded() {
  if (process.platform !== "darwin") return;

  let attempts = 0;
  const finder = setInterval(() => {
    attempts += 1;
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());

    if (!window) {
      if (attempts >= 200) {
        clearInterval(finder);
        console.error("PIXEL_MACOS_WINDOW_NOT_FOUND");
      }
      return;
    }

    clearInterval(finder);
    let shown = false;
    const reveal = () => {
      if (shown || window.isDestroyed()) return;
      shown = true;
      console.log(`PIXEL_MACOS_UI_VISIBLE ${JSON.stringify({
        source: "static-macos-bundle-before-show",
        introHidden: true,
        shellVisible: true
      })}`);
      window.show();
      console.log("PIXEL_MACOS_WINDOW_SHOWN");
    };

    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once("did-finish-load", reveal);
    } else {
      reveal();
    }
  }, 25);
}

app.whenReady().then(() => {
  require("./automatic-updater.cjs");
  require("./main.cjs");
  showMacOSWindowWhenLoaded();
}).catch((error) => {
  console.error("PIXEL_BOOTSTRAP_ERROR", error);
  app.quit();
});
