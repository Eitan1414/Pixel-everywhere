const CREATION_CANVAS_SIZE = 512;
const MAX_ANIMATION_FRAMES = 24;
const creationStatusLabels = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée"
};

function creationEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function creationFormatDate(value) {
  if (!value) return "";
  const normalized = String(value);
  const date = new Date(`${normalized}${normalized.endsWith("Z") || normalized.includes("+") ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return normalized;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function memberCreationToken() {
  return localStorage.getItem("pixel-member-token") || "";
}

function staffCreationToken() {
  return sessionStorage.getItem("pixel-token") || "";
}

async function creationApi(path, { method = "GET", body, auth = "member" } = {}) {
  const token = auth === "staff" ? staffCreationToken() : memberCreationToken();
  if (!token) throw new Error(auth === "staff" ? "Connecte-toi au staff." : "Connecte ton compte membre.");
  const headers = {
    Authorization: `Bearer ${token}`,
    "ngrok-skip-browser-warning": "pixel-everywhere"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Serveur Pixel Everywhere inaccessible.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details) && data.details.length ? ` ${data.details.join(" • ")}` : "";
    throw new Error(`${data.error || "Une erreur est survenue."}${details}`);
  }
  return data;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFilename(value, fallback) {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || fallback;
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function blankFrameDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = CREATION_CANVAS_SIZE;
  canvas.height = CREATION_CANVAS_SIZE;
  return canvas.toDataURL("image/png");
}

async function drawDataUrl(context, dataUrl, { alpha = 1, clear = false, whiteBackground = false } = {}) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (clear) context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (whiteBackground) {
    context.save();
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
  }
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(image, 0, 0, context.canvas.width, context.canvas.height);
  context.restore();
}

class CanvasEditor {
  constructor(canvas, { transparent = false, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { willReadFrequently: true });
    this.transparent = transparent;
    this.onChange = onChange;
    this.tool = "pencil";
    this.color = "#191919";
    this.size = 8;
    this.drawing = false;
    this.lastPoint = null;
    this.history = [];
    this.historyIndex = -1;
    this.canvas.width = CREATION_CANVAS_SIZE;
    this.canvas.height = CREATION_CANVAS_SIZE;
    this.resetSurface();
    this.pushHistory();
    this.bind();
  }

  resetSurface() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.transparent) {
      this.context.fillStyle = "#ffffff";
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      this.canvas.addEventListener(name, (event) => this.pointerUp(event));
    });
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height
    };
  }

  pointerDown(event) {
    event.preventDefault();
    const point = this.point(event);
    if (this.tool === "fill") {
      this.floodFill(Math.floor(point.x), Math.floor(point.y), this.color);
      this.commit();
      return;
    }
    this.drawing = true;
    this.lastPoint = point;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.stroke(point, point);
  }

  pointerMove(event) {
    if (!this.drawing) return;
    event.preventDefault();
    const point = this.point(event);
    this.stroke(this.lastPoint, point);
    this.lastPoint = point;
  }

  pointerUp(event) {
    if (!this.drawing) return;
    event.preventDefault();
    this.drawing = false;
    this.lastPoint = null;
    this.commit();
  }

  stroke(from, to) {
    const ctx = this.context;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.size;
    ctx.globalCompositeOperation = this.tool === "eraser" ? (this.transparent ? "destination-out" : "source-over") : "source-over";
    ctx.strokeStyle = this.tool === "eraser" ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
    this.onChange();
  }

  floodFill(startX, startY, fillColor) {
    const ctx = this.context;
    const image = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = image.data;
    const startIndex = (startY * this.canvas.width + startX) * 4;
    const target = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
    const fill = this.hexToRgba(fillColor);
    if (target.every((channel, index) => channel === fill[index])) return;
    const stack = [[startX, startY]];
    const matches = (index) => target.every((channel, offset) => data[index + offset] === channel);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) continue;
      const index = (y * this.canvas.width + x) * 4;
      if (!matches(index)) continue;
      data[index] = fill[0];
      data[index + 1] = fill[1];
      data[index + 2] = fill[2];
      data[index + 3] = 255;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(image, 0, 0);
    this.onChange();
  }

  hexToRgba(hex) {
    const clean = String(hex).replace("#", "");
    const value = Number.parseInt(clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
  }

  commit() {
    this.pushHistory();
    this.onChange();
  }

  pushHistory() {
    const snapshot = this.canvas.toDataURL("image/png");
    if (this.history[this.historyIndex] === snapshot) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > 20) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  async restore(dataUrl, { resetHistory = false } = {}) {
    this.resetSurface();
    await drawDataUrl(this.context, dataUrl);
    if (resetHistory) {
      this.history = [this.canvas.toDataURL("image/png")];
      this.historyIndex = 0;
    }
    this.onChange();
  }

  async undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    await this.restore(this.history[this.historyIndex]);
  }

  async redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    await this.restore(this.history[this.historyIndex]);
  }

  clear() {
    this.resetSurface();
    this.commit();
  }

  dataUrl() {
    return this.canvas.toDataURL("image/png");
  }

  async flattenedDataUrl() {
    if (!this.transparent) return this.dataUrl();
    const flattened = document.createElement("canvas");
    flattened.width = this.canvas.width;
    flattened.height = this.canvas.height;
    const ctx = flattened.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flattened.width, flattened.height);
    ctx.drawImage(this.canvas, 0, 0);
    return flattened.toDataURL("image/png");
  }
}

function installCreationNavigation() {
  const featureGrid = document.querySelector("#page-home .feature-grid");
  if (featureGrid && !featureGrid.querySelector('[data-page-target="creation"]')) {
    const card = document.createElement("button");
    card.className = "feature-card creation-feature";
    card.dataset.pageTarget = "creation";
    card.innerHTML = `
      <span class="feature-icon creation-icon">✎</span>
      <span><strong>Atelier créatif</strong><small>Dessine ou anime image par image</small></span>
    `;
    const rating = featureGrid.querySelector('[data-page-target="rating"]');
    featureGrid.insertBefore(card, rating || null);
  }

  const bottomNav = document.querySelector(".bottom-nav");
  if (bottomNav && !bottomNav.querySelector('[data-page-target="creation"]')) {
    const button = document.createElement("button");
    button.dataset.pageTarget = "creation";
    button.innerHTML = "<span>✎</span><small>Créer</small>";
    const application = bottomNav.querySelector('[data-page-target="application"]');
    bottomNav.insertBefore(button, application || null);
  }

  const guideActions = document.querySelector(".guide-actions");
  if (guideActions && !guideActions.querySelector('[data-guide-page="creation"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.guidePage = "creation";
    button.innerHTML = "<strong>Atelier créatif</strong><small>Dessin Paint et animation frame par frame</small>";
    const staffButton = guideActions.querySelector('[data-guide-page="staff"]');
    guideActions.insertBefore(button, staffButton || null);
  }
}

function creationToolbar(prefix) {
  return `
    <div class="creation-toolbar" aria-label="Outils de dessin">
      <button type="button" class="active" data-creation-tool="pencil" data-editor="${prefix}">✎ <span>Crayon</span></button>
      <button type="button" data-creation-tool="eraser" data-editor="${prefix}">⌫ <span>Gomme</span></button>
      <button type="button" data-creation-tool="fill" data-editor="${prefix}">▣ <span>Remplir</span></button>
      <label class="creation-color">Couleur <input id="${prefix}Color" type="color" value="#191919" /></label>
      <label class="creation-size">Taille <input id="${prefix}Size" type="range" min="1" max="48" value="8" /><output id="${prefix}SizeValue">8</output></label>
      <button type="button" id="${prefix}Undo">↶ <span>Annuler</span></button>
      <button type="button" id="${prefix}Redo">↷ <span>Rétablir</span></button>
      <button type="button" id="${prefix}Clear" class="danger-lite">× <span>Effacer</span></button>
    </div>
  `;
}

function installCreationPage() {
  const main = document.querySelector("#mainContent");
  if (!main || document.querySelector("#page-creation")) return;
  const page = document.createElement("section");
  page.id = "page-creation";
  page.className = "page";
  page.innerHTML = `
    <div class="section-heading">
      <div><p class="eyebrow">Crée directement dans l’application</p><h2>Atelier créatif</h2></div>
      <button id="refreshMemberCreations" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div class="creation-mode-tabs" role="tablist">
      <button class="active" type="button" data-creation-mode="drawing"><span>🖌️</span><strong>Dessin</strong><small>Un Paint simple et complet</small></button>
      <button type="button" data-creation-mode="animation"><span>🎞️</span><strong>Animation</strong><small>Frame par frame</small></button>
    </div>

    <section id="creation-drawing" class="creation-mode-panel active">
      <div class="creation-workspace">
        <article class="creation-editor-card card">
          ${creationToolbar("drawing")}
          <div class="creation-canvas-shell"><canvas id="drawingCanvas" aria-label="Zone de dessin"></canvas></div>
          <div class="creation-export-row">
            <button id="downloadDrawing" class="secondary-button" type="button">Télécharger en PNG</button>
            <small>Format 512 × 512 px, fond blanc.</small>
          </div>
        </article>
        <form id="drawingSubmissionForm" class="creation-submit-card card">
          <p class="eyebrow">Proposer au staff</p><h3>Envoyer ce dessin</h3>
          <p>Le staff peut l’approuver et choisir librement la récompense en pièces.</p>
          <label>Titre<input name="title" minlength="2" maxlength="100" required placeholder="Ex. Pixel dans l’espace" /></label>
          <label>Description<textarea name="description" maxlength="1200" rows="4" placeholder="Explique ton dessin ou le temps passé…"></textarea></label>
          <button class="primary-button" type="submit">Envoyer le dessin au staff</button>
          <p class="form-status" aria-live="polite"></p>
        </form>
      </div>
    </section>

    <section id="creation-animation" class="creation-mode-panel">
      <div class="creation-workspace">
        <article class="creation-editor-card card">
          ${creationToolbar("animation")}
          <div class="animation-stage-shell">
            <img id="animationOnionLayer" alt="" aria-hidden="true" />
            <canvas id="animationCanvas" aria-label="Frame d’animation actuelle"></canvas>
          </div>
          <div class="animation-controls">
            <button id="previousFrame" type="button">← Frame précédente</button>
            <strong id="animationFrameLabel">Frame 1 / 1</strong>
            <button id="nextFrame" type="button">Frame suivante →</button>
          </div>
          <div class="animation-project-actions">
            <button id="addFrame" type="button">＋ Nouvelle frame</button>
            <button id="duplicateFrame" type="button">⧉ Dupliquer</button>
            <button id="deleteFrame" type="button" class="danger-lite">Supprimer</button>
            <label><input id="onionSkinToggle" type="checkbox" checked /> Pelure d’oignon</label>
            <label>Vitesse <input id="animationFps" type="range" min="1" max="12" value="6" /><output id="animationFpsValue">6 FPS</output></label>
          </div>
          <div id="animationTimeline" class="animation-timeline" aria-label="Frames de l’animation"></div>
          <div class="animation-preview-row">
            <canvas id="animationPreviewCanvas" width="512" height="512" aria-label="Aperçu animé"></canvas>
            <div>
              <button id="toggleAnimationPreview" class="secondary-button" type="button">▶ Lire l’animation</button>
              <button id="downloadAnimation" class="secondary-button" type="button">Exporter en WebM</button>
              <button id="downloadAnimationProject" class="text-button" type="button">Sauvegarder le projet JSON</button>
              <small>Maximum ${MAX_ANIMATION_FRAMES} frames. L’export WebM dépend du navigateur Android.</small>
            </div>
          </div>
        </article>
        <form id="animationSubmissionForm" class="creation-submit-card card">
          <p class="eyebrow">Proposer au staff</p><h3>Envoyer cette animation</h3>
          <p>Les frames seront conservées afin que le staff puisse lire l’animation avant de décider.</p>
          <label>Titre<input name="title" minlength="2" maxlength="100" required placeholder="Ex. Pixel fait coucou" /></label>
          <label>Description<textarea name="description" maxlength="1200" rows="4" placeholder="Explique l’idée et le mouvement…"></textarea></label>
          <button class="primary-button" type="submit">Envoyer l’animation au staff</button>
          <p class="form-status" aria-live="polite"></p>
        </form>
      </div>
    </section>

    <div class="creation-history-heading"><div><strong>Mes créations envoyées</strong><small>La décision arrive aussi dans ta messagerie.</small></div></div>
    <div id="memberCreationsList" class="creation-submission-list"></div>
  `;
  const credits = document.querySelector("#page-credits");
  main.insertBefore(page, credits || document.querySelector("#page-staff"));
}

function installStaffCreationPanel() {
  const tabs = document.querySelector(".staff-tabs");
  const workspace = document.querySelector("#staffWorkspace");
  if (!tabs || !workspace || document.querySelector("#staff-creations")) return;
  const tab = document.createElement("button");
  tab.type = "button";
  tab.dataset.staffTab = "creations";
  tab.textContent = "Créations";
  const accountsTab = tabs.querySelector('[data-staff-tab="accounts"]');
  tabs.insertBefore(tab, accountsTab || null);
  const panel = document.createElement("section");
  panel.id = "staff-creations";
  panel.className = "staff-panel";
  panel.innerHTML = `
    <div class="staff-creation-heading">
      <div><strong>Dessins et animations reçus</strong><small>Vérifie la création puis choisis le nombre de pièces à attribuer.</small></div>
      <button id="refreshStaffCreations" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div id="staffCreationsList" class="creation-submission-list"></div>
  `;
  const accountsPanel = document.querySelector("#staff-accounts");
  workspace.insertBefore(panel, accountsPanel || null);
}

let drawingEditor;
let animationEditor;
let animationFrames = [];
let animationFrameIndex = 0;
let previewTimer = null;
let previewFrameIndex = 0;

function bindEditorToolbar(prefix, editor) {
  document.querySelectorAll(`[data-editor="${prefix}"][data-creation-tool]`).forEach((button) => {
    button.addEventListener("click", () => {
      editor.tool = button.dataset.creationTool;
      document.querySelectorAll(`[data-editor="${prefix}"][data-creation-tool]`).forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  const color = document.querySelector(`#${prefix}Color`);
  const size = document.querySelector(`#${prefix}Size`);
  const sizeValue = document.querySelector(`#${prefix}SizeValue`);
  color.addEventListener("input", () => { editor.color = color.value; });
  size.addEventListener("input", () => {
    editor.size = Number(size.value);
    sizeValue.textContent = size.value;
  });
  document.querySelector(`#${prefix}Undo`).addEventListener("click", () => editor.undo());
  document.querySelector(`#${prefix}Redo`).addEventListener("click", () => editor.redo());
  document.querySelector(`#${prefix}Clear`).addEventListener("click", () => {
    if (window.confirm("Effacer toute la zone de dessin ?")) editor.clear();
  });
}

async function flattenedFrame(frameDataUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = CREATION_CANVAS_SIZE;
  canvas.height = CREATION_CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await drawDataUrl(ctx, frameDataUrl);
  return canvas.toDataURL("image/png");
}

function saveAnimationFrame() {
  if (!animationEditor || !animationFrames.length) return;
  animationFrames[animationFrameIndex] = animationEditor.dataUrl();
}

async function loadAnimationFrame(index) {
  if (!animationFrames.length) animationFrames = [blankFrameDataUrl()];
  saveAnimationFrame();
  animationFrameIndex = Math.max(0, Math.min(index, animationFrames.length - 1));
  await animationEditor.restore(animationFrames[animationFrameIndex], { resetHistory: true });
  updateAnimationUi();
}

function updateOnionLayer() {
  const layer = document.querySelector("#animationOnionLayer");
  const enabled = document.querySelector("#onionSkinToggle")?.checked;
  if (!layer) return;
  if (enabled && animationFrameIndex > 0) {
    layer.src = animationFrames[animationFrameIndex - 1];
    layer.classList.add("visible");
  } else {
    layer.removeAttribute("src");
    layer.classList.remove("visible");
  }
}

function updateAnimationUi() {
  saveAnimationFrame();
  document.querySelector("#animationFrameLabel").textContent = `Frame ${animationFrameIndex + 1} / ${animationFrames.length}`;
  document.querySelector("#previousFrame").disabled = animationFrameIndex === 0;
  document.querySelector("#nextFrame").disabled = animationFrameIndex === animationFrames.length - 1;
  document.querySelector("#deleteFrame").disabled = animationFrames.length === 1;
  document.querySelector("#addFrame").disabled = animationFrames.length >= MAX_ANIMATION_FRAMES;
  document.querySelector("#duplicateFrame").disabled = animationFrames.length >= MAX_ANIMATION_FRAMES;
  const timeline = document.querySelector("#animationTimeline");
  timeline.replaceChildren(...animationFrames.map((frame, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === animationFrameIndex ? "active" : "";
    button.innerHTML = `<img src="${frame}" alt="Frame ${index + 1}" /><span>${index + 1}</span>`;
    button.addEventListener("click", () => loadAnimationFrame(index));
    return button;
  }));
  updateOnionLayer();
}

async function drawPreviewFrame(index) {
  saveAnimationFrame();
  const canvas = document.querySelector("#animationPreviewCanvas");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await drawDataUrl(ctx, animationFrames[index]);
}

function stopAnimationPreview() {
  if (previewTimer) window.clearInterval(previewTimer);
  previewTimer = null;
  document.querySelector("#toggleAnimationPreview").textContent = "▶ Lire l’animation";
}

async function toggleAnimationPreview() {
  if (previewTimer) {
    stopAnimationPreview();
    return;
  }
  saveAnimationFrame();
  previewFrameIndex = 0;
  await drawPreviewFrame(0);
  const fps = Number(document.querySelector("#animationFps").value);
  document.querySelector("#toggleAnimationPreview").textContent = "■ Arrêter";
  previewTimer = window.setInterval(async () => {
    previewFrameIndex = (previewFrameIndex + 1) % animationFrames.length;
    await drawPreviewFrame(previewFrameIndex);
  }, Math.round(1000 / fps));
}

async function exportAnimationWebm() {
  saveAnimationFrame();
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("L’export WebM n’est pas pris en charge sur cet appareil. Utilise la sauvegarde JSON du projet.");
  }
  const fps = Number(document.querySelector("#animationFps").value);
  const canvas = document.createElement("canvas");
  canvas.width = CREATION_CANVAS_SIZE;
  canvas.height = CREATION_CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  const completed = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
  recorder.start();
  const loops = animationFrames.length === 1 ? 2 : 1;
  for (let loop = 0; loop < loops; loop += 1) {
    for (const frame of animationFrames) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await drawDataUrl(ctx, frame);
      await new Promise((resolve) => window.setTimeout(resolve, Math.round(1000 / fps)));
    }
  }
  recorder.stop();
  await completed;
  downloadBlob(new Blob(chunks, { type: "video/webm" }), `animation-pdd-${Date.now()}.webm`);
}

