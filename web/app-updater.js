const BUILD_VERSION = typeof __PIXEL_APP_VERSION__ !== "undefined"
  ? __PIXEL_APP_VERSION__
  : "0.2.0";

const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
const DISMISS_INTERVAL = 24 * 60 * 60 * 1000;
const updateState = {
  runtime: null,
  checking: false,
  latest: null
};

function updateEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateFormatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "Aucun fichier";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toLocaleString("fr-FR", { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`;
}

function updateFormatDate(value) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function updateApiHeaders({ json = false, staff = false } = {}) {
  const headers = {};
  const activeBase = window.PixelServerSettings?.activeApiBase?.() || "";
  if (activeBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  if (json) headers["Content-Type"] = "application/json";
  if (staff) {
    const token = sessionStorage.getItem("pixel-token")
      || localStorage.getItem("pixel-staff-token-persistent")
      || "";
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function updateApi(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...updateApiHeaders({
        json: options.body !== undefined && !(options.body instanceof Blob),
        staff: Boolean(options.staff)
      }),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details) && data.details.length
      ? ` ${data.details.join(" • ")}`
      : "";
    const error = new Error(`${data.error || "La mise à jour a échoué."}${details}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function detectRuntime() {
  if (updateState.runtime) return updateState.runtime;

  try {
    if (window.pixelDesktop?.getRuntime) {
      const desktop = await window.pixelDesktop.getRuntime();
      if (desktop?.platform === "darwin") {
        updateState.runtime = {
          platform: "macos",
          arch: desktop.arch === "arm64" ? "arm64" : "x64",
          version: desktop.version || BUILD_VERSION,
          label: desktop.arch === "arm64" ? "macOS Apple Silicon" : "macOS Intel"
        };
        return updateState.runtime;
      }
    }
  } catch {
    // La détection web reste disponible.
  }

  const capacitorPlatform = window.Capacitor?.getPlatform?.();
  if (capacitorPlatform === "android") {
    updateState.runtime = {
      platform: "android",
      arch: "universal",
      version: BUILD_VERSION,
      label: "Android"
    };
    return updateState.runtime;
  }

  const userAgent = navigator.userAgent || "";
  if (/Android/i.test(userAgent)) {
    updateState.runtime = {
      platform: "android",
      arch: "universal",
      version: BUILD_VERSION,
      label: "Android"
    };
    return updateState.runtime;
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    updateState.runtime = {
      platform: "macos",
      arch: "x64",
      version: BUILD_VERSION,
      label: "macOS"
    };
    return updateState.runtime;
  }

  updateState.runtime = {
    platform: "web",
    arch: "",
    version: BUILD_VERSION,
    label: "Navigateur"
  };
  return updateState.runtime;
}

function installUpdateInterface() {
  const accountCard = document.querySelector("#loginDialog .login-card");
  const accountTabs = accountCard?.querySelector(".account-tabs");
  if (accountCard && accountTabs && !document.querySelector("#appUpdateCard")) {
    const card = document.createElement("section");
    card.id = "appUpdateCard";
    card.className = "app-update-card";
    card.innerHTML = `
      <div>
        <strong>Mises à jour automatiques</strong>
        <small id="appUpdateSummary">Version ${updateEscape(BUILD_VERSION)} • Vérification automatique</small>
      </div>
      <button id="checkAppUpdateButton" type="button">Vérifier</button>
    `;
    accountCard.insertBefore(card, accountTabs);
  }

  if (!document.querySelector("#appUpdateDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "appUpdateDialog";
    dialog.className = "app-update-dialog";
    dialog.innerHTML = `
      <article class="app-update-modal">
        <button id="closeAppUpdateDialog" class="dialog-close" type="button" aria-label="Fermer">×</button>
        <div class="app-update-icon" aria-hidden="true">↥</div>
        <p class="eyebrow">Pixel Everywhere</p>
        <h2 id="appUpdateTitle">Une mise à jour est disponible</h2>
        <p id="appUpdateVersions" class="app-update-versions"></p>
        <div id="appUpdateNotes" class="app-update-notes"></div>
        <p id="appUpdateInstructions" class="account-help"></p>
        <div class="app-update-actions">
          <button id="downloadAppUpdateButton" class="primary-button" type="button">Télécharger la mise à jour</button>
          <button id="laterAppUpdateButton" class="text-button" type="button">Plus tard</button>
        </div>
        <p id="appUpdateDialogStatus" class="form-status" aria-live="polite"></p>
      </article>
    `;
    document.body.append(dialog);
  }

  installAdminUpdatePanel();
}

function installAdminUpdatePanel() {
  const tabs = document.querySelector(".staff-tabs");
  const workspace = document.querySelector("#staffWorkspace");
  if (!tabs || !workspace || document.querySelector("#staff-updates")) return;

  const tab = document.createElement("button");
  tab.id = "updateAdminTabButton";
  tab.type = "button";
  tab.dataset.staffTab = "updates";
  tab.textContent = "Mises à jour";
  tab.hidden = true;
  const accountsTab = tabs.querySelector('[data-staff-tab="accounts"]');
  tabs.insertBefore(tab, accountsTab || null);

  const panel = document.createElement("section");
  panel.id = "staff-updates";
  panel.className = "staff-panel";
  panel.innerHTML = `
    <form id="updateAdminForm" class="card update-admin-form">
      <div class="update-admin-heading">
        <div>
          <p class="eyebrow">Diffusion automatique</p>
          <h3>Version proposée aux utilisateurs</h3>
        </div>
        <button id="refreshUpdateAdmin" class="icon-button" type="button" aria-label="Actualiser">↻</button>
      </div>

      <label class="update-enabled-toggle">
        <input name="enabled" type="checkbox" />
        <span><strong>Activer la recherche automatique</strong><small>L’application vérifiera au démarrage puis toutes les quatre heures.</small></span>
      </label>

      <div class="update-version-grid">
        <label>
          Dernière version
          <input name="latestVersion" required pattern="\\d+\\.\\d+\\.\\d+.*" placeholder="0.2.1" />
        </label>
        <label>
          Version minimale
          <input name="minimumVersion" required pattern="\\d+\\.\\d+\\.\\d+.*" placeholder="0.2.0" />
        </label>
      </div>

      <label>
        Notes de mise à jour
        <textarea name="releaseNotes" rows="6" maxlength="8000" placeholder="Nouveautés, corrections et changements importants…"></textarea>
      </label>

      <details class="update-link-details">
        <summary>Liens externes facultatifs</summary>
        <small>Laisse ces champs vides pour distribuer directement les fichiers enregistrés sur Termux.</small>
        <label>APK Android<input name="androidUrl" type="url" placeholder="https://…/Pixel-Everywhere.apk" /></label>
        <label>Mac Apple Silicon<input name="macosArm64Url" type="url" placeholder="https://…/macOS-arm64.zip" /></label>
        <label>Mac Intel<input name="macosX64Url" type="url" placeholder="https://…/macOS-x64.zip" /></label>
      </details>

      <button class="primary-button" type="submit">Enregistrer et publier les réglages</button>
      <p id="updateAdminStatus" class="form-status" aria-live="polite"></p>
    </form>

    <section class="update-files-section">
      <div>
        <strong>Fichiers distribués par Termux</strong>
        <small>Limite : 350 Mo par fichier. Un lien externe reste prioritaire lorsqu’il est renseigné.</small>
      </div>
      <div id="updateFileCards" class="update-file-grid"></div>
    </section>
  `;

  const accountsPanel = document.querySelector("#staff-accounts");
  workspace.insertBefore(panel, accountsPanel || null);
}

function updateFileCard(target, label, accept, metadata = {}) {
  return `
    <article class="update-file-card" data-update-target="${updateEscape(target)}">
      <div>
        <strong>${updateEscape(label)}</strong>
        <small class="update-file-meta">${metadata.available
          ? `${updateFormatBytes(metadata.size)} • ${updateFormatDate(metadata.updatedAt)}`
          : "Aucun fichier enregistré"}</small>
      </div>
      <input class="update-file-input" type="file" accept="${updateEscape(accept)}" />
      <div class="update-file-actions">
        <button class="primary-button upload-update-file" type="button">Envoyer</button>
        <button class="text-button delete-update-file" type="button" ${metadata.available ? "" : "disabled"}>Supprimer</button>
      </div>
      <p class="form-status" aria-live="polite"></p>
    </article>
  `;
}

function renderUpdateFileCards(files = {}) {
  const container = document.querySelector("#updateFileCards");
  if (!container) return;
  container.innerHTML = [
    updateFileCard("android", "Android • APK", ".apk,application/vnd.android.package-archive", files.android),
    updateFileCard("macos-arm64", "macOS • Apple Silicon", ".zip,application/zip", files["macos-arm64"]),
    updateFileCard("macos-x64", "macOS • Intel", ".zip,application/zip", files["macos-x64"])
  ].join("");
}

function currentStaffUser() {
  const raw = sessionStorage.getItem("pixel-user")
    || localStorage.getItem("pixel-staff-user-persistent")
    || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function refreshUpdateAdminVisibility() {
  const tab = document.querySelector("#updateAdminTabButton");
  if (!tab) return;
  const admin = currentStaffUser()?.role === "admin";
  tab.hidden = !admin;
  if (!admin && document.querySelector("#staff-updates.active")) {
    document.querySelector('[data-staff-tab="applications"]')?.click();
  }
}

async function loadUpdateAdminSettings() {
  const form = document.querySelector("#updateAdminForm");
  const status = document.querySelector("#updateAdminStatus");
  if (!form || currentStaffUser()?.role !== "admin") return;
  status.className = "form-status";
  status.textContent = "Chargement des réglages…";
  try {
    const data = await updateApi("/admin/update-settings", { staff: true });
    const settings = data.settings || {};
    form.elements.enabled.checked = Boolean(settings.enabled);
    form.elements.latestVersion.value = settings.latestVersion || BUILD_VERSION;
    form.elements.minimumVersion.value = settings.minimumVersion || BUILD_VERSION;
    form.elements.releaseNotes.value = settings.releaseNotes || "";
    form.elements.androidUrl.value = settings.androidUrl || "";
    form.elements.macosArm64Url.value = settings.macosArm64Url || "";
    form.elements.macosX64Url.value = settings.macosX64Url || "";
    renderUpdateFileCards(data.files || {});
    status.textContent = `Dernière modification : ${updateFormatDate(settings.updatedAt)}`;
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  }
}

async function saveUpdateAdminSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector("#updateAdminStatus");
  const values = Object.fromEntries(new FormData(form));
  const payload = {
    enabled: form.elements.enabled.checked,
    latestVersion: String(values.latestVersion || "").trim(),
    minimumVersion: String(values.minimumVersion || "").trim(),
    releaseNotes: String(values.releaseNotes || "").trim(),
    androidUrl: String(values.androidUrl || "").trim(),
    macosArm64Url: String(values.macosArm64Url || "").trim(),
    macosX64Url: String(values.macosX64Url || "").trim()
  };

  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Publication des réglages…";
  try {
    const data = await updateApi("/admin/update-settings", {
      method: "PUT",
      staff: true,
      body: JSON.stringify(payload)
    });
    status.className = "form-status success";
    status.textContent = data.message;
    localStorage.removeItem("pixel-update-last-check");
    await loadUpdateAdminSettings();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function uploadUpdateFile(card) {
  const target = card.dataset.updateTarget;
  const input = card.querySelector(".update-file-input");
  const button = card.querySelector(".upload-update-file");
  const status = card.querySelector(".form-status");
  const file = input.files?.[0];
  if (!file) {
    status.className = "form-status error";
    status.textContent = "Choisis d’abord un fichier.";
    return;
  }
  if (file.size > 350 * 1024 * 1024) {
    status.className = "form-status error";
    status.textContent = "Ce fichier dépasse 350 Mo.";
    return;
  }

  button.disabled = true;
  status.className = "form-status";
  status.textContent = `Envoi de ${file.name} (${updateFormatBytes(file.size)})… Ne ferme pas l’application.`;
  try {
    const data = await updateApi(`/admin/update-files/${encodeURIComponent(target)}`, {
      method: "PUT",
      staff: true,
      headers: { "Content-Type": "application/octet-stream" },
      body: file
    });
    status.className = "form-status success";
    status.textContent = data.message;
    input.value = "";
    await loadUpdateAdminSettings();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deleteUpdateFile(card) {
  const target = card.dataset.updateTarget;
  const status = card.querySelector(".form-status");
  const button = card.querySelector(".delete-update-file");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Suppression…";
  try {
    const data = await updateApi(`/admin/update-files/${encodeURIComponent(target)}`, {
      method: "DELETE",
      staff: true
    });
    status.className = "form-status success";
    status.textContent = data.message;
    await loadUpdateAdminSettings();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
    button.disabled = false;
  }
}

function updateSummary(message, type = "") {
  const summary = document.querySelector("#appUpdateSummary");
  if (!summary) return;
  summary.textContent = message;
  summary.className = type;
}

function dismissedRecently(version) {
  const dismissed = localStorage.getItem("pixel-update-dismissed-version");
  const dismissedAt = Number(localStorage.getItem("pixel-update-dismissed-at") || 0);
  return dismissed === version && Date.now() - dismissedAt < DISMISS_INTERVAL;
}

function showUpdateDialog(data, runtime) {
  const dialog = document.querySelector("#appUpdateDialog");
  if (!dialog) return;

  updateState.latest = data;
  document.querySelector("#appUpdateTitle").textContent = data.required
    ? "Mise à jour obligatoire"
    : "Une mise à jour est disponible";
  document.querySelector("#appUpdateVersions").textContent =
    `Version installée ${runtime.version} → nouvelle version ${data.latestVersion}`;
  document.querySelector("#appUpdateNotes").innerHTML = data.releaseNotes
    ? `<strong>Nouveautés</strong><p>${updateEscape(data.releaseNotes).replaceAll("\n", "<br />")}</p>`
    : "<p>Cette version contient des améliorations et des corrections.</p>";

  const instructions = runtime.platform === "android"
    ? "Android ouvrira le téléchargement de l’APK. Confirme ensuite son installation dans le système."
    : "Le fichier ZIP adapté à ce Mac sera téléchargé. Remplace ensuite l’ancienne application par la nouvelle.";
  document.querySelector("#appUpdateInstructions").textContent = instructions;

  const later = document.querySelector("#laterAppUpdateButton");
  const close = document.querySelector("#closeAppUpdateDialog");
  later.hidden = Boolean(data.required);
  close.hidden = Boolean(data.required);
  document.querySelector("#appUpdateDialogStatus").textContent = "";

  if (!dialog.open) dialog.showModal();
}

async function openUpdateDownload() {
  const data = updateState.latest;
  const status = document.querySelector("#appUpdateDialogStatus");
  if (!data?.downloadUrl) {
    status.className = "form-status error";
    status.textContent = "Le fichier de cette version n’est pas encore configuré.";
    return;
  }

  const runtime = await detectRuntime();
  status.className = "form-status";
  status.textContent = "Ouverture du téléchargement…";

  try {
    if (runtime.platform === "android") {
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } else if (window.pixelDesktop?.openExternal) {
      await window.pixelDesktop.openExternal(data.downloadUrl);
    } else {
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    }
    status.className = "form-status success";
    status.textContent = "Téléchargement ouvert. Termine l’installation depuis ton appareil.";
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error?.message || "Impossible d’ouvrir le téléchargement.";
  }
}

async function checkForUpdates({ manual = false, ignoreThrottle = false } = {}) {
  if (updateState.checking) return;
  const lastCheck = Number(localStorage.getItem("pixel-update-last-check") || 0);
  if (!manual && !ignoreThrottle && Date.now() - lastCheck < UPDATE_CHECK_INTERVAL) return;

  updateState.checking = true;
  updateSummary("Recherche d’une mise à jour…");
  const checkButton = document.querySelector("#checkAppUpdateButton");
  if (checkButton) checkButton.disabled = true;

  try {
    const runtime = await detectRuntime();
    const query = new URLSearchParams({
      currentVersion: runtime.version,
      platform: runtime.platform,
      arch: runtime.arch
    });
    const data = await updateApi(`/app/update?${query.toString()}`);
    localStorage.setItem("pixel-update-last-check", String(Date.now()));

    if (data.updateAvailable) {
      updateSummary(`Version ${data.latestVersion} disponible`, "update-available");
      if (manual || data.required || !dismissedRecently(data.latestVersion)) {
        showUpdateDialog(data, runtime);
      }
    } else if (data.enabled && !data.configured && data.latestVersion !== runtime.version) {
      updateSummary(`Version ${runtime.version} • fichier de mise à jour en préparation`);
      if (manual) {
        const dialogStatus = document.querySelector("#appUpdateDialogStatus");
        if (dialogStatus) dialogStatus.textContent = "";
      }
    } else {
      updateSummary(`Version ${runtime.version} • application à jour`, "update-current");
      if (manual) {
        const button = document.querySelector("#checkAppUpdateButton");
        const oldText = button?.textContent;
        if (button) button.textContent = "À jour ✓";
        window.setTimeout(() => {
          if (button) button.textContent = oldText || "Vérifier";
        }, 1800);
      }
    }
  } catch (error) {
    updateSummary(`Version ${BUILD_VERSION} • vérification indisponible`, "update-error");
    if (manual) {
      const button = document.querySelector("#checkAppUpdateButton");
      if (button) {
        button.title = error.message;
        button.textContent = "Erreur";
        window.setTimeout(() => {
          button.textContent = "Vérifier";
        }, 1800);
      }
    }
  } finally {
    updateState.checking = false;
    if (checkButton) checkButton.disabled = false;
  }
}

function installUpdateEvents() {
  document.querySelector("#checkAppUpdateButton")?.addEventListener("click", () =>
    checkForUpdates({ manual: true, ignoreThrottle: true })
  );

  document.querySelector("#closeAppUpdateDialog")?.addEventListener("click", () => {
    if (!updateState.latest?.required) document.querySelector("#appUpdateDialog")?.close();
  });

  document.querySelector("#laterAppUpdateButton")?.addEventListener("click", () => {
    if (updateState.latest?.required) return;
    localStorage.setItem("pixel-update-dismissed-version", updateState.latest?.latestVersion || "");
    localStorage.setItem("pixel-update-dismissed-at", String(Date.now()));
    document.querySelector("#appUpdateDialog")?.close();
  });

  document.querySelector("#downloadAppUpdateButton")?.addEventListener("click", openUpdateDownload);

  document.querySelector("#updateAdminTabButton")?.addEventListener("click", () =>
    window.setTimeout(loadUpdateAdminSettings, 0)
  );
  document.querySelector("#refreshUpdateAdmin")?.addEventListener("click", loadUpdateAdminSettings);
  document.querySelector("#updateAdminForm")?.addEventListener("submit", saveUpdateAdminSettings);

  document.querySelector("#updateFileCards")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-update-target]");
    if (!card) return;
    if (event.target.closest(".upload-update-file")) uploadUpdateFile(card);
    if (event.target.closest(".delete-update-file")) deleteUpdateFile(card);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdates();
  });
}

installUpdateInterface();
installUpdateEvents();
refreshUpdateAdminVisibility();
window.setInterval(refreshUpdateAdminVisibility, 750);
window.setTimeout(() => checkForUpdates(), 2600);
window.setInterval(() => checkForUpdates({ ignoreThrottle: true }), UPDATE_CHECK_INTERVAL);
