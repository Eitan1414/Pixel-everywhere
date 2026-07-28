function creationStaffToken() {
  return sessionStorage.getItem("pixel-token") || "";
}

async function fetchCreationProject(creationId) {
  const token = creationStaffToken();
  if (!token) throw new Error("Connecte-toi au staff.");
  const response = await fetch(`/api/staff/creations/${creationId}/project`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "pixel-everywhere"
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Impossible de charger cette animation.");
  let project;
  try {
    project = JSON.parse(data.projectData || "{}");
  } catch {
    throw new Error("Le projet d’animation est illisible.");
  }
  if (!Array.isArray(project.frames) || !project.frames.length) {
    throw new Error("Aucune frame n’a été trouvée.");
  }
  return { frames: project.frames, fps: Number(data.fps || project.fps || 6) };
}

function installLazyAnimationButton(card) {
  if (!(card instanceof HTMLElement) || card.dataset.lazyAnimationReady === "true") return;
  const typeText = card.querySelector(".creation-submission-head small")?.textContent || "";
  if (!typeText.startsWith("Animation")) return;
  const media = card.querySelector(".staff-creation-media");
  const preview = media?.querySelector("img");
  if (!media || !preview || media.querySelector("button")) return;
  card.dataset.lazyAnimationReady = "true";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "▶ Lire";
  let project = null;
  let timer = null;
  let frameIndex = 0;
  const originalPreview = preview.src;

  button.addEventListener("click", async () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
      preview.src = originalPreview;
      button.textContent = "▶ Lire";
      return;
    }

    if (!project) {
      button.disabled = true;
      button.textContent = "Chargement…";
      try {
        project = await fetchCreationProject(Number(card.dataset.creationId));
      } catch (error) {
        window.alert(error.message);
        button.textContent = "▶ Lire";
        button.disabled = false;
        return;
      }
      button.disabled = false;
    }

    frameIndex = 0;
    preview.src = project.frames[0];
    button.textContent = "■ Stop";
    timer = window.setInterval(() => {
      frameIndex = (frameIndex + 1) % project.frames.length;
      preview.src = project.frames[frameIndex];
    }, Math.round(1000 / Math.max(1, project.fps)));
  });

  media.append(button);
}

function scanCreationCards(root = document) {
  root.querySelectorAll?.(".staff-creation-card[data-creation-id]").forEach(installLazyAnimationButton);
}

const staffCreationsList = document.querySelector("#staffCreationsList");
if (staffCreationsList) {
  scanCreationCards(staffCreationsList);
  new MutationObserver(() => scanCreationCards(staffCreationsList)).observe(staffCreationsList, {
    childList: true,
    subtree: true
  });
}
