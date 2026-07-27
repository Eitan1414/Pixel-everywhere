const storage = {
  member: "pixel-remembered-member-username",
  staff: "pixel-remembered-staff-username",
  lastKind: "pixel-last-account-kind"
};

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

function rememberForm(form, kind) {
  if (!form) return;
  const username = form.querySelector("input[name='username']");
  if (!username) return;

  const remembered = localStorage.getItem(storage[kind]);
  if (remembered && !username.value) username.value = remembered;

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

replaceStartupIntro();

window.addEventListener("DOMContentLoaded", () => {
  rememberForm(document.querySelector("#memberLoginForm"), "member");
  rememberForm(document.querySelector("#memberRegisterForm"), "member");
  rememberForm(document.querySelector("#loginForm"), "staff");

  window.setTimeout(() => {
    const lastKind = localStorage.getItem(storage.lastKind);
    if (lastKind) setAccountTab(lastKind);
  }, 0);

  document.querySelector("#accountButton")?.addEventListener("click", () => {
    window.setTimeout(() => {
      const lastKind = localStorage.getItem(storage.lastKind);
      if (lastKind) setAccountTab(lastKind);
    }, 0);
  }, { capture: true });
});
