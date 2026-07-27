const { app, BrowserWindow, net, protocol, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function registerAppProtocol() {
  const webRoot = path.resolve(__dirname, "../www");
  const webRootPrefix = `${webRoot}${path.sep}`;

  protocol.handle("app", (request) => {
    const requestUrl = new URL(request.url);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = path.resolve(webRoot, `.${requestedPath}`);

    if (filePath !== webRoot && !filePath.startsWith(webRootPrefix)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: "Pixel Everywhere",
    backgroundColor: "#050509",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.loadURL("app://pixel/index.html");
}

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
