async function openPixelHelperDownload(button) {
  const update = window.PixelHelper?.getUpdate?.();
  const url = String(update?.downloadUrl || "");
  if (!url) {
    document.querySelector("#downloadAppUpdateButton")?.click();
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Ouverture…";
  try {
    if (window.pixelDesktop?.openExternal) {
      await window.pixelDesktop.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    button.textContent = "Téléchargement ouvert ✓";
  } catch {
    button.textContent = "Réessayer";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = previousText || "Télécharger la mise à jour";
    }, 1800);
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("#pixelHelperDownloadUpdate");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openPixelHelperDownload(button);
}, true);
