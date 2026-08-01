const ANDROID_CHUNK_SIZE = 4 * 1024 * 1024;
const isAndroidUpdateRuntime = window.Capacitor?.getPlatform?.() === "android"
  || /Android/i.test(navigator.userAgent || "");

function androidUpdateApiBase() {
  const base = window.PixelServerSettings?.activeApiBase?.() || "";
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("Configure d’abord l’adresse du serveur PDD dans l’application.");
  }
  return base.replace(/\/$/, "");
}

function androidUpdateToken() {
  return sessionStorage.getItem("pixel-token")
    || localStorage.getItem("pixel-staff-token-persistent")
    || "";
}

async function androidUpdateRequest(path, { method = "GET", json, body, headers = {} } = {}) {
  const token = androidUpdateToken();
  if (!token) throw new Error("Reconnecte ton compte administrateur avant d’envoyer le fichier.");

  const base = androidUpdateApiBase();
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    ...headers
  };
  if (base.includes(".ngrok-free.")) {
    requestHeaders["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  if (json !== undefined) requestHeaders["Content-Type"] = "application/json";

  const response = await fetch(`${base}${path}`, {
    method,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details) && data.details.length
      ? ` ${data.details.join(" • ")}`
      : "";
    throw new Error(`${data.error || "L’envoi du fichier a échoué."}${details}`);
  }
  return data;
}

function formatAndroidUploadBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function decorateAndroidUpdateCards() {
  if (!isAndroidUpdateRuntime) return;
  document.querySelectorAll("[data-update-target]").forEach((card) => {
    if (card.dataset.pixelAndroidUpdateDecorated === "true") return;
    card.dataset.pixelAndroidUpdateDecorated = "true";

    const button = card.querySelector(".upload-update-file");
    if (button) button.textContent = "Envoyer depuis Android";
    if (!card.querySelector(".android-update-upload-help")) {
      const help = document.createElement("small");
      help.className = "android-update-upload-help";
      help.textContent = "Android enverra le fichier par petits morceaux pour éviter les coupures.";
      card.querySelector(".update-file-actions")?.insertAdjacentElement("beforebegin", help);
    }
  });
}

async function cancelAndroidUpload(target, uploadId) {
  if (!uploadId) return;
  try {
    await androidUpdateRequest(
      `/admin/update-files/${encodeURIComponent(target)}/chunked/${encodeURIComponent(uploadId)}`,
      { method: "DELETE" }
    );
  } catch {
    // La session expirera automatiquement côté serveur.
  }
}

async function uploadAndroidUpdate(card, button) {
  const target = String(card.dataset.updateTarget || "");
  const input = card.querySelector(".update-file-input");
  const status = card.querySelector(".form-status");
  const file = input?.files?.[0];

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

  const totalChunks = Math.ceil(file.size / ANDROID_CHUNK_SIZE);
  const previousText = button.textContent;
  let uploadId = "";
  button.disabled = true;
  status.className = "form-status";
  status.textContent = `Préparation de ${file.name} (${formatAndroidUploadBytes(file.size)})…`;

  try {
    const started = await androidUpdateRequest(
      `/admin/update-files/${encodeURIComponent(target)}/chunked/start`,
      {
        method: "POST",
        json: {
          filename: file.name,
          size: file.size,
          totalChunks
        }
      }
    );
    uploadId = started.uploadId;

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * ANDROID_CHUNK_SIZE;
      const end = Math.min(start + ANDROID_CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const percent = Math.round((start / file.size) * 100);
      button.textContent = `${percent} %`;
      status.textContent = `Envoi de ${file.name} : morceau ${index + 1}/${totalChunks}…`;

      await androidUpdateRequest(
        `/admin/update-files/${encodeURIComponent(target)}/chunked/${encodeURIComponent(uploadId)}/${index}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk
        }
      );
    }

    button.textContent = "Finalisation…";
    status.textContent = "Vérification et installation du fichier sur Termux…";
    const completed = await androidUpdateRequest(
      `/admin/update-files/${encodeURIComponent(target)}/chunked/${encodeURIComponent(uploadId)}/complete`,
      { method: "POST", json: {} }
    );

    status.className = "form-status success";
    status.textContent = completed.message || "Le fichier de mise à jour est prêt sur le serveur.";
    input.value = "";
    window.setTimeout(() => document.querySelector("#refreshUpdateAdmin")?.click(), 150);
  } catch (error) {
    await cancelAndroidUpload(target, uploadId);
    status.className = "form-status error";
    status.textContent = error?.message || "Impossible d’envoyer le fichier depuis Android.";
  } finally {
    button.disabled = false;
    button.textContent = previousText || "Envoyer depuis Android";
  }
}

if (isAndroidUpdateRuntime) {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".upload-update-file");
    if (!button) return;
    const card = button.closest("[data-update-target]");
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    uploadAndroidUpdate(card, button);
  }, true);

  const observer = new MutationObserver(decorateAndroidUpdateCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  decorateAndroidUpdateCards();
}
