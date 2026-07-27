const storage = {
  member: "pixel-remembered-member-username",
  staff: "pixel-remembered-staff-username",
  lastKind: "pixel-last-account-kind"
};

const memberApiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function replaceStartupIntro() {
  const intro = document.querySelector("#startupAnimation");
  if (!intro) return;

  intro.innerHTML = `
    <div class="startup-backdrop-glow" aria-hidden="true"></div>
    <div class="startup-grid-v2" aria-hidden="true"></div>
    <div class="startup-beams-v2" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="startup-particles-v2" aria-hidden="true">
      ${"<i></i>".repeat(18)}
    </div>
    <div class="startup-scene startup-scene-v2" aria-hidden="true">
      <div class="startup-orbit-v2 orbit-one-v2"></div>
      <div class="startup-orbit-v2 orbit-two-v2"></div>
      <div class="startup-flare-v2"></div>
      <div class="startup-scan-v2"></div>
      <svg class="startup-hello startup-hello-v2" viewBox="0 0 600 190">
        <text x="20" y="145">HELLO</text>
      </svg>
      <div class="startup-pixel startup-pixel-v2">
        <div class="startup-pixel-float">
          <img class="startup-pixel-body" src="./assets/pixel-body.png" alt="" />
          <img class="startup-pixel-eye" src="./assets/pixel-eye.png" alt="" />
          <span class="startup-writing-arm startup-writing-arm-v2"><i class="startup-pencil"></i></span>
        </div>
      </div>
      <img class="startup-wordmark startup-wordmark-v2" src="./assets/pdd2-wordmark.png" alt="" />
      <p class="startup-tagline-v2">CREATE • SHARE • IMAGINE</p>
    </div>
    <p class="startup-app-name startup-app-name-v2">Pixel Everywhere <span>ALPHA</span></p>
    <div class="startup-blackout startup-blackout-v2" aria-hidden="true"></div>
    <button id="skipStartup" type="button">Passer</button>
  `;

  window.setTimeout(() => {
    const skip = document.querySelector("#skipStartup");
    if (skip && !intro.classList.contains("leaving")) skip.click();
  }, 8800);
}

function setAccountTab(kind) {
  if (kind !== "member" && kind !== "staff") return;
  document.querySelectorAll("[data-account-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.accountTab === kind);
  });
  document.querySelectorAll(".account-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `account-${kind}`);
  });
}

function setMemberMode(mode) {
  document.querySelectorAll("[data-member-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.memberMode === mode);
  });
  document.querySelector("#memberLoginForm")?.classList.toggle("active", mode === "login");
  document.querySelector("#memberRegisterForm")?.classList.toggle("active", mode === "register");
}

function prefillForm(form, kind) {
  const username = form?.querySelector("input[name='username']");
  const remembered = localStorage.getItem(storage[kind]);
  if (username && remembered && !username.value) username.value = remembered;
}

function prefillRememberedAccounts() {
  prefillForm(document.querySelector("#memberLoginForm"), "member");
  prefillForm(document.querySelector("#memberRegisterForm"), "member");
  prefillForm(document.querySelector("#loginForm"), "staff");
}

function rememberForm(form, kind) {
  if (!form) return;
  const username = form.querySelector("input[name='username']");
  if (!username) return;

  prefillForm(form, kind);

  if (!form.querySelector(".remembered-account-note")) {
    const note = document.createElement("small");
    note.className = "remembered-account-note";
    note.textContent = "Ton identifiant est mémorisé sur cet appareil. Le mot de passe ne l’est jamais.";
    username.closest("label")?.after(note);
  }

  form.addEventListener("submit", () => {
    const value = username.value.trim();
    if (value) localStorage.setItem(storage[kind], value);
    localStorage.setItem(storage.lastKind, kind);
  }, { capture: true });
}

