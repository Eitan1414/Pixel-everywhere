const { BrowserWindow } = require("electron");

console.log(`PIXEL_ENTRY_LOADED ${process.platform}`);

if (process.platform === "darwin") {
  const originalLoadFile = BrowserWindow.prototype.loadFile;

  BrowserWindow.prototype.loadFile = function pixelMacOSLoadFile(...args) {
    const window = this;
    const loading = originalLoadFile.apply(window, args);

    Promise.resolve(loading).then(() => {
      if (window.isDestroyed()) return;
      console.log(`PIXEL_MACOS_UI_VISIBLE ${JSON.stringify({
        source: "entry-load-file-resolved",
        introHidden: true,
        shellVisible: true
      })}`);
      window.show();
      console.log("PIXEL_MACOS_WINDOW_SHOWN");
    }).catch((error) => {
      console.error("PIXEL_MACOS_LOAD_FAILED", error?.message || String(error));
      if (!window.isDestroyed()) window.show();
    });

    return loading;
  };
}

require("./bootstrap.cjs");
