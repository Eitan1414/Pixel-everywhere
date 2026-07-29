const originalFetch = window.fetch.bind(window);
const windowsRuntimePromise = typeof window.pixelDesktop?.getRuntime === "function"
  ? window.pixelDesktop.getRuntime().catch(() => null)
  : Promise.resolve(null);

async function windowsRuntime() {
  const runtime = await windowsRuntimePromise;
  return runtime?.platform === "win32" ? runtime : null;
}

// app-updater.js existait avant la cible Windows et considère sinon Electron
// Windows comme un navigateur. Cette interception très ciblée corrige uniquement
// la requête publique de mise à jour, tout en laissant le relais réseau existant
// gérer l’adresse réelle du serveur.
window.fetch = async (input, init) => {
  if (typeof input === "string" && /^\/api\/app\/update(?:\?|$)/.test(input)) {
    const runtime = await windowsRuntime();
    if (runtime) {
      const [pathname, query = ""] = input.split("?", 2);
      const params = new URLSearchParams(query);
      params.set("platform", "windows");
      params.set("arch", "x64");
      input = `${pathname}?${params.toString()}`;
    }
  }
  return originalFetch(input, init);
};

function windowsUpdateHeaders({ json = false } = {}) {
  const headers = {};
  const activeBase = window.PixelServerSettings?.activeApiBase?.() || "";
  if (activeBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  const token = sessionStorage.getItem("pixel-token")
    || localStorage.getItem("pixel-staff-token-persistent")
    || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function windowsUpdateApi(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...windowsUpdateHeaders({ json: options.body !== undefined }),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details) && data.details.length
      ? ` ${data.details.join(" • ")}`
      : "";
    throw new Error(`${data.error || "La mise à jour Windows a échoué."}${details}`);
  }
  return data;
}

function windowsCurrentStaffUser() {
  const raw = sessionStorage.getItem("pixel-user")
    || localStorage.getItem("pixel-staff-user-persistent")
    || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function windowsFormatBytes(value) {
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

function windowsFormatDate(value) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

let windowsFileMetadata = {};
let windowsSettingsLoaded = false;

function ensureWindowsExternalUrlField() {
  const details = document.querySelector("#updateAdminForm .update-link-details");
  if (!details || details.querySelector('[name="windowsX64Url"]')) return;
  const label = document.createElement("label");
  label.textContent = "Windows 64 bits";
  const input = document.createElement("input");
  input.name = "windowsX64Url";
  input.type = "url";
  input.placeholder = "https://…/Windows-x64-Setup.exe";
  label.append(input);
  details.append(label);
}

function windowsCardMarkup(metadata = {}) {
  const available = Boolean(metadata.available);
  const meta = available
    ? `${windowsFormatBytes(metadata.size)} • ${windowsFormatDate(metadata.updatedAt)}`
    : "Aucun fichier enregistré";
  return `
    <article class="update-file-card" data-update-target="windows-x64">
      <div>
        <strong>Windows • 64 bits</strong>
        <small class="update-file-meta">${meta}</small>
      </div>
      <input class="update-file-input" type="file" accept=".exe,application/vnd.microsoft.portable-executable,application/x-msdownload" />
      <div class="update-file-actions">
        <button class="primary-button upload-update-file" type="button">Envoyer</button>
        <button class="text-button delete-update-file" type="button" ${available ? "" : "disabled"}>Supprimer</button>
      </div>
      <p class="form-status" aria-live="polite"></p>
    </article>
  `;
}

function ensureWindowsUpdateCard() {
  const container = document.querySelector("#updateFileCards");
  if (!container || container.querySelector('[data-update-target="windows-x64"]')) return;
  container.insertAdjacentHTML("beforeend", windowsCardMarkup(windowsFileMetadata));
}

function ensureWindowsAdminInterface() {
  ensureWindowsExternalUrlField();
  ensureWindowsUpdateCard();
}

async function loadWindowsUpdateSettings() {
  const form = document.querySelector("#updateAdminForm");
  if (!form || windowsCurrentStaffUser()?.role !== "admin") return;
  try {
    const data = await windowsUpdateApi("/admin/update-settings");
    const settings = data.settings || {};
    ensureWindowsExternalUrlField();
    if (form.elements.windowsX64Url) {
      form.elements.windowsX64Url.value = settings.windowsX64Url || "";
    }
    windowsFileMetadata = data.files?.["windows-x64"] || {};
    document.querySelector('[data-update-target="windows-x64"]')?.remove();
    ensureWindowsUpdateCard();
    windowsSettingsLoaded = true;
  } catch {
    // L’ancien serveur peut ne pas encore connaître Windows. Les autres cibles
    // restent utilisables et la mise à niveau Termux activera ensuite ce champ.
  }
}

async function saveWindowsAwareSettings(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "updateAdminForm") return;
  event.preventDefault();
  event.stopImmediatePropagation();

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
    macosX64Url: String(values.macosX64Url || "").trim(),
    windowsX64Url: String(values.windowsX64Url || "").trim()
  };

  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Publication des réglages…";
  try {
    const data = await windowsUpdateApi("/admin/update-settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    status.className = "form-status success";
    status.textContent = data.message;
    localStorage.removeItem("pixel-update-last-check");
    document.querySelector("#refreshUpdateAdmin")?.click();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function decorateWindowsUpdateDialog() {
  if (!(await windowsRuntime())) return;
  const instructions = document.querySelector("#appUpdateInstructions");
  if (instructions) {
    instructions.textContent = "L’installateur Windows sera téléchargé puis lancé automatiquement. Pixel Everywhere se fermera pendant l’installation.";
  }
  const button = document.querySelector("#downloadAppUpdateButton");
  if (button) button.textContent = "Installer automatiquement";
}

document.addEventListener("submit", saveWindowsAwareSettings, true);
document.addEventListener("click", (event) => {
  if (event.target.closest("#refreshUpdateAdmin, #updateAdminTabButton")) {
    window.setTimeout(loadWindowsUpdateSettings, 0);
  }
});

const windowsObserver = new MutationObserver(() => {
  ensureWindowsAdminInterface();
  decorateWindowsUpdateDialog();
  if (!windowsSettingsLoaded && document.querySelector("#updateAdminForm")) {
    loadWindowsUpdateSettings();
  }
});
windowsObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["open"]
});

ensureWindowsAdminInterface();
decorateWindowsUpdateDialog();