function installPixelMinimalBackground() {
  const style = document.createElement("style");
  style.textContent = `
    #page-pixel .pet-stage,
    #page-pixel .pet-stage.pet-day,
    #page-pixel .pet-stage.pet-evening,
    #page-pixel .pet-stage.pet-night {
      background: transparent !important;
      border-color: rgba(255, 255, 255, 0.07) !important;
      box-shadow: none !important;
    }

    #page-pixel .pet-stage::before,
    #page-pixel .pet-sky,
    #page-pixel .pet-room,
    #page-pixel .pet-sketch-house {
      display: none !important;
    }

    .pixel-community-tools {
      display: grid;
      gap: 10px;
      margin: 14px 0;
      padding: 15px;
      border: 1px solid rgba(18, 214, 223, 0.24);
      border-radius: 17px;
      background: rgba(18, 214, 223, 0.055);
    }

    .pixel-community-tools > div {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }

    .pixel-community-tools button {
      min-height: 46px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 13px;
      color: var(--text);
      font-weight: 800;
      background: var(--surface);
    }

    .pixel-community-tools small {
      color: var(--muted);
      line-height: 1.45;
    }

    .member-auth-help {
      display: block;
      margin-top: -4px;
      color: var(--muted);
      font-size: 0.74rem;
      line-height: 1.4;
    }
  `;
  document.head.append(style);
}

function openMemberAccount(mode = "login") {
  setAccountTab("member");
  setMemberMode(mode);
  document.querySelector("#accountButton")?.click();
}

function installCommunityTools() {
  const page = document.querySelector("#page-pixel");
  const petCard = page?.querySelector(".pet-card");
  if (!page || !petCard || page.querySelector(".pixel-community-tools")) return;

  const panel = document.createElement("section");
  panel.className = "pixel-community-tools";
  panel.innerHTML = `
    <strong>Outils de la communauté</strong>
    <div>
      <button type="button" data-quick-bug-report>🐞 Signaler un bug</button>
      <button type="button" data-quick-xp-trade>◆ Convertir en XP</button>
    </div>
    <small>Le bug report est envoyé à tous les modos et administrateurs. La conversion utilise 1 pièce = 15 XP et crée une demande dans la messagerie du staff pour un ajout manuel sur Discord.</small>
  `;
  petCard.after(panel);

  panel.querySelector("[data-quick-bug-report]")?.addEventListener("click", () => {
    const memberSignedIn = !document.querySelector("#memberSignedIn")?.classList.contains("hidden");
    if (memberSignedIn) document.querySelector("#openBugReportButton")?.click();
    else openMemberAccount("login");
  });

  panel.querySelector("[data-quick-xp-trade]")?.addEventListener("click", () => {
    const memberSignedIn = !document.querySelector("#memberSignedIn")?.classList.contains("hidden");
    if (memberSignedIn) document.querySelector("#openXpConversionButton")?.click();
    else openMemberAccount("login");
  });
}

function installPixelSwipeGuard() {
  const page = document.querySelector("#page-pixel");
  if (!page) return;

  let gesture = null;

  page.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) {
      gesture = null;
      return;
    }

    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      scrollY: window.scrollY,
      multiTouch: event.touches.length > 1,
      interactive: Boolean(event.target.closest(
        "button, input, textarea, select, a, dialog, [role='button'], [data-pet-action], [data-shop-item]"
      ))
    };
  }, { capture: true, passive: true });

  page.addEventListener("touchmove", (event) => {
    if (gesture && event.touches.length > 1) gesture.multiTouch = true;
  }, { capture: true, passive: true });

  page.addEventListener("touchend", (event) => {
    if (!gesture) return;

    const touch = event.changedTouches[0];
    const start = gesture;
    gesture = null;

    if (!touch) {
      event.stopImmediatePropagation();
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);
    const pageScrolled = Math.abs(window.scrollY - start.scrollY) > 8;

    const clearlyHorizontal =
      !start.multiTouch &&
      !start.interactive &&
      !pageScrolled &&
      horizontalDistance >= 110 &&
      horizontalDistance > verticalDistance * 1.5;

    if (!clearlyHorizontal) {
      event.stopImmediatePropagation();
    }
  }, { capture: true, passive: true });

  page.addEventListener("touchcancel", (event) => {
    gesture = null;
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });
}

function memberAuthStatus(form, message, type = "") {
  const status = form.querySelector(".form-status");
  if (!status) return;
  status.textContent = message;
  status.className = `form-status ${type}`.trim();
}

