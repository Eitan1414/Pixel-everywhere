import { registerPlugin } from "@capacitor/core";

const PixelUpdater = registerPlugin("PixelUpdater");
const originalFetch = window.fetch.bind(window);
let latestUpdate = null;
let runtimePromise = null;
let installing = false;

function isUpdateRequest(input) {
  if (typeof input === "string") return /^\/api\/app\/update(?:\?|$)/.test(input);
  if (input instanceof URL) return /\/api\/app\/update(?:\?|$)/.test(input.pathname + input.search);
  if (input instanceof Request) {
    try {
      const url = new URL(input.url, window.location.href);
      return url.pathname.endsWith("/api/app/update");
    } catch {
      return false;
    }
  }
  return false;
}

window.fetch = async function capturePixelUpdate(input, init) {
  const response = await originalFetch(input, init);
  if (isUpdateRequest(input)) {
    response.clone().json().then((data) => {
      if (data?.updateAvailable && data?.downloadUrl) latestUpdate = data;
    }).catch(() => {});
  }
  return response;
};

async function detectNativeRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    try {
      if (window.pixelDesktop?.getRuntime) {
        const runtime = await window.pixelDesktop.getRuntime();
        if (["win32", "darwin"].includes(runtime?.platform)) return runtime;
      }
    } catch {
      // Android ou navigateur ci-dessous.
    }

    if (window.Capacitor?.getPlatform?.() === "android") {
      return { platform: "android", arch: "universal" };
    }
    return null;
  })();
  return runtimePromise;
}

function ensureProgressUi() {
  const modal = document.querySelector("#appUpdateDialog .app-update-modal");
  if (!modal) return null;
  let box = document.querySelector("#automaticUpdateProgress");
  if (!box) {
    box = document.createElement("div");
    box.id = "automaticUpdateProgress";
    box.className = "automatic-update-progress hidden";
    box.innerHTML = `
      <div class="automatic-update-progress-head">
        <strong id="automaticUpdateProgressLabel">Préparation…</strong>
        <span id="automaticUpdateProgressPercent">0 %</span>
      </div>
      <div class="automatic-update-progress-track"><i id="automaticUpdateProgressBar"></i></div>`;
    document.querySelector("#appUpdateInstructions")?.insertAdjacentElement("afterend", box);
  }
  return box;
}

function setProgress({ percent = 0, label = "Téléchargement…" } = {}) {
  const box = ensureProgressUi();
  if (!box) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  box.classList.remove("hidden");
  box.querySelector("#automaticUpdateProgressLabel").textContent = label;
  box.querySelector("#automaticUpdateProgressPercent").textContent = `${Math.round(value)} %`;
  box.querySelector("#automaticUpdateProgressBar").style.width = `${value}%`;
}

function setStatus(message, type = "") {
  const status = document.querySelector("#appUpdateDialogStatus");
  if (!status) return;
  status.className = `form-status ${type}`.trim();
  status.textContent = message;
}

function setBusy(value) {
  installing = value;
  const button = document.querySelector("#downloadAppUpdateButton");
  const later = document.querySelector("#laterAppUpdateButton");
  const close = document.querySelector("#closeAppUpdateDialog");
  if (button) button.disabled = value;
  if (later) later.disabled = value;
  if (close) close.disabled = value;
}

function updateDialogForRuntime(runtime) {
  const instructions = document.querySelector("#appUpdateInstructions");
  const button = document.querySelector("#downloadAppUpdateButton");
  if (!instructions || !button || !runtime) return;

  if (runtime.platform === "android") {
    instructions.textContent = "L’APK sera téléchargé dans l’application, puis Android ouvrira automatiquement la confirmation d’installation.";
    button.textContent = "Télécharger et installer";
  } else if (runtime.platform === "win32") {
    instructions.textContent = "L’installateur sera téléchargé, lancé silencieusement, puis Pixel Everywhere redémarrera avec la nouvelle version.";
    button.textContent = "Installer automatiquement";
  } else if (runtime.platform === "darwin") {
    instructions.textContent = "La nouvelle application sera téléchargée, remplacera l’ancienne après fermeture, puis Pixel Everywhere redémarrera.";
    button.textContent = "Installer et redémarrer";
  }
}

async function installAndroid(update) {
  const progressListener = await PixelUpdater.addListener("downloadProgress", (event) => {
    setProgress({
      percent: event.percent,
      label: event.stage === "installing" ? "Ouverture de l’installation…" : "Téléchargement de l’APK…"
    });
  });
  try {
    const result = await PixelUpdater.downloadAndInstall({
      url: update.downloadUrl,
      fileName: `Pixel-Everywhere-${update.latestVersion}.apk`
    });
    setProgress({ percent: 100, label: "Installation ouverte" });
    setStatus(result?.message || "Android a ouvert la confirmation d’installation.", "success");
  } finally {
    await progressListener.remove();
  }
}

async function installDesktop(update) {
  const removeProgress = window.pixelDesktop.onUpdateProgress?.((event) => {
    const stageLabels = {
      downloading: "Téléchargement de la mise à jour…",
      preparing: "Préparation de l’installation…",
      installing: "Installation et redémarrage…"
    };
    setProgress({ percent: event.percent, label: stageLabels[event.stage] || "Préparation…" });
  });
  try {
    const result = await window.pixelDesktop.installUpdate({
      url: update.downloadUrl,
      version: update.latestVersion
    });
    setProgress({ percent: 100, label: "Installation lancée" });
    setStatus(result?.message || "L’installation est lancée. L’application va redémarrer.", "success");
  } finally {
    removeProgress?.();
  }
}

async function startAutomaticInstall(event) {
  const button = event.target.closest("#downloadAppUpdateButton");
  if (!button || installing) return;

  const runtime = await detectNativeRuntime();
  const nativeDesktop = runtime && ["win32", "darwin"].includes(runtime.platform) && window.pixelDesktop?.installUpdate;
  const nativeAndroid = runtime?.platform === "android" && window.Capacitor?.isNativePlatform?.();
  if (!nativeDesktop && !nativeAndroid) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!latestUpdate?.downloadUrl) {
    setStatus("Le lien de téléchargement n’est pas encore disponible.", "error");
    return;
  }

  setBusy(true);
  setStatus("Préparation de la mise à jour…");
  setProgress({ percent: 0, label: "Connexion au serveur…" });
  try {
    if (nativeAndroid) await installAndroid(latestUpdate);
    else await installDesktop(latestUpdate);
  } catch (error) {
    const permissionHelp = error?.code === "INSTALL_PERMISSION_REQUIRED"
      ? " Autorise Pixel Everywhere à installer des applications, puis appuie de nouveau sur le bouton."
      : "";
    setStatus(`${error?.message || "L’installation automatique a échoué."}${permissionHelp}`, "error");
    setBusy(false);
  }
}

document.addEventListener("click", startAutomaticInstall, true);

const dialogObserver = new MutationObserver(async () => {
  const dialog = document.querySelector("#appUpdateDialog");
  if (!dialog?.open) return;
  updateDialogForRuntime(await detectNativeRuntime());
  ensureProgressUi()?.classList.add("hidden");
});

dialogObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["open"]
});

detectNativeRuntime().then(updateDialogForRuntime).catch(() => {});
