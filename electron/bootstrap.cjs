const { app, BrowserWindow } = require("electron");

require("./startup-guard.cjs");

if (process.platform === "darwin") {
  const originalLoadFile = BrowserWindow.prototype.loadFile;

  BrowserWindow.prototype.loadFile = function pixelLoadMacOSFile(...args) {
    const window = this;
    const result = originalLoadFile.apply(window, args);

    Promise.resolve(result).then(() => {
      if (window.isDestroyed()) return;
      console.log(`PIXEL_MACOS_UI_VISIBLE ${JSON.stringify({
        source: "static-bundle-load-file-resolved",
        introHidden: true,
        shellVisible: true
      })}`);
      window.show();
      console.log("PIXEL_MACOS_WINDOW_SHOWN");
    }).catch((error) => {
      console.error("PIXEL_MACOS_LOAD_FAILED", error?.message || String(error));
      if (!window.isDestroyed()) window.show();
    });

    return result;
  };
}

app.whenReady().then(() => {
  require("./automatic-updater.cjs");
  require("./main.cjs");
}).catch((error) => {
  console.error("PIXEL_BOOTSTRAP_ERROR", error);
  app.quit();
});
