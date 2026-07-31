const userAgent = navigator.userAgent || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);

if (isAndroid && !document.querySelector("#androidStartupAnimation")) {
  const root = document.documentElement;
  root.dataset.pixelAndroidIntro = "active";

  const overlay = document.createElement("div");
  overlay.id = "androidStartupAnimation";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Animation de démarrage Pixel Everywhere");
  overlay.innerHTML = `
    <div class="android-intro-glow" aria-hidden="true"></div>
    <div class="android-intro-grid" aria-hidden="true"></div>
    <div class="android-intro-beams" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="android-intro-particles" aria-hidden="true">
      ${Array.from({ length: 24 }, () => "<i></i>").join("")}
    </div>
    <div class="android-intro-stage" aria-hidden="true">
      <div class="android-intro-rings"></div>
      <div class="android-intro-mascot">
        <div class="android-intro-mascot-inner">
          <span class="android-intro-sketch"></span>
          <span class="android-intro-pencil-trail"></span>
          <img class="android-intro-body" src="./assets/pixel-body.png" alt="" />
          <img class="android-intro-eye" src="./assets/pixel-eye.png" alt="" />
          <span class="android-intro-hand" aria-label="Pixel fait coucou">👋</span>
        </div>
      </div>
      <span class="android-intro-wordmark-streaks"></span>
      <img class="android-intro-wordmark" src="./assets/pdd2-wordmark.png" alt="Pixel Everywhere" />
      <div class="android-intro-copy">
        <p class="android-intro-imagine">Imagine•Create•Share</p>
        <p class="android-intro-credit">By:Eitan14/Eitan2.0</p>
        <p class="android-intro-tagline">PDD Everywhere you go</p>
      </div>
    </div>
    <button class="android-intro-skip" type="button">Passer</button>
  `;

  const finish = () => {
    if (overlay.classList.contains("android-intro-leaving")) return;
    overlay.classList.add("android-intro-leaving");
    root.dataset.pixelAndroidIntro = "finished";
    window.setTimeout(() => overlay.remove(), 520);
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timer = window.setTimeout(finish, reducedMotion ? 1450 : 9350);

  overlay.querySelector(".android-intro-skip")?.addEventListener("click", () => {
    window.clearTimeout(timer);
    finish();
  });

  overlay.addEventListener("animationcancel", () => {
    if (!document.hidden) finish();
  }, { once: true });

  document.body.prepend(overlay);

  window.setTimeout(() => {
    if (root.dataset.pixelAndroidIntro === "active" && !document.body.contains(overlay)) {
      root.dataset.pixelAndroidIntro = "finished";
    }
  }, 10000);
}