async function memberAuthRequest(paths, values) {
  let lastError = null;

  for (const path of paths) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (memberApiBase.includes(".ngrok-free.")) {
        headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
      }

      const response = await fetch(`${memberApiBase}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(values)
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 404) {
        lastError = new Error("Route membre absente sur le serveur.");
        continue;
      }

      if (!response.ok) {
        const details = Array.isArray(data.details) && data.details.length
          ? ` ${data.details.join(" • ")}`
          : "";
        const error = new Error(`${data.error || "Connexion membre impossible."}${details}`);
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.status) throw error;
      lastError = error;
    }
  }

  if (lastError?.message === "Route membre absente sur le serveur.") {
    throw new Error("Le serveur Termux utilise encore une ancienne version sans comptes membres. Mets à jour le dépôt sur l’appareil serveur, puis redémarre npm start et le tunnel ngrok.");
  }

  throw new Error("Serveur membre inaccessible. Vérifie Termux, npm start et le tunnel ngrok.");
}

function normalizeMemberPayload(data, fallbackUsername) {
  const raw = data?.member || data?.user || data?.account;
  const token = data?.token || data?.accessToken || data?.access_token;
  if (!raw || !token) return null;

  return {
    token,
    member: {
      ...raw,
      username: raw.username || fallbackUsername,
      displayName: raw.displayName || raw.display_name || raw.name || raw.username || fallbackUsername,
      points: Number(raw.points || 0)
    }
  };
}

function installMemberAuthFix() {
  const configurations = [
    {
      selector: "#memberLoginForm",
      paths: ["/members/login", "/member/login", "/auth/member/login"],
      pending: "Connexion au compte membre…",
      success: "Connexion membre réussie."
    },
    {
      selector: "#memberRegisterForm",
      paths: ["/members/register", "/member/register", "/auth/member/register"],
      pending: "Création du compte membre…",
      success: "Compte membre créé."
    }
  ];

  const registrationUsername = document.querySelector("#memberRegisterForm input[name='username']");
  registrationUsername?.removeAttribute("pattern");
  registrationUsername?.setAttribute("maxlength", "40");
  registrationUsername?.setAttribute("placeholder", "Lettres, chiffres, espace, point, tiret…");

  if (registrationUsername && !registrationUsername.closest("label")?.nextElementSibling?.classList.contains("member-auth-help")) {
    const help = document.createElement("small");
    help.className = "member-auth-help";
    help.textContent = "Les accents et espaces sont acceptés. Minimum 3 caractères.";
    registrationUsername.closest("label")?.after(help);
  }

  configurations.forEach((configuration) => {
    const form = document.querySelector(configuration.selector);
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const button = form.querySelector("button[type='submit']");
      const values = Object.fromEntries(new FormData(form));
      Object.keys(values).forEach((key) => {
        if (typeof values[key] === "string") values[key] = values[key].trim();
      });

      if (!form.checkValidity()) {
        form.reportValidity();
        memberAuthStatus(form, "Vérifie les champs du formulaire.", "error");
        return;
      }

      button.disabled = true;
      memberAuthStatus(form, configuration.pending);

      try {
        const data = await memberAuthRequest(configuration.paths, values);
        const session = normalizeMemberPayload(data, values.username);
        if (!session) throw new Error("Le serveur n’a pas renvoyé une session membre valide.");

        localStorage.setItem("pixel-member-token", session.token);
        localStorage.setItem("pixel-member", JSON.stringify(session.member));
        localStorage.setItem(storage.member, session.member.username);
        localStorage.setItem(storage.lastKind, "member");
        memberAuthStatus(form, configuration.success, "success");
        window.setTimeout(() => window.location.reload(), 350);
      } catch (error) {
        memberAuthStatus(form, error.message || "Impossible d’utiliser ce compte membre.", "error");
      } finally {
        button.disabled = false;
      }
    }, { capture: true });
  });
}

replaceStartupIntro();
installPixelMinimalBackground();

window.addEventListener("DOMContentLoaded", () => {
  installPixelSwipeGuard();
  installCommunityTools();
  installMemberAuthFix();
  rememberForm(document.querySelector("#memberLoginForm"), "member");
  rememberForm(document.querySelector("#memberRegisterForm"), "member");
  rememberForm(document.querySelector("#loginForm"), "staff");

  window.setTimeout(() => {
    const lastKind = localStorage.getItem(storage.lastKind);
    if (lastKind) setAccountTab(lastKind);
  }, 0);

  document.querySelector("#accountButton")?.addEventListener("click", () => {
    window.setTimeout(() => {
      prefillRememberedAccounts();
      const lastKind = localStorage.getItem(storage.lastKind);
      if (lastKind) setAccountTab(lastKind);
    }, 0);
  }, { capture: true });

  ["#memberLogoutButton", "#logoutButton"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("click", () => {
      window.setTimeout(prefillRememberedAccounts, 0);
    }, { capture: true });
  });
});