function currentAnimationProject() {
  saveAnimationFrame();
  return {
    version: 1,
    kind: "animation",
    width: CREATION_CANVAS_SIZE,
    height: CREATION_CANVAS_SIZE,
    fps: Number(document.querySelector("#animationFps").value),
    frames: [...animationFrames]
  };
}

async function submitCreation(form, kind) {
  const button = form.querySelector("button[type='submit']");
  const status = form.querySelector(".form-status");
  if (!memberCreationToken()) {
    status.className = "form-status error";
    status.textContent = "Connecte ton compte membre avant d’envoyer une création.";
    document.querySelector("#accountButton")?.click();
    return;
  }
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Préparation de la création…";
  try {
    let project;
    let previewData;
    if (kind === "drawing") {
      const frame = drawingEditor.dataUrl();
      project = { version: 1, kind, width: CREATION_CANVAS_SIZE, height: CREATION_CANVAS_SIZE, fps: 1, frames: [frame] };
      previewData = frame;
    } else {
      project = currentAnimationProject();
      previewData = await flattenedFrame(project.frames[0]);
    }
    const projectData = JSON.stringify(project);
    if (projectData.length > 9_000_000) {
      throw new Error("Cette animation est trop lourde pour le serveur. Réduis le nombre de frames ou efface les frames inutiles.");
    }
    status.textContent = "Envoi au staff…";
    const data = await creationApi("/members/creations", {
      method: "POST",
      body: {
        kind,
        title: values.title,
        description: values.description || "",
        previewData,
        projectData,
        frameCount: project.frames.length,
        fps: project.fps
      }
    });
    form.reset();
    status.className = "form-status success";
    status.textContent = data.message;
    await loadMemberCreations();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function memberCreationCard(creation) {
  const typeLabel = creation.kind === "animation" ? `Animation • ${creation.frameCount} frames • ${creation.fps} FPS` : "Dessin PNG";
  const reward = creation.status === "approved"
    ? `<strong class="creation-reward">+${Number(creation.rewardPoints)} ◆</strong>`
    : "";
  const review = creation.reviewNote
    ? `<p class="creation-review-note"><strong>Message du staff :</strong> ${creationEscape(creation.reviewNote)}</p>`
    : "";
  return `
    <article class="creation-submission-card">
      <img src="${creation.previewData}" alt="Aperçu de ${creationEscape(creation.title)}" />
      <div class="creation-submission-body">
        <div class="creation-submission-head">
          <div><strong>${creationEscape(creation.title)}</strong><small>${typeLabel} • ${creationFormatDate(creation.createdAt)}</small></div>
          <span class="creation-status status-${creationEscape(creation.status)}">${creationStatusLabels[creation.status] || creation.status}</span>
        </div>
        ${creation.description ? `<p>${creationEscape(creation.description)}</p>` : ""}
        ${review}${reward}
      </div>
    </article>
  `;
}

async function loadMemberCreations() {
  const list = document.querySelector("#memberCreationsList");
  if (!list) return;
  if (!memberCreationToken()) {
    list.innerHTML = '<div class="empty-state">Connecte ton compte membre pour envoyer une création et suivre les décisions.</div>';
    return;
  }
  list.innerHTML = '<div class="loading-card">Chargement de tes créations…</div>';
  try {
    const data = await creationApi("/members/creations");
    const creations = Array.isArray(data.creations) ? data.creations : [];
    list.innerHTML = creations.length ? creations.map(memberCreationCard).join("") : '<div class="empty-state">Tu n’as encore envoyé aucune création.</div>';
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${creationEscape(error.message)}</div>`;
  }
}

function parseProject(creation) {
  try {
    const project = JSON.parse(creation.projectData || "{}");
    return Array.isArray(project.frames) ? project : { frames: [] };
  } catch {
    return { frames: [] };
  }
}

function staffCreationCard(creation) {
  const article = document.createElement("article");
  article.className = "creation-submission-card staff-creation-card";
  article.dataset.creationId = String(creation.id);
  const media = document.createElement("div");
  media.className = "staff-creation-media";
  const preview = document.createElement("img");
  preview.src = creation.previewData;
  preview.alt = `Aperçu de ${creation.title}`;
  media.append(preview);
  const project = parseProject(creation);
  if (creation.kind === "animation" && project.frames.length) {
    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "▶ Lire";
    let timer = null;
    let frame = 0;
    play.addEventListener("click", () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
        preview.src = creation.previewData;
        play.textContent = "▶ Lire";
        return;
      }
      play.textContent = "■ Stop";
      preview.src = project.frames[0];
      timer = window.setInterval(() => {
        frame = (frame + 1) % project.frames.length;
        preview.src = project.frames[frame];
      }, Math.round(1000 / Math.max(1, Number(creation.fps || 6))));
    });
    media.append(play);
  }

  const body = document.createElement("div");
  body.className = "creation-submission-body";
  const processed = creation.status !== "pending";
  body.innerHTML = `
    <div class="creation-submission-head">
      <div>
        <strong>${creationEscape(creation.title)}</strong>
        <small>${creation.kind === "animation" ? `Animation • ${creation.frameCount} frames • ${creation.fps} FPS` : "Dessin PNG"}</small>
        <small>Par ${creationEscape(creation.member?.displayName)} (@${creationEscape(creation.member?.username)}) • ${creationFormatDate(creation.createdAt)}</small>
      </div>
      <span class="creation-status status-${creationEscape(creation.status)}">${creationStatusLabels[creation.status] || creation.status}</span>
    </div>
    ${creation.description ? `<p>${creationEscape(creation.description)}</p>` : '<p class="muted">Aucune description.</p>'}
    ${processed ? `
      <div class="creation-processed">
        <strong>${creation.status === "approved" ? `${creation.rewardPoints} pièces attribuées` : "Création refusée"}</strong>
        ${creation.reviewNote ? `<p>${creationEscape(creation.reviewNote)}</p>` : ""}
        <small>Traité par ${creationEscape(creation.reviewedBy || "le staff")} • ${creationFormatDate(creation.reviewedAt)}</small>
      </div>
    ` : `
      <form class="creation-decision-form">
        <label>Récompense en pièces<input name="rewardPoints" type="number" min="1" max="1000" value="50" required inputmode="numeric" /></label>
        <label>Message au membre<textarea name="note" maxlength="1500" rows="3" placeholder="Explique ce qui a plu ou ce qui doit être amélioré…"></textarea></label>
        <div class="creation-decision-actions">
          <button class="primary-button" type="submit" data-decision="approved">Approuver et rémunérer</button>
          <button class="danger-button" type="submit" data-decision="rejected">Refuser</button>
        </div>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `}
  `;
  article.append(media, body);
  return article;
}

async function loadStaffCreations() {
  const list = document.querySelector("#staffCreationsList");
  if (!list) return;
  if (!staffCreationToken()) {
    list.innerHTML = '<div class="empty-state">Connecte-toi au staff pour examiner les créations.</div>';
    return;
  }
  list.innerHTML = '<div class="loading-card">Chargement des créations…</div>';
  try {
    const data = await creationApi("/staff/creations", { auth: "staff" });
    const creations = Array.isArray(data.creations) ? data.creations : [];
    list.replaceChildren(...(creations.length ? creations.map(staffCreationCard) : [Object.assign(document.createElement("div"), { className: "empty-state", textContent: "Aucune création reçue pour le moment." })]));
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${creationEscape(error.message)}</div>`;
  }
}

function installCreationEvents() {
  drawingEditor = new CanvasEditor(document.querySelector("#drawingCanvas"), { transparent: false });
  animationFrames = [blankFrameDataUrl()];
  animationEditor = new CanvasEditor(document.querySelector("#animationCanvas"), {
    transparent: true,
    onChange: () => {
      if (animationFrames.length) animationFrames[animationFrameIndex] = animationEditor?.dataUrl() || animationFrames[animationFrameIndex];
    }
  });
  bindEditorToolbar("drawing", drawingEditor);
  bindEditorToolbar("animation", animationEditor);
  updateAnimationUi();
  drawPreviewFrame(0);

  document.querySelectorAll("[data-creation-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.creationMode;
      document.querySelectorAll("[data-creation-mode]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".creation-mode-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `creation-${mode}`));
      stopAnimationPreview();
    });
  });

  document.querySelector("#downloadDrawing").addEventListener("click", () => {
    const title = document.querySelector("#drawingSubmissionForm [name='title']").value;
    downloadBlob(dataUrlToBlob(drawingEditor.dataUrl()), `${safeFilename(title, "dessin-pdd")}.png`);
  });
  document.querySelector("#drawingSubmissionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitCreation(event.currentTarget, "drawing");
  });
  document.querySelector("#animationSubmissionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitCreation(event.currentTarget, "animation");
  });

  document.querySelector("#previousFrame").addEventListener("click", () => loadAnimationFrame(animationFrameIndex - 1));
  document.querySelector("#nextFrame").addEventListener("click", () => loadAnimationFrame(animationFrameIndex + 1));
  document.querySelector("#addFrame").addEventListener("click", async () => {
    if (animationFrames.length >= MAX_ANIMATION_FRAMES) return;
    saveAnimationFrame();
    animationFrames.splice(animationFrameIndex + 1, 0, blankFrameDataUrl());
    await loadAnimationFrame(animationFrameIndex + 1);
  });
  document.querySelector("#duplicateFrame").addEventListener("click", async () => {
    if (animationFrames.length >= MAX_ANIMATION_FRAMES) return;
    saveAnimationFrame();
    animationFrames.splice(animationFrameIndex + 1, 0, animationFrames[animationFrameIndex]);
    await loadAnimationFrame(animationFrameIndex + 1);
  });
  document.querySelector("#deleteFrame").addEventListener("click", async () => {
    if (animationFrames.length <= 1 || !window.confirm("Supprimer cette frame ?")) return;
    animationFrames.splice(animationFrameIndex, 1);
    await loadAnimationFrame(Math.min(animationFrameIndex, animationFrames.length - 1));
  });
  document.querySelector("#onionSkinToggle").addEventListener("change", updateOnionLayer);
  document.querySelector("#animationFps").addEventListener("input", (event) => {
    document.querySelector("#animationFpsValue").textContent = `${event.target.value} FPS`;
    stopAnimationPreview();
  });
  document.querySelector("#toggleAnimationPreview").addEventListener("click", toggleAnimationPreview);
  document.querySelector("#downloadAnimation").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Export…";
    try {
      await exportAnimationWebm();
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  document.querySelector("#downloadAnimationProject").addEventListener("click", () => {
    const title = document.querySelector("#animationSubmissionForm [name='title']").value;
    const project = currentAnimationProject();
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${safeFilename(title, "animation-pdd")}.pixel-animation.json`);
  });

  document.querySelector("#refreshMemberCreations").addEventListener("click", loadMemberCreations);
  document.querySelectorAll('[data-page-target="creation"], [data-guide-page="creation"]').forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(loadMemberCreations, 0));
  });
  const staffTab = document.querySelector('[data-staff-tab="creations"]');
  staffTab?.addEventListener("click", () => window.setTimeout(loadStaffCreations, 0));
  document.querySelector("#refreshStaffCreations")?.addEventListener("click", loadStaffCreations);

  document.querySelector("#staffCreationsList")?.addEventListener("submit", async (event) => {
    const form = event.target.closest(".creation-decision-form");
    if (!form) return;
    event.preventDefault();
    const submitter = event.submitter;
    const statusValue = submitter?.dataset.decision;
    if (!statusValue) return;
    const card = form.closest("[data-creation-id]");
    const creationId = Number(card?.dataset.creationId);
    const rewardInput = form.elements.rewardPoints;
    const status = form.querySelector(".form-status");
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    status.className = "form-status";
    status.textContent = statusValue === "approved" ? "Attribution des pièces…" : "Envoi du refus…";
    try {
      const data = await creationApi(`/staff/creations/${creationId}/decision`, {
        method: "POST",
        auth: "staff",
        body: {
          status: statusValue,
          rewardPoints: statusValue === "approved" ? Number(rewardInput.value) : 0,
          note: form.elements.note.value || ""
        }
      });
      status.className = "form-status success";
      status.textContent = data.message;
      await loadStaffCreations();
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
      form.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (document.querySelector("#page-creation.active")) loadMemberCreations();
    if (document.querySelector("#staff-creations.active")) loadStaffCreations();
  });
}

installCreationNavigation();
installCreationPage();
installStaffCreationPanel();
installCreationEvents();
