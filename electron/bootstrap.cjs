const { app } = require("electron");

require("./startup-guard.cjs");

app.whenReady().then(() => {
  require("./automatic-updater.cjs");
  require("./main.cjs");
}).catch((error) => {
  console.error("PIXEL_BOOTSTRAP_ERROR", error);
  app.quit();
});